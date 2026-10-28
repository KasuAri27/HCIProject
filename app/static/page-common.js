"use strict";

async function pageFetch(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
  }
  return data;
}

function pageJson(path, method, body) {
  return pageFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pageEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let toastTimer = null;
function pageToast(message, kind = "ok") {
  const el = document.getElementById("page-toast");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3600);
}

window.pageFetch = pageFetch;
window.pageJson = pageJson;
window.pageEscape = pageEscape;
window.pageToast = pageToast;
