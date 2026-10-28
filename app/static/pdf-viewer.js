"use strict";

import * as pdfjsLib from "./vendor/pdfjs/runtime/pdf.min.mjs?v=6.4.299";
import {
  EventBus,
  PDFLinkService,
  PDFViewer,
} from "./vendor/pdfjs/web/pdf_viewer.mjs?v=6.4.299";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "./vendor/pdfjs/runtime/pdf.worker.min.mjs?v=6.4.299",
  import.meta.url
).href;

const CMAP_URL = new URL("./vendor/pdfjs/cmaps/", import.meta.url).href;
const STANDARD_FONT_URL = new URL(
  "./vendor/pdfjs/standard_fonts/",
  import.meta.url
).href;
const WASM_URL = new URL("./vendor/pdfjs/wasm/", import.meta.url).href;

let viewer = null;
let eventBus = null;
let linkService = null;
let loadingTask = null;
let currentPdf = null;
let loadToken = 0;
let bound = false;
let viewerEvents = null;
let pageTimer = null;
let fitFrame = null;

const ui = () => ({
  container: document.getElementById("pdf-viewer-container"),
  viewer: document.getElementById("pdf-viewer"),
  loading: document.getElementById("pdf-loading"),
  pageStatus: document.getElementById("pdf-page-status"),
});

function updatePageStatus() {
  const el = ui();
  if (el.pageStatus) el.pageStatus.textContent = `${viewer?.currentPageNumber || 1} / ${currentPdf?.numPages || 1}`;
}

function fitWidth() {
  if (!viewer || !currentPdf || !ui().container.clientWidth) return;
  viewer.currentScaleValue = "page-width";
}

function zoom(factor, origin) {
  if (!viewer || !currentPdf) return;
  const scale = viewer.currentScale || 1;
  const target = Math.max(0.25, Math.min(4, scale * factor));
  viewer.updateScale({ scaleFactor: target / scale, origin, drawingDelay: 100 });
}

function bindReader() {
  if (bound) return;
  bound = true;
  const el = ui();
  let pointerStart = null;
  el.container.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  el.container.addEventListener("click", (event) => {
    if (event.button !== 0 || !event.target.closest(".page") || event.target.closest("a, button, input, textarea, select")) return;
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) return;
    if (!window.getSelection()?.isCollapsed) return;
    zoom(1.15, [event.clientX, event.clientY]);
  });
  el.container.addEventListener("contextmenu", (event) => {
    if (!event.target.closest(".page") || event.target.closest("a, button, input, textarea, select")) return;
    event.preventDefault();
    zoom(1 / 1.15, [event.clientX, event.clientY]);
  });
  el.container.addEventListener("keydown", (event) => {
    if (event.target !== el.container || event.ctrlKey || event.metaKey || event.altKey) return;
    if (["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "0") fitWidth();
      else zoom(event.key === "-" ? 1 / 1.15 : 1.15);
    }
  });
  el.container.addEventListener("scroll", () => {
    if (!currentPdf) return;
    updatePageStatus();
    el.pageStatus.hidden = false;
    clearTimeout(pageTimer);
    pageTimer = setTimeout(() => { el.pageStatus.hidden = true; }, 1100);
  }, { passive: true });
  let lastWidth = 0;
  const observer = new ResizeObserver(() => {
    const width = el.container.getBoundingClientRect().width;
    if (!width || Math.abs(width - lastWidth) < 1) return;
    lastWidth = width;
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(fitWidth);
  });
  observer.observe(el.container);
}

export async function loadPdf(url) {
  bindReader();
  const el = ui();
  await clearPdf();
  const token = ++loadToken;
  if (!url || !el.container || !el.viewer) return;
  if (el.loading) el.loading.hidden = false;
  try {
    loadingTask = pdfjsLib.getDocument({
      url,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
      standardFontDataUrl: STANDARD_FONT_URL,
      wasmUrl: WASM_URL,
      enableXfa: true,
    });
    const pdf = await loadingTask.promise;
    if (token !== loadToken) {
      pdf.destroy();
      return;
    }
    currentPdf = pdf;
    eventBus = new EventBus();
    linkService = new PDFLinkService({ eventBus });
    viewer = new PDFViewer({
      container: el.container,
      viewer: el.viewer,
      eventBus,
      linkService,
      textLayerMode: 1,
      abortSignal: (viewerEvents = new AbortController()).signal,
    });
    linkService.setViewer(viewer);
    viewer.setDocument(pdf);
    linkService.setDocument(pdf, null);
    eventBus.on("pagechanging", () => {
      if (!viewer) return;
      updatePageStatus();
      window.dispatchEvent(new CustomEvent("learning:pdf-page", { detail: { page: viewer.currentPageNumber } }));
    });
    eventBus.on("pagesinit", () => {
      fitWidth();
      updatePageStatus();
    });
    updatePageStatus();
  } catch (error) {
    if (token !== loadToken) return;
    if (el.viewer) {
      el.viewer.innerHTML = "";
      const message = document.createElement("div");
      message.className = "pdf-error";
      message.textContent = `PDF 加载失败：${String(error.message || error)}`;
      el.viewer.appendChild(message);
    }
  } finally {
    if (token === loadToken && el.loading) el.loading.hidden = true;
  }
}

export async function clearPdf() {
  loadToken += 1;
  clearTimeout(pageTimer);
  cancelAnimationFrame(fitFrame);
  try {
    if (viewer) viewer.setDocument(null);
  } catch (error) {
    /* 已销毁 */
  }
  viewerEvents?.abort();
  viewerEvents = null;
  try {
    if (loadingTask) await loadingTask.destroy();
  } catch (error) {
    /* 已销毁 */
  }
  viewer = null;
  eventBus = null;
  linkService = null;
  loadingTask = null;
  currentPdf = null;
  const el = ui();
  if (el.viewer) el.viewer.innerHTML = "";
  if (el.pageStatus) el.pageStatus.hidden = true;
  updatePageStatus();
}

export function goToPage(page) {
  if (!viewer || !currentPdf) return false;
  const number = Number(page);
  if (!Number.isFinite(number) || number < 1 || number > currentPdf.numPages) {
    return false;
  }
  viewer.currentPageNumber = number;
  return true;
}

export function currentPage() {
  return viewer ? viewer.currentPageNumber : 0;
}
