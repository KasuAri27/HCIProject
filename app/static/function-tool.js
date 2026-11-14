(() => {
  "use strict";

  const functions = new Map([
    ["sin", Math.sin], ["cos", Math.cos], ["tan", Math.tan],
    ["asin", Math.asin], ["acos", Math.acos], ["atan", Math.atan],
    ["sinh", Math.sinh], ["cosh", Math.cosh], ["tanh", Math.tanh],
    ["sqrt", Math.sqrt], ["cbrt", Math.cbrt], ["abs", Math.abs],
    ["ln", Math.log], ["log", Math.log10], ["log2", Math.log2], ["exp", Math.exp],
    ["floor", Math.floor], ["ceil", Math.ceil], ["sign", Math.sign],
  ]);
  const superscript = new Map(Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺", (character, index) =>
    [character, "0123456789-+"[index]]));
  const equationPrefix = /^(?:y|f\d*\s*\(\s*x\s*\))\s*=\s*/i;

  // 表达式只经过数学记号和白名单运算，用户输入不会作为脚本执行。
  function compile(source, allowVariable = true) {
    const text = source.trim()
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (part) => `^(${Array.from(part, (ch) => superscript.get(ch)).join("")})`)
      .normalize("NFKC").toLowerCase()
      .replace(equationPrefix, "")
      .replace(/[−–]/g, "-").replace(/[×·⋅]/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^");
    if (!text) throw new Error("请输入表达式");
    const tokens = [];
    const lexer = /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|log2|[a-z]+|[π√+\-*/^()|]/y;
    while (lexer.lastIndex < text.length) {
      const start = lexer.lastIndex;
      const match = lexer.exec(text);
      if (!match) throw new Error(`无法识别符号「${text[start]}」`);
      const token = match[0].trim();
      if (!token) continue;
      if (/^[0-9.]/.test(token) && /^[0-9.]/.test(tokens[tokens.length - 1] || "")) {
        throw new Error("两个数值之间缺少运算符");
      }
      tokens.push(token);
    }
    let index = 0;
    let bars = 0;
    const peek = () => tokens[index];
    function take(token) {
      if (peek() !== token) return false;
      index++;
      return true;
    }
    function enclosed(end) {
      const body = sum();
      if (!take(end)) throw new Error(`缺少 ${end}`);
      return body;
    }
    function atom() {
      if (take("(")) return enclosed(")");
      if (take("|")) {
        bars++;
        const body = enclosed("|");
        bars--;
        return (x) => Math.abs(body(x));
      }
      const token = tokens[index++];
      if (!token) throw new Error("表达式不完整");
      if (/^[0-9.]/.test(token)) {
        const value = Number(token);
        if (!Number.isFinite(value)) throw new Error("数值超出范围");
        return () => value;
      }
      if (token === "x" && allowVariable) return (x) => x;
      if (token === "x") throw new Error("这里需要一个常数");
      if (token === "π" || token === "pi") return () => Math.PI;
      if (token === "e") return () => Math.E;
      if (token === "√") {
        const body = atom();
        return (x) => Math.sqrt(body(x));
      }
      const fn = functions.get(token);
      if (!fn) throw new Error(`无法识别「${token}」`);
      if (!take("(")) throw new Error(`${token} 的参数需要括号`);
      const body = enclosed(")");
      return (x) => fn(body(x));
    }
    function power() {
      const base = atom();
      if (!take("^")) return base;
      const exponent = unary();
      return (x) => base(x) ** exponent(x);
    }
    function unary() {
      if (take("+")) return unary();
      if (take("-")) {
        const body = unary();
        return (x) => -body(x);
      }
      return power();
    }
    function product() {
      let value = unary();
      while (peek()) {
        const token = peek();
        const explicit = token === "*" || token === "/";
        // 允许 2x、2π、(x+1)(x-1) 等相邻因子。
        if (!explicit && !/^[0-9.a-zπ√(]/.test(token) && !(token === "|" && bars === 0)) break;
        if (explicit) index++;
        const left = value;
        const right = unary();
        value = token === "/" ? (x) => left(x) / right(x) : (x) => left(x) * right(x);
      }
      return value;
    }
    function sum() {
      let value = product();
      while (peek() === "+" || peek() === "-") {
        const sign = tokens[index++] === "+" ? 1 : -1;
        const left = value;
        const right = product();
        value = (x) => left(x) + sign * right(x);
      }
      return value;
    }
    const fn = sum();
    if (index !== tokens.length) throw new Error(`「${peek()}」的位置不正确`);
    return fn;
  }

  function constant(source) {
    const value = compile(source, false)(0);
    if (!Number.isFinite(value)) throw new Error("请输入有限实数");
    return value;
  }

  function integral(fn, from, to) {
    if (from === to) return 0;
    const a = Math.min(from, to), b = Math.max(from, to);
    if (!Number.isFinite(b - a)) throw new Error("积分区间超出范围");
    let samples = 0;
    function evaluate(x) {
      if (++samples > 18000) throw new Error("积分数值未收敛");
      const y = fn(x);
      if (!Number.isFinite(y)) throw new Error("区间内出现无定义值，无法估算定积分");
      return y;
    }
    const panel = (lo, hi, left, mid, right) => (hi - lo) * (left + 4 * mid + right) / 6;
    function refine(lo, hi, left, mid, right, previous, tolerance, depth) {
      const center = lo + (hi - lo) / 2;
      const lm = evaluate(lo + (center - lo) / 2);
      const rm = evaluate(center + (hi - center) / 2);
      const l = panel(lo, center, left, lm, mid);
      const r = panel(center, hi, mid, rm, right);
      const delta = l + r - previous;
      if (Math.abs(delta) <= 15 * tolerance) return l + r + delta / 15;
      if (!depth || !Number.isFinite(delta)) throw new Error("积分数值未收敛");
      return refine(lo, center, left, lm, mid, l, tolerance / 2, depth - 1) +
        refine(center, hi, mid, rm, right, r, tolerance / 2, depth - 1);
    }
    let total = 0;
    // 先分段再细分，降低整段对称采样掩盖中间奇点的风险。
    for (let i = 0; i < 16; i++) {
      const lo = a + (b - a) * i / 16, hi = i === 15 ? b : a + (b - a) * (i + 1) / 16;
      const left = evaluate(lo), mid = evaluate(lo + (hi - lo) / 2), right = evaluate(hi);
      const estimate = panel(lo, hi, left, mid, right);
      total += refine(lo, hi, left, mid, right, estimate, 1e-9 * Math.max(1, Math.abs(estimate)), 16);
    }
    if (!Number.isFinite(total)) throw new Error("积分结果超出范围");
    return to < from ? -total : total;
  }

  const near = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
  const stable = (value) => ({ kind: "value", value });
  function sampleLimit(fn, point, direction, offset) {
    const values = [];
    for (let i = 0; i < 12; i++) {
      const x = Number.isFinite(point)
        ? point + Math.max(1, Math.abs(point)) * (direction * offset * 10 ** (-i - 1))
        : Math.sign(point) * offset * 10 ** i;
      if (x !== point) values.push(fn(x));
    }
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return { kind: "domain" };
    const tail = values.slice(-5);
    const end = tail[tail.length - 1];
    if (!tail.every(Number.isFinite)) {
      const sign = Math.sign(end);
      const last = finite[finite.length - 1];
      const previous = finite[finite.length - 2];
      if (Math.abs(end) === Infinity && tail.slice(-3).every((value) => value === end) &&
          Math.sign(last) === sign && Math.abs(last) > 1e6 && Math.abs(last) > Math.abs(previous)) {
        return stable(end);
      }
      return { kind: "unstable" };
    }
    const differences = tail.slice(1).map((value, i) => value - tail[i]);
    const signed = differences.every((value) => Math.sign(value) === Math.sign(differences[0]) && value !== 0);
    if (signed) {
      const increments = differences.map(Math.abs);
      const ratios = increments.slice(1).map((value, i) => value / increments[i]);
      if (ratios.every((ratio) => ratio < 0.82) && Math.max(...ratios) - Math.min(...ratios) < 0.2) {
        const lastRatio = ratios[ratios.length - 1];
        const correction = differences[differences.length - 1] * lastRatio / (1 - lastRatio);
        const sum = end + correction;
        // 清除外推相消留下的浮点尾数，保留真正接近零的非零常数。
        const roundoff = 16 * Number.EPSILON * Math.max(Math.abs(end), Math.abs(correction));
        const value = Math.abs(sum) <= roundoff ? 0 : sum;
        if (Number.isFinite(value) && near(value, end)) return stable(value);
        // 较慢的几何收敛可外推，但必须由前一组样本给出相同估计。
        const priorRatio = ratios[ratios.length - 2];
        const prior = tail[3] + differences[2] * priorRatio / (1 - priorRatio);
        if (Number.isFinite(value) && near(value, prior)) return stable(value);
      }
      const sameDirection = tail.every((value) => Math.sign(value) === Math.sign(differences[0]));
      const growing = ratios.every((ratio) => ratio > 1.35) && Math.abs(end) > 1e5;
      const logarithmic = ratios.every((ratio) => Math.abs(ratio - 1) < 0.08) && increments[0] > 0.05;
      if (sameDirection && (growing || logarithmic)) return stable(Math.sign(end) * Infinity);
    }
    return tail.slice(-3).every((value) => near(value, end)) ? stable(end) : { kind: "unstable" };
  }

  function oneSidedLimit(fn, point, direction) {
    // 多组错开的探针需要相互吻合，避免把单组采样的偶然结果当成极限。
    const checks = [1, 1.57, 2.31].map((offset) => sampleLimit(fn, point, direction, offset));
    const first = checks[0];
    if (first.kind === "value" && checks.every((item) => item.kind === "value" &&
      (item.value === first.value || (Number.isFinite(item.value) && Number.isFinite(first.value) && near(item.value, first.value))))) {
      return first;
    }
    return { kind: checks.every((item) => item.kind === "domain") ? "domain" : "unstable" };
  }

  function format(value) {
    if (value === Infinity) return "+∞";
    if (value === -Infinity) return "−∞";
    return String(Number(value.toPrecision(8)));
  }
  function describe(result) {
    if (result.kind === "domain") return "未取得实数值";
    if (result.kind === "unstable") return "数值未稳定";
    return Number.isFinite(result.value) ? `≈ ${format(result.value)}` : format(result.value);
  }

  const byId = (id) => document.getElementById(id);
  const expression = byId("function-expression");
  const seriesList = byId("function-list");
  const target = byId("function-target");
  const plot = byId("function-plot");
  const integralForm = byId("function-integral-form");
  const limitForm = byId("function-limit-form");
  const integralResult = byId("function-integral-result");
  const limitResult = byId("function-limit-result");
  const colors = ["#087d82", "#9155b4", "#c06230", "#386aba", "#a13c66", "#40834b"];
  const sessionKey = "learning.functionTool.v1";
  const series = [];
  let nextId = 1;
  let editing = null;
  let range = { xMin: -8, xMax: 8, yMin: -5, yMax: 5 };

  function svg(tag, attributes, content) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    if (content !== undefined) element.textContent = content;
    return element;
  }
  function ticks(min, max, count) {
    const interval = (max - min) / count;
    const unit = 10 ** Math.floor(Math.log10(interval));
    const step = unit * ([1, 2, 5, 10].find((n) => n * unit >= interval) || 10);
    const values = [];
    for (let i = Math.ceil(min / step); i <= Math.floor(max / step) && values.length < 30; i++) {
      values.push(i * step);
    }
    return values;
  }
  function tickLabel(value) {
    const magnitude = Math.abs(value);
    return magnitude >= 1e5 || (magnitude > 0 && magnitude < 1e-3) ? value.toExponential(1) : format(value);
  }

  function drawPlot() {
    const width = plot.clientWidth, height = plot.clientHeight;
    if (width < 100 || height < 100) return;
    const left = width < 360 ? 41 : 47, right = width - 15, top = 15, bottom = height - 25;
    const { xMin, xMax, yMin, yMax } = range;
    const xSpan = xMax - xMin, ySpan = yMax - yMin;
    const px = (x) => left + (right - left) * (x - xMin) / xSpan;
    const py = (y) => top + (bottom - top) * (yMax - y) / ySpan;
    const line = (x1, y1, x2, y2, axis = false) => svg("line", {
      x1, y1, x2, y2, class: axis ? "function-plot-axis" : "function-plot-grid",
    });
    const clip = svg("clipPath", { id: "function-plot-clip" });
    clip.append(svg("rect", { x: left, y: top, width: right - left, height: bottom - top }));
    const layers = [clip];
    for (const x of ticks(xMin, xMax, width < 400 ? 4 : 8)) {
      const x1 = px(x);
      layers.push(line(x1, top, x1, bottom, x === 0),
        svg("text", { x: x1, y: bottom + 16, "text-anchor": x1 > right - 14 ? "end" : "middle" }, tickLabel(x)));
    }
    for (const y of ticks(yMin, yMax, 6)) {
      const y1 = py(y);
      layers.push(line(left, y1, right, y1, y === 0),
        svg("text", { x: left - 7, y: y1 + 4, "text-anchor": "end" }, tickLabel(y)));
    }
    const paths = svg("g", { "clip-path": "url(#function-plot-clip)" });
    const samples = Math.min(1000, Math.max(280, Math.ceil(width * 1.4)));
    for (const entry of series) {
      const commands = [];
      let prior = null;
      for (let i = 0; i <= samples; i++) {
        const x = xMin + xSpan * i / samples;
        const y = entry.fn(x);
        if (!Number.isFinite(y)) { prior = null; continue; }
        let join = Boolean(prior);
        if (prior) {
          const middle = entry.fn((x + prior.x) / 2);
          // 探测采样之间的发散，避免用直线跨过不连续点。
          join = Number.isFinite(middle) && Math.abs(y - prior.y) <= 1.8 * ySpan &&
            Math.abs(middle - (y + prior.y) / 2) <= ySpan;
        }
        const boundedY = Math.max(top - height * 2, Math.min(bottom + height * 2, py(y)));
        commands.push(`${join ? "L" : "M"}${px(x).toFixed(2)} ${boundedY.toFixed(2)}`);
        prior = { x, y };
      }
      paths.append(svg("path", { d: commands.join(" "), fill: "none", stroke: entry.color,
        "stroke-width": entry.id === editing ? 2.5 : 1.8, "stroke-linejoin": "round",
        "stroke-linecap": "round", "data-function-id": entry.id }));
    }
    layers.push(paths);
    plot.setAttribute("viewBox", `0 0 ${width} ${height}`);
    plot.replaceChildren(...layers);
  }

  function errorAt(id, message = "") {
    const element = byId(id);
    element.textContent = message;
    element.hidden = !message;
  }
  function resultAt(element, message = "", failed = false) {
    element.textContent = message;
    element.dataset.error = String(failed);
  }
  function clearResults() {
    resultAt(integralResult);
    resultAt(limitResult);
  }
  function label(entry) { return `f${entry.id}(x) = ${entry.source}`; }
  function button(text) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    return element;
  }
  function refreshSeries(preferred = Number(target.value)) {
    seriesList.replaceChildren();
    for (const entry of series) {
      const row = document.createElement("li");
      const edit = button("");
      const swatch = document.createElement("i");
      const name = document.createElement("span");
      swatch.style.backgroundColor = entry.color;
      name.textContent = label(entry);
      edit.append(swatch, name);
      edit.title = label(entry);
      edit.setAttribute("aria-pressed", String(entry.id === editing));
      edit.addEventListener("click", () => {
        editing = entry.id;
        expression.value = entry.source;
        errorAt("function-editor-error");
        clearResults();
        refreshSeries(entry.id);
        expression.focus();
      });
      const remove = button("×");
      remove.setAttribute("aria-label", `移除函数 f${entry.id}`);
      remove.addEventListener("click", () => {
        series.splice(series.indexOf(entry), 1);
        if (editing === entry.id) resetEditor();
        else refreshSeries();
        clearResults();
        expression.focus();
      });
      row.append(edit, remove);
      seriesList.append(row);
    }
    target.replaceChildren(...series.map((entry) => new Option(label(entry), String(entry.id))));
    if (series.some((entry) => entry.id === preferred)) target.value = String(preferred);
    target.disabled = !series.length;
    for (const form of [integralForm, limitForm]) form.querySelector("button").disabled = !series.length;
    byId("function-save").textContent = editing === null ? "添加函数" : "保存函数";
    byId("function-new").hidden = editing === null;
    plot.setAttribute("aria-label", series.length ? `函数坐标图，${series.map(label).join("；")}` : "函数坐标图");
    drawPlot();
  }
  function resetEditor() {
    editing = null;
    expression.value = "";
    errorAt("function-editor-error");
    refreshSeries();
  }
  function loadSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      if (!saved || !Array.isArray(saved.series)) return;
      for (const item of saved.series.slice(0, 12)) {
        if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || item.id > 1e6 ||
            typeof item.source !== "string" || item.source.length > expression.maxLength ||
            series.some((entry) => entry.id === item.id)) continue;
        try {
          series.push({ id: item.id, source: item.source, fn: compile(item.source),
            color: colors[(item.id - 1) % colors.length] });
          nextId = Math.max(nextId, item.id + 1);
        } catch { /* 跳过失效的会话表达式，其余函数仍可使用。 */ }
      }
      if (series.some((entry) => entry.id === saved.editing)) editing = saved.editing;
      if (typeof saved.draft === "string") expression.value = saved.draft.slice(0, expression.maxLength);
      return saved.target;
    } catch { /* 存储不可用时，工具仍可在当前页面使用。 */ }
  }
  function saveSession() {
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        series: series.map(({ id, source }) => ({ id, source })),
        draft: expression.value, editing, target: Number(target.value),
      }));
    } catch { /* 存储不可用时保留当前页面状态。 */ }
  }

  byId("function-editor-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const source = expression.value.trim().replace(equationPrefix, "");
    try {
      const fn = compile(source);
      let entry = series.find((item) => item.id === editing);
      if (entry) Object.assign(entry, { source, fn });
      else {
        if (series.length >= 12) throw new Error("最多可添加 12 条函数");
        const id = nextId++;
        entry = { id, source, fn, color: colors[(id - 1) % colors.length] };
        series.push(entry);
        expression.value = "";
      }
      errorAt("function-editor-error");
      clearResults();
      refreshSeries(entry.id);
    } catch (error) {
      errorAt("function-editor-error", error.message);
      expression.focus();
    }
  });
  byId("function-new").addEventListener("click", () => { resetEditor(); expression.focus(); });
  expression.addEventListener("input", () => errorAt("function-editor-error"));
  byId("function-keypad").addEventListener("click", (event) => {
    const key = event.target.closest("button");
    if (!key) return;
    const start = expression.selectionStart, end = expression.selectionEnd;
    const prefix = key.dataset.wrap;
    const value = prefix === undefined ? key.dataset.insert : `${prefix}(${expression.value.slice(start, end)})`;
    if (expression.value.length - (end - start) + value.length > expression.maxLength) return;
    expression.setRangeText(value, start, end, "end");
    expression.focus();
    if (prefix !== undefined && start === end) expression.setSelectionRange(start + prefix.length + 1, start + prefix.length + 1);
    errorAt("function-editor-error");
  });
  byId("function-range-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const [xMin, xMax, yMin, yMax] = ["x-min", "x-max", "y-min", "y-max"]
        .map((key) => constant(byId(`function-${key}`).value));
      if (xMin >= xMax || yMin >= yMax) throw new Error("最小值必须小于最大值");
      if ([xMin, xMax, yMin, yMax].some((value) => Math.abs(value) > 1e9) ||
          xMax - xMin < 1e-6 || yMax - yMin < 1e-6) throw new Error("坐标范围超出可绘制精度");
      range = { xMin, xMax, yMin, yMax };
      errorAt("function-range-error");
      drawPlot();
    } catch (error) { errorAt("function-range-error", error.message); }
  });
  target.addEventListener("change", clearResults);
  integralForm.addEventListener("input", () => resultAt(integralResult));
  limitForm.addEventListener("input", () => resultAt(limitResult));
  integralForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = series.find((item) => item.id === Number(target.value));
    if (!entry) return;
    try {
      const from = constant(byId("function-integral-from").value);
      const to = constant(byId("function-integral-to").value);
      resultAt(integralResult, `≈ ${format(integral(entry.fn, from, to))}`);
    } catch (error) { resultAt(integralResult, error.message, true); }
  });
  limitForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = series.find((item) => item.id === Number(target.value));
    if (!entry) return;
    try {
      const text = byId("function-limit-point").value.trim().toLowerCase().replace(/−/g, "-");
      const point = /^[+-]?(?:∞|inf|infinity)$/.test(text)
        ? (text.startsWith("-") ? -Infinity : Infinity) : constant(text);
      const side = byId("function-limit-side").value;
      if (!Number.isFinite(point) || side !== "both") {
        const result = oneSidedLimit(entry.fn, point, side === "left" ? -1 : 1);
        resultAt(limitResult, describe(result), result.kind !== "value");
        return;
      }
      const left = oneSidedLimit(entry.fn, point, -1);
      const right = oneSidedLimit(entry.fn, point, 1);
      const bothValues = left.kind === "value" && right.kind === "value";
      const equal = bothValues && (left.value === right.value ||
        (Number.isFinite(left.value) && Number.isFinite(right.value) && near(left.value, right.value)));
      if (equal) resultAt(limitResult, describe(left));
      else {
        const headline = bothValues ? "左右极限不同" : "未能确认双侧极限";
        resultAt(limitResult, `${headline}\n左侧 ${describe(left)}\n右侧 ${describe(right)}`, true);
      }
    } catch (error) { resultAt(limitResult, error.message, true); }
  });
  refreshSeries(loadSession());
  new ResizeObserver(drawPlot).observe(plot);
  window.addEventListener("pagehide", saveSession);
})();
