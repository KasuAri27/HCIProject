/* 学习助手 · 批注台 — 第二阶段前端 */
"use strict";

// ------------------------------------------------------------
// 状态
// ------------------------------------------------------------
let session = null;
let libraryState = { documents: [], overview: {}, library: {}, jobs: [] };
let documents = [];
let currentDoc = null;
let currentContent = null;
let currentVersionId = "";
let currentBlocks = [];
let currentViewMode = "markdown";
let currentPdfUrl = "";
let annotations = [];
let selectedDocId = "";

let chatMessages = [];
let notesDocId = "";
let notesTitle = "";
let notesContent = "";
let notesDirty = false;
let notesSuggestions = [];
let notesDraftText = "";
let notesAutoSuggestDoc = "";
let notesSaveTimer = null;
let notesSaving = false;

let questionCache = "";
let exerciseDocId = "";
let lastSubmission = null;

let selection = null;
let spotBubbleLoading = false;
let activeTab = "chat";
let docToken = 0;

let jobsTimer = null;
let jobsPolling = false;
let positionTimer = null;
let suppressPositionSave = true;

let notesUndoStack = [];
let notesUndoTimer = null;
let notesLastValue = "";
let checkQuestion = "";
let checkSelection = null;
let checkId = "";
let lastExerciseEvidenceId = "";
let positionStatusTimer = null;
let readFontSize = 17;
let readLineHeight = 1.85;

/** block_id -> {doc_id, title, locator}，用于跨文档引用跳转 */
let citeDocs = {};
let searchTimer = null;
let searchSeq = 0;

const FORMAT_LABEL = { md: "MD", txt: "TXT", docx: "DOCX", pptx: "PPTX", pdf: "PDF" };
const SKILL_LEVELS = ["不会", "了解", "能用", "熟悉"];

// ------------------------------------------------------------
// DOM
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const btnRailToggle = $("btn-rail-toggle");
const btnAnnotToggle = $("btn-annot-toggle");
const btnFocus = $("btn-focus");
const btnHelp = $("btn-help");
const helpModal = $("help-modal");
const btnHelpClose = $("btn-help-close");
const topbarCrumb = $("topbar-crumb");
const btnImport = $("btn-import");
const importInput = $("import-input");
const btnLlmStatus = $("llm-status");
const btnRefreshLibrary = $("btn-refresh-library");
const btnConfig = $("btn-config");
const btnWorkspace = $("btn-workspace");
const btnReset = $("btn-reset");
const modelMenu = $("model-menu");
const jobStrip = $("job-strip");

const railLeft = $("rail-left");
const railRight = $("rail-right");
const libraryCount = $("library-count");
const librarySearch = $("library-search");
const libraryAlert = $("library-alert");
const libraryTree = $("library-tree");
const searchPanel = $("search-panel");
const searchSummary = $("search-summary");
const searchResults = $("search-results");
const btnAskCross = $("btn-ask-cross");
const readRatio = $("read-ratio");
const readBar = $("read-bar");
const noteCountEl = $("note-count");
const exerciseCountEl = $("exercise-count");
const gutterLeft = $("gutter-left");
const gutterRight = $("gutter-right");

const docHead = $("doc-head");
const docTitle = $("doc-title");
const docCall = $("doc-call");
const docVersion = $("doc-version");
const docVersionNote = $("doc-version-note");
const docOriginal = $("doc-original");
const positionStatusEl = $("position-status");
const readLevelSelect = $("read-level");
const btnReadSettings = $("btn-read-settings");
const readSettings = $("read-settings");
const btnFontDec = $("btn-font-dec");
const btnFontInc = $("btn-font-inc");
const fontSizeLabel = $("font-size-label");
const lineHeightSelect = $("line-height");
const btnPrereq = $("btn-prereq");
const docProgressBar = $("doc-progress-bar");
const docScroll = $("doc-scroll");
const docEmpty = $("doc-empty");
const pdfView = $("pdf-view");
const pdfFrame = $("pdf-frame");
const docPage = $("doc-page");
const docBody = $("doc-body");

const bubble = $("select-bubble");
const bubbleClose = $("select-bubble-close");
const bubbleQuote = $("select-bubble-quote");
const bubbleInput = $("select-bubble-input");
const bubbleAnswer = $("select-bubble-answer");
const btnSpotAsk = $("btn-spot-ask");
const btnThrowChat = $("btn-throw-chat");
const btnQuoteNote = $("btn-quote-note");
const btnHighlight = $("btn-highlight");
const btnModeExplain = $("btn-mode-explain");
const btnModeExample = $("btn-mode-example");
const btnModePrereq = $("btn-mode-prereq");
const btnModeCheck = $("btn-mode-check");
const checkAnswerWrap = $("check-answer-wrap");
const checkAnswer = $("check-answer");
const btnCheckSubmit = $("btn-check-submit");
const checkFeedback = $("check-feedback");
const checkSelfRate = $("check-self-rate");

const tabButtons = Array.from(document.querySelectorAll(".tab"));
const tabInk = $("tab-ink");
const badgeChat = $("badge-chat");
const badgeAnnotations = $("badge-annotations");
const dotNotes = $("dot-notes");
const dotExercise = $("dot-exercise");
const dotReview = $("dot-review");
const annotCount = $("annot-count");
const annotationsList = $("annotations-list");
const chatMessagesEl = $("chat-messages");
const chatInput = $("chat-input");
const btnChatSend = $("btn-chat-send");
const notesEmpty = $("notes-empty");
const notesLayout = $("notes-layout");
const notesSaveStatus = $("notes-save-status");
const btnNotesSave = $("btn-notes-save");
const btnNotesUndo = $("btn-notes-undo");
const btnNotesExport = $("btn-notes-export");
const notesContentEl = $("notes-content");
const notesInstruction = $("notes-instruction");
const btnNotesDraft = $("btn-notes-draft");
const notesDraftWrap = $("notes-draft-wrap");
const notesDraftBody = $("notes-draft-body");
const notesDraftReplace = $("notes-draft-replace");
const btnNotesDraftApply = $("btn-notes-draft-apply");
const btnNotesDraftDiscard = $("btn-notes-draft-discard");
const btnNotesRefreshSuggest = $("btn-notes-refresh-suggest");
const notesSuggestionsList = $("notes-suggestions-list");
const btnExercise = $("btn-exercise");
const exerciseDifficulty = $("exercise-difficulty");
const exerciseQuestion = $("exercise-question");
const codeEditor = $("code-editor");
const btnSubmit = $("btn-submit");
const exerciseReview = $("exercise-review");
const btnExerciseNext = $("btn-exercise-next");
const exerciseSelfRate = $("exercise-self-rate");
const exerciseEvidenceStatus = $("exercise-evidence-status");
const lastReview = $("last-review");
const understandingCountEl = $("understanding-count");
const practiceCountEl = $("practice-count");

const confirmModal = $("confirm-modal");
const confirmModalTitle = $("confirm-modal-title");
const confirmModalBody = $("confirm-modal-body");
const btnConfirmCancel = $("btn-confirm-cancel");
const btnConfirmOk = $("btn-confirm-ok");
let confirmResolver = null;

const prereqModal = $("prereq-modal");
const prereqFocus = $("prereq-focus");
const prereqQuestions = $("prereq-questions");
const prereqEmpty = $("prereq-empty");
const btnPrereqSkip = $("btn-prereq-skip");
const btnPrereqSubmit = $("btn-prereq-submit");
const toastEl = $("toast");

// ------------------------------------------------------------
// 工具
// ------------------------------------------------------------
function showToast(message, duration = 3200) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => (toastEl.hidden = true), duration);
}

async function api(path, options = {}) {
  let resp;
  try {
    resp = await fetch(path, options);
  } catch (e) {
    throw new Error("无法连接后端服务，请先运行 python launcher/launcher.py");
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `请求失败（HTTP ${resp.status}）`);
  return data;
}

async function postJson(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchJson(path, body) {
  return api(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = String(s ?? "");
  return div.innerHTML;
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function llmConfigured() {
  return !!(session && session.llm_configured);
}

function ready() {
  return !!(currentDoc && currentContent && currentContent.status === "ready");
}

function currentDocId() {
  return (currentDoc && currentDoc.id) || selectedDocId || "";
}

function isNarrow() {
  return window.matchMedia("(max-width: 900px)").matches;
}

// ------------------------------------------------------------
// 标签 & 侧栏抽屉
// ------------------------------------------------------------
function moveTabInk() {
  const active = tabButtons.find((b) => b.classList.contains("is-active"));
  if (!active) return;
  tabInk.style.left = `${active.offsetLeft}px`;
  tabInk.style.width = `${active.offsetWidth}px`;
}

function switchTab(name) {
  activeTab = name;
  tabButtons.forEach((btn) => {
    const on = btn.dataset.pane === `pane-${name}`;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
    const pane = $(btn.dataset.pane);
    if (pane) {
      pane.classList.toggle("is-active", on);
      pane.hidden = !on;
    }
  });
  moveTabInk();
  if (name === "notes") onNotesTabShown();
  if (name === "annotations") renderAnnotations();
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.pane.replace("pane-", "")));
  btn.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const index = tabButtons.indexOf(btn);
    const next = e.key === "ArrowRight" ? index + 1 : index - 1;
    const target = tabButtons[(next + tabButtons.length) % tabButtons.length];
    target.focus();
    switchTab(target.dataset.pane.replace("pane-", ""));
  });
});

function syncScrim() {
  document.body.classList.toggle(
    "has-scrim",
    document.body.classList.contains("rail-left-open") ||
      document.body.classList.contains("rail-right-open")
  );
}

btnRailToggle.addEventListener("click", () => {
  document.body.classList.toggle("rail-left-open");
  document.body.classList.remove("rail-right-open");
  syncScrim();
});
btnAnnotToggle.addEventListener("click", () => {
  document.body.classList.toggle("rail-right-open");
  document.body.classList.remove("rail-left-open");
  syncScrim();
});
document.addEventListener("click", (e) => {
  if (e.target === document.body && document.body.classList.contains("has-scrim")) {
    document.body.classList.remove("rail-left-open", "rail-right-open");
    syncScrim();
  }
});

function openRightRail() {
  if (isNarrow()) {
    document.body.classList.add("rail-right-open");
    document.body.classList.remove("rail-left-open");
    syncScrim();
  }
}

// ------------------------------------------------------------
// 可拖拽分栏
// ------------------------------------------------------------
function bindGutter(gutter, rail, side, storageKey, min, max) {
  if (!gutter || !rail) return;
  const apply = (px) => {
    const value = Math.max(min, Math.min(max, px));
    document.documentElement.style.setProperty(
      side === "left" ? "--rail-l" : "--rail-r",
      `${Math.round(value)}px`
    );
    try {
      localStorage.setItem(storageKey, String(Math.round(value)));
    } catch (e) {
      /* ignore */
    }
    moveTabInk();
  };
  try {
    const stored = parseInt(localStorage.getItem(storageKey) || "", 10);
    if (Number.isFinite(stored)) apply(stored);
  } catch (e) {
    /* ignore */
  }
  gutter.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rail.getBoundingClientRect().width;
    document.body.classList.add("is-resizing");
    const move = (ev) => {
      const delta = ev.clientX - startX;
      apply(side === "left" ? startWidth + delta : startWidth - delta);
    };
    const up = () => {
      document.body.classList.remove("is-resizing");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
  gutter.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const width = rail.getBoundingClientRect().width;
    const delta = e.key === "ArrowRight" ? 16 : -16;
    apply(side === "left" ? width + delta : width - delta);
  });
}

// ------------------------------------------------------------
// 资料库
// ------------------------------------------------------------
function applyLibrary(payload) {
  libraryState = payload || {};
  documents = Array.isArray(payload && payload.documents) ? payload.documents : [];
  if (payload && payload.overview) session = session ? { ...session, overview: payload.overview } : session;
}

function renderStats() {
  const o = (libraryState.overview || (session && session.overview) || {});
  const total = o.document_count || 0;
  const read = o.read_count || 0;
  readRatio.textContent = `${read} / ${total}`;
  readBar.style.width = total ? `${Math.max(4, Math.round((read / total) * 100))}%` : "0";
  noteCountEl.textContent = String(o.note_count || 0);
  exerciseCountEl.textContent = String(o.exercise_count || 0);
  if (understandingCountEl) understandingCountEl.textContent = String(o.understanding_count || 0);
  if (practiceCountEl) practiceCountEl.textContent = String(o.practice_count || 0);
  libraryCount.textContent = String(total);
}

function renderLibrary() {
  const query = (librarySearch.value || "").trim().toLowerCase();
  const filtered = documents.filter((doc) => {
    if (!query) return true;
    return `${doc.title || ""} ${doc.source_name || ""}`.toLowerCase().includes(query);
  });

  libraryAlert.hidden = !(libraryState.library && libraryState.library.warnings && libraryState.library.warnings.length);
  libraryAlert.textContent =
    libraryState.library && libraryState.library.warnings
      ? libraryState.library.warnings.join(" ")
      : "";

  if (!filtered.length) {
    libraryTree.innerHTML = `<p class="empty">${
      documents.length ? "没有匹配的资料。" : "还没有资料。点右上角的「导入资料」。"
    }</p>`;
    return;
  }

  const groups = new Map();
  for (const doc of filtered) {
    const key = doc.origin === "library" ? "资料库文件" : "导入的资料";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }

  const frag = document.createDocumentFragment();
  for (const [label, docs] of groups) {
    const heading = document.createElement("div");
    heading.className = "group-label";
    heading.textContent = label;
    frag.appendChild(heading);
    for (const doc of docs) {
      frag.appendChild(buildDocRow(doc));
    }
  }
  libraryTree.innerHTML = "";
  libraryTree.appendChild(frag);
}

// ------------------------------------------------------------
// 全文检索与跨资料提问
// ------------------------------------------------------------
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightSnippet(text, keywords) {
  const escaped = escapeHtml(text);
  if (!keywords || !keywords.length) return escaped;
  const terms = [...keywords]
    .sort((a, b) => b.length - a.length)
    .map((kw) => escapeRegExp(escapeHtml(kw)))
    .filter(Boolean);
  if (!terms.length) return escaped;
  try {
    return escaped.replace(new RegExp(`(${terms.join("|")})`, "gi"), "<mark>$1</mark>");
  } catch (e) {
    return escaped;
  }
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  const query = (librarySearch.value || "").trim();
  if (!query) {
    searchSeq += 1;
    searchPanel.hidden = true;
    searchResults.innerHTML = "";
    return;
  }
  searchTimer = setTimeout(runFullTextSearch, 320);
}

async function runFullTextSearch() {
  const query = (librarySearch.value || "").trim();
  if (!query) {
    searchPanel.hidden = true;
    return;
  }
  const seq = ++searchSeq;
  searchPanel.hidden = false;
  searchResults.innerHTML = '<p class="empty">检索中…</p>';
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}&limit=12`);
    if (seq !== searchSeq) return;
    renderSearchResults(data);
  } catch (e) {
    if (seq !== searchSeq) return;
    searchResults.innerHTML = `<p class="empty">${escapeHtml(e.message)}</p>`;
  }
}

function renderSearchResults(data) {
  const results = data.results || [];
  searchSummary.textContent = results.length
    ? `全文检索 · ${results.length} 条`
    : "全文检索 · 无结果";
  if (!results.length) {
    searchResults.innerHTML =
      '<p class="empty">没有匹配正文的内容。可以换个关键词，或点「跨资料提问」让助教检索。</p>';
    return;
  }
  searchResults.innerHTML = "";
  for (const hit of results) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "search-hit";
    item.dataset.docId = hit.document_id || "";
    item.dataset.blockId = hit.block_id || "";
    const head = document.createElement("span");
    head.className = "search-hit-head";
    head.textContent = `《${hit.title || "未命名"}》 · ${hit.locator || hit.chapter_title || ""}`;
    const body = document.createElement("span");
    body.className = "search-hit-snippet";
    body.innerHTML = highlightSnippet(hit.snippet || "", data.keywords);
    item.append(head, body);
    item.addEventListener("click", () => openSearchHit(hit));
    searchResults.appendChild(item);
  }
}

async function openSearchHit(hit) {
  await focusBlock(hit.block_id, hit.document_id);
}

async function askAcrossDocuments() {
  const query = (librarySearch.value || "").trim();
  if (!query) return showToast("先输入关键词");
  if (!llmConfigured()) {
    showToast("请先配置 API；全文检索仍然可用");
    return;
  }
  openRightRail();
  switchTab("chat");
  chatMessages.push({ role: "user", content: `跨资料：${query}`, via: "ask" });
  chatMessages.push({ role: "assistant", content: "正在检索并回答…", pending: true });
  renderChat();
  try {
    const data = await postJson("/api/ask", { query });
    for (const citation of data.citations || []) {
      citeDocs[citation.block_id] = citation;
    }
    chatMessages.pop();
    chatMessages.push({
      role: "assistant",
      content: data.answer || "",
      via: "ask",
      sources: data.sources || [],
    });
    renderChat();
  } catch (e) {
    chatMessages.pop();
    chatMessages.push({
      role: "assistant",
      content: `跨资料提问失败：${e.message}`,
      via: "ask",
    });
    renderChat();
    showToast(e.message, 5000);
  }
}

async function focusBlock(blockId, docId = "") {
  if (!blockId) return;
  if (docId && docId !== currentDocId()) {
    await loadDocument(docId, { markOpen: true });
  }
  if (!ready()) {
    showToast("资料尚未解析完成，暂时无法定位");
    return;
  }
  if (currentViewMode === "pdf") {
    const block = currentBlocks.find((item) => item.id === blockId);
    const locator = (block && block.locator) || {};
    const page = locator.page || locator.slide;
    if (page && currentPdfUrl) {
      const base = currentPdfUrl.split("#")[0];
      pdfFrame.src = `${base}#page=${encodeURIComponent(page)}&zoom=page-width`;
      showToast(`已定位到第 ${page} 页`);
    } else {
      showToast("已打开资料；PDF 播放模式无法精确定位该段");
    }
    return;
  }
  const block = docBody.querySelector(
    `.doc-block[data-block-id="${CSS.escape(blockId)}"]`
  );
  if (!block) {
    showToast("这条引用来自旧版本，当前资料已更新，原文无法定位");
    return;
  }
  block.scrollIntoView({ behavior: "smooth", block: "center" });
  block.classList.remove("cite-flash");
  void block.offsetWidth;
  block.classList.add("cite-flash");
  setTimeout(() => block.classList.remove("cite-flash"), 1600);
}

function buildDocRow(doc) {
  const row = document.createElement("div");
  row.className = "file";
  if (doc.id === currentDocId()) row.classList.add("is-active");
  row.title = doc.source_name || doc.title;
  row.dataset.docId = doc.id;

  const name = document.createElement("span");
  name.className = "file-name";
  name.textContent = doc.title || doc.source_name || "未命名";
  row.appendChild(name);

  const job = doc.job || null;
  if (job && (job.status === "queued" || job.status === "parsing")) {
    const status = document.createElement("span");
    status.className = "file-status";
    status.textContent = job.status === "queued" ? "等待" : `${job.progress || 0}%`;
    row.appendChild(status);
  } else if (doc.version_status === "failed" || (job && job.status === "failed")) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "file-retry";
    retry.textContent = "重试";
    retry.title = doc.version_error || (job && job.error) || "解析失败";
    retry.addEventListener("click", (e) => {
      e.stopPropagation();
      retryImportJob(job ? job.id : null);
    });
    row.appendChild(retry);
  }

  const chips = document.createElement("span");
  chips.className = "chips";
  [["读", doc.is_read], ["记", doc.has_note], ["题", doc.has_exercise]].forEach(([label, on]) => {
    const chip = document.createElement("span");
    chip.className = `chip${on ? " on" : ""}`;
    chip.textContent = label;
    chips.appendChild(chip);
  });
  row.appendChild(chips);

  const format = document.createElement("span");
  format.className = "format-badge";
  format.textContent = FORMAT_LABEL[doc.source_format] || (doc.source_format || "").toUpperCase();
  row.appendChild(format);

  row.addEventListener("click", () => loadDocument(doc.id, { markOpen: true }));
  return row;
}

function renderJobStrip() {
  const jobs = (libraryState.jobs || []).filter((j) => j.status === "queued" || j.status === "parsing");
  if (!jobs.length) {
    jobStrip.hidden = true;
    jobStrip.innerHTML = "";
    return;
  }
  jobStrip.hidden = false;
  jobStrip.innerHTML = jobs
    .map(
      (job) => `
      <div class="job-row">
        <div class="job-head">
          <span class="job-name">${escapeHtml(job.source_name || "资料")}</span>
          <span class="job-stage">${escapeHtml(job.stage || job.status)} ${job.progress || 0}%</span>
        </div>
        <div class="job-bar"><i style="width:${Math.max(0, Math.min(100, job.progress || 0))}%"></i></div>
        ${job.error ? `<div class="job-error">${escapeHtml(job.error)}</div>` : ""}
      </div>`
    )
    .join("");
}

function startJobPolling() {
  if (jobsTimer) return;
  jobsTimer = setInterval(pollJobs, 900);
}

function stopJobPolling() {
  if (jobsTimer) clearInterval(jobsTimer);
  jobsTimer = null;
}

async function pollJobs() {
  if (jobsPolling) return;
  jobsPolling = true;
  try {
    const payload = await api("/api/library");
    const wasReadyDoc = currentDocId();
    applyLibrary(payload);
    renderStats();
    renderLibrary();
    renderJobStrip();
    if (!(payload.jobs || []).length) {
      stopJobPolling();
      await refreshSessionQuiet();
      await maybeReloadCurrentDoc();
    }
  } catch (e) {
    stopJobPolling();
  } finally {
    jobsPolling = false;
  }
}

async function retryImportJob(jobId) {
  if (!jobId) {
    showToast("找不到解析任务，请点「刷新资料」重新扫描");
    return;
  }
  try {
    await postJson(`/api/imports/${jobId}/retry`, {});
    showToast("已重新开始解析");
    await fetchLibraryData();
    startJobPolling();
  } catch (e) {
    showToast(e.message, 5000);
  }
}

async function fetchLibraryData() {
  const payload = await api("/api/library");
  applyLibrary(payload);
  renderStats();
  renderLibrary();
  renderJobStrip();
  return payload;
}

async function maybeReloadCurrentDoc() {
  const id = currentDocId();
  if (!id) return;
  const doc = documents.find((d) => d.id === id);
  if (!doc) return;
  const currentReady = currentContent && currentContent.status === "ready";
  const versionChanged = doc.version_no && currentDoc && doc.version_no !== currentDoc.version_no;
  const becameReady = doc.version_status === "ready" && (!currentReady || versionChanged);
  const becameFailed = doc.version_status === "failed" && !currentReady;
  if (becameReady || becameFailed) {
    await loadDocument(id, { markOpen: false, force: true });
  }
}

async function refreshLibrary() {
  btnRefreshLibrary.disabled = true;
  try {
    const payload = await api("/api/library/scan", { method: "POST" });
    applyLibrary(payload);
    renderStats();
    renderLibrary();
    renderJobStrip();
    await maybeReloadCurrentDoc();
    if ((payload.jobs || []).length) {
      startJobPolling();
      showToast("正在解析新资料…");
    } else {
      showToast("资料库已刷新");
    }
  } catch (e) {
    showToast(e.message, 5000);
  } finally {
    btnRefreshLibrary.disabled = false;
  }
}

librarySearch.addEventListener("input", () => {
  renderLibrary();
  scheduleSearch();
});
if (btnAskCross) btnAskCross.addEventListener("click", askAcrossDocuments);
btnRefreshLibrary.addEventListener("click", refreshLibrary);

// ------------------------------------------------------------
// 导入
// ------------------------------------------------------------
btnImport.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", async () => {
  const files = Array.from(importInput.files || []);
  importInput.value = "";
  if (!files.length) return;
  btnImport.disabled = true;
  try {
    let imported = 0;
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      try {
        const data = await api("/api/import", { method: "POST", body: form });
        if (data.duplicate) {
          showToast(`${file.name}：内容已存在，跳过`);
        } else {
          imported += 1;
        }
      } catch (e) {
        showToast(`${file.name}：${e.message}`, 5000);
      }
    }
    if (imported) showToast(`已导入 ${imported} 个文件，正在后台解析`);
    await fetchLibraryData();
    if ((libraryState.jobs || []).length) startJobPolling();
  } finally {
    btnImport.disabled = false;
  }
});

// ------------------------------------------------------------
// 文档
// ------------------------------------------------------------
async function loadPage() {
  try {
    const [sessionData, libraryData] = await Promise.all([
      api("/api/session"),
      api("/api/library"),
    ]);
    session = sessionData;
    applyLibrary(libraryData);
    renderStats();
    renderLibrary();
    renderJobStrip();
    updateLlmStatus();

    selectedDocId = session.selected_document ? session.selected_document.id : "";
    if (selectedDocId) {
      currentDoc = documents.find((d) => d.id === selectedDocId) || session.selected_document;
      await loadDocument(selectedDocId, { markOpen: false });
    } else {
      showEmpty();
    }
    if ((libraryState.jobs || []).length) startJobPolling();
  } catch (e) {
    showToast(e.message, 5000);
  }
}

async function loadDocument(docId, options = {}) {
  if (!docId) return;
  if (docId === currentDocId() && currentContent && currentContent.status === "ready" && !options.force) {
    if (options.markOpen) await postJson(`/api/documents/${docId}/open`, {});
    return;
  }
  if (notesDirty) await saveNotesNow();
  await savePositionNow();

  const token = ++docToken;
  selectedDocId = docId;
  currentDoc = documents.find((d) => d.id === docId) || currentDoc;

  try {
    if (options.markOpen) await postJson(`/api/documents/${docId}/open`, {});
    const data = await api(`/api/documents/${docId}`);
    if (token !== docToken) return;

    currentDoc = data.document || currentDoc;
    currentContent = data;
    currentVersionId = data.version && data.version.id ? data.version.id : "";
    currentBlocks = data.blocks || [];
    annotations = data.annotations || [];
    exerciseReview.innerHTML = "";
    codeEditor.value = "";
    btnExerciseNext.hidden = true;
    renderDocView(data);
    await loadNotes(docId);
    await loadChat(docId);
    await loadLearningEvidence(docId);
    await refreshSessionQuiet();
    renderExercise();
    renderReview();
    updateTabBadges();
    renderSidebarActive();
    if (isNarrow()) {
      document.body.classList.remove("rail-left-open", "rail-right-open");
      syncScrim();
    }
    if (data.status !== "ready") startJobPolling();
  } catch (e) {
    if (token !== docToken) return;
    showToast(e.message, 5000);
  }
}

function renderDocView(data) {
  docHead.hidden = false;
  docTitle.textContent = (data.document && data.document.title) || "未命名资料";
  docCall.textContent =
    (data.document && (data.document.source_path || data.document.source_name)) || "";
  topbarCrumb.hidden = false;
  topbarCrumb.textContent = (data.document && (data.document.source_name || data.document.title)) || "";
  docVersion.hidden = !(data.version && data.version.number);
  docVersion.textContent = data.version && data.version.number ? `v${data.version.number}` : "";
  const versions = data.versions || [];
  if (docVersion) {
    docVersion.title = versions.length
      ? versions
          .map((v) => `v${v.version_no} · ${v.status}${v.parsed_at ? ` · ${v.parsed_at}` : ""}`)
          .join("\n")
      : "当前版本";
  }
  if (docVersionNote) {
    if (versions.length > 1) {
      const oldVersions = versions
        .slice(1)
        .map((v) => `v${v.version_no}`)
        .join("、");
      docVersionNote.hidden = false;
      docVersionNote.textContent = `资料已更新到 v${
        (data.version && data.version.number) || ""
      }；旧版本（${oldVersions}）已保留，旧标注与 AI 引用可能无法定位到当前版本。`;
    } else {
      docVersionNote.hidden = true;
      docVersionNote.textContent = "";
    }
  }
  docOriginal.hidden = !data.original_url;
  docOriginal.href = data.original_url || "#";
  btnPrereq.disabled = data.status !== "ready";
  readLevelSelect.disabled = data.status !== "ready";
  readLevelSelect.value = (data.document && data.document.read_level) || "";
  currentViewMode = data.view_mode === "pdf" ? "pdf" : "markdown";
  currentPdfUrl = data.pdf_url || "";
  setPositionStatus("", "");

  if (data.status !== "ready") {
    pdfView.hidden = true;
    docScroll.classList.remove("is-pdf");
    docPage.hidden = true;
    docEmpty.hidden = false;
    renderStatusCard(data);
    docProgressBar.style.width = "0";
    annotations = [];
    renderAnnotations();
    renderExercise();
    return;
  }

  if (data.pdf_missing) {
    docVersionNote.hidden = false;
    docVersionNote.textContent =
      "PDF 播放文件尚未生成，当前显示文本预览；可在资料柜重新解析或检查本机 Office。";
  }

  if (currentViewMode === "pdf") {
    docEmpty.hidden = true;
    docPage.hidden = true;
    pdfView.hidden = false;
    docScroll.classList.add("is-pdf");
    btnReadSettings.hidden = true;
    readSettings.hidden = true;
    docBody.innerHTML = "";
    pdfFrame.src = currentPdfUrl;
    docProgressBar.style.width = "0";
    setPositionStatus("", "PDF 播放模式 · 不记录滚动位置");
    renderAnnotations();
    return;
  }

  pdfView.hidden = true;
  docScroll.classList.remove("is-pdf");
  btnReadSettings.hidden = false;
  pdfFrame.src = "about:blank";
  docEmpty.hidden = true;
  docPage.hidden = false;
  docBody.innerHTML = data.html || "";
  typesetMath(docBody);
  attachCopyButtons(docBody);
  attachHashLinks(docBody);
  bindBlockClicks();
  applyHighlights();
  renderAnnotations();

  setTimeout(() => {
    restorePosition(data.position);
    updateDocProgress();
    setTimeout(() => {
      suppressPositionSave = false;
    }, 450);
  }, 0);
}

function applyReadingSettings() {
  document.documentElement.style.setProperty("--read-font-size", `${readFontSize}px`);
  document.documentElement.style.setProperty("--read-line-height", String(readLineHeight));
  if (fontSizeLabel) fontSizeLabel.textContent = `${readFontSize}px`;
  if (lineHeightSelect) lineHeightSelect.value = String(readLineHeight);
  try {
    localStorage.setItem("learning.readFontSize", String(readFontSize));
    localStorage.setItem("learning.readLineHeight", String(readLineHeight));
  } catch (e) {
    /* ignore */
  }
}

function loadReadingSettings() {
  try {
    const size = parseInt(localStorage.getItem("learning.readFontSize") || "", 10);
    const line = parseFloat(localStorage.getItem("learning.readLineHeight") || "");
    if (Number.isFinite(size)) readFontSize = Math.max(14, Math.min(24, size));
    if (Number.isFinite(line)) readLineHeight = Math.max(1.4, Math.min(2.4, line));
  } catch (e) {
    /* ignore */
  }
  applyReadingSettings();
}

async function setReadLevel(level) {
  if (!currentDocId()) return;
  try {
    await postJson(`/api/documents/${currentDocId()}/read-level`, { self_level: level });
    if (currentDoc) currentDoc.read_level = level;
    readLevelSelect.value = level;
    showToast(level ? `读后自评：${level}` : "已清除读后自评");
  } catch (e) {
    showToast(e.message, 5000);
  }
}

function toggleFocusMode(force) {
  const on = force === undefined ? !document.body.classList.contains("focus-mode") : force;
  document.body.classList.toggle("focus-mode", on);
  if (btnFocus) btnFocus.textContent = on ? "退出专注" : "专注";
  if (on) showToast("专注阅读：Ctrl+Shift+F 或 Esc 退出", 2600);
}

function showHelp() {
  if (helpModal) helpModal.hidden = false;
}

function closeHelp() {
  if (helpModal) helpModal.hidden = true;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

if (btnReadSettings) {
  btnReadSettings.addEventListener("click", () => {
    readSettings.hidden = !readSettings.hidden;
  });
}
if (btnFontDec) {
  btnFontDec.addEventListener("click", () => {
    readFontSize = clampNumber(readFontSize - 1, 14, 24);
    applyReadingSettings();
  });
}
if (btnFontInc) {
  btnFontInc.addEventListener("click", () => {
    readFontSize = clampNumber(readFontSize + 1, 14, 24);
    applyReadingSettings();
  });
}
if (lineHeightSelect) {
  lineHeightSelect.addEventListener("change", () => {
    readLineHeight = clampNumber(parseFloat(lineHeightSelect.value) || 1.85, 1.4, 2.4);
    applyReadingSettings();
  });
}
if (readLevelSelect) {
  readLevelSelect.addEventListener("change", () => setReadLevel(readLevelSelect.value));
}
if (btnFocus) btnFocus.addEventListener("click", () => toggleFocusMode());
if (btnHelp) btnHelp.addEventListener("click", showHelp);
if (btnHelpClose) btnHelpClose.addEventListener("click", closeHelp);
if (helpModal) {
  helpModal.addEventListener("mousedown", (e) => {
    if (e.target === helpModal) closeHelp();
  });
}

function isTypingTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "F" || e.key === "f")) {
    e.preventDefault();
    toggleFocusMode();
    return;
  }
  if (e.key === "Escape") {
    if (modelMenu && !modelMenu.hidden) {
      toggleModelMenu(false);
      return;
    }
    if (helpModal && !helpModal.hidden) {
      closeHelp();
      return;
    }
    if (document.body.classList.contains("focus-mode")) {
      toggleFocusMode(false);
      return;
    }
    closeBubble();
    return;
  }
  if (e.key === "?" && !isTypingTarget(e.target) && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    showHelp();
  }
});

function renderStatusCard(data) {
  const job = data.job || {};
  const failed = data.status === "failed" || job.status === "failed";
  const progress = Math.max(0, Math.min(100, job.progress || (failed ? 100 : 0)));
  const stage = job.stage || (failed ? "解析失败" : "等待解析");
  const error = data.error || job.error || "";
  docEmpty.innerHTML = `
    <div class="status-card">
      <h2>${failed ? "这份资料没能解析" : "正在后台解析"}</h2>
      <p>${escapeHtml(data.document ? data.document.title : "")} · ${escapeHtml(
        FORMAT_LABEL[(data.document && data.document.source_format) || ""] || ""
      )}</p>
      <div class="job-bar"><i style="width:${progress}%"></i></div>
      <p class="empty" style="padding:0;text-align:left">${escapeHtml(stage)} ${failed ? "" : `${progress}%`}</p>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      ${
        failed
          ? `<div class="actions"><button type="button" class="btn btn-small" id="btn-status-retry">重新解析</button></div>`
          : `<p class="empty-note">可以继续看左侧其他资料；解析完成后这里会自动刷新。</p>`
      }
    </div>`;
  const retry = $("btn-status-retry");
  if (retry) {
    retry.addEventListener("click", () => {
      const jobId = (data.job && data.job.id) || null;
      retryImportJob(jobId);
    });
  }
}

function showEmpty() {
  docHead.hidden = true;
  docPage.hidden = true;
  docEmpty.hidden = false;
  topbarCrumb.hidden = true;
  docEmpty.innerHTML = "";
  currentDoc = null;
  currentContent = null;
  currentVersionId = "";
  currentBlocks = [];
  annotations = [];
  questionCache = "";
  lastSubmission = null;
  chatMessages = [];
  renderChat();
  chatInput.value = "";
  notesDocId = "";
  notesTitle = "";
  notesContent = "";
  notesDirty = false;
  notesContentEl.value = "";
  notesDraftWrap.hidden = true;
  notesDraftBody.innerHTML = "";
  notesSuggestions = [];
  notesAutoSuggestDoc = "";
  renderSuggestions();
  updateNotesEnabled();
  setSaveState("", "");
  exerciseReview.innerHTML = "";
  codeEditor.value = "";
  renderAnnotations();
  renderExercise();
  renderReview();
  renderSidebarActive();

  if (!documents.length) {
    renderEmptyLibrary();
  } else {
    renderEmptyPick();
  }
}

function renderEmptyLibrary() {
  const path = (libraryState.library && libraryState.library.path) || "library/";
  docEmpty.innerHTML = `
    <div class="empty-card">
      <h2>把你的资料放进来</h2>
      <p>支持 Markdown、TXT、DOCX 和文本型 PDF。导入后会保留原文件，并在后台解析成可阅读、可标注的章节和内容块。</p>
      <div class="path-line"><span class="grow">${escapeHtml(path)}</span></div>
      <ol class="empty-steps">
        <li>点右上角「导入资料」，选择一个或多个文件。</li>
        <li>等后台解析完成，左侧资料柜会出现文档。</li>
        <li>也可以把文件直接放进上面的目录，再点「刷新资料」。</li>
      </ol>
      <p class="empty-note">没有配置 API 也能阅读、标注和记笔记。</p>
      <div class="actions" style="display:flex;gap:8px;margin-top:14px">
        <button type="button" class="btn btn-primary" id="btn-empty-import">导入资料</button>
        <button type="button" class="btn btn-quiet" id="btn-empty-scan">刷新资料库</button>
      </div>
    </div>`;
  $("btn-empty-import").addEventListener("click", () => importInput.click());
  $("btn-empty-scan").addEventListener("click", refreshLibrary);
}

function renderEmptyPick() {
  const recent = documents.slice(0, 3);
  docEmpty.innerHTML = `
    <div class="empty-card">
      <h2>挑一份资料开始读</h2>
      <p>左侧资料柜已经收录了 ${documents.length} 份资料。选中后可以阅读、划选提问、写笔记和标注。</p>
      <div class="quick-list">
        ${recent
          .map(
            (doc) =>
              `<button type="button" class="quick-item" data-doc-id="${escapeHtml(doc.id)}">
                <span>${escapeHtml(doc.title || doc.source_name || "未命名")}</span>
                <span class="quick-format">${FORMAT_LABEL[doc.source_format] || ""}</span>
              </button>`
          )
          .join("")}
      </div>
      <p class="empty-note">也可以点右上角「导入资料」继续添加。</p>
    </div>`;
  docEmpty.querySelectorAll(".quick-item").forEach((btn) => {
    btn.addEventListener("click", () => loadDocument(btn.dataset.docId, { markOpen: true }));
  });
}

function renderSidebarActive() {
  renderLibrary();
}

async function refreshSessionQuiet() {
  try {
    const data = await api("/api/session");
    session = data;
    lastSubmission = data.last_submission || null;
    updateLlmStatus();
    renderExercise();
    renderReview();
    renderStats();
    updateTabBadges();
    renderLibrary();
  } catch (e) {
    /* 静默刷新失败不打断阅读 */
  }
}

// ------------------------------------------------------------
// 分类 / 版本
// ------------------------------------------------------------
// ------------------------------------------------------------
// 阅读位置
// ------------------------------------------------------------
function updateDocProgress() {
  const max = docScroll.scrollHeight - docScroll.clientHeight;
  const pct = max > 0 ? (docScroll.scrollTop / max) * 100 : 0;
  docProgressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function collectPosition() {
  if (!ready() || !currentVersionId || !currentBlocks.length) return null;
  const nodes = Array.from(docBody.querySelectorAll(".doc-block[data-block-id]"));
  if (!nodes.length) return null;
  const scrollTop = docScroll.scrollTop;
  const containerTop = docScroll.getBoundingClientRect().top;
  let chosen = nodes[0];
  let offset = 0;
  for (const node of nodes) {
    const top = node.getBoundingClientRect().top - containerTop + scrollTop;
    if (top <= scrollTop + 10) {
      chosen = node;
      const height = node.getBoundingClientRect().height || 1;
      offset = Math.max(0, Math.min(1, (scrollTop - top) / height));
    } else {
      break;
    }
  }
  const max = docScroll.scrollHeight - docScroll.clientHeight;
  return {
    version_id: currentVersionId,
    block_id: chosen.dataset.blockId,
    block_offset: offset,
    scroll_ratio: max > 0 ? Math.max(0, Math.min(1, scrollTop / max)) : 0,
  };
}

function setPositionStatus(kind, text) {
  if (!positionStatusEl) return;
  positionStatusEl.textContent = text || "";
  positionStatusEl.classList.remove("is-saving", "is-ok", "is-err");
  if (kind) positionStatusEl.classList.add(kind);
  clearTimeout(positionStatusTimer);
  if (kind === "is-ok") {
    positionStatusTimer = setTimeout(() => {
      positionStatusEl.textContent = "";
      positionStatusEl.classList.remove("is-ok");
    }, 3200);
  }
}

function schedulePositionSave() {
  if (suppressPositionSave) return;
  clearTimeout(positionTimer);
  positionTimer = setTimeout(() => savePositionNow(), 700);
}

async function savePositionNow(beacon = false) {
  if (currentViewMode === "pdf") return;
  const position = collectPosition();
  if (!position || !currentDocId()) return;
  try {
    if (beacon) {
      fetch(`/api/documents/${currentDocId()}/position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(position),
        keepalive: true,
      });
      return;
    }
    setPositionStatus("is-saving", "保存位置…");
    await postJson(`/api/documents/${currentDocId()}/position`, position);
    const stamp = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    setPositionStatus("is-ok", `位置已保存 · ${stamp}`);
  } catch (e) {
    setPositionStatus("is-err", "位置未保存");
  }
}

function restorePosition(position) {
  if (!position || position.version_id !== currentVersionId || !position.block_id) {
    updateDocProgress();
    return;
  }
  const block = docBody.querySelector(
    `.doc-block[data-block-id="${CSS.escape(position.block_id)}"]`
  );
  if (!block) {
    updateDocProgress();
    return;
  }
  const containerTop = docScroll.getBoundingClientRect().top;
  const top = block.getBoundingClientRect().top - containerTop + docScroll.scrollTop;
  const height = block.getBoundingClientRect().height || 0;
  const target = top + (position.block_offset || 0) * height - 10;
  suppressPositionSave = true;
  docScroll.scrollTop = Math.max(0, target);
  updateDocProgress();
}

docScroll.addEventListener("scroll", () => {
  updateDocProgress();
  schedulePositionSave();
});

window.addEventListener("beforeunload", () => {
  savePositionNow(true);
});

// ------------------------------------------------------------
// 划段 / 批注
// ------------------------------------------------------------
function resetCheckUi() {
  checkQuestion = "";
  checkSelection = null;
  checkId = "";
  if (checkAnswerWrap) checkAnswerWrap.hidden = true;
  if (checkAnswer) checkAnswer.value = "";
  if (checkFeedback) {
    checkFeedback.hidden = true;
    checkFeedback.innerHTML = "";
  }
  if (checkSelfRate) {
    checkSelfRate.hidden = true;
    checkSelfRate.querySelectorAll("button").forEach((btn) => btn.removeAttribute("data-selected"));
  }
}

function closeBubble(force = false) {
  if (!force && spotBubbleLoading) return;
  bubble.hidden = true;
  bubbleAnswer.hidden = true;
  bubbleAnswer.innerHTML = "";
  bubbleInput.value = "";
  selection = null;
  resetCheckUi();
}

function openBubble(info) {
  selection = info;
  bubbleQuote.textContent = info.quote.length > 260 ? `${info.quote.slice(0, 260)}…` : info.quote;
  bubbleInput.value = "";
  bubbleAnswer.hidden = true;
  bubbleAnswer.innerHTML = "";
  resetCheckUi();
  bubble.hidden = false;
  openRightRail();
  switchTab("chat");
}

function selectionOffsets(block, range, which) {
  const probe = range.cloneRange();
  probe.selectNodeContents(block);
  if (which === "start") probe.setEnd(range.startContainer, range.startOffset);
  else probe.setEnd(range.endContainer, range.endOffset);
  return probe.toString().length;
}

function onTextSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!docBody.contains(range.commonAncestorContainer)) return;
  const block = range.startContainer.parentElement
    ? range.startContainer.parentElement.closest(".doc-block")
    : null;
  if (!block || !block.contains(range.endContainer)) {
    if (block) showToast("请在同一段文字内划选");
    return;
  }
  const quote = sel.toString().trim();
  if (!quote) return;
  openBubble({
    quote,
    blockId: block.dataset.blockId,
    start: selectionOffsets(block, range, "start"),
    end: selectionOffsets(block, range, "end"),
    locator: block.dataset.locator || "",
    blockEl: block,
  });
}

function onBlockClick(e) {
  if (e.target.closest("a, button, .copy-btn")) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) return;
  const block = e.target.closest(".doc-block");
  if (!block) return;
  const text = (block.textContent || "").trim();
  if (!text) return;
  const raw = block.textContent || "";
  const start = Math.max(0, raw.indexOf(text));
  openBubble({
    quote: text,
    blockId: block.dataset.blockId,
    start,
    end: start + text.length,
    locator: block.dataset.locator || "",
    blockEl: block,
  });
}

docBody.addEventListener("mouseup", () => {
  setTimeout(onTextSelection, 0);
});
docBody.addEventListener("click", onBlockClick);

bubbleClose.addEventListener("click", () => closeBubble(true));
document.addEventListener("mousedown", (e) => {
  if (bubble.hidden || spotBubbleLoading) return;
  if (bubble.contains(e.target) || docBody.contains(e.target)) return;
  closeBubble();
});

function applyHighlights() {
  if (!docBody) return;
  docBody.querySelectorAll("mark.hl").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent || ""));
  });
  docBody.normalize();
  for (const annotation of annotations) {
    if (annotation.version_id && annotation.version_id !== currentVersionId) continue;
    const block = docBody.querySelector(
      `.doc-block[data-block-id="${CSS.escape(annotation.block_id)}"]`
    );
    if (!block) continue;
    wrapRange(
      block,
      annotation.start_offset,
      annotation.end_offset,
      annotation.id,
      annotation.color || "amber"
    );
  }
}

function wrapRange(block, start, end, annotationId, color) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const segments = [];
  let pos = 0;
  let node = walker.nextNode();
  while (node) {
    const length = node.nodeValue ? node.nodeValue.length : 0;
    const nodeStart = pos;
    const nodeEnd = pos + length;
    if (nodeEnd > start && nodeStart < end) {
      segments.push({ node, nodeStart, nodeEnd });
    }
    pos = nodeEnd;
    node = walker.nextNode();
  }
  for (const segment of segments) {
    const from = Math.max(start, segment.nodeStart) - segment.nodeStart;
    const to = Math.min(end, segment.nodeEnd) - segment.nodeStart;
    if (to <= from) continue;
    const range = document.createRange();
    range.setStart(segment.node, from);
    range.setEnd(segment.node, to);
    const mark = document.createElement("mark");
    mark.className = `hl hl-${color}`;
    mark.dataset.annotationId = annotationId;
    try {
      range.surroundContents(mark);
    } catch (e) {
      /* 跨节点异常时跳过，不影响正文 */
    }
  }
}

async function createHighlight() {
  if (!selection || !ready()) {
    showToast("先打开一份资料并选中文字");
    return;
  }
  try {
    const data = await postJson(`/api/documents/${currentDocId()}/annotations`, {
      doc_id: currentDocId(),
      version_id: currentVersionId,
      block_id: selection.blockId,
      start_offset: selection.start,
      end_offset: selection.end,
      quote: selection.quote,
      note: "",
      color: "amber",
    });
    const annotation = data.annotation;
    annotation.locator_label = selection.locator;
    annotations.push(annotation);
    closeBubble(true);
    applyHighlights();
    renderAnnotations();
    updateTabBadges();
    switchTab("annotations");
    showToast("已高亮，可以写批注");
  } catch (e) {
    showToast(e.message, 5000);
  }
}

function renderAnnotations() {
  annotCount.textContent = annotations.length ? `${annotations.length} 条` : "";
  if (!annotations.length) {
    const hasOldVersions =
      currentContent && (currentContent.versions || []).length > 1;
    const emptyText =
      currentViewMode === "pdf"
        ? "PDF 播放模式暂不支持划选标注；已有标注仍保留在数据库。"
        : hasOldVersions
        ? "当前版本还没有标注；旧版本的标注仍保留，但不会显示在这里。"
        : "在正文里选中一段文字，点「高亮」，这里会出现标注。";
    annotationsList.innerHTML = `<p class="empty">${emptyText}</p>`;
    updateTabBadges();
    return;
  }
  annotationsList.innerHTML = annotations
    .map(
      (a) => `
      <div class="annotation-item" data-id="${escapeHtml(a.id)}">
        <blockquote class="annotation-quote color-${escapeHtml(a.color || "amber")}">${escapeHtml(
          a.quote || ""
        )}</blockquote>
        <p class="annotation-locator">${escapeHtml(a.locator_label || "")}</p>
        <textarea class="annotation-note" placeholder="写点批注（可选）">${escapeHtml(
          a.note || ""
        )}</textarea>
        <div class="annotation-actions">
          <select class="annotation-color" aria-label="高亮颜色">
            ${["amber", "teal", "rose"]
              .map(
                (c) =>
                  `<option value="${c}"${a.color === c ? " selected" : ""}>${
                    c === "amber" ? "琥珀" : c === "teal" ? "青" : "玫红"
                  }</option>`
              )
              .join("")}
          </select>
          <button type="button" class="btn btn-small annot-save">保存批注</button>
          <button type="button" class="btn btn-small btn-quiet annot-locate">定位</button>
          <button type="button" class="btn btn-small btn-quiet annot-delete">删除</button>
        </div>
      </div>`
    )
    .join("");
  annotationsList.querySelectorAll(".annotation-item").forEach((item) => {
    const id = item.dataset.id;
    const note = item.querySelector(".annotation-note");
    const color = item.querySelector(".annotation-color");
    item.querySelector(".annot-save").addEventListener("click", async () => {
      try {
        const data = await api(`/api/annotations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.value }),
        });
        const found = annotations.find((a) => a.id === id);
        if (found) found.note = data.annotation.note;
        showToast("批注已保存");
      } catch (e) {
        showToast(e.message, 5000);
      }
    });
    color.addEventListener("change", async () => {
      try {
        const value = color.value;
        await api(`/api/annotations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: value }),
        });
        const found = annotations.find((a) => a.id === id);
        if (found) found.color = value;
        applyHighlights();
        renderAnnotations();
        updateTabBadges();
      } catch (e) {
        showToast(e.message, 5000);
      }
    });
    item.querySelector(".annot-locate").addEventListener("click", () => {
      const mark = docBody.querySelector(`mark.hl[data-annotation-id="${CSS.escape(id)}"]`);
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.classList.add("hl-flash");
        setTimeout(() => mark.classList.remove("hl-flash"), 1000);
      } else {
        showToast("这段内容在当前版本里找不到了");
      }
    });
    item.querySelector(".annot-delete").addEventListener("click", async () => {
      const ok = await showConfirm("删除这条标注？", "高亮和批注都会被移除，不可恢复。");
      if (!ok) return;
      try {
        await api(`/api/annotations/${id}`, { method: "DELETE" });
        annotations = annotations.filter((a) => a.id !== id);
        applyHighlights();
        renderAnnotations();
        updateTabBadges();
        showToast("标注已删除");
      } catch (e) {
        showToast(e.message, 5000);
      }
    });
  });
  updateTabBadges();
}

// ------------------------------------------------------------
// 对话
// ------------------------------------------------------------
function renderChat() {
  if (!currentDocId()) {
    chatMessagesEl.innerHTML = '<p class="empty">打开一份资料后，这里可以就它提问。</p>';
    updateTabBadges();
    return;
  }
  if (!chatMessages.length) {
    chatMessagesEl.innerHTML =
      '<p class="empty">还没有消息。划选一段「现场问 / 放进对话」，或在下面直接提问。</p>';
    updateTabBadges();
    return;
  }
  chatMessagesEl.innerHTML = chatMessages
    .map((m) => {
      const isUser = m.role === "user";
      const roleLabel = isUser ? "你" : m.via === "ask" ? "助教 · 跨资料" : "助教";
      if (m.pending) {
        return `<div class="msg msg-ai">
          <p class="msg-role">${roleLabel}</p>
          <div class="loading">检索并回答中…</div>
        </div>`;
      }
      const sources =
        !isUser && m.sources && m.sources.length
          ? `<p class="msg-sources">来源：${m.sources
              .map(
                (s) =>
                  `<button type="button" class="source-link" data-doc-id="${escapeAttr(
                    s.document_id || ""
                  )}">${escapeHtml(s.title || "未命名")}</button>`
              )
              .join(" · ")}</p>`
          : "";
      return `<div class="msg ${isUser ? "msg-you" : "msg-ai"}">
        <p class="msg-role">${roleLabel}</p>
        ${isUser && m.quote ? `<blockquote class="msg-quote">${escapeHtml(m.quote)}</blockquote>` : ""}
        <div class="msg-body ${isUser ? "" : "markdown"}">${
          isUser ? `<p>${escapeHtml(m.content || "")}</p>` : renderMarkdown(m.content || "")
        }</div>
        ${sources}
      </div>`;
    })
    .join("");
  attachCopyButtons(chatMessagesEl);
  typesetMath(chatMessagesEl);
  chatMessagesEl.querySelectorAll(".source-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const docId = btn.dataset.docId;
      if (docId) loadDocument(docId, { markOpen: true });
    });
  });
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  updateTabBadges();
}

async function loadChat(docId) {
  chatMessages = [];
  try {
    const data = await api(`/api/chat?doc_id=${encodeURIComponent(docId)}`);
    chatMessages = data.messages || [];
  } catch (e) {
    chatMessages = [];
  }
  renderChat();
}

async function sendChat(question, quote) {
  if (!ready()) {
    showToast("资料还没解析完成");
    return;
  }
  if (!llmConfigured()) {
    showToast("请先在 API 设置中配置接口；阅读和笔记不受影响");
    return;
  }
  const q = (question || "").trim();
  if (!q && !quote) {
    showToast("先写一句问题，或在正文里划选一段");
    return;
  }
  btnChatSend.disabled = true;
  chatMessagesEl.insertAdjacentHTML("beforeend", '<div class="loading chat-pending">思考中…</div>');
  try {
    const data = await postJson("/api/chat", {
      doc_id: currentDocId(),
      title: currentDoc ? currentDoc.title : undefined,
      question: q || "讲这段",
      quote: quote || undefined,
      block_id: quote ? (selection && selection.blockId) || undefined : undefined,
    });
    chatMessages = data.messages || [];
    renderChat();
    chatInput.value = "";
  } catch (e) {
    showToast(e.message, 5000);
  } finally {
    chatMessagesEl.querySelector(".chat-pending")?.remove();
    updateLlmStatus();
  }
}

btnChatSend.addEventListener("click", () => sendChat(chatInput.value, ""));
chatInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    sendChat(chatInput.value, "");
  }
});

async function spotAsk() {
  if (!selection) return showToast("先划一段原文");
  if (!llmConfigured()) {
    showToast("请先配置 API；阅读和记笔记不受影响");
    return;
  }
  spotBubbleLoading = true;
  btnSpotAsk.disabled = true;
  btnThrowChat.disabled = true;
  bubbleAnswer.hidden = false;
  bubbleAnswer.innerHTML = '<div class="loading">现场回答中…</div>';
  try {
    const data = await postJson("/api/chat/spot", {
      doc_id: currentDocId(),
      title: currentDoc ? currentDoc.title : undefined,
      question: bubbleInput.value.trim() || "讲这段",
      quote: selection.quote,
      block_id: selection.blockId || undefined,
    });
    setMarkdownHtml(bubbleAnswer, data.reply || "");
    attachCopyButtons(bubbleAnswer);
  } catch (e) {
    bubbleAnswer.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    showToast(e.message, 5000);
  } finally {
    spotBubbleLoading = false;
    btnSpotAsk.disabled = false;
    btnThrowChat.disabled = false;
  }
}

async function throwToChat() {
  if (!selection) return showToast("先划一段原文");
  await sendChat(bubbleInput.value, selection.quote);
  if (chatMessages.length) closeBubble(true);
}

// ------------------------------------------------------------
// 划段动作 / 理解检查
// ------------------------------------------------------------
const SELECTION_ACTION_LABEL = {
  explain: "解释",
  example: "举例",
  prereq: "补前置",
};

function markSelfRate(container, level) {
  if (!container) return;
  container.querySelectorAll("button[data-level]").forEach((btn) => {
    if (btn.dataset.level === level) btn.setAttribute("data-selected", "1");
    else btn.removeAttribute("data-selected");
  });
}

function checkUiBusy(busy) {
  [btnModeExplain, btnModeExample, btnModePrereq, btnModeCheck, btnCheckSubmit].forEach((btn) => {
    if (btn) btn.disabled = !!busy;
  });
}

async function runSelectionAction(mode) {
  if (!selection) return showToast("先划一段原文");
  if (!llmConfigured()) {
    showToast("请先在 API 设置中配置接口；阅读和笔记不受影响");
    return;
  }
  if (mode === "check") return requestCheckQuestion();
  resetCheckUi();
  bubbleAnswer.hidden = false;
  bubbleAnswer.innerHTML = `<div class="loading">${SELECTION_ACTION_LABEL[mode]}中…</div>`;
  checkUiBusy(true);
  try {
    const data = await postJson("/api/selection/action", {
      doc_id: currentDocId(),
      mode,
      quote: selection.quote,
      block_id: selection.blockId || undefined,
    });
    setMarkdownHtml(bubbleAnswer, data.markdown || "");
    attachCopyButtons(bubbleAnswer);
  } catch (e) {
    bubbleAnswer.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    showToast(e.message, 5000);
  } finally {
    checkUiBusy(false);
  }
}

async function requestCheckQuestion() {
  if (!selection) return showToast("先划一段原文");
  if (!llmConfigured()) {
    showToast("请先在 API 设置中配置接口；阅读和笔记不受影响");
    return;
  }
  checkSelection = { quote: selection.quote, blockId: selection.blockId };
  checkQuestion = "";
  checkId = "";
  bubbleAnswer.hidden = false;
  bubbleAnswer.innerHTML = '<div class="loading">正在出理解检查题…</div>';
  if (checkAnswerWrap) checkAnswerWrap.hidden = true;
  if (checkFeedback) {
    checkFeedback.hidden = true;
    checkFeedback.innerHTML = "";
  }
  if (checkSelfRate) checkSelfRate.hidden = true;
  checkUiBusy(true);
  try {
    const data = await postJson("/api/selection/action", {
      doc_id: currentDocId(),
      mode: "check",
      quote: checkSelection.quote,
      block_id: checkSelection.blockId || undefined,
    });
    checkQuestion = data.markdown || "";
    setMarkdownHtml(bubbleAnswer, checkQuestion);
    attachCopyButtons(bubbleAnswer);
    if (checkAnswerWrap) checkAnswerWrap.hidden = false;
    if (checkAnswer) {
      checkAnswer.value = "";
      checkAnswer.focus();
    }
  } catch (e) {
    bubbleAnswer.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    showToast(e.message, 5000);
  } finally {
    checkUiBusy(false);
  }
}

async function submitCheck() {
  if (!checkQuestion) return showToast("先点「理解检查」生成题目");
  if (!checkSelection) return showToast("先划一段原文");
  const answer = (checkAnswer && checkAnswer.value.trim()) || "";
  if (!answer) return showToast("先写下你的理解");
  if (!llmConfigured()) return showToast("请先在 API 设置中配置接口");
  if (btnCheckSubmit) btnCheckSubmit.disabled = true;
  if (checkFeedback) {
    checkFeedback.hidden = false;
    checkFeedback.innerHTML = '<div class="loading">正在检查…</div>';
  }
  try {
    const data = await postJson("/api/understanding", {
      doc_id: currentDocId(),
      block_id: checkSelection.blockId || undefined,
      quote: checkSelection.quote,
      question: checkQuestion,
      answer,
    });
    checkId = data.id || "";
    setMarkdownHtml(checkFeedback, data.feedback || "");
    attachCopyButtons(checkFeedback);
    if (checkSelfRate) {
      checkSelfRate.hidden = false;
      markSelfRate(checkSelfRate, data.self_level || "");
    }
    await refreshSessionQuiet();
    showToast(data.verdict ? `AI 判断：${data.verdict}` : "检查完成");
  } catch (e) {
    if (checkFeedback) checkFeedback.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    showToast(e.message, 5000);
  } finally {
    if (btnCheckSubmit) btnCheckSubmit.disabled = false;
  }
}

async function rateCheck(level) {
  if (!checkId) return showToast("先提交理解检查");
  try {
    await patchJson(`/api/understanding/${encodeURIComponent(checkId)}`, { self_level: level });
    markSelfRate(checkSelfRate, level);
    showToast(`已记录理解自评：${level}`);
  } catch (e) {
    showToast(e.message, 5000);
  }
}

btnSpotAsk.addEventListener("click", spotAsk);
btnThrowChat.addEventListener("click", throwToChat);
btnHighlight.addEventListener("click", createHighlight);
btnModeExplain.addEventListener("click", () => runSelectionAction("explain"));
btnModeExample.addEventListener("click", () => runSelectionAction("example"));
btnModePrereq.addEventListener("click", () => runSelectionAction("prereq"));
btnModeCheck.addEventListener("click", () => runSelectionAction("check"));
btnCheckSubmit.addEventListener("click", submitCheck);
if (checkSelfRate) {
  checkSelfRate.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-level]");
    if (btn) rateCheck(btn.dataset.level);
  });
}

document.addEventListener("click", async (e) => {
  const cite = e.target.closest("a.cite");
  if (!cite) return;
  e.preventDefault();
  const blockId = cite.dataset.blockId;
  const meta = citeDocs[blockId] || {};
  const docId = cite.dataset.docId || meta.doc_id || "";
  await focusBlock(blockId, docId);
});
btnQuoteNote.addEventListener("click", async () => {
  if (!selection) return showToast("先划一段原文");
  const quote = selection.quote;
  const block = `> ${quote.split(/\r?\n/).join("\n> ")}`;
  if (notesDocId !== currentDocId()) await loadNotes(currentDocId());
  prepareNotesWrite();
  notesContentEl.value = notesContentEl.value.trim()
    ? `${notesContentEl.value.trimEnd()}\n\n${block}`
    : block;
  finishNotesWrite();
  notesDirty = true;
  closeBubble(true);
  switchTab("notes");
  await saveNotesNow();
  showToast("已记进当前资料笔记");
});

// ------------------------------------------------------------
// 笔记
// ------------------------------------------------------------
function setSaveState(kind, text) {
  notesSaveStatus.textContent = text || "";
  notesSaveStatus.classList.remove("is-saving", "is-ok", "is-err");
  if (kind) notesSaveStatus.classList.add(kind);
}

function updateNotesEnabled() {
  const hasDoc = !!currentDocId();
  notesEmpty.hidden = hasDoc;
  notesLayout.hidden = !hasDoc;
  notesContentEl.disabled = !hasDoc;
  notesInstruction.disabled = !hasDoc;
  btnNotesSave.disabled = !hasDoc || notesSaving;
  if (btnNotesUndo) btnNotesUndo.disabled = !notesUndoStack.length;
  if (btnNotesExport) {
    btnNotesExport.disabled = !hasDoc || !(notesContentEl.value || "").trim();
  }
  const ai = hasDoc && ready() && llmConfigured();
  btnNotesDraft.disabled = !ai;
  btnNotesRefreshSuggest.disabled = !ai;
}

const NOTES_UNDO_LIMIT = 50;

function updateNotesUndoButton() {
  if (btnNotesUndo) btnNotesUndo.disabled = !notesUndoStack.length;
}

function pushNotesUndo(value) {
  if (value === undefined) return;
  if (notesUndoStack[notesUndoStack.length - 1] === value) return;
  notesUndoStack.push(value);
  while (notesUndoStack.length > NOTES_UNDO_LIMIT) notesUndoStack.shift();
  updateNotesUndoButton();
}

function resetNotesUndo() {
  notesUndoStack = [];
  clearTimeout(notesUndoTimer);
  notesUndoTimer = null;
  notesLastValue = notesContentEl.value;
  updateNotesUndoButton();
}

function beginNotesEdit() {
  if (notesUndoTimer) return;
  pushNotesUndo(notesLastValue);
  notesUndoTimer = setTimeout(() => {
    notesUndoTimer = null;
    notesLastValue = notesContentEl.value;
  }, 800);
}

function prepareNotesWrite() {
  pushNotesUndo(notesContentEl.value);
  clearTimeout(notesUndoTimer);
  notesUndoTimer = null;
}

function finishNotesWrite() {
  notesLastValue = notesContentEl.value;
  updateNotesUndoButton();
  updateTabBadges();
}

async function undoNotes() {
  if (!notesUndoStack.length) return showToast("没有可撤销的修改");
  const prev = notesUndoStack.pop();
  notesContentEl.value = prev;
  notesLastValue = prev;
  notesDirty = true;
  clearTimeout(notesSaveTimer);
  updateNotesUndoButton();
  updateTabBadges();
  if (notesSaving) scheduleNotesSave();
  else await saveNotesNow();
  showToast("已撤销一步");
}

function notesFileName(title) {
  return `${String(title || "笔记").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80)}.md`;
}

function exportNotes() {
  if (!notesDocId) return showToast("先打开一份资料");
  const content = (notesContentEl.value || "").trim();
  if (!content) return showToast("笔记还是空的");
  const title = notesTitle || (currentDoc && currentDoc.title) || "笔记";
  const src = (currentDoc && (currentDoc.source_name || currentDoc.source_path)) || "";
  const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
  const parts = [];
  if (!content.startsWith("#")) parts.push(`# ${title}`);
  parts.push(`> 来源：${src || "未记录"}  \n> 导出：${stamp}`);
  parts.push(content);
  const blob = new Blob([`${parts.join("\n\n")}\n`], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = notesFileName(title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("已导出 Markdown");
}

async function loadNotes(docId) {
  notesDocId = docId;
  notesDirty = false;
  notesSuggestions = [];
  notesAutoSuggestDoc = "";
  notesDraftText = "";
  notesDraftWrap.hidden = true;
  notesDraftBody.innerHTML = "";
  notesContentEl.value = "";
  resetNotesUndo();
  setSaveState("", "");
  updateNotesEnabled();
  renderSuggestions();
  if (!docId) return;
  try {
    const data = await api(`/api/notes?doc_id=${encodeURIComponent(docId)}`);
    notesDocId = data.doc_id || docId;
    notesTitle = data.title || (currentDoc && currentDoc.title) || "";
    notesContent = data.content || "";
    notesContentEl.value = notesContent;
    resetNotesUndo();
    setSaveState("is-ok", data.updated_at ? `已同步 · ${data.updated_at}` : "");
  } catch (e) {
    setSaveState("is-err", "加载失败");
  }
  updateNotesEnabled();
  updateTabBadges();
}

async function saveNotesNow() {
  if (!notesDocId || notesSaving) return;
  const content = notesContentEl.value;
  notesSaving = true;
  btnNotesSave.disabled = true;
  setSaveState("is-saving", "保存中…");
  try {
    const data = await api("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_id: notesDocId,
        title: notesTitle || undefined,
        content,
      }),
    });
    notesContent = data.content != null ? data.content : content;
    notesDirty = false;
    setSaveState("is-ok", data.updated_at ? `已保存 · ${data.updated_at}` : "已保存");
    if (data.overview) {
      libraryState.overview = data.overview;
      renderStats();
      const doc = documents.find((d) => d.id === notesDocId);
      if (doc) doc.has_note = content.trim() ? 1 : 0;
      renderLibrary();
    }
    updateTabBadges();
  } catch (e) {
    setSaveState("is-err", "保存失败");
    showToast(e.message, 5000);
  } finally {
    notesSaving = false;
    btnNotesSave.disabled = !notesDocId;
    updateNotesEnabled();
  }
}

function scheduleNotesSave() {
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(() => saveNotesNow(), 800);
}

function onNotesTabShown() {
  updateNotesEnabled();
  if (!ready() || !llmConfigured()) return;
  if (!notesDocId || notesAutoSuggestDoc === notesDocId) return;
  notesAutoSuggestDoc = notesDocId;
  fetchSuggestions(false);
}

function renderSuggestions() {
  if (!notesSuggestions.length) {
    notesSuggestionsList.innerHTML = `<p class="empty">${
      llmConfigured() ? "暂无建议，点「换一批」看看" : "配置 API 后，切到笔记页会自动给建议。"
    }</p>`;
    return;
  }
  notesSuggestionsList.innerHTML = notesSuggestions
    .map(
      (s) => `
      <div class="suggest-item" data-id="${escapeHtml(s.id)}">
        <p class="suggest-reason">${escapeHtml(s.reason || "建议")}</p>
        <p class="suggest-text">${escapeHtml(s.text || "")}</p>
        <div class="suggest-actions">
          <button type="button" class="btn btn-small btn-primary suggest-adopt">采纳</button>
          <button type="button" class="btn btn-small btn-quiet suggest-ignore">忽略</button>
        </div>
      </div>`
    )
    .join("");
  notesSuggestionsList.querySelectorAll(".suggest-adopt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".suggest-item").dataset.id;
      const item = notesSuggestions.find((s) => s.id === id);
      if (!item) return;
      const value = notesContentEl.value;
      prepareNotesWrite();
      notesContentEl.value = value.trim() ? `${value.trimEnd()}\n\n${item.text}` : item.text;
      finishNotesWrite();
      notesDirty = true;
      notesSuggestions = notesSuggestions.filter((s) => s.id !== id);
      renderSuggestions();
      saveNotesNow();
      showToast("已采纳，写进笔记");
    });
  });
  notesSuggestionsList.querySelectorAll(".suggest-ignore").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".suggest-item").dataset.id;
      notesSuggestions = notesSuggestions.filter((s) => s.id !== id);
      renderSuggestions();
    });
  });
}

async function fetchSuggestions(showOk) {
  if (!notesDocId || !llmConfigured()) return;
  btnNotesRefreshSuggest.disabled = true;
  notesSuggestionsList.innerHTML = '<div class="loading">AI 正在看你的笔记…</div>';
  try {
    const data = await postJson("/api/notes/suggest", { doc_id: notesDocId });
    notesSuggestions = data.suggestions || [];
    renderSuggestions();
    if (showOk) showToast("建议已刷新");
  } catch (e) {
    renderSuggestions();
    showToast(e.message, 5000);
  } finally {
    updateNotesEnabled();
  }
}

async function requestDraft() {
  if (!notesDocId || !llmConfigured()) return;
  btnNotesDraft.disabled = true;
  notesDraftWrap.hidden = false;
  notesDraftBody.innerHTML = '<div class="loading">生成草稿中…</div>';
  try {
    const data = await postJson("/api/notes/draft", {
      doc_id: notesDocId,
      instruction: notesInstruction.value.trim() || undefined,
    });
    notesDraftText = data.draft || "";
    setMarkdownHtml(notesDraftBody, notesDraftText || "（空草稿）");
    attachCopyButtons(notesDraftBody);
  } catch (e) {
    notesDraftBody.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    showToast(e.message, 5000);
  } finally {
    updateNotesEnabled();
  }
}

async function applyDraft() {
  if (!notesDraftText) return;
  prepareNotesWrite();
  notesContentEl.value = notesDraftReplace.checked
    ? notesDraftText
    : `${notesContentEl.value.trimEnd()}\n\n---\n\n${notesDraftText}`.trim();
  finishNotesWrite();
  notesDirty = true;
  notesDraftWrap.hidden = true;
  notesDraftText = "";
  await saveNotesNow();
  showToast("草稿已写进笔记");
}

btnNotesSave.addEventListener("click", saveNotesNow);
btnNotesUndo.addEventListener("click", undoNotes);
btnNotesExport.addEventListener("click", exportNotes);
notesContentEl.addEventListener("input", () => {
  beginNotesEdit();
  notesDirty = true;
  if (btnNotesExport) {
    btnNotesExport.disabled = !(notesContentEl.value || "").trim();
  }
  updateTabBadges();
  scheduleNotesSave();
});
btnNotesRefreshSuggest.addEventListener("click", () => {
  notesAutoSuggestDoc = notesDocId;
  fetchSuggestions(true);
});
btnNotesDraft.addEventListener("click", requestDraft);
btnNotesDraftApply.addEventListener("click", applyDraft);
btnNotesDraftDiscard.addEventListener("click", () => {
  notesDraftWrap.hidden = true;
  notesDraftText = "";
});

// ------------------------------------------------------------
// 练习 / 复盘
// ------------------------------------------------------------
async function loadLearningEvidence(docId) {
  lastExerciseEvidenceId = "";
  if (exerciseSelfRate) {
    exerciseSelfRate.hidden = true;
    markSelfRate(exerciseSelfRate, "");
  }
  if (exerciseEvidenceStatus) exerciseEvidenceStatus.textContent = "";
  if (!docId) return;
  try {
    const data = await api(`/api/documents/${encodeURIComponent(docId)}/learning`);
    const latest = (data.practice || [])[0];
    if (!latest) return;
    lastExerciseEvidenceId = latest.id || "";
    if (exerciseSelfRate) {
      exerciseSelfRate.hidden = false;
      markSelfRate(exerciseSelfRate, latest.self_level || "");
    }
    if (exerciseEvidenceStatus) {
      if (latest.version_id && currentVersionId && latest.version_id !== currentVersionId) {
        exerciseEvidenceStatus.textContent = "最近一次练习来自旧版本";
      } else {
        exerciseEvidenceStatus.textContent = latest.created_at
          ? `最近一次练习 · ${latest.created_at}`
          : "最近一次练习";
      }
    }
  } catch (e) {
    /* 学习记录读取失败不影响阅读与出题 */
  }
}

async function rateExercise(level) {
  if (!lastExerciseEvidenceId) return;
  try {
    await patchJson(
      `/api/exercise-evidence/${encodeURIComponent(lastExerciseEvidenceId)}`,
      { self_level: level }
    );
    markSelfRate(exerciseSelfRate, level);
    await refreshSessionQuiet();
    renderStats();
    showToast(`已记录练习自评：${level}`);
  } catch (e) {
    showToast(e.message, 5000);
  }
}

function renderExercise() {
  const docId = currentDocId();
  const selected = session && session.selected_document;
  const sameDoc = selected && selected.id === docId;
  const exercise = sameDoc ? session.exercise || {} : {};
  exerciseDocId = docId;
  questionCache = (exercise.question || "").trim();
  if (!docId) {
    exerciseQuestion.innerHTML = '<p class="empty">打开一份资料后可以出题。</p>';
    btnSubmit.disabled = true;
    btnExerciseNext.hidden = true;
  } else if (!ready()) {
    exerciseQuestion.innerHTML = '<p class="empty">资料解析完成后可以出题。</p>';
    btnSubmit.disabled = true;
    btnExerciseNext.hidden = true;
  } else if (questionCache) {
    setMarkdownHtml(exerciseQuestion, questionCache);
    btnSubmit.disabled = !llmConfigured();
    btnExerciseNext.hidden = false;
  } else {
    exerciseQuestion.innerHTML = '<p class="empty">点「出题」生成一道针对这份资料的练习。</p>';
    btnSubmit.disabled = true;
    btnExerciseNext.hidden = true;
  }
  lastSubmission = sameDoc ? session.last_submission : null;
  if (exerciseSelfRate) exerciseSelfRate.hidden = !lastExerciseEvidenceId;
  updateLlmStatus();
  updateTabBadges();
}

function renderReview() {
  const sub = lastSubmission;
  if (!sub || !sub.review) {
    lastReview.innerHTML = '<p class="empty">提交解答后，这里显示你的解答和 AI 批改。</p>';
    updateTabBadges();
    return;
  }
  lastReview.innerHTML = `
    <p class="meta">${escapeHtml(sub.title || "")}${sub.submitted_at ? ` · ${escapeHtml(sub.submitted_at)}` : ""}</p>
    <h3>题目</h3>
    ${renderMarkdown(sub.question || "")}
    <h3>你的解答</h3>
    <pre><code>${escapeHtml(sub.code || "")}</code></pre>
    <h3>批改</h3>
    ${renderMarkdown(sub.review || "")}
  `;
  attachCopyButtons(lastReview);
  typesetMath(lastReview);
  updateTabBadges();
}

async function requestExercise() {
  if (!ready()) return showToast("资料还没解析完成");
  if (!llmConfigured()) return showToast("请先配置 API；阅读和笔记不受影响");
  btnExercise.disabled = true;
  btnExerciseNext.hidden = true;
  exerciseReview.innerHTML = "";
  codeEditor.value = "";
  lastExerciseEvidenceId = "";
  if (exerciseSelfRate) {
    exerciseSelfRate.hidden = true;
    markSelfRate(exerciseSelfRate, "");
  }
  if (exerciseEvidenceStatus) exerciseEvidenceStatus.textContent = "";
  exerciseQuestion.innerHTML = '<div class="loading">正在出题…</div>';
  try {
    const data = await postJson("/api/exercise", {
      doc_id: currentDocId(),
      difficulty: exerciseDifficulty.value,
    });
    questionCache = data.question || "";
    setMarkdownHtml(exerciseQuestion, questionCache);
    attachCopyButtons(exerciseQuestion);
    btnSubmit.disabled = !llmConfigured();
    btnExerciseNext.hidden = false;
    updateTabBadges();
  } catch (e) {
    exerciseQuestion.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    showToast(e.message, 5000);
  } finally {
    updateLlmStatus();
  }
}

async function submitExercise() {
  const answer = codeEditor.value.trim();
  if (!answer) return showToast("先写解答");
  btnSubmit.disabled = true;
  btnExerciseNext.hidden = true;
  exerciseReview.innerHTML = '<div class="loading">正在批改…</div>';
  try {
    const data = await postJson("/api/exercise/submit", {
      doc_id: currentDocId(),
      code: answer,
    });
    setMarkdownHtml(exerciseReview, data.review || "");
    attachCopyButtons(exerciseReview);
    lastExerciseEvidenceId = data.evidence_id || "";
    if (exerciseSelfRate) {
      exerciseSelfRate.hidden = !lastExerciseEvidenceId;
      markSelfRate(exerciseSelfRate, "");
    }
    if (exerciseEvidenceStatus) {
      exerciseEvidenceStatus.textContent = lastExerciseEvidenceId ? "刚提交的练习" : "";
    }
    btnExerciseNext.hidden = false;
    await refreshSessionQuiet();
    renderReview();
    showToast("批改完成");
  } catch (e) {
    exerciseReview.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    showToast(e.message, 5000);
  } finally {
    updateLlmStatus();
  }
}

btnExercise.addEventListener("click", requestExercise);
btnExerciseNext.addEventListener("click", requestExercise);
btnSubmit.addEventListener("click", submitExercise);
if (exerciseSelfRate) {
  exerciseSelfRate.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-level]");
    if (btn) rateExercise(btn.dataset.level);
  });
}

// ------------------------------------------------------------
// 前置自评
// ------------------------------------------------------------
function showPrereqModal(data) {
  return new Promise((resolve) => {
    const questions = data.questions || [];
    const answers = data.answers || {};
    prereqFocus.textContent = data.focus ? `前置焦点：${data.focus}` : "";
    prereqQuestions.innerHTML = "";
    const empty = questions.length === 0;
    prereqEmpty.hidden = !empty;
    prereqQuestions.hidden = empty;
    btnPrereqSubmit.textContent = empty ? "知道了" : "提交";

    questions.forEach((q) => {
      const options = q.options && q.options.length ? q.options : SKILL_LEVELS;
      const wrap = document.createElement("div");
      wrap.className = "prereq-q";
      wrap.innerHTML = `
        <p class="prereq-q-prompt">${escapeHtml(q.prompt || "")}</p>
        <p class="prereq-q-why">${escapeHtml(q.why || "")}</p>
        <div class="prereq-options">${options
          .map(
            (opt) =>
              `<label class="prereq-opt${answers[q.id] === opt ? " selected" : ""}">
                <input type="radio" name="prereq-${escapeHtml(q.id)}" value="${escapeHtml(opt)}"${
                  answers[q.id] === opt ? " checked" : ""
                }>${escapeHtml(opt)}</label>`
          )
          .join("")}</div>`;
      wrap.querySelectorAll(".prereq-opt input").forEach((input) => {
        input.addEventListener("change", () => {
          wrap.querySelectorAll(".prereq-opt").forEach((el) => el.classList.remove("selected"));
          input.closest(".prereq-opt").classList.add("selected");
        });
      });
      prereqQuestions.appendChild(wrap);
    });

    prereqModal.hidden = false;
    const cleanup = () => {
      prereqModal.hidden = true;
      btnPrereqSubmit.onclick = null;
      btnPrereqSkip.onclick = null;
    };
    btnPrereqSkip.onclick = () => {
      cleanup();
      resolve(false);
    };
    btnPrereqSubmit.onclick = async () => {
      const collected = {};
      if (!empty) {
        for (const q of questions) {
          const input = prereqQuestions.querySelector(
            `input[name="prereq-${CSS.escape(q.id)}"]:checked`
          );
          if (!input) return showToast(`请先回答：${q.prompt || q.id}`);
          collected[q.id] = input.value;
        }
      }
      btnPrereqSubmit.disabled = true;
      try {
        await postJson("/api/prereq/answer", { doc_id: currentDocId(), answers: collected });
        cleanup();
        resolve(true);
      } catch (e) {
        showToast(e.message, 5000);
      } finally {
        btnPrereqSubmit.disabled = false;
      }
    };
  });
}

async function openPrereq() {
  if (!ready()) return showToast("资料还没解析完成");
  if (!llmConfigured()) {
    showToast("前置自评是可选的 AI 功能；请先在 API 配置页填写 Key 并启用模型");
    return;
  }
  btnPrereq.disabled = true;
  try {
    let data = await api(`/api/prereq?doc_id=${encodeURIComponent(currentDocId())}`);
    if (!data.cached) {
      showToast("正在生成前置自评…", 1800);
      data = await postJson("/api/prereq", { doc_id: currentDocId() });
    }
    await showPrereqModal(data);
  } catch (e) {
    showToast(e.message, 5000);
  } finally {
    btnPrereq.disabled = !ready();
  }
}

btnPrereq.addEventListener("click", openPrereq);

// ------------------------------------------------------------
// 确认 / 配置 / 重置
// ------------------------------------------------------------
function showConfirm(title, body) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    confirmModalTitle.textContent = title;
    confirmModalBody.textContent = body;
    confirmModal.hidden = false;
  });
}

function closeConfirm(result) {
  confirmModal.hidden = true;
  const fn = confirmResolver;
  confirmResolver = null;
  if (fn) fn(!!result);
}

btnConfirmCancel.addEventListener("click", () => closeConfirm(false));
btnConfirmOk.addEventListener("click", () => closeConfirm(true));

let modelState = null;

function usableModels() {
  if (!modelState) return [];
  const withKey = new Set(
    (modelState.providers || [])
      .filter((provider) => provider.has_key)
      .map((provider) => provider.id)
  );
  return (modelState.enabled_models || []).filter((item) =>
    withKey.has(item.provider_id)
  );
}

function renderModelMenu() {
  if (!modelMenu) return;
  const enabled = usableModels();
  if (!enabled.length) {
    modelMenu.innerHTML =
      '<p class="model-menu-empty">还没有填写 Key 的服务。<a class="model-menu-link" href="/api-config">去 API 配置</a></p>';
    return;
  }
  const groups = new Map();
  for (const item of enabled) {
    const key = item.provider_name || item.provider_id || "服务";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  modelMenu.innerHTML = [...groups.entries()]
    .map(
      ([name, items]) => `<p class="model-menu-group">${escapeHtml(name)}</p>
        ${items
          .map(
            (item) => `<button type="button" class="model-option${
              item.active ? " is-active" : ""
            }" role="menuitemradio" aria-checked="${item.active ? "true" : "false"}" data-provider-id="${escapeAttr(
              item.provider_id
            )}" data-model="${escapeAttr(item.model)}">
              <span class="model-name">${escapeHtml(item.model)}</span>
            </button>`
          )
          .join("")}`
    )
    .join("");
}

async function updateLlmStatus() {
  let configured = llmConfigured();
  try {
    const data = await api("/api/models");
    modelState = data;
    configured = !!data.llm_configured;
    if (session) session.llm_configured = configured;
    const active = usableModels().find((item) => item.active);
    if (active) {
      btnLlmStatus.textContent = `${active.provider_name} · ${active.model}`;
      btnLlmStatus.title = `首页模型：${active.provider_name} · ${active.model}`;
    } else {
      btnLlmStatus.textContent = "配置模型";
      btnLlmStatus.title = "打开模型菜单";
    }
    btnLlmStatus.classList.toggle("pill-ok", configured && !!active);
    btnLlmStatus.classList.toggle("pill-warn", !(configured && !!active));
    if (modelMenu && !modelMenu.hidden) renderModelMenu();
  } catch (e) {
    btnLlmStatus.textContent = configured ? "AI 已就绪" : "配置模型";
    btnLlmStatus.classList.toggle("pill-ok", configured);
    btnLlmStatus.classList.toggle("pill-warn", !configured);
  }
  const canAI = ready() && configured;
  btnChatSend.disabled = !canAI;
  btnNotesDraft.disabled = !canAI || !notesDocId;
  btnNotesRefreshSuggest.disabled = !canAI || !notesDocId;
  btnExercise.disabled = !canAI;
  btnSubmit.disabled = !canAI || !questionCache;
}

async function toggleModelMenu(force) {
  if (!modelMenu) return;
  const open = force === undefined ? modelMenu.hidden : force;
  if (!open) {
    modelMenu.hidden = true;
    btnLlmStatus.setAttribute("aria-expanded", "false");
    return;
  }
  if (!modelState) await updateLlmStatus();
  renderModelMenu();
  modelMenu.hidden = false;
  btnLlmStatus.setAttribute("aria-expanded", "true");
}

btnConfig.addEventListener("click", () => {
  window.location.href = "/api-config";
});
if (btnWorkspace) {
  btnWorkspace.addEventListener("click", () => {
    window.location.href = "/user";
  });
}
btnLlmStatus.addEventListener("click", () => toggleModelMenu());
if (modelMenu) {
  modelMenu.addEventListener("click", async (event) => {
    const option = event.target.closest(".model-option");
    if (!option) return;
    try {
      const data = await postJson("/api/active-model", {
        provider_id: option.dataset.providerId,
        model: option.dataset.model,
      });
      modelState = { ...data.state, llm_configured: data.llm_configured };
      if (session) session.llm_configured = !!data.llm_configured;
      renderModelMenu();
      toggleModelMenu(false);
      await updateLlmStatus();
      showToast(`已切换到 ${option.dataset.model}`);
    } catch (e) {
      showToast(e.message, 5000);
    }
  });
}
document.addEventListener("mousedown", (event) => {
  if (!modelMenu || modelMenu.hidden) return;
  if (modelMenu.contains(event.target) || btnLlmStatus.contains(event.target)) return;
  toggleModelMenu(false);
});

btnReset.addEventListener("click", async () => {
  const ok = await showConfirm(
    "确认重置？",
    "会清空已读、题目、全部对话、笔记、标注和阅读位置；文档、原文件和 API 配置保留。"
  );
  if (!ok) return;
  try {
    await postJson("/api/reset", {});
    await loadPage();
    showToast("学习记录已重置，文档和 API 配置保留");
  } catch (e) {
    showToast(e.message, 5000);
  }
});

// ------------------------------------------------------------
// 标签徽章
// ------------------------------------------------------------
function updateTabBadges() {
  if (badgeChat) {
    badgeChat.hidden = !chatMessages.length;
    badgeChat.textContent = String(chatMessages.length);
  }
  if (badgeAnnotations) {
    badgeAnnotations.hidden = !annotations.length;
    badgeAnnotations.textContent = String(annotations.length);
  }
  if (dotNotes) dotNotes.hidden = !(notesContentEl.value || "").trim();
  if (dotExercise) dotExercise.hidden = !questionCache;
  if (dotReview) dotReview.hidden = !(lastSubmission && lastSubmission.review);
}

// ------------------------------------------------------------
// Markdown 渲染（与后端 source.render_markdown 对应）
// ------------------------------------------------------------
const PH_CODE = "\x01";
const PH_MATH = "\x02";
const PH_IMG = "\x03";
const PH_LINK = "\x04";
const PH_BR = "\x05";
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu;
const KATEX_DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];

function stripDocumentMarkup(text) {
  if (!text) return text;
  let s = String(text);
  if (s.startsWith("---")) {
    const end = s.indexOf("\n---", 3);
    if (end !== -1) {
      s = s.slice(end + 4);
      if (s.startsWith("\n")) s = s.slice(1);
    }
  }
  const lines = s.split("\n");
  const out = [];
  let inCode = false;
  for (const line of lines) {
    if (/^\s*(```+|~~~+)\s*(.*)$/.test(line)) {
      inCode = !inCode;
      out.push(line);
      continue;
    }
    if (inCode) out.push(line);
    else out.push(line.replace(/<!--.*?-->/g, ""));
  }
  return out.join("\n");
}

function slugifyHeading(raw) {
  let t = String(raw).trim().replace(EMOJI_RE, "").toLowerCase();
  let kept = "";
  for (const ch of t) {
    if (/[a-z0-9_\u4e00-\u9fff -]/.test(ch)) kept += ch;
  }
  t = kept.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/-$/g, "");
  return t || "section";
}

function allocHeadingId(raw, counts) {
  const base = slugifyHeading(raw);
  const n = counts[base] || 0;
  counts[base] = n + 1;
  return n === 0 ? base : `${base}-${n}`;
}

function mathDisplayHtml(tex) {
  const t = (tex || "").trim();
  if (!t) return '<div class="math-display"></div>';
  return `<div class="math-display">$$${escapeHtml(t)}$$</div>`;
}

function renderHtmlImgLine(line) {
  const s = line.trim();
  if (!/^<img\s/i.test(s)) return null;
  const srcM = s.match(/src\s*=\s*["']([^"']+)["']/i);
  if (!srcM) return null;
  const altM = s.match(/alt\s*=\s*["']([^"']*)["']/i);
  const alt = altM ? altM[1] : "";
  const styleM = s.match(/style\s*=\s*["']([^"']*)["']/i);
  const styleAttr = styleM ? ` style="${escapeHtml(styleM[1])}"` : "";
  return `<img src="${escapeHtml(srcM[1])}" alt="${escapeHtml(alt)}"${styleAttr} />`;
}

function typesetMath(root) {
  if (!root || typeof renderMathInElement !== "function") return;
  renderMathInElement(root, { delimiters: KATEX_DELIMITERS, throwOnError: false });
}

function setMarkdownHtml(el, md) {
  if (!el) return;
  el.innerHTML = renderMarkdown(md);
  typesetMath(el);
}

function renderMarkdown(md) {
  if (!md) return "";
  const lines = stripDocumentMarkup(md).split("\n");
  const out = [];
  let i = 0;
  let inCode = false;
  let codeBuf = [];
  const headingIds = {};
  const flushCode = () => {
    if (codeBuf.length) {
      out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
      codeBuf = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)\s*.*$/);
    if (fence) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushCode();
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }
    if (line.trim() === "$$") {
      const parts = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "$$") {
        parts.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      out.push(mathDisplayHtml(parts.join("\n")));
      continue;
    }
    const displayOne = line.match(/^\s*\$\$(.+)\$\$\s*$/);
    if (displayOne) {
      out.push(mathDisplayHtml(displayOne[1]));
      i++;
      continue;
    }
    const imgLine = renderHtmlImgLine(line);
    if (imgLine) {
      out.push(imgLine);
      i++;
      continue;
    }
    let m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const level = m[1].length;
      const rawTitle = m[2];
      out.push(
        `<h${level} id="${escapeHtml(allocHeadingId(rawTitle, headingIds))}">${inline(
          rawTitle
        )}</h${level}>`
      );
      i++;
      continue;
    }
    if (/^\s*---\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows = [line];
      i++;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }
    m = line.match(/^\s*[-*+]\s+(.*)$/);
    if (m) {
      out.push(`<li>${inline(m[1])}</li>`);
      i++;
      continue;
    }
    m = line.match(/^\s*\d+\.\s+(.*)$/);
    if (m) {
      out.push(`<li>${inline(m[1])}</li>`);
      i++;
      continue;
    }
    m = line.match(/^\s*>\s?(.*)$/);
    if (m) {
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      lines[i].trim() !== "$$" &&
      !/^\s*\|/.test(lines[i]) &&
      !/^\s*<img\s/i.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*[-*+]/.test(lines[i]) &&
      !/^\s*\d+\./.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*```/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  if (inCode) flushCode();
  let result = out.join("\n");
  result = result.replace(/(<li>.*?<\/li>\s*)+/gs, (m) => `<ul>${m}</ul>`);
  result = result.replace(/\[cite:([0-9a-fA-F]{8,})\]/g, (_all, blockId) => {
    const meta = citeDocs[blockId] || {};
    const title = meta.title
      ? `来源：${meta.title}${meta.locator ? ` · ${meta.locator}` : ""}`
      : "原文";
    const docAttr = meta.doc_id ? ` data-doc-id="${escapeAttr(meta.doc_id)}"` : "";
    return `<a href="#block-${blockId}" class="cite" data-block-id="${blockId}"${docAttr} title="${escapeAttr(
      title
    )}">原文</a>`;
  });
  return result;
}

function isTableSep(line) {
  const s = line.trim();
  if (!(s.startsWith("|") && s.endsWith("|"))) return false;
  const cells = s.slice(1, -1).split("|").map((c) => c.trim());
  return cells.length > 0 && cells.every((c) => c === "" || /^:?-+:?$/.test(c));
}

function splitCells(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  s = s.replace(/\\\|/g, "\x00");
  return s.split("|").map((c) => c.trim().replace(/\x00/g, "|"));
}

function renderTable(rows) {
  const header = splitCells(rows[0]);
  const body = rows.slice(2).map(splitCells);
  let html = "<table><thead><tr>";
  header.forEach((cell) => (html += `<th>${inline(cell)}</th>`));
  html += "</tr></thead><tbody>";
  body.forEach((row) => {
    html += "<tr>";
    row.forEach((cell) => (html += `<td>${inline(cell)}</td>`));
    html += "</tr>";
  });
  return `${html}</tbody></table>`;
}

function inline(text) {
  const codeSlots = [];
  const mathSlots = [];
  const imgSlots = [];
  const linkSlots = [];
  const stashCode = (m) => {
    codeSlots.push(m[1]);
    return `${PH_CODE}C${codeSlots.length - 1}${PH_CODE}`;
  };
  const stashDollarMath = (m) => {
    mathSlots.push(`$${m[1]}$`);
    return `${PH_MATH}${mathSlots.length - 1}${PH_MATH}`;
  };
  const stashParenMath = (m) => {
    mathSlots.push(`\\(${m[1]}\\)`);
    return `${PH_MATH}${mathSlots.length - 1}${PH_MATH}`;
  };
  const stashMdImg = (m) => {
    imgSlots.push([m[1], m[2]]);
    return `${PH_IMG}${imgSlots.length - 1}${PH_IMG}`;
  };
  const stashLink = (m) => {
    linkSlots.push([m[1], m[2]]);
    return `${PH_LINK}${linkSlots.length - 1}${PH_LINK}`;
  };
  let t = String(text);
  t = t.replace(/`([^`]+)`/g, stashCode);
  t = t.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, stashDollarMath);
  t = t.replace(/\\\((.+?)\\\)/g, stashParenMath);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, stashMdImg);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, stashLink);
  t = t.replace(/<br\s*\/?>/gi, PH_BR);
  t = escapeHtml(t);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  t = t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  t = t.replace(new RegExp(PH_BR, "g"), "<br>");
  linkSlots.forEach(([label, url], i) => {
    const lab = escapeHtml(label);
    const u = (url || "").trim();
    let tag;
    if (/^javascript:/i.test(u)) tag = lab;
    else if (u.startsWith("#")) tag = `<a href="${escapeHtml(u)}">${lab}</a>`;
    else if (/^https?:\/\//i.test(u)) {
      tag = `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${lab}</a>`;
    } else tag = `<a href="${escapeHtml(u)}">${lab}</a>`;
    t = t.replace(`${PH_LINK}${i}${PH_LINK}`, tag);
  });
  codeSlots.forEach((code, i) => {
    t = t.replace(`${PH_CODE}C${i}${PH_CODE}`, `<code>${escapeHtml(code)}</code>`);
  });
  mathSlots.forEach((raw, i) => {
    t = t.replace(`${PH_MATH}${i}${PH_MATH}`, escapeHtml(raw));
  });
  imgSlots.forEach(([alt, url], i) => {
    t = t.replace(
      `${PH_IMG}${i}${PH_IMG}`,
      `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`
    );
  });
  return t;
}

// ------------------------------------------------------------
// 正文交互
// ------------------------------------------------------------
function attachCopyButtons(root) {
  if (!root) return;
  root.querySelectorAll("pre > code").forEach((code) => {
    const pre = code.parentElement;
    if (pre.dataset.copyReady) return;
    pre.dataset.copyReady = "1";
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "复制";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        btn.textContent = "已复制";
        btn.classList.add("copied");
      } catch (e) {
        btn.textContent = "复制失败";
      }
      setTimeout(() => {
        btn.textContent = "复制";
        btn.classList.remove("copied");
      }, 1500);
    });
    wrap.appendChild(btn);
  });
}

function attachHashLinks(root) {
  if (!root) return;
  root.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      let id = "";
      try {
        id = decodeURIComponent((a.getAttribute("href") || "").slice(1));
      } catch (err) {
        id = (a.getAttribute("href") || "").slice(1);
      }
      const target = id ? document.getElementById(id) : null;
      if (!target || !root.contains(target)) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function bindBlockClicks() {
  docBody.querySelectorAll(".doc-block").forEach((block) => {
    if (block.dataset.bound) return;
    block.dataset.bound = "1";
    block.addEventListener("click", onBlockClick);
  });
}

// ------------------------------------------------------------
// 初始化
// ------------------------------------------------------------
bindGutter(gutterLeft, railLeft, "left", "learning.railL", 220, 460);
bindGutter(gutterRight, railRight, "right", "learning.railR", 300, 560);
window.addEventListener("resize", moveTabInk);
document.addEventListener("DOMContentLoaded", () => {});
switchTab("chat");
moveTabInk();
loadReadingSettings();
loadPage();
