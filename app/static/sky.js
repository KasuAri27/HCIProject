/* 知识星空页：三维球面上的概念节点图，学习进度以水位表示，节点聚焦时视角跟随。
   three.js 通过 sky.html 的 importmap 从本地 vendor 目录动态加载；泛光后期失败时退回直接渲染。
   课程与概念目前是本文件内置的样例数据，尚未接入真实课程。 */
(async () => {
  const root = document.getElementById("knowledge-sky");
  const $ = selector => root.querySelector(selector);
  const canvas = $("canvas");
  const stage = $(".ks-sky");
  const picker = $("select");
  const labels = $(".ks-labels");
  const progressLabel = $(".ks-progress");
  const error = $(".ks-error");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let THREE, renderer, post = null;
  try {
    THREE = await import("three");
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (cause) {
    error.textContent = "3D 场景加载失败";
    error.hidden = false;
    picker.disabled = true;
    console.error(cause);
    return;
  }
  // 泛光后期是锦上添花：加载失败时退回直接渲染，画面仍然完整
  try {
    const [composer, render, bloom, output] = await Promise.all([
      import("three/addons/postprocessing/EffectComposer.js"),
      import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/UnrealBloomPass.js"),
      import("three/addons/postprocessing/OutputPass.js"),
    ]);
    post = { ...composer, ...render, ...bloom, ...output };
  } catch (cause) {
    console.warn("泛光后期不可用，已退回直接渲染", cause);
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 40);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const centerId = 0;
  const rad = Math.PI / 180;
  // 默认视角（全景模式与载入课程时使用）
  const HOME_YAW = -0.32, HOME_PITCH = 0.34;
  // 节点格式：[名称, 纬度, 经度, 前置节点, 进度, 已掌握?]；纬度、经度为 null 时自动排布
  const courses = [{ name: "微积分", concepts: [
    ["函数", 0, 0, [], 64],
    ["极限", 43, 10, [0], 100, true],
    ["平均变化率", -12, -37, [0], 82],
    ["导数", 5, 7, [1, 2], 100],
    ["链式法则", 23, 54, [3, 5], 38],
    ["复合函数", 52, 102, [0], 23],
    ["单调性", -27, -9, [3], 52],
    ["极值", -52, 31, [6], 0],
    ["高阶导数", -12, 45, [3], 16],
    ["泰勒展开", -36, 96, [8], 0],
    ["连续性", 56, -76, [1], 12],
    ["定积分", 5, -91, [10], 0],
    ["微积分基本定理", -30, -108, [3, 11], 0],
    ["积分换元", -52, -66, [4, 12], 0],
    ["分部积分", -48, 150, [12, 15], 0],
    ["乘积法则", 4, 87, [3], 0],
    ["中值定理", 13, -135, [3, 10], 0],
    ["不定积分", 34, -165, [3], 0],
    ["广义积分", -16, 173, [1, 11], 0],
    ["偏导数", 37, 148, [3, 20], 0],
    ["多元函数", 4, 142, [0], 0],
    ["梯度", 58, -135, [19], 0],
    ["最优化", -19, -157, [7, 21], 0],
    ["曲线弧长", -67, -147, [11, 3], 0],
  ] }, { name: "线性代数", concepts: [
    ["向量", null, null, [], 100, true],
    ["线性组合", null, null, [0], 100],
    ["线性相关", null, null, [1], 100],
    ["基与维数", null, null, [2], 76],
    ["矩阵", null, null, [0], 100, true],
    ["矩阵乘法", null, null, [4], 88],
    ["线性方程组", null, null, [4, 2], 64],
    ["行列式", null, null, [5], 45],
    ["逆矩阵", null, null, [5, 7], 20],
    ["特征值", null, null, [7, 3], 0],
    ["特征向量", null, null, [9], 0],
    ["对角化", null, null, [10, 8], 0],
    ["内积空间", null, null, [3], 10],
    ["正交化", null, null, [12], 0],
    ["奇异值分解", null, null, [11, 13], 0],
  ] }, { name: "概率论", concepts: [
    ["概率空间", null, null, [], 100],
    ["条件概率", null, null, [0], 100, true],
    ["独立性", null, null, [1], 90],
    ["贝叶斯公式", null, null, [1], 100],
    ["随机变量", null, null, [0], 100],
    ["期望", null, null, [4], 70],
    ["方差", null, null, [5], 55],
    ["常见分布", null, null, [4], 35],
    ["大数定律", null, null, [6], 0],
    ["中心极限定理", null, null, [8, 7], 0],
    ["联合分布", null, null, [4, 2], 25],
    ["协方差", null, null, [10, 6], 0],
    ["最大似然估计", null, null, [7, 5], 0],
    ["假设检验", null, null, [9, 12], 0],
  ] }];
  const maxEdges = Math.max(...courses.map(({ concepts }) => concepts.reduce((sum, node) => sum + node[3].length, 0)));
  // 当前课程的数据；切换课程时由 loadCourse 重新赋值
  let concepts = [], edges = [], adjacency = [], reachable = new Set(), positions = [];
  const displayName = id => concepts[id][4] > 0 || reachable.has(id) ? concepts[id][0] : "???";
  const isLocked = id => displayName(id) === "???";
  const stateOf = id => concepts[id][5] ? "mastered" : concepts[id][4] === 100 ? "done"
    : concepts[id][4] > 0 ? "learning" : isLocked(id) ? "locked" : "ready";
  // 内发光：学习中只有一点冷光，学完偏冷白，已掌握是强烈的琥珀色（>1 的部分会被泛光放大）
  const GLOW = {
    learning: { color: "#2fc4d8", strength: 0.3 },
    done: { color: "#a6ecff", strength: 0.55 },
    mastered: { color: "#ffa733", strength: 1.05 },
  };
  const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  const easeOutBack = x => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

  /* ---------- 全景排布：球面上的节点位置 ---------- */
  // 没有手工经纬度的课程：先按斐波那契螺旋把节点铺满球面，再用「斥力 + 前置边弹簧」松弛，
  // 让相连的节点靠近、其余节点互相推开；中心枢纽（0 号）固定在球心，不参与排布
  function layoutOnSphere(list) {
    const count = list.length, golden = Math.PI * (3 - Math.sqrt(5));
    const points = list.map((_, i) => {
      if (i === centerId) return new THREE.Vector3();
      const y = 1 - 2 * (i - 0.5) / (count - 1), ring = Math.sqrt(1 - y * y);
      return new THREE.Vector3(Math.cos(i * golden) * ring, y, Math.sin(i * golden) * ring);
    });
    const links = list.flatMap((node, to) => node[3].map(from => [from, to]))
      .filter(([from, to]) => from !== centerId && to !== centerId);
    // 默认视线正对的那个点：把节点从这里推开，避免有节点正好挡在中心枢纽前面
    const gaze = new THREE.Vector3(
      Math.cos(HOME_PITCH) * Math.sin(HOME_YAW), Math.sin(HOME_PITCH), Math.cos(HOME_PITCH) * Math.cos(HOME_YAW));
    for (let step = 0; step < 400; step++) {
      const force = points.map((point, i) => i === centerId ? new THREE.Vector3()
        : point.clone().sub(gaze).multiplyScalar(0.05 / Math.max(point.distanceToSquared(gaze), 0.04)));
      for (let i = 1; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const push = points[i].clone().sub(points[j]);
          push.multiplyScalar(0.02 / Math.max(push.lengthSq(), 0.01));
          force[i].add(push);
          force[j].sub(push);
        }
      }
      for (const [from, to] of links) {
        const pull = points[to].clone().sub(points[from]);
        pull.multiplyScalar((pull.length() - 0.7) * 0.05 / (pull.length() || 1));
        force[from].add(pull);
        force[to].sub(pull);
      }
      for (let i = 1; i < count; i++) points[i].add(force[i]).normalize();
    }
    return points;
  }
  function buildPositions(list) {
    if (list.every(node => node[1] !== null)) {
      return list.map(([, lat, lon], id) => {
        if (id === centerId) return new THREE.Vector3();
        return new THREE.Vector3(
          Math.cos(lat * rad) * Math.sin(lon * rad),
          Math.sin(lat * rad),
          Math.cos(lat * rad) * Math.cos(lon * rad),
        ).multiplyScalar(1.22);
      });
    }
    return layoutOnSphere(list).map(point => point.multiplyScalar(1.22));
  }

  /* ---------- 聚焦排布：以被点击的节点为中心，直接相连的节点绕在周围 ---------- */
  // 返回每个节点的目标位置、跳数，以及这一圈邻居的方向（用来挑选观察角度）。
  // 焦点放在原点，一跳邻居均匀摊在半径 1 的球面上，更远的节点沿父节点向外一层层推开
  function layoutFocus(focus) {
    const count = concepts.length;
    const hop = new Array(count).fill(Infinity);
    const parent = new Array(count).fill(-1);
    hop[focus] = 0;
    const queue = [focus];
    for (let head = 0; head < queue.length; head++) {
      for (const next of adjacency[queue[head]]) {
        if (hop[next] !== Infinity) continue;
        hop[next] = hop[queue[head]] + 1;
        parent[next] = queue[head];
        queue.push(next);
      }
    }
    const ring = queue.filter(id => hop[id] === 1);
    // 初始方向取自全景图里邻居相对焦点的方向；之后主要靠互相排斥摊开，弹簧只保留一点原有的相对关系
    const start = ring.map(id => {
      const d = positions[id].clone().sub(positions[focus]);
      return d.lengthSq() < 1e-8 ? new THREE.Vector3(0, 1, 0) : d.normalize();
    });
    const dirs = start.map(d => d.clone());
    for (let step = 0; step < 160; step++) {
      const force = dirs.map((d, k) => start[k].clone().sub(d).multiplyScalar(0.03));
      for (let i = 0; i < dirs.length; i++) {
        for (let j = i + 1; j < dirs.length; j++) {
          const push = dirs[i].clone().sub(dirs[j]);
          push.multiplyScalar(0.05 / Math.max(push.lengthSq(), 0.04));
          force[i].add(push);
          force[j].sub(push);
        }
      }
      dirs.forEach((d, k) => d.add(force[k]).normalize());
    }
    const goal = positions.map(() => null);
    goal[focus] = new THREE.Vector3();
    ring.forEach((id, k) => { goal[id] = dirs[k].clone(); });
    for (const id of queue) {
      if (hop[id] < 2) continue;
      const outward = goal[parent[id]].clone().normalize();
      // 在父节点外侧再推出 0.85，并带上一点全景图里的相对位移，避免兄弟节点叠在一起
      goal[id] = goal[parent[id]].clone().addScaledVector(outward, 0.85)
        .addScaledVector(positions[id].clone().sub(positions[parent[id]]), 0.3);
    }
    for (let id = 0; id < count; id++) {
      if (goal[id]) continue;
      goal[id] = positions[id].clone().sub(positions[focus]).normalize().multiplyScalar(3.2);
    }
    // 外层节点常常挤在同一个方向：互相排斥一下，再用弹簧拉回各自原来的位置
    const outer = queue.filter(id => hop[id] >= 2);
    const anchor = new Map(outer.map(id => [id, goal[id].clone()]));
    for (let step = 0; step < 80; step++) {
      for (let i = 0; i < outer.length; i++) {
        for (let j = i + 1; j < outer.length; j++) {
          const push = goal[outer[i]].clone().sub(goal[outer[j]]);
          push.multiplyScalar(0.03 / Math.max(push.lengthSq(), 0.05));
          goal[outer[i]].add(push);
          goal[outer[j]].sub(push);
        }
        goal[outer[i]].addScaledVector(anchor.get(outer[i]).clone().sub(goal[outer[i]]), 0.04);
      }
    }
    return { hop, goal, dirs };
  }
  // 挑一个观察方向，让这一圈邻居在画面里围着焦点摊开，而不是前后叠在一起：
  // 取协方差矩阵 Σ ddᵀ 的最小特征向量（对 trace·I − M 做幂迭代即得）
  function bestViewDirection(dirs, fallback) {
    const m = [0, 0, 0, 0, 0, 0];
    for (const d of dirs) {
      m[0] += d.x * d.x; m[1] += d.x * d.y; m[2] += d.x * d.z;
      m[3] += d.y * d.y; m[4] += d.y * d.z; m[5] += d.z * d.z;
    }
    const trace = m[0] + m[3] + m[5];
    const v = fallback.clone();
    for (let i = 0; i < 40; i++) {
      v.set(
        trace * v.x - (m[0] * v.x + m[1] * v.y + m[2] * v.z),
        trace * v.y - (m[1] * v.x + m[3] * v.y + m[4] * v.z),
        trace * v.z - (m[2] * v.x + m[4] * v.y + m[5] * v.z),
      );
      if (v.lengthSq() < 1e-9) return fallback;
      v.normalize();
    }
    return v.dot(fallback) < 0 ? v.negate() : v;
  }

  /* ---------- 共用 GLSL 片段 ---------- */
  // 夜间影棚环境：左上冷白主光 + 右后暖铜补光，玻璃与水面都从这里取反射
  const studioEnvironment = `
    vec3 studio(vec3 direction, float roughness) {
      vec3 d = normalize(direction);
      vec3 key = normalize(vec3(-0.50, 0.79, 0.38));
      vec3 fill = normalize(vec3(0.66, 0.23, -0.72));
      float ambient = 0.05 + 0.05 * (d.y * 0.5 + 0.5);
      float k = mix(0.70, 0.05, roughness) * pow(max(dot(d, key), 0.0), mix(28.0, 5.0, roughness));
      float r = mix(0.30, 0.04, roughness) * pow(max(dot(d, fill), 0.0), mix(16.0, 4.0, roughness));
      return vec3(0.34, 0.56, 0.72) * ambient * 2.0 + vec3(0.78, 0.92, 1.0) * k + vec3(1.0, 0.72, 0.40) * r;
    }`;
  // 夜空：渐变底色 + 银河尘带 + 两层程序化星点。做成函数，既画背景，也供水体折射、反射时取样
  const skyLibrary = `
    float hash13(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
    }
    float vnoise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
    }
    float fbm(vec3 p) {
      float amplitude = 0.5, sum = 0.0;
      for (int i = 0; i < 4; i++) { sum += amplitude * vnoise(p); p = p * 2.03 + 7.1; amplitude *= 0.5; }
      return sum;
    }
    // 把方向放大后按整数格子撒星：每格最多一颗，位置在格内抖动，避免出现网格感
    vec3 starLayer(vec3 d, float scale, float density, float size) {
      vec3 x = d * scale;
      vec3 cell = floor(x);
      float h = hash13(cell);
      if (h < 1.0 - density) return vec3(0.0);
      vec3 jitter = vec3(hash13(cell + 11.3), hash13(cell + 23.7), hash13(cell + 37.1));
      float r = length(x - (cell + 0.2 + 0.6 * jitter));
      float lum = mix(0.25, 1.0, fract(h * 91.7));
      vec3 tint = mix(vec3(0.70, 0.85, 1.0), vec3(1.0, 0.86, 0.66), step(0.72, fract(h * 13.1)));
      return tint * smoothstep(size, 0.0, r) * lum * 1.25;
    }
    vec3 skyRadiance(vec3 direction) {
      vec3 d = normalize(direction);
      vec3 color = mix(vec3(0.0016, 0.0035, 0.0085), vec3(0.0075, 0.0185, 0.034), smoothstep(-0.8, 0.9, d.y));
      vec3 axis = normalize(vec3(0.35, 0.80, -0.50));
      float band = exp(-pow(dot(d, axis) * 2.6, 2.0));
      float cloud = smoothstep(0.34, 0.86, fbm(d * 2.4 + 3.0));
      vec3 dust = mix(vec3(0.010, 0.060, 0.070), vec3(0.040, 0.030, 0.095), fbm(d * 3.1 + 17.0));
      color += dust * band * cloud * 1.4;
      color += starLayer(d, 55.0, 0.07, 0.16);
      color += starLayer(d, 130.0, 0.045, 0.2) * 0.55;
      return color;
    }`;

  /* ---------- 夜空与大气 ---------- */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDirection;
      ${skyLibrary}
      void main() {
        // 暗部很容易出现色带，叠一点极小的噪声抖动
        float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor = vec4(skyRadiance(vDirection) + (grain - 0.5) * 0.0008, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -3;
  scene.add(sky);

  // 球体外缘一圈很淡的大气光，让整体读成「一个球」而不是散点。
  // 做成穿过原点、始终朝向相机的圆片：边缘亮环 + 向内渐隐的薄雾
  const ATMOSPHERE_RADIUS = 1.36;
  const atmosphere = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float r = length((vUv - 0.5) * 2.0);
        float rim = exp(-pow((r - 0.975) / 0.022, 2.0));
        float haze = smoothstep(0.5, 0.98, r);
        float inside = 1.0 - smoothstep(0.985, 1.02, r);
        gl_FragColor = vec4(vec3(0.10, 0.46, 0.56) * (rim * 0.05 + haze * 0.006) * inside, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  atmosphere.renderOrder = -2;
  scene.add(atmosphere);

  /* ---------- 节点：玻璃壳 + 水 ---------- */
  const sphereGeometry = new THREE.SphereGeometry(1, 48, 32);
  // 每个节点一份材质：uDim 控制整体淡入淡出（未解锁、远离焦点的节点会变淡）
  function glassMaterial(dim) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uDim: { value: dim } },
      vertexShader: `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = -p.xyz;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        uniform float uDim;
        varying vec3 vN;
        varying vec3 vV;
        ${studioEnvironment}
        void main() {
          vec3 n = normalize(vN);
          vec3 v = normalize(vV);
          float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4);
          vec3 r = reflect(-v, n);
          vec3 reflected = studio(r * mat3(viewMatrix), 0.10);
          // 只让主光的反射成片发亮，环境底光不参与，否则整颗球会蒙上一层雾
          float glint = smoothstep(0.22, 0.8, max(reflected.r, reflected.b));
          // 玻璃表面一点锐利的高光，像刚擦过的水珠
          vec3 light = normalize(mat3(viewMatrix) * vec3(-0.50, 0.79, 0.38));
          float spec = pow(max(dot(r, light), 0.0), 120.0) * 1.4;
          vec3 color = reflected * (1.1 + rim) + vec3(0.45, 0.78, 0.9) * rim * 0.4 + spec;
          float alpha = min(0.95, 0.03 + 0.70 * rim + 0.80 * glint + spec * 0.4);
          gl_FragColor = vec4(color, alpha * uDim);
          #include <colorspace_fragment>
        }`,
    });
  }

  // 水面和水体共用同一条动态边界，所以液面始终与水体贴合
  function liquidGeometry() {
    const coordinates = [], surface = [], indices = [];
    const segments = 48, rings = 18, stride = segments + 1;
    for (const isSurface of [0, 1]) {
      const offset = surface.length;
      for (let ring = 0; ring <= rings; ring++) {
        for (let step = 0; step <= segments; step++) {
          const theta = step / segments * Math.PI * 2;
          coordinates.push(Math.cos(theta), ring / rings, Math.sin(theta));
          surface.push(isSurface);
          if (ring === rings || step === segments) continue;
          const a = offset + ring * stride + step;
          const b = a + 1, c = a + stride, d = c + 1;
          if (isSurface) indices.push(a, b, c, b, d, c);
          else indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(coordinates, 3));
    geometry.setAttribute("aSurface", new THREE.Float32BufferAttribute(surface, 1));
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    return geometry;
  }
  const fluidGeometry = liquidGeometry();
  const fluidVertex = `
    attribute float aSurface;
    uniform float level;
    uniform float phase;
    uniform float energy;
    uniform float tilt;
    varying vec3 vP;
    varying vec3 vN;
    varying vec3 vV;
    varying float vSurface;
    varying float vEdge;
    const float radius = 0.925;
    float wave(vec2 p) {
      float a = 0.018 + 0.047 * energy;
      return a * sin(p.x * 4.2 + p.y * 3.0 - phase)
        + a * 0.62 * cos(p.y * 5.1 - p.x * 1.7 - phase * 1.42)
        + p.x * tilt + p.y * tilt * 0.28;
    }
    void main() {
      vec2 direction = position.xz;
      float rimY = clamp(level + wave(direction), -radius + 0.015, radius - 0.015);
      float rimR = sqrt(radius * radius - rimY * rimY);
      vec3 p;
      vec3 n;
      if (aSurface > 0.5) {
        vec2 uv = direction * position.y;
        float y = clamp(level + wave(uv), -radius + 0.015, radius - 0.015);
        p = vec3(uv.x * rimR, y, uv.y * rimR);
        float dx = wave(uv + vec2(0.012, 0.0)) - wave(uv - vec2(0.012, 0.0));
        float dz = wave(uv + vec2(0.0, 0.012)) - wave(uv - vec2(0.0, 0.012));
        n = normalize(vec3(-dx, 0.024 * rimR, -dz));
        vEdge = smoothstep(0.9, 1.0, position.y);     // 水面贴近杯壁处：弯月面
      } else {
        float y = mix(-radius, rimY, position.y);
        float r = sqrt(max(0.0, radius * radius - y * y));
        p = vec3(direction.x * r, y, direction.y * r);
        n = normalize(p);
        vEdge = smoothstep(0.96, 1.0, position.y);    // 水线：水体顶端贴着杯壁的一圈亮边
      }
      vec4 view = modelViewMatrix * vec4(p, 1.0);
      vP = p;
      vN = normalize(normalMatrix * n);
      vV = -view.xyz;
      vSurface = aSurface;
      gl_Position = projectionMatrix * view;
    }`;
  const fullFluidVertex = `
    varying vec3 vP;
    varying vec3 vN;
    varying vec3 vV;
    varying float vSurface;
    varying float vEdge;
    void main() {
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      vP = position * 0.925;
      vN = normalize(normalMatrix * normal);
      vV = -view.xyz;
      vSurface = 0.0;
      vEdge = 0.0;
      gl_Position = projectionMatrix * view;
    }`;
  // 水的着色思路：不是给液体上色，而是模拟光线。
  // 光线折射进水里，在球形杯壁上再折射出来，所以整颗水球是一枚透镜，里面倒映着被放大、颠倒的夜空；
  // 水本身几乎透明，只按光线走过的距离吸收红光（朗伯-比尔），厚的地方偏青蓝；
  // 再叠加菲涅尔反射、尖锐的镜面高光、背光侧的聚焦亮斑和水线上的一圈亮边
  const fluidFragment = `
    uniform float level;
    uniform vec3 uGlowColor;
    uniform float uGlow;
    uniform float uFade;
    varying vec3 vP;
    varying vec3 vN;
    varying vec3 vV;
    varying float vSurface;
    varying float vEdge;
    ${skyLibrary}
    ${studioEnvironment}
    const float R = 0.925;
    void main() {
      vec3 n = normalize(vN);
      vec3 v = normalize(vV);
      vec3 incident = -v;
      float cosi = clamp(dot(n, v), 0.0, 1.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
      mat3 toWorld = mat3(viewMatrix);

      // 入水折射 → 走到球壁（解光线与球的交点）→ 出水折射
      vec3 t1 = refract(incident, n, 1.0 / 1.333);
      vec3 p0 = toWorld * vP;
      float b = dot(p0, t1);
      float travel = -b + sqrt(max(b * b - (dot(p0, p0) - R * R), 0.0));
      vec3 q = p0 + t1 * travel;
      vec3 exitNormal = q / R;
      vec3 t2 = refract(t1, -exitNormal, 1.333);
      bool trapped = dot(t2, t2) < 1e-4;
      vec3 seen = trapped ? vec3(0.0) : skyRadiance(t2 * toWorld);
      vec3 absorb = exp(-travel * vec3(0.95, 0.28, 0.14) * 1.4);

      vec3 light = normalize(toWorld * vec3(-0.50, 0.79, 0.38));
      float thick = 1.0 - exp(-travel * 1.2);
      vec3 scatter = vec3(0.012, 0.075, 0.105) * thick * (0.55 + 0.45 * max(dot(n, light), 0.0));
      float focus = pow(max(dot(exitNormal, -light), 0.0), 7.0);
      vec3 through = seen * absorb * 1.6 + scatter + vec3(0.55, 0.9, 1.0) * focus * thick * 0.3;
      // 内发光：从水里透出来，边缘更亮
      through += uGlowColor * uGlow * (0.5 + 0.9 * pow(1.0 - cosi, 2.0));

      vec3 reflectDir = reflect(incident, n);
      vec3 reflectWorld = reflectDir * toWorld;
      vec3 reflection = skyRadiance(reflectWorld) + studio(reflectWorld, 0.15) * 0.6;
      float mirror = clamp(fresnel * (vSurface > 0.5 ? 2.2 : 1.0) + vEdge * 0.25, 0.0, 0.9);
      float spec = pow(max(dot(reflectDir, light), 0.0), 140.0) * 2.0;
      vec3 color = mix(through, reflection, mirror) + spec * vec3(1.0, 0.97, 0.9);
      color += vec3(0.55, 0.85, 0.95) * vEdge * 0.35;
      gl_FragColor = vec4(color, uFade);
      #include <colorspace_fragment>
    }`;

  // 光晕：从节点背后透出的光，核心 + 三层缓慢旋转的六芒射线 + 周期性扩散的光环 + 云雾
  const radianceGeometry = new THREE.PlaneGeometry(2, 2);
  function createRadiance(color, strength, seed) {
    const uniforms = {
      color: { value: new THREE.Color(color) }, seed: { value: seed * 1.618 },
      strength: { value: strength }, uFade: { value: 1 }, uTime: shared.uTime,
    };
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 color;
        uniform float seed;
        uniform float strength;
        uniform float uFade;
        uniform float uTime;
        varying vec2 vUv;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 a = floor(p);
          vec2 t = fract(p);
          t = t * t * (3.0 - 2.0 * t);
          return mix(mix(hash(a), hash(a + vec2(1.0, 0.0)), t.x),
            mix(hash(a + vec2(0.0, 1.0)), hash(a + 1.0), t.x), t.y);
        }
        float mist(vec2 p) {
          return noise(p) * 0.55 + noise(p * 2.03 + 11.1) * 0.29 + noise(p * 4.12 - 7.4) * 0.16;
        }
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          float a = atan(p.y, p.x);
          float breathe = 0.86 + 0.14 * sin(uTime * 1.7 + seed * 2.0);
          float core = exp(-7.0 * r * r);
          float glow = exp(-2.6 * r);
          float rays = 0.0;
          for (int i = 0; i < 3; i++) {
            float angle = a + seed + uTime * (0.04 + 0.03 * float(i)) + float(i) * 0.5236;
            rays += pow(abs(cos(angle * 3.0)), 40.0 + 50.0 * float(i)) * (0.55 - 0.15 * float(i));
          }
          rays *= exp(-3.0 * r) * smoothstep(0.0, 0.08, r);
          float phase = fract(uTime * 0.28 + seed * 0.37);
          float ring = exp(-pow((r - (0.28 + 0.62 * phase)) / 0.035, 2.0)) * (1.0 - phase);
          vec2 q = mat2(0.81, -0.59, 0.59, 0.81) * p;
          float wisps = smoothstep(0.2, 0.85, mist(q * 5.0 + seed + uTime * 0.03));
          float edge = 1.0 - smoothstep(0.72, 1.0, r);
          float intensity = (core * 0.55 + glow * (0.3 + 0.4 * wisps) + rays * 0.6 + ring * 0.5)
            * edge * breathe * strength * uFade;
          gl_FragColor = vec4(color, intensity);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(radianceGeometry, material);
    mesh.scale.setScalar(3.6);
    mesh.renderOrder = 3;
    return { mesh, fade: uniforms.uFade };
  }
  // 已掌握节点周围缓缓盘旋的碎光
  function createSparkles(color, seed) {
    const count = 20;
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // 用节点序号做种子的伪随机，保证每次载入的样子一致
      for (let k = 0; k < 3; k++) seeds[i * 3 + k] = (Math.sin((seed * 31 + i * 7 + k * 13) * 12.9898) * 43758.5453) % 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds.map(Math.abs), 3));
    const uniforms = { color: { value: new THREE.Color(color) }, uFade: { value: 1 }, uTime: shared.uTime, uViewport: shared.uViewport };
    const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
      vertexShader: `
        attribute vec3 aSeed;
        uniform float uTime;
        uniform float uViewport;
        varying float vTwinkle;
        void main() {
          float angle = aSeed.x * 6.2831 + uTime * (0.25 + aSeed.z * 0.45);
          float tilt = aSeed.z * 3.14159;
          float radius = 1.7 + aSeed.y * 1.4;
          vec3 pos = vec3(cos(angle), sin(angle) * cos(tilt), sin(angle) * sin(tilt)) * radius;
          vec4 view = modelViewMatrix * vec4(pos, 1.0);
          vTwinkle = 0.45 + 0.55 * sin(uTime * 3.0 + aSeed.x * 40.0);
          float worldScale = length(modelMatrix[0].xyz);
          gl_PointSize = max(1.5, 0.16 * worldScale * projectionMatrix[1][1] * uViewport * 0.5 / -view.z);
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        uniform vec3 color;
        uniform float uFade;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float spark = pow(max(1.0 - d, 0.0), 2.0);
          gl_FragColor = vec4(color * 2.2, spark * vTwinkle * uFade);
          #include <colorspace_fragment>
        }`,
    }));
    points.frustumCulled = false;
    points.renderOrder = 4;
    return { points, fade: uniforms.uFade };
  }

  let records = [];
  let pickTargets = [];
  const buildRecords = () => positions.map((position, id) => {
    const group = new THREE.Group();
    group.position.copy(position);
    group.scale.setScalar(1e-4);
    scene.add(group);
    const state = stateOf(id);
    const baseDim = state === "locked" ? 0.42 : 1;
    const glassMat = glassMaterial(baseDim);
    const glass = new THREE.Mesh(sphereGeometry, glassMat);
    glass.userData.id = id;
    glass.renderOrder = 1;
    group.add(glass);
    const progress = concepts[id][4] / 100;
    const fadeUniforms = [];
    let uniforms = null;
    if (progress > 0) {
      // 由球冠体积反解水位高度，保证水量与进度成正比
      const level = -0.925 * 2 * Math.sin(Math.asin(1 - 2 * progress) / 3);
      const glow = GLOW[state];
      uniforms = {
        level: { value: level }, phase: { value: 0 }, energy: { value: 0 }, tilt: { value: 0 },
        uGlowColor: { value: new THREE.Color(glow.color) }, uGlow: { value: glow.strength }, uFade: { value: 1 },
      };
      fadeUniforms.push(uniforms.uFade);
      const full = progress === 1;
      const liquid = new THREE.Mesh(full ? sphereGeometry : fluidGeometry, new THREE.ShaderMaterial({
        uniforms, vertexShader: full ? fullFluidVertex : fluidVertex, fragmentShader: fluidFragment,
        transparent: true,
      }));
      liquid.renderOrder = -1;
      if (full) liquid.scale.setScalar(0.925);
      group.add(liquid);
    }
    let halo = null;
    if (progress === 1) {
      const mastered = state === "mastered";
      const radiance = createRadiance(mastered ? "#ffb347" : "#8fdde6", mastered ? 1.25 : 0.5, id);
      halo = radiance.mesh;
      group.add(halo);
      fadeUniforms.push(radiance.fade);
      if (mastered) {
        const sparkles = createSparkles("#ffcf7a", id);
        group.add(sparkles.points);
        fadeUniforms.push(sparkles.fade);
      }
    }
    const marker = document.createElement("div");
    marker.className = "ks-marker";
    marker.hidden = true;
    const number = document.createElement("span");
    number.className = "ks-number";
    number.textContent = `${concepts[id][4]}%`;
    const name = document.createElement("span");
    name.className = "ks-name";
    name.textContent = displayName(id);
    marker.append(number, name);
    labels.append(marker);
    return { group, glass, glassMat, baseDim, halo, uniforms, fadeUniforms, marker, number };
  });

  /* ---------- 连线：弧线 + 沿前置→后续方向流动的光点 ---------- */
  // 三类线共用同一套着色：按到相机的距离淡出远侧，aDim 让远离焦点的边变淡，并可叠加流光
  const shared = {
    uTime: { value: 0 }, uCamDist: { value: 4 }, uReveal: { value: 0 }, uViewport: { value: 600 },
  };
  function lineMaterial(color, alpha, flow) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { ...shared, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uFlow: { value: flow } },
      vertexShader: `
        attribute float aS;
        attribute float aDim;
        uniform float uCamDist;
        varying float vS;
        varying float vFade;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          vS = aS;
          vFade = aDim * mix(1.0, 0.28, smoothstep(uCamDist - 0.9, uCamDist + 1.25, length(view.xyz)));
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uAlpha;
        uniform float uFlow;
        uniform float uTime;
        uniform float uReveal;
        varying float vS;
        varying float vFade;
        void main() {
          // fract 的值随弧长递增，pow 把它压成「亮头 + 长尾」的彗星形状
          float comet = pow(fract(vS * 1.5 - uTime * 0.45), 10.0);
          float alpha = uAlpha * vFade * (1.0 + uFlow * 3.2 * comet) * uReveal;
          vec3 color = mix(uColor, vec3(1.0, 0.95, 0.80), uFlow * comet * 0.7);
          gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
          #include <colorspace_fragment>
        }`,
    });
  }
  const ARC_STEPS = 20;
  function linesWithCapacity(segmentCount, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segmentCount * 6), 3));
    geometry.setAttribute("aS", new THREE.BufferAttribute(new Float32Array(segmentCount * 2), 1));
    geometry.setAttribute("aDim", new THREE.BufferAttribute(new Float32Array(segmentCount * 2).fill(1), 1));
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    scene.add(lines);
    return lines;
  }
  const mutedLines = linesWithCapacity(maxEdges * ARC_STEPS, lineMaterial("#4f9bb0", 0.4, 0));
  const activeLines = linesWithCapacity(maxEdges * ARC_STEPS, lineMaterial("#f0cf8b", 0.8, 1));

  // 两点之间：方向沿大圆弧插值、半径线性插值；与原点相连的边保持直线（辐条）
  function arcPoint(a, b, t, out) {
    const ra = a.length(), rb = b.length();
    if (ra < 1e-3 || rb < 1e-3) return out.lerpVectors(a, b, t);
    const omega = Math.acos(THREE.MathUtils.clamp(a.dot(b) / (ra * rb), -1, 1));
    if (omega < 1e-3) return out.lerpVectors(a, b, t);
    const w = Math.sin(omega);
    out.copy(a).multiplyScalar(Math.sin((1 - t) * omega) / (w * ra)).addScaledVector(b, Math.sin(t * omega) / (w * rb));
    // 弧线中段略微外抬，像悬在球面上方的轨道
    return out.multiplyScalar((ra + (rb - ra) * t) * (1 + 0.035 * Math.sin(Math.PI * t)));
  }

  // 黄铜刻度环：三道倾斜的环 + 每 5° 一格、每 30° 一长格的刻度
  const brassRing = lineMaterial("#d8b87a", 0.2, 0);
  const brassTicks = lineMaterial("#d8b87a", 0.28, 0);
  const tickAxis = new THREE.Vector3(1, 0, 0);
  for (const tilt of [0.23, 0.98, 1.82]) {
    const outline = [], ticks = [];
    const normal = new THREE.Vector3(0, 1, 0).applyAxisAngle(tickAxis, tilt);
    for (let i = 0; i < 96; i++) {
      const angle = i * Math.PI / 48;
      outline.push(new THREE.Vector3(Math.cos(angle) * 1.23, 0, Math.sin(angle) * 1.23).applyAxisAngle(tickAxis, tilt));
    }
    for (let i = 0; i < 72; i++) {
      const angle = i * Math.PI / 36;
      const point = new THREE.Vector3(Math.cos(angle) * 1.23, 0, Math.sin(angle) * 1.23).applyAxisAngle(tickAxis, tilt);
      const half = i % 6 === 0 ? 0.03 : 0.012;
      ticks.push(point.clone().addScaledVector(normal, -half), point.clone().addScaledVector(normal, half));
    }
    const ringGeometry = new THREE.BufferGeometry().setFromPoints(outline);
    ringGeometry.setAttribute("aS", new THREE.Float32BufferAttribute(new Float32Array(outline.length), 1));
    ringGeometry.setAttribute("aDim", new THREE.Float32BufferAttribute(new Float32Array(outline.length).fill(1), 1));
    const tickGeometry = new THREE.BufferGeometry().setFromPoints(ticks);
    tickGeometry.setAttribute("aS", new THREE.Float32BufferAttribute(new Float32Array(ticks.length), 1));
    tickGeometry.setAttribute("aDim", new THREE.Float32BufferAttribute(new Float32Array(ticks.length).fill(1), 1));
    scene.add(new THREE.LineLoop(ringGeometry, brassRing), new THREE.LineSegments(tickGeometry, brassTicks));
  }

  // 选中标记：始终朝向相机的双层刻度圈，外圈三段弧缓慢旋转
  const reticle = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...shared, uColor: { value: new THREE.Color("#f0cf8b") } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uReveal;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float w = fwidth(r) * 1.2;
        float outer = smoothstep(0.035 + w, 0.0, abs(r - 0.86));
        float arcs = step(0.0, sin(a * 3.0 + uTime * 0.6));
        float inner = smoothstep(0.018 + w, 0.0, abs(r - 0.76)) * step(0.0, sin(a * 18.0 - uTime * 0.5)) * 0.55;
        gl_FragColor = vec4(uColor, (outer * (0.3 + 0.7 * arcs) + inner) * 0.9 * uReveal);
        #include <colorspace_fragment>
      }`,
  }));
  reticle.renderOrder = 5;
  scene.add(reticle);

  /* ---------- 后期：泛光 ---------- */
  let composer = null, bloomPass = null;
  if (post) {
    // 半浮点 + 4 倍多重采样：让大于 1 的发光值保留下来交给泛光，同时不丢抗锯齿
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new post.EffectComposer(renderer, target);
    composer.addPass(new post.RenderPass(scene, camera));
    bloomPass = new post.UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.6, 1.0);
    composer.addPass(bloomPass);
    composer.addPass(new post.OutputPass());
  }

  /* ---------- 状态 ---------- */
  let selected = centerId;
  let focusId = null;              // null：全景；否则以该节点为中心的聚焦视图
  let yaw = HOME_YAW, pitch = HOME_PITCH;
  let fitRadius = 1.5;             // 镜头取景要容纳的半径（聚焦时缩小，即推近）
  let goal = null;                 // 相机缓动的目标朝向
  let width = 0, height = 0;
  let frame = 0, lastNow = 0, introAt = null;
  let stirredAt = -Infinity, impulse = 0;
  let drag = null, hovering = false, visible = true, labelsDirty = true, introDone = false;
  // 每个节点的「当前值」向「目标值」缓动：位置、半径、淡入程度
  let current = [], goalPos = [];
  let radius = new Float32Array(0), radiusGoal = new Float32Array(0);
  let fade = new Float32Array(0), fadeGoal = new Float32Array(0);
  const screen = new THREE.Vector3();
  const animating = () => !reducedMotion.matches && visible && !document.hidden;

  const FADE_BY_HOP = [1, 1, 0.3, 0.1];
  function overviewRadius(id) {
    if (id === centerId) return 0.26;
    return concepts[id][4] > 0 ? 0.1 : 0.062;
  }
  function focusRadius(id, hop) {
    if (hop === 0) return 0.27;
    const learned = concepts[id][4] > 0;
    return hop === 1 ? (learned ? 0.15 : 0.105) : (learned ? 0.08 : 0.058);
  }

  function fillLines(lines, list) {
    const position = lines.geometry.attributes.position;
    const along = lines.geometry.attributes.aS;
    const dimmed = lines.geometry.attributes.aDim;
    let vertex = 0;
    const previous = new THREE.Vector3(), point = new THREE.Vector3();
    for (const [from, to] of list) {
      const a = current[from], b = current[to];
      const chord = a.distanceTo(b);
      // 两端按节点半径内缩，线不会钻进水体或压住数字
      const start = radius[from] * 1.2 / chord, end = 1 - radius[to] * 1.2 / chord;
      if (!(end - start > 0.03)) continue;
      // 平方让远处的边比远处的节点淡得更快，不会有长线横穿整个画面
      const dim = Math.min(fade[from], fade[to]) ** 2;
      let travelled = start * chord;
      arcPoint(a, b, start, previous);
      for (let step = 1; step <= ARC_STEPS; step++) {
        arcPoint(a, b, start + (end - start) * step / ARC_STEPS, point);
        position.setXYZ(vertex, previous.x, previous.y, previous.z);
        along.setX(vertex, travelled);
        dimmed.setX(vertex++, dim);
        travelled += previous.distanceTo(point);
        position.setXYZ(vertex, point.x, point.y, point.z);
        along.setX(vertex, travelled);
        dimmed.setX(vertex++, dim);
        previous.copy(point);
      }
    }
    lines.geometry.setDrawRange(0, vertex);
    position.needsUpdate = along.needsUpdate = dimmed.needsUpdate = true;
  }
  function updateEdges() {
    const muted = [], active = [];
    for (const edge of edges) (edge.includes(selected) ? active : muted).push(edge);
    fillLines(mutedLines, muted);
    fillLines(activeLines, active);
  }

  function projectLabels() {
    const occupied = [];
    // 只给焦点和直接相连的节点标名字；全景模式下焦点是中心枢纽
    const order = new Set([selected, ...adjacency[selected]]);
    for (const record of records) record.marker.hidden = true;
    for (const id of order) {
      const record = records[id];
      const featured = id === selected;
      if (!featured && (displayName(id) === "???" ||
        (focusId === null && camera.position.dot(current[id]) < 0))) continue;
      screen.copy(current[id]).project(camera);
      if (Math.abs(screen.x) > 0.95 || Math.abs(screen.y) > 0.91) continue;
      pointer.set(screen.x, screen.y);
      raycaster.setFromCamera(pointer, camera);
      // 被别的节点挡住的标签不显示
      if (raycaster.intersectObjects(pickTargets, false)[0]?.object !== record.glass) continue;
      const depth = -current[id].clone().applyMatrix4(camera.matrixWorldInverse).z;
      const pixels = record.group.scale.x * height / (2 * depth * Math.tan(camera.fov * rad / 2));
      const x = (screen.x + 1) * width / 2;
      const y = (1 - screen.y) * height / 2;
      const half = displayName(id).length * 6.5 + 6;
      // 选中节点的名字被样式推到刻度圈外（见 .ks-marker[data-selected]），这里的位置要和样式一致
      const labelY = featured ? y + pixels * 1.8 + 6 : y + pixels + 8;
      if (x < half || x + half > width || labelY > height - 18 ||
        occupied.some(box => Math.abs(box.x - x) < box.half + half && Math.abs(box.y - labelY) < 17)) continue;
      occupied.push({ x, y: labelY, half });
      record.marker.style.left = `${x}px`;
      record.marker.style.top = `${y}px`;
      record.marker.style.setProperty("--node-radius", `${pixels}px`);
      record.number.hidden = !featured && pixels < 13;
      record.marker.hidden = false;
    }
  }

  function render(now) {
    if (!width || !height) return;
    const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0;
    lastNow = now;
    const still = reducedMotion.matches;
    if (introAt === null) introAt = now;
    const intro = still ? Infinity : (now - introAt) / 1000;

    // 节点位置、半径、淡入程度向目标缓动
    const ease = 1 - Math.exp(-dt * 4.2);
    let morphing = false;
    for (let i = 0; i < records.length; i++) {
      if (current[i].distanceToSquared(goalPos[i]) > 1e-6) { current[i].lerp(goalPos[i], ease); morphing = true; }
      else current[i].copy(goalPos[i]);
      radius[i] += (radiusGoal[i] - radius[i]) * ease;
      fade[i] += (fadeGoal[i] - fade[i]) * ease;
      if (Math.abs(radiusGoal[i] - radius[i]) > 1e-4 || Math.abs(fadeGoal[i] - fade[i]) > 1e-3) morphing = true;
    }
    if (morphing) updateEdges();

    // 相机：选中节点后缓动转向；全景模式下空闲时极慢地自转，拖动或悬停时停住
    let moving = !introDone || !!drag || morphing;
    if (goal) {
      const k = 1 - Math.exp(-dt * 5.5);
      yaw += wrapAngle(goal.yaw - yaw) * k;
      pitch += (goal.pitch - pitch) * k;
      if (Math.abs(wrapAngle(goal.yaw - yaw)) < 0.002 && Math.abs(goal.pitch - pitch) < 0.002) goal = null;
      moving = true;
    } else if (!drag && !hovering && !still && focusId === null) {
      yaw += dt * 0.035;
      moving = true;
    }
    const v = camera.fov * rad / 2;
    const fit = Math.min(v, Math.atan(Math.tan(v) * camera.aspect));
    // 聚焦时镜头推近，让这一圈邻居占满画面
    fitRadius += ((focusId === null ? 1.5 : 1.22) - fitRadius) * ease;
    const distance = fitRadius / Math.sin(fit);
    camera.position.set(
      distance * Math.cos(pitch) * Math.sin(yaw),
      distance * Math.sin(pitch),
      distance * Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(0, 0, 0);

    // 入场：节点按序号依次弹出，之后连线与标签再淡入
    for (let i = 0; i < records.length; i++) {
      const k = still ? 1 : easeOutBack(THREE.MathUtils.clamp((intro - i * 0.03) / 0.8, 0, 1));
      const record = records[i];
      record.group.position.copy(current[i]);
      record.group.scale.setScalar(Math.max(1e-4, radius[i] * k));
      record.glassMat.uniforms.uDim.value = record.baseDim * fade[i];
      for (const uniform of record.fadeUniforms) uniform.value = fade[i];
    }
    shared.uReveal.value = still ? 1 : smooth(0.7, 1.7, intro);
    if (!introDone) {
      labels.style.opacity = still ? 1 : smooth(1.1, 1.8, intro);
      if (intro > 2.2) introDone = true;
    }
    shared.uTime.value = now / 1000;
    shared.uCamDist.value = distance;
    activeLines.material.uniforms.uFlow.value = still ? 0 : 1;
    // 圆片半径取球体轮廓在原点平面上的投影半径，使亮环正好贴住透视后的球缘
    atmosphere.scale.setScalar(ATMOSPHERE_RADIUS / Math.sqrt(1 - (ATMOSPHERE_RADIUS / distance) ** 2));
    atmosphere.quaternion.copy(camera.quaternion);

    const elapsed = Math.min(now - stirredAt, 1500);
    const decay = Math.max(0, 1 - elapsed / 1500);
    // 水面一直有极轻微的起伏，拖动或点选时才会明显晃动
    const energy = still ? 0 : 0.16 + 0.84 * decay;
    for (const { group, halo, uniforms } of records) {
      if (uniforms) {
        uniforms.phase.value = now / 260;
        uniforms.energy.value = energy;
        uniforms.tilt.value = impulse * decay * Math.cos(elapsed / 134);
      }
      if (halo) {
        // 让水体遮住光晕中心，光向外透出
        halo.position.subVectors(group.position, camera.position).normalize().multiplyScalar(0.64);
        halo.quaternion.copy(camera.quaternion);
      }
    }
    reticle.position.copy(current[selected]);
    reticle.scale.setScalar(Math.max(1e-4, records[selected].group.scale.x * 1.75));
    reticle.quaternion.copy(camera.quaternion);

    if (composer) composer.render();
    else renderer.render(scene, camera);
    if (moving || labelsDirty) {
      projectLabels();
      labelsDirty = false;
    }
  }
  function tick(now) {
    frame = 0;
    render(now);
    if (animating()) frame = requestAnimationFrame(tick);
  }
  const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };
  function stir(tilt) {
    stirredAt = performance.now();
    impulse = THREE.MathUtils.clamp(tilt, -0.35, 0.35);
    wake();
  }

  // 聚焦到某个节点（null 回到全景）：重新计算所有节点的目标位置，剩下的交给 render 缓动
  function focusOn(id) {
    const still = reducedMotion.matches;
    focusId = id;
    selected = id === null ? centerId : id;
    let view;
    if (id === null) {
      positions.forEach((point, i) => {
        goalPos[i].copy(point);
        fadeGoal[i] = 1;
        radiusGoal[i] = overviewRadius(i);
      });
      goal = { yaw: HOME_YAW, pitch: HOME_PITCH };
    } else {
      const layout = layoutFocus(id);
      layout.goal.forEach((point, i) => {
        goalPos[i].copy(point);
        fadeGoal[i] = FADE_BY_HOP[Math.min(layout.hop[i], 3)] ?? FADE_BY_HOP[3];
        radiusGoal[i] = focusRadius(i, layout.hop[i]);
      });
      const gaze = new THREE.Vector3(
        Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
      view = bestViewDirection(layout.dirs, gaze);
      goal = { yaw: Math.atan2(view.x, view.z), pitch: THREE.MathUtils.clamp(Math.asin(view.y), -1.43, 1.43) };
    }
    if (still) {
      current.forEach((point, i) => { point.copy(goalPos[i]); radius[i] = radiusGoal[i]; fade[i] = fadeGoal[i]; });
      ({ yaw, pitch } = goal);
      goal = null;
    }
    records.forEach((record, i) => { record.marker.dataset.selected = String(i === selected); });
    progressLabel.textContent = `${displayName(selected)}，学习进度 ${concepts[selected][4]}%${concepts[selected][5] ? "，已掌握" : ""}`;
    updateEdges();
    labelsDirty = true;
    wake();
  }

  // 载入一门课程：释放旧节点的材质，重建位置、连线与标签，并重播入场动画
  function loadCourse(index) {
    for (const { group, marker } of records) {
      scene.remove(group);
      marker.remove();
      group.traverse(object => object.material?.dispose());
    }
    ({ concepts } = courses[index]);
    // 边的方向是「前置 → 后续」，流光沿这个方向移动
    edges = concepts.flatMap((node, to) => node[3].map(from => [from, to]));
    adjacency = concepts.map(() => new Set());
    reachable = new Set();
    for (const [from, to] of edges) {
      adjacency[from].add(to);
      adjacency[to].add(from);
      if (concepts[from][4] === 100) reachable.add(to);
      if (concepts[to][4] === 100) reachable.add(from);
    }
    positions = buildPositions(concepts);
    records = buildRecords();
    pickTargets = records.map(record => record.glass);
    current = positions.map(point => point.clone());
    goalPos = positions.map(point => point.clone());
    radiusGoal = Float32Array.from(concepts, (_, i) => overviewRadius(i));
    radius = radiusGoal.slice();
    fadeGoal = new Float32Array(concepts.length).fill(1);
    fade = fadeGoal.slice();
    yaw = HOME_YAW;
    pitch = HOME_PITCH;
    fitRadius = 1.5;
    goal = null;
    introAt = null;
    introDone = false;
    labels.style.opacity = 0;
    picker.value = String(index);
    focusOn(null);
    goal = null;
  }

  /* ---------- 交互 ---------- */
  function pick(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(2 * (event.clientX - bounds.left) / bounds.width - 1, 1 - 2 * (event.clientY - bounds.top) / bounds.height);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickTargets, false)[0];
  }
  picker.replaceChildren(...courses.map((course, index) => new Option(course.name, index)));
  picker.addEventListener("change", () => loadCourse(Number(picker.value)));
  // 键盘：方向键依次切换节点，Home 或 Esc 回到全景
  canvas.addEventListener("keydown", event => {
    if (event.key === "Home" || event.key === "Escape") {
      event.preventDefault();
      focusOn(null);
      stir(0.2);
      return;
    }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    focusOn((selected + step + concepts.length) % concepts.length);
    stir(0.28);
  });
  canvas.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, lastX: event.clientX, yaw, pitch };
    goal = null;
    canvas.style.cursor = "";
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (!event.isPrimary) return;
    if (!drag) {
      // 悬停在节点上时提示可点选
      canvas.style.cursor = pick(event) ? "pointer" : "";
      return;
    }
    yaw = drag.yaw - (event.clientX - drag.x) * 0.009;
    pitch = THREE.MathUtils.clamp(drag.pitch + (event.clientY - drag.y) * 0.008, -1.43, 1.43);
    labelsDirty = true;
    stir((event.clientX - drag.lastX) * 0.03);
    drag.lastX = event.clientX;
  });
  canvas.addEventListener("pointerup", event => {
    if (!drag || !event.isPrimary) return;
    const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
    drag = null;
    if (distance > 5) return;
    const hit = pick(event);
    // 点节点：以它为中心；点空白处：回到全景
    if (hit) {
      if (hit.object.userData.id !== focusId) focusOn(hit.object.userData.id);
    } else if (focusId !== null) {
      focusOn(null);
    }
    stir(0.18);
  });
  canvas.addEventListener("lostpointercapture", () => { drag = null; });
  canvas.addEventListener("pointerenter", () => { hovering = true; });
  canvas.addEventListener("pointerleave", () => { hovering = false; wake(); });
  function resize() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    if (composer) {
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
    }
    shared.uViewport.value = height * ratio;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    labelsDirty = true;
    wake();
  }
  // 滚出视口或切到后台时停止逐帧渲染，回来后再恢复
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); }).observe(stage);
  document.addEventListener("visibilitychange", wake);
  reducedMotion.addEventListener("change", () => { labelsDirty = true; wake(); });

  loadCourse(0);
  new ResizeObserver(resize).observe(stage);
  resize();
  root.dataset.renderer = composer ? "three-webgl-bloom" : "three-webgl";
})();
