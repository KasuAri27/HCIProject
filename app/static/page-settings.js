"use strict";

const FONT_KEY = "learning.readFontSize";
const LINE_KEY = "learning.readLineHeight";
const DEFAULT_FONT = 17;
const DEFAULT_LINE = 1.85;

let fontSize = DEFAULT_FONT;
let lineHeight = DEFAULT_LINE;
let resetArmed = false;
let resetTimer = null;

const preview = document.getElementById("reading-preview");
const fontValue = document.getElementById("font-size-value");
const lineButtons = [...document.querySelectorAll("[data-line]")];
const resetButton = document.getElementById("btn-reset-learning");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadReadingSettings() {
  try {
    const size = parseInt(localStorage.getItem(FONT_KEY) || "", 10);
    const line = parseFloat(localStorage.getItem(LINE_KEY) || "");
    if (Number.isFinite(size)) fontSize = clamp(size, 14, 24);
    if (Number.isFinite(line)) lineHeight = clamp(line, 1.4, 2.4);
  } catch (error) {
    /* 本地存储不可用时用默认值 */
  }
  applyReadingSettings();
}

function applyReadingSettings() {
  preview.style.setProperty("--preview-size", `${fontSize}px`);
  preview.style.setProperty("--preview-leading", String(lineHeight));
  fontValue.textContent = `${fontSize} px`;
  lineButtons.forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      Number(button.dataset.line) === lineHeight ? "true" : "false"
    );
  });
  try {
    localStorage.setItem(FONT_KEY, String(fontSize));
    localStorage.setItem(LINE_KEY, String(lineHeight));
  } catch (error) {
    /* 忽略不可写的本地存储 */
  }
}

document.getElementById("btn-font-dec").addEventListener("click", () => {
  fontSize = clamp(fontSize - 1, 14, 24);
  applyReadingSettings();
});
document.getElementById("btn-font-inc").addEventListener("click", () => {
  fontSize = clamp(fontSize + 1, 14, 24);
  applyReadingSettings();
});
lineButtons.forEach((button) => {
  button.addEventListener("click", () => {
    lineHeight = clamp(parseFloat(button.dataset.line) || DEFAULT_LINE, 1.4, 2.4);
    applyReadingSettings();
  });
});
document.getElementById("btn-reading-reset").addEventListener("click", () => {
  fontSize = DEFAULT_FONT;
  lineHeight = DEFAULT_LINE;
  applyReadingSettings();
  pageToast("阅读设置已恢复默认");
});

async function loadDataSummary() {
  try {
    const data = await pageFetch("/api/library");
    const overview = data.overview || {};
    document.getElementById("data-summary").textContent =
      `${overview.document_count || 0} 份资料 · 已读 ${overview.read_count || 0} · ` +
      `笔记 ${overview.note_count || 0} · 练习 ${overview.practice_count || 0}`;
  } catch (error) {
    document.getElementById("data-summary").textContent = "学习数据读取失败";
  }
}

function disarmReset() {
  resetArmed = false;
  clearTimeout(resetTimer);
  resetButton.textContent = "清空学习记录";
  resetButton.classList.remove("is-armed");
}

resetButton.addEventListener("click", async () => {
  if (!resetArmed) {
    resetArmed = true;
    resetButton.textContent = "再次点击确认清空";
    resetButton.classList.add("is-armed");
    resetTimer = setTimeout(disarmReset, 4500);
    return;
  }
  resetButton.disabled = true;
  try {
    await pageJson("/api/reset", "POST", {});
    disarmReset();
    pageToast("学习记录已清空，文档和 API 配置保留");
    await loadDataSummary();
  } catch (error) {
    pageToast(error.message, "err");
  } finally {
    resetButton.disabled = false;
  }
});

loadReadingSettings();
loadDataSummary();
