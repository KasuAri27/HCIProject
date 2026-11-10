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
let selectedDocId = "";

let chatMessages = [];
let activeThreadId = null;
let chatLoadSequence = 0;
let threadOpenSequence = 0;
let activeCourseId = "";
const threadByDocument = new Map();
const collapsedCourses = new Set();
let importCourseId = "";
let chatSending = false;
let suggestionsTimer = null;
let suggestionsSequence = 0;
let suggestionsController = null;
let suggestionsKey = "";
let pdfReadingPage = 1;
let notesDocId = "";
let notesTitle = "";
let notesContent = "";
let notesDirty = false;
let notesSaveTimer = null;
let notesSaving = false;
let notesSaveInFlight = null;


let selection = null;
let spotBubbleLoading = false;
let railLeftPinned = false;
let pdfShellPromise = null;

function getPdfShell() {
  if (!pdfShellPromise) pdfShellPromise = import("./pdf-viewer.js?v=6.4.299-3");
  return pdfShellPromise;
}

async function showPdfShell(url) {
  if (!url) return;
  try {
    const shell = await getPdfShell();
    await shell.loadPdf(url);
  } catch (error) {
    showToast(`PDF 阅读器加载失败：${error.message || error}`, 5000);
  }
}

async function clearPdfShell() {
  if (!pdfShellPromise) return;
  try {
    const shell = await pdfShellPromise;
    await shell.clearPdf();
  } catch (error) {
    /* 阅读器尚未就绪 */
  }
}
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
const btnChatToggle = $("btn-chat-toggle");
const btnHelpClose = $("btn-help-close");
const helpModal = $("help-modal");
const topbarCrumb = $("topbar-crumb");
const importInput = $("import-input");
const btnAvatar = $("btn-avatar");
const topbarAvatarImg = $("topbar-avatar-img");
const topbarAvatarInitial = $("topbar-avatar-initial");
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
const gutterLeft = $("gutter-left");
const gutterRight = $("gutter-right");
const gutterSource = $("gutter-source");

const docVersionNote = $("doc-version-note");
const docScroll = $("doc-scroll");
const docEmpty = $("doc-empty");
const pdfView = $("pdf-view");
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
const btnModeExplain = $("btn-mode-explain");
const btnModeExample = $("btn-mode-example");
const btnModePrereq = $("btn-mode-prereq");
const btnModeCheck = $("btn-mode-check");
const checkAnswerWrap = $("check-answer-wrap");
const checkAnswer = $("check-answer");
const btnCheckSubmit = $("btn-check-submit");
const checkFeedback = $("check-feedback");
const checkSelfRate = $("check-self-rate");

const chatMessagesEl = $("chat-messages");
const chatSuggestionsEl = $("chat-suggestions");
const chatInput = $("chat-input");
const btnChatSend = $("btn-chat-send");
const notesEmpty = $("notes-empty");
const notesLayout = $("notes-layout");
const notesSaveStatus = $("notes-save-status");
const btnNotesSave = $("btn-notes-save");
const btnNotesUndo = $("btn-notes-undo");
const btnNotesExport = $("btn-notes-export");
const notesContentEl = $("notes-content");

const confirmModal = $("confirm-modal");
const confirmModalTitle = $("confirm-modal-title");
const confirmModalBody = $("confirm-modal-body");
const btnConfirmCancel = $("btn-confirm-cancel");
const btnConfirmOk = $("btn-confirm-ok");
let confirmResolver = null;

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

function isLibraryDrawer() { return window.matchMedia("(max-width: 1200px)").matches; }

function isNarrow() {
  return window.matchMedia("(max-width: 900px)").matches;
}

// ------------------------------------------------------------
// 标签 & 侧栏抽屉
// ------------------------------------------------------------
function switchTab(name) {
  if (name === "notes" && !notesContentEl.disabled) notesContentEl.focus();
}

function syncScrim() {
  document.body.classList.toggle(
    "has-scrim",
    (isLibraryDrawer() && document.body.classList.contains("rail-left-open")) ||
      document.body.classList.contains("rail-right-open")
  );
}

function railRightOpen() {
  return !document.body.classList.contains("rail-right-closed");
}

function syncChatToggle() {
  if (!btnChatToggle) return;
  const open = railRightOpen();
  btnChatToggle.classList.toggle("is-active", open);
  btnChatToggle.setAttribute("aria-expanded", open ? "true" : "false");
  const label = open ? "收起 AI 侧栏" : "展开 AI 侧栏";
  btnChatToggle.setAttribute("aria-label", label);
  btnChatToggle.title = label;
}

function setLeftRail(open, pinned = false) {
  document.body.classList.toggle("rail-left-open", open);
  railLeftPinned = open && pinned;
  if (open) document.body.classList.remove("rail-left-open-pinned");
  syncScrim();
}

let chatSlideTimer = null;
function setRightRail(open, animate = true) {
  const changed = open !== railRightOpen();
  clearTimeout(chatSlideTimer);
  const moving = changed && animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.body.classList.toggle("chat-sliding", moving);
  if (moving) {
    // 先让浏览器记录起始网格，分栏宽度和右侧抽屉才能同步过渡。
    $("workbench").getBoundingClientRect();
    chatSlideTimer = setTimeout(() => document.body.classList.remove("chat-sliding"), 280);
  }
  if (!open && railRight.contains(document.activeElement)) btnChatToggle.focus();
  railRight.inert = !open;
  railRight.setAttribute("aria-hidden", String(!open));
  railRight.dataset.slideState = open ? "open" : "closed";
  document.body.classList.toggle("rail-right-closed", !open);
  document.body.classList.remove("rail-right-open");
  syncChatToggle();
  applyWorkspaceWidths();
}

btnRailToggle.addEventListener("click", () => {
  if (!isLibraryDrawer()) {
    document.body.classList.toggle("library-closed");
    applyWorkspaceWidths();
    return;
  }
  if (
    document.body.classList.contains("rail-left-open") &&
    !railLeftPinned
  ) {
    railLeftPinned = true;
    return;
  }
  const open = !document.body.classList.contains("rail-left-open");
  setLeftRail(open, open);
});
railLeft.addEventListener("mouseleave", (event) => {
  if (!isLibraryDrawer()) return;
  if (railLeftPinned) return;
  if (event.relatedTarget && railLeft.contains(event.relatedTarget)) return;
  setLeftRail(false, false);
});
document.addEventListener("click", (event) => {
  if (event.target.closest("dialog, .modal-mask")) return;
  if (!isLibraryDrawer() || !document.body.classList.contains("rail-left-open")) return;
  if (railLeft.contains(event.target) || btnRailToggle.contains(event.target)) return;
  setLeftRail(false, false);
});

function toggleWorkspaceChat() { setRightRail(!railRightOpen()); }
btnChatToggle.addEventListener("click", toggleWorkspaceChat);
document.addEventListener("click", (event) => {
  if (event.target.closest("dialog, .modal-mask")) return;
  if (!document.body.classList.contains("rail-right-open")) return;
  if (railRight.contains(event.target) || btnChatToggle.contains(event.target)) return;
  document.body.classList.remove("rail-right-open");
  syncScrim();
  syncChatToggle();
});

function openRightRail() {
  setRightRail(true);
}
syncChatToggle();

// ------------------------------------------------------------
// 可拖拽分栏
// ------------------------------------------------------------
// 使用视口比例保存新布局，旧版两侧栏的像素宽度不适用于四栏分配。
const workspaceWidthKey = "learning.workspaceWidths";
const workspaceWidths = { course: 0.16, source: 0.50, chat: 0.17, mobileChat: 0.44 };
try {
  const saved = JSON.parse(localStorage.getItem(workspaceWidthKey) || "null");
  for (const key of Object.keys(workspaceWidths)) {
    if (Number.isFinite(saved?.[key]) && saved[key] > 0 && saved[key] < 1) workspaceWidths[key] = saved[key];
  }
} catch (e) { /* 本地偏好不可用时使用默认比例。 */ }

function clampWidth(value, min, max) { return Math.max(min, Math.min(max, value)); }

function workspaceWidthBounds() {
  const width = document.documentElement.clientWidth;
  const mobile = width <= 1000;
  const courseVisible = width > 1200 && !document.body.classList.contains("library-closed");
  const course = clampWidth(workspaceWidths.course * width, width * 0.15, width * 0.20);
  const available = width - (courseVisible ? course + 1 : 0) - (mobile ? 1 : 2);
  const noteMin = Math.min(150, width * 0.4);
  const chatMin = Math.min(180, width * 0.4);
  // 即便 AI 收起，也为它保留可恢复的宽度边界，避免展开时改变原文宽度。
  const chat = clampWidth(workspaceWidths[mobile ? "mobileChat" : "chat"] * width,
    chatMin, available - noteMin - (mobile ? 0 : 260));
  const source = mobile ? 0 : clampWidth(workspaceWidths.source * width, 260, available - noteMin - chat);
  return { width, mobile, courseVisible, course, available, noteMin, chatMin, chat, source };
}

function applyWorkspaceWidths(persist = false) {
  const box = workspaceWidthBounds();
  const root = document.documentElement;
  root.style.setProperty("--rail-l", `${box.course}px`);
  root.style.setProperty("--workspace-source", `${box.source}px`);
  root.style.setProperty("--rail-r", `${box.chat}px`);
  for (const [gutter, value, min, max] of [
    [gutterLeft, box.course, box.width * 0.15, box.width * 0.20],
    [gutterSource, box.source, 260, box.available - box.noteMin - box.chat],
    [gutterRight, box.chat, box.chatMin, box.available - box.noteMin - box.source],
  ]) {
    gutter.setAttribute("aria-valuemin", String(Math.round(min)));
    gutter.setAttribute("aria-valuemax", String(Math.round(Math.max(min, max))));
    gutter.setAttribute("aria-valuenow", String(Math.round(value)));
    gutter.setAttribute("aria-valuetext", `${Math.round(value / box.width * 100)}%`);
  }
  if (persist) {
    try { localStorage.setItem(workspaceWidthKey, JSON.stringify(workspaceWidths)); }
    catch (e) { /* 宽度调整不依赖本地存储成功。 */ }
  }
}

function resizeWorkspacePart(kind, delta, start) {
  if (kind === "course") {
    // 课程边界只在课程与原文之间交换空间，笔记和 AI 保持不变。
    const course = clampWidth(start.course + delta, start.width * 0.15,
      Math.min(start.width * 0.20, start.course + start.source - 260));
    workspaceWidths.course = course / start.width;
    workspaceWidths.source = (start.source + start.course - course) / start.width;
  } else if (kind === "source") {
    workspaceWidths.source = clampWidth(start.source + delta, 260,
      start.available - start.noteMin - start.chat) / start.width;
  } else {
    const key = start.mobile ? "mobileChat" : "chat";
    workspaceWidths[key] = clampWidth(start.chat - delta, start.chatMin,
      start.available - start.noteMin - start.source) / start.width;
  }
  applyWorkspaceWidths(true);
}

function bindWorkspaceGutter(gutter, kind) {
  gutter.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const start = workspaceWidthBounds();
    gutter.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing");
    const move = (next) => resizeWorkspacePart(kind, next.clientX - startX, start);
    const finish = () => {
      document.body.classList.remove("is-resizing");
      gutter.removeEventListener("pointermove", move);
      gutter.removeEventListener("pointerup", finish);
      gutter.removeEventListener("pointercancel", finish);
      gutter.removeEventListener("lostpointercapture", finish);
    };
    gutter.addEventListener("pointermove", move);
    gutter.addEventListener("pointerup", finish);
    gutter.addEventListener("pointercancel", finish);
    gutter.addEventListener("lostpointercapture", finish);
  });
  gutter.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resizeWorkspacePart(kind, event.key === "ArrowRight" ? 16 : -16, workspaceWidthBounds());
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

function renderLibrary() {
  const query = (librarySearch.value || "").trim().toLowerCase();
  const courses = libraryState.courses || [];
  const threads = libraryState.threads || [];
  libraryCount.textContent = String(documents.length);
  libraryTree.replaceChildren();
  libraryTree.classList.toggle("is-empty", !documents.length && !courses.length);
  const warnings = (libraryState.library?.warnings || []).filter((warning) => !warning.includes("资料库为空"));
  libraryAlert.hidden = !warnings.length;
  libraryAlert.textContent = warnings.join(" ");
  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.id = "library-import-row";
  importButton.className = "library-import-row";
  importButton.textContent = "＋ 导入资料";
  libraryTree.appendChild(importButton);
  const linkedIds = new Set(courses.flatMap((course) => course.document_ids));
  const groups = [...courses, { id: "", title: "未分组资料", document_ids: documents.filter((doc) => !linkedIds.has(doc.id)).map((doc) => doc.id) }];
  for (const course of groups) {
    const courseDocs = documents.filter((doc) => course.document_ids.includes(doc.id));
    const matchesCourse = course.title.toLowerCase().includes(query);
    const visibleDocs = courseDocs.filter((doc) => !query || matchesCourse || `${doc.title} ${doc.source_name || ""}`.toLowerCase().includes(query) || threads.some((thread) => thread.document_id === doc.id && thread.title.toLowerCase().includes(query)));
    if (!course.id && !courseDocs.length && courses.length) continue;
    if (query && !matchesCourse && !visibleDocs.length) continue;
    const group = document.createElement("section");
    group.className = "course-group";
    group.dataset.courseId = course.id;
    const heading = document.createElement("div");
    heading.className = "course-heading";
    const toggle = document.createElement("button");
    toggle.type = "button";
    const expanded = !collapsedCourses.has(course.id) || !!query;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.classList.toggle("is-selected", course.id === activeCourseId);
    toggle.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${expanded ? "m4 6 4 4 4-4" : "m6 4 4 4-4 4"}"/></svg>`;
    const label = document.createElement("span");
    label.textContent = course.title;
    toggle.appendChild(label);
    toggle.addEventListener("click", () => {
      activeCourseId = course.id;
      if (collapsedCourses.has(course.id)) collapsedCourses.delete(course.id); else collapsedCourses.add(course.id);
      renderLibrary();
    });
    heading.appendChild(toggle);
    group.appendChild(heading);
    if (expanded) {
      for (const doc of visibleDocs) {
        const file = document.createElement("div");
        file.className = "course-file";
        const row = buildDocRow(doc);
        row.addEventListener("click", () => { activeCourseId = course.id; updateWorkspaceDocument(); });
        file.appendChild(row);
        if (doc.id === currentDocId()) {
          for (const thread of threads.filter((item) => item.document_id === doc.id)) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "workspace-thread";
            button.classList.toggle("is-active", thread.id === activeThreadId);
            button.dataset.threadId = thread.id;
            button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v9H6l-4 3zM5 5h6M5 8h4"/></svg>';
            const text = document.createElement("span");
            text.textContent = thread.title;
            button.appendChild(text);
            button.addEventListener("click", () => openWorkspaceThread(thread));
            file.appendChild(button);
          }
          const newThread = document.createElement("button");
          newThread.type = "button";
          newThread.className = "workspace-thread";
          newThread.textContent = "＋ 新建对话";
          newThread.addEventListener("click", () => createWorkspaceThread(doc.id));
          file.appendChild(newThread);
        }
        group.appendChild(file);
      }
      if (!courseDocs.length) {
        const empty = document.createElement("p"); empty.className = "course-empty";
        empty.textContent = course.id ? "还没有资料，导入这门课程的第一份文件。" : "已有资料会保留在这里，也可以导入到课程。";
        group.appendChild(empty);
      }
      const add = document.createElement("button");
      add.type = "button"; add.className = "course-import"; add.textContent = "＋ 导入资料";
      add.addEventListener("click", () => { activeCourseId = course.id; importCourseId = course.id; importInput.click(); });
      group.appendChild(add);
    }
    libraryTree.appendChild(group);
  }
  updateWorkspaceDocument();
}

function updateWorkspaceDocument() {
  const course = (libraryState.courses || []).find((item) => item.id === activeCourseId);
  $("workspace-course-name").textContent = course?.title || "未分组资料";
  $("workspace-notes-file").textContent = currentDoc?.title || "";
  $("workspace-document-title").textContent = currentDoc?.title || "选择一份资料，开始学习";
  $("workspace-document-format").textContent = currentDoc ? (FORMAT_LABEL[currentDoc.source_format] || "资料") : "阅读与思考，在同一个空间";
  const thread = (libraryState.threads || []).find((item) => item.id === activeThreadId);
  $("workspace-chat-title").textContent = thread?.title || "AI 对话";
  const context = $("workspace-chat-context");
  context.hidden = !currentDoc;
  context.textContent = currentDoc?.title || "";
}

async function openWorkspaceThread(thread) {
  const sequence = ++threadOpenSequence;
  try {
    await loadDocument(thread.document_id, { markOpen: true });
    if (sequence !== threadOpenSequence || currentDocId() !== thread.document_id) return;
    const response = await postJson(`/api/threads/${thread.id}/open`, {});
    if (sequence !== threadOpenSequence || currentDocId() !== thread.document_id) return;
    ++chatLoadSequence;
    activeThreadId = thread.id;
    threadByDocument.set(thread.document_id, thread.id);
    chatMessages = response.messages || [];
    resetChatSuggestions();
    renderChat(); renderLibrary();
    openRightRail(); switchTab("chat"); scheduleChatSuggestions();
  } catch (error) { showToast(error.message, 5000); }
}

async function createWorkspaceThread(docId = currentDocId()) {
  if (!docId) return showToast("先打开一份课程资料，再开始对话");
  try {
    const data = await postJson("/api/threads", { doc_id: docId });
    applyLibrary(data.library);
    await openWorkspaceThread(data.thread);
  } catch (error) { showToast(error.message, 5000); }
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
    if (page) {
      try {
        const shell = await getPdfShell();
        if (shell.goToPage(page)) {
          showToast(`已定位到第 ${page} 页`);
        } else {
          showToast("PDF 页码超出范围");
        }
      } catch (error) {
        showToast("PDF 阅读器尚未就绪");
      }
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
  try {
    const payload = await api("/api/library/scan", { method: "POST" });
    applyLibrary(payload);
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
  }
}

librarySearch.addEventListener("input", () => {
  renderLibrary();
  scheduleSearch();
});
if (btnAskCross) btnAskCross.addEventListener("click", askAcrossDocuments);

// ------------------------------------------------------------
// 导入
// ------------------------------------------------------------
async function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const targetCourse = importCourseId;
  railLeft.classList.add("is-importing");
  try {
    let imported = 0;
    let firstImportedDoc = "";
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      if (targetCourse) form.append("course_id", targetCourse);
      try {
        const data = await api("/api/import", { method: "POST", body: form });
        firstImportedDoc ||= data.document_id || "";
        if (data.duplicate) {
          showToast(`${file.name}：${importCourseId ? "已关联到当前课程" : "内容已存在，跳过"}`);
        } else {
          imported += 1;
        }
      } catch (e) {
        showToast(`${file.name}：${e.message}`, 5000);
      }
    }
    if (imported) showToast(`已导入 ${imported} 个文件，正在后台解析`);
    await fetchLibraryData();
    if (firstImportedDoc) {
      activeCourseId = targetCourse;
      await loadDocument(firstImportedDoc, { markOpen: true });
    }
    if ((libraryState.jobs || []).length) startJobPolling();
  } finally {
    railLeft.classList.remove("is-importing");
    importCourseId = "";
  }
}

importInput.addEventListener("change", () => {
  const files = Array.from(importInput.files || []);
  importInput.value = "";
  uploadFiles(files);
});

libraryTree.addEventListener("click", (event) => {
  if (event.target.closest("#library-import-row, #library-drop-empty")) {
    importInput.click();
  }
});
libraryTree.addEventListener("keydown", (event) => {
  if (!event.target.closest("#library-drop-empty")) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    importInput.click();
  }
});

["dragenter", "dragover"].forEach((name) => {
  railLeft.addEventListener(name, (event) => {
    if (!event.dataTransfer || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    railLeft.classList.add("is-dragover");
  });
});
railLeft.addEventListener("dragleave", (event) => {
  if (event.relatedTarget && railLeft.contains(event.relatedTarget)) return;
  railLeft.classList.remove("is-dragover");
});
railLeft.addEventListener("drop", (event) => {
  if (!event.dataTransfer) return;
  event.preventDefault();
  railLeft.classList.remove("is-dragover");
  uploadFiles(event.dataTransfer.files);
});
window.addEventListener("dragover", (event) => {
  if (event.dataTransfer && event.dataTransfer.types.includes("Files")) {
    event.preventDefault();
  }
});
window.addEventListener("drop", (event) => {
  if (event.dataTransfer && event.dataTransfer.files.length) {
    event.preventDefault();
  }
});

// ------------------------------------------------------------
// 文档
// ------------------------------------------------------------
async function loadPage() {
  loadTopbarProfile();
  try {
    const [sessionData, libraryData] = await Promise.all([
      api("/api/session"),
      api("/api/library"),
    ]);
    session = sessionData;
    if (session.selected_document && session.selected_thread_id) threadByDocument.set(session.selected_document.id, session.selected_thread_id);
    applyLibrary(libraryData);
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
  closeBubble(true);
  resetChatSuggestions();
  pdfReadingPage = 1;
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
    renderDocView(data);
    await loadNotes(docId);
    if (token !== docToken) return;
    await loadChat(docId);
    if (token !== docToken) return;
    await refreshSessionQuiet();
    scheduleChatSuggestions();
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
  const course = (libraryState.courses || []).find((item) => item.id === activeCourseId && item.document_ids.includes(data.document?.id))
    || (libraryState.courses || []).find((item) => item.document_ids.includes(data.document?.id));
  activeCourseId = course?.id || "";
  topbarCrumb.hidden = false;
  topbarCrumb.textContent = (data.document && (data.document.source_name || data.document.title)) || "";
  const versions = data.versions || [];
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
  currentViewMode = data.view_mode === "pdf" ? "pdf" : "markdown";
  currentPdfUrl = data.pdf_url || "";
  updateWorkspaceDocument();

  if (data.status !== "ready") {
    pdfView.hidden = true;
    docScroll.classList.remove("is-pdf");
    docPage.hidden = true;
    clearPdfShell();
    docEmpty.hidden = false;
    renderStatusCard(data);
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
    docBody.innerHTML = "";
    showPdfShell(currentPdfUrl);
    return;
  }

  pdfView.hidden = true;
  docScroll.classList.remove("is-pdf");
  clearPdfShell();
  docEmpty.hidden = true;
  docPage.hidden = false;
  docBody.innerHTML = data.html || "";
  typesetMath(docBody);
  attachCopyButtons(docBody);
  attachHashLinks(docBody);
  bindBlockClicks();

  setTimeout(() => {
    restorePosition(data.position);
    setTimeout(() => {
      suppressPositionSave = false;
    }, 450);
  }, 0);
}

function applyReadingSettings() {
  document.documentElement.style.setProperty("--read-font-size", `${readFontSize}px`);
  document.documentElement.style.setProperty("--read-line-height", String(readLineHeight));
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

function toggleFocusMode(force) {
  const on = force === undefined ? !document.body.classList.contains("focus-mode") : force;
  document.body.classList.toggle("focus-mode", on);
  if (on) showToast("专注阅读：Ctrl+Shift+F 或 Esc 退出", 2600);
}

function showHelp() {
  if (helpModal) helpModal.hidden = false;
}

function closeHelp() {
  if (helpModal) helpModal.hidden = true;
}

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
  if (document.querySelector("dialog[open]")) return;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "F" || e.key === "f")) {
    e.preventDefault();
    toggleFocusMode();
    return;
  }
  if (e.key === "Escape") {
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
  ++chatLoadSequence;
  ++threadOpenSequence;
  activeThreadId = null;
  resetChatSuggestions();
  docPage.hidden = true;
  docEmpty.hidden = false;
  topbarCrumb.hidden = true;
  docEmpty.innerHTML = "";
  currentDoc = null;
  updateWorkspaceDocument();
  currentContent = null;
  currentVersionId = "";
  currentBlocks = [];
  chatMessages = [];
  renderChat();
  chatInput.value = "";
  notesDocId = "";
  notesTitle = "";
  notesContent = "";
  notesDirty = false;
  notesContentEl.value = "";
  updateNotesEnabled();
  setSaveState("", "");
  renderSidebarActive();

  if (!documents.length) {
    renderEmptyLibrary();
  } else {
    renderEmptyPick();
  }
}

function renderEmptyLibrary() {
  docEmpty.innerHTML = `
    <div class="empty-card">
      <h2>把你的资料放进来</h2>
      <p>支持 Markdown、TXT、DOCX、PPTX 和 PDF。从左侧资料柜点「导入资料」，或把文件直接拖进资料柜；解析完成后就能在这里阅读和标注。</p>
      <p class="empty-note">没有配置 API 也能阅读、标注和记笔记。</p>
    </div>`;
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
      <p class="empty-note">也可以在左侧资料柜继续导入。</p>
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
    updateLlmStatus();
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
    await postJson(`/api/documents/${currentDocId()}/position`, position);
  } catch (e) {
    /* 位置保存失败不打扰阅读 */
  }
}

function restorePosition(position) {
  if (!position || position.version_id !== currentVersionId || !position.block_id) {
    return;
  }
  const block = docBody.querySelector(
    `.doc-block[data-block-id="${CSS.escape(position.block_id)}"]`
  );
  if (!block) {
    return;
  }
  const containerTop = docScroll.getBoundingClientRect().top;
  const top = block.getBoundingClientRect().top - containerTop + docScroll.scrollTop;
  const height = block.getBoundingClientRect().height || 0;
  const target = top + (position.block_offset || 0) * height - 10;
  suppressPositionSave = true;
  docScroll.scrollTop = Math.max(0, target);
}

docScroll.addEventListener("scroll", () => {
  schedulePositionSave();
  scheduleChatSuggestions();
});
window.addEventListener("learning:pdf-page", (event) => {
  pdfReadingPage = event.detail.page;
  scheduleChatSuggestions();
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
  scheduleChatSuggestions();
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
  scheduleChatSuggestions();
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

// ------------------------------------------------------------
// 对话
// ------------------------------------------------------------
const DEFAULT_CHAT_QUESTIONS = [
  "帮我梳理这份资料的重点",
  "出个题考察一下",
  "看看我的笔记还需要补充什么",
];

function renderChatSuggestions(questions = DEFAULT_CHAT_QUESTIONS, source = "default") {
  chatSuggestionsEl.replaceChildren();
  chatSuggestionsEl.dataset.source = source;
  questions.forEach((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-suggestion";
    button.disabled = chatSending;
    button.title = `发送：${question}`;
    const text = document.createElement("span");
    text.textContent = question;
    button.appendChild(text);
    button.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 4v7a2 2 0 0 1-2 2H4m4-4-4 4 4 4"/></svg>');
    button.addEventListener("click", () => sendChat(question, selection?.quote || ""));
    chatSuggestionsEl.appendChild(button);
  });
}

function resetChatSuggestions() {
  clearTimeout(suggestionsTimer);
  ++suggestionsSequence;
  suggestionsController?.abort();
  suggestionsKey = "";
  chatSuggestionsEl.setAttribute("aria-busy", "false");
  renderChatSuggestions();
}

function scheduleChatSuggestions() {
  clearTimeout(suggestionsTimer);
  suggestionsTimer = setTimeout(refreshChatSuggestions, 600);
}

async function refreshChatSuggestions() {
  if (chatSending) return;
  if (!ready() || !llmConfigured()) {
    if (suggestionsKey) resetChatSuggestions();
    return;
  }
  const context = {
    doc_id: currentDocId(),
    quote: selection?.quote?.slice(0, 2000) || "",
    block_id: selection?.blockId || (currentViewMode === "markdown" ? collectPosition()?.block_id : "") || "",
    page: currentViewMode === "pdf" ? pdfReadingPage : 0,
    ...(activeThreadId ? { thread_id: activeThreadId } : {}),
  };
  const key = JSON.stringify([context, currentVersionId, chatMessages.slice(-6)]);
  if (key === suggestionsKey) return;
  suggestionsKey = key;
  suggestionsController?.abort();
  suggestionsController = new AbortController();
  const sequence = ++suggestionsSequence;
  renderChatSuggestions();
  chatSuggestionsEl.setAttribute("aria-busy", "true");
  try {
    const data = await api("/api/chat/suggestions", {
      method: "POST", signal: suggestionsController.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(context),
    });
    if (sequence !== suggestionsSequence) return;
    if (Array.isArray(data.suggestions) && data.suggestions.length === 3 &&
        data.suggestions.every((q) => typeof q === "string" && q.trim())) {
      renderChatSuggestions(data.suggestions, data.source);
    }
  } catch (error) {
    // 默认问题始终可用，建议生成失败不打断阅读与对话。
  } finally {
    if (sequence === suggestionsSequence) chatSuggestionsEl.setAttribute("aria-busy", "false");
  }
}

function renderChat() {
  if (!currentDocId() || !chatMessages.length) {
    chatMessagesEl.replaceChildren();
    return;
  }
  chatMessagesEl.innerHTML = chatMessages
    .map((m, index) => {
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
        ${!isUser ? `<button type="button" class="chat-to-notes" data-note-message="${index}" aria-label="将这条回答记入笔记" title="记入笔记"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h7l3 3v5M12 3v4h3M5 3v14h5M14.5 12v6M11.5 15h6"/></svg></button>` : ""}
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
  chatMessagesEl.querySelectorAll("[data-note-message]").forEach((button) => {
    button.addEventListener("click", async () => {
      const message = chatMessages[Number(button.dataset.noteMessage)];
      if (!notesDocId || !message || message.role !== "assistant") return;
      prepareNotesWrite();
      notesContentEl.value = [notesContentEl.value.trimEnd(), message.content].filter(Boolean).join("\n\n");
      finishNotesWrite();
      notesDirty = true;
      await saveNotesNow();
      if (notesDirty) await saveNotesNow();
    });
  });
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function loadChat(docId) {
  const sequence = ++chatLoadSequence;
  const saved = threadByDocument.get(docId);
  const available = (libraryState.threads || []).filter((thread) => thread.document_id === docId);
  const desired = available.find((thread) => thread.id === saved)?.id || available[0]?.id || null;
  activeThreadId = desired;
  chatMessages = [];
  renderChat();
  try {
    const params = new URLSearchParams({ doc_id: docId });
    if (desired) params.set("thread_id", desired);
    const data = await api(`/api/chat?${params}`);
    if (sequence !== chatLoadSequence || docId !== currentDocId()) return;
    chatMessages = data.messages || [];
  } catch (error) {
    if (sequence !== chatLoadSequence || docId !== currentDocId()) return;
    chatMessages = [];
    showToast(error.message, 5000);
  }
  renderChat(); updateWorkspaceDocument(); scheduleChatSuggestions();
}

async function sendChat(question, quote) {
  if (chatSending) return;
  if (!ready()) {
    showToast(currentDocId() ? "资料还没解析完成" : "先打开一份资料，再提问");
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
  const requestedDoc = currentDocId();
  const requestedThread = activeThreadId;
  // 对话可检查当前笔记，先等待现有保存，避免把上一版笔记当成用户刚写的内容。
  if (notesDirty || notesSaving) {
    await saveNotesNow();
    if (notesDirty) await saveNotesNow();
    if (notesDirty) { showToast("笔记未保存成功，请重试"); return; }
  }
  if (chatSending || requestedDoc !== currentDocId() || requestedThread !== activeThreadId) return;
  chatSending = true;
  const sendingDocId = currentDocId();
  const sendingThreadId = activeThreadId;
  const inputAtSend = chatInput.value;
  ++suggestionsSequence;
  suggestionsController?.abort();
  chatSuggestionsEl.setAttribute("aria-busy", "false");
  updateLlmStatus();
  chatMessagesEl.insertAdjacentHTML("beforeend", '<div class="loading chat-pending">思考中…</div>');
  try {
    const data = await postJson("/api/chat", {
      doc_id: sendingDocId,
      ...(sendingThreadId ? { thread_id: sendingThreadId } : {}),
      title: currentDoc ? currentDoc.title : undefined,
      question: q || "讲这段",
      quote: quote || undefined,
      block_id: quote ? (selection && selection.blockId) || undefined : undefined,
    });
    if (sendingDocId !== currentDocId() || sendingThreadId !== activeThreadId) return;
    activeThreadId = data.thread_id || sendingThreadId;
    if (activeThreadId) threadByDocument.set(sendingDocId, activeThreadId);
    chatMessages = data.messages || [];
    renderChat();
    if (chatInput.value === inputAtSend) chatInput.value = "";
    fetchLibraryData().catch(() => {});
  } catch (e) {
    showToast(e.message, 5000);
  } finally {
    chatSending = false;
    chatMessagesEl.querySelector(".chat-pending")?.remove();
    updateLlmStatus();
    scheduleChatSuggestions();
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
      ...(activeThreadId ? { thread_id: activeThreadId } : {}),
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
  if (mode === "check") {
    openRightRail();
    await sendChat("根据我选中的这段原文出个题考察一下，先不要给答案。", selection.quote);
    return;
  }
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
  btnNotesSave.disabled = !hasDoc || notesSaving;
  if (btnNotesUndo) btnNotesUndo.disabled = !notesUndoStack.length;
  if (btnNotesExport) {
    btnNotesExport.disabled = !hasDoc || !(notesContentEl.value || "").trim();
  }
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
}

async function undoNotes() {
  if (!notesUndoStack.length) return showToast("没有可撤销的修改");
  const prev = notesUndoStack.pop();
  notesContentEl.value = prev;
  notesLastValue = prev;
  notesDirty = true;
  clearTimeout(notesSaveTimer);
  updateNotesUndoButton();
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
  notesContentEl.value = "";
  resetNotesUndo();
  setSaveState("", "");
  updateNotesEnabled();
  if (!docId) return;
  try {
    const data = await api(`/api/notes?doc_id=${encodeURIComponent(docId)}`);
    if (docId !== currentDocId() || notesDocId !== docId) return;
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
}

function saveNotesNow() {
  if (notesSaveInFlight) return notesSaveInFlight;
  notesSaveInFlight = performNotesSave().then((saved) => {
    if (saved && notesDirty && notesDocId) scheduleNotesSave();
    return saved;
  }).finally(() => { notesSaveInFlight = null; });
  return notesSaveInFlight;
}

async function performNotesSave() {
  if (!notesDocId || notesSaving) return;
  const content = notesContentEl.value;
  const savingDocId = notesDocId;
  notesSaving = true;
  btnNotesSave.disabled = true;
  setSaveState("is-saving", "保存中…");
  try {
    const data = await api("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_id: savingDocId,
        title: notesTitle || undefined,
        content,
      }),
    });
    if (savingDocId !== notesDocId) return true;
    notesContent = data.content != null ? data.content : content;
    notesDirty = notesContentEl.value !== content;
    setSaveState("is-ok", data.updated_at ? `已保存 · ${data.updated_at}` : "已保存");
    if (data.overview) {
      libraryState.overview = data.overview;
        const doc = documents.find((d) => d.id === notesDocId);
      if (doc) doc.has_note = content.trim() ? 1 : 0;
      renderLibrary();
    }
    return true;
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

btnNotesSave.addEventListener("click", saveNotesNow);
btnNotesUndo.addEventListener("click", undoNotes);
btnNotesExport.addEventListener("click", exportNotes);
notesContentEl.addEventListener("input", () => {
  beginNotesEdit();
  notesDirty = true;
  if (btnNotesExport) {
    btnNotesExport.disabled = !(notesContentEl.value || "").trim();
  }
  scheduleNotesSave();
});
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

function renderTopbarAvatar(profile) {
  if (!btnAvatar || !topbarAvatarImg || !topbarAvatarInitial) return;
  const name = (profile.display_name || "").trim();
  const initial = name ? [...name][0] : "读";
  topbarAvatarInitial.textContent = initial;
  if (profile.avatar) {
    topbarAvatarImg.src = profile.avatar;
    topbarAvatarImg.hidden = false;
    topbarAvatarInitial.hidden = true;
  } else {
    topbarAvatarImg.hidden = true;
    topbarAvatarImg.removeAttribute("src");
    topbarAvatarInitial.hidden = false;
  }
  btnAvatar.title = name ? `${name} · 设置` : "打开设置";
}

async function loadTopbarProfile() {
  try {
    const data = await api("/api/profile");
    renderTopbarAvatar(data.profile || {});
  } catch (e) {
    /* 档案读取失败不影响阅读 */
  }
}

function updateLlmStatus() {
  const canAI = ready() && llmConfigured();
  btnChatSend.disabled = !canAI || chatSending;
  chatSuggestionsEl.querySelectorAll("button").forEach((button) => { button.disabled = chatSending; });
}

// ------------------------------------------------------------
// 标签徽章
// ------------------------------------------------------------
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

// 课程与导航入口复用现有导入、阅读和设置弹窗，不创建独立整页。
const courseDialog = $("course-dialog");
$("btn-create-course").addEventListener("click", () => {
  $("course-form-error").hidden = true;
  courseDialog.showModal();
  $("course-title").focus();
});
$("btn-course-cancel").addEventListener("click", () => courseDialog.close());
$("course-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("btn-course-submit");
  button.disabled = true;
  $("course-form-error").hidden = true;
  try {
    const data = await postJson("/api/courses", { title: $("course-title").value.trim() });
    applyLibrary(data.library);
    activeCourseId = data.course.id;
    collapsedCourses.delete(activeCourseId);
    renderLibrary();
    courseDialog.close();
    $("course-form").reset();
    if (isLibraryDrawer()) setLeftRail(true, true);
    showToast("课程已创建，可以导入这门课程的资料");
  } catch (error) {
    $("course-form-error").textContent = error.message;
    $("course-form-error").hidden = false;
  } finally { button.disabled = false; }
});
$("btn-courses").addEventListener("click", () => { librarySearch.value = ""; renderLibrary(); });
$("btn-sidebar-fold").addEventListener("click", () => {
  if (isLibraryDrawer()) setLeftRail(false); else document.body.classList.add("library-closed");
});
$("btn-document-chat").addEventListener("click", toggleWorkspaceChat);
$("btn-close-chat").addEventListener("click", () => setRightRail(false));
$("btn-source-toggle").addEventListener("click", () => {
  document.body.classList.toggle("source-open");
  $("btn-source-toggle").setAttribute("aria-expanded", String(document.body.classList.contains("source-open")));
});
$("btn-source-close").addEventListener("click", () => { document.body.classList.remove("source-open"); $("btn-source-toggle").setAttribute("aria-expanded", "false"); });
$("btn-new-thread").addEventListener("click", () => createWorkspaceThread());

// ------------------------------------------------------------
// 初始化
// ------------------------------------------------------------
applyWorkspaceWidths();
bindWorkspaceGutter(gutterLeft, "course");
bindWorkspaceGutter(gutterSource, "source");
bindWorkspaceGutter(gutterRight, "chat");
window.addEventListener("resize", () => {
  // 窗口变化直接适配新分栏，避免把旧断点的网格也当作抽屉动画插值。
  clearTimeout(chatSlideTimer);
  document.body.classList.remove("chat-sliding");
  applyWorkspaceWidths();
  syncChatToggle();
  syncScrim();
});
window.addEventListener("storage", (event) => {
  if (
    event.key === "learning.readFontSize" ||
    event.key === "learning.readLineHeight"
  ) {
    loadReadingSettings();
  }
});
window.addEventListener("learning:reading-settings", (event) => {
  readFontSize = event.detail.fontSize;
  readLineHeight = event.detail.lineHeight;
  applyReadingSettings();
});
window.addEventListener("learning:profile", (event) => renderTopbarAvatar(event.detail));
window.addEventListener("learning:api-config", async () => {
  await refreshSessionQuiet();
  resetChatSuggestions();
  scheduleChatSuggestions();
});
window.addEventListener("learning:data-changed", (event) => {
  if (event.detail && event.detail.reset) {
    clearTimeout(notesSaveTimer);
    clearTimeout(positionTimer);
    clearTimeout(notesUndoTimer);
    notesUndoStack = [];
    ++docToken;
    closeBubble();
    pdfView.hidden = true;
    docScroll.classList.remove("is-pdf");
    clearPdfShell();
    showEmpty();
  }
  loadPage();
});
document.addEventListener("DOMContentLoaded", () => {});
if (window.matchMedia("(max-width: 1000px)").matches) setRightRail(false, false);
switchTab("chat");
loadReadingSettings();
renderChatSuggestions();
loadPage();
