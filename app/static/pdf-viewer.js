"use strict";

import * as pdfjsLib from "./vendor/pdfjs/build/pdf.min.mjs?v=6.4.299";
import {
  EventBus,
  PDFLinkService,
  PDFViewer,
} from "./vendor/pdfjs/web/pdf_viewer.mjs?v=6.4.299";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "./vendor/pdfjs/build/pdf.worker.min.mjs?v=6.4.299",
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

const ui = () => ({
  container: document.getElementById("pdf-viewer-container"),
  viewer: document.getElementById("pdf-viewer"),
  loading: document.getElementById("pdf-loading"),
  pageStatus: document.getElementById("pdf-page-status"),
  zoomStatus: document.getElementById("pdf-zoom-status"),
  prev: document.getElementById("pdf-prev"),
  next: document.getElementById("pdf-next"),
  zoomIn: document.getElementById("pdf-zoom-in"),
  zoomOut: document.getElementById("pdf-zoom-out"),
  fit: document.getElementById("pdf-fit"),
});

function updateToolbar() {
  const el = ui();
  if (!viewer || !currentPdf) {
    if (el.pageStatus) el.pageStatus.textContent = "1 / 1";
    if (el.zoomStatus) el.zoomStatus.textContent = "100%";
    if (el.prev) el.prev.disabled = true;
    if (el.next) el.next.disabled = true;
    return;
  }
  const page = viewer.currentPageNumber || 1;
  const total = currentPdf.numPages || 1;
  if (el.pageStatus) el.pageStatus.textContent = `${page} / ${total}`;
  if (el.zoomStatus) {
    el.zoomStatus.textContent = `${Math.round((viewer.currentScale || 1) * 100)}%`;
  }
  if (el.prev) el.prev.disabled = page <= 1;
  if (el.next) el.next.disabled = page >= total;
}

function bindToolbar() {
  if (bound) return;
  bound = true;
  const el = ui();
  el.prev?.addEventListener("click", () => {
    if (viewer) viewer.currentPageNumber = Math.max(1, viewer.currentPageNumber - 1);
  });
  el.next?.addEventListener("click", () => {
    if (!viewer || !currentPdf) return;
    viewer.currentPageNumber = Math.min(
      currentPdf.numPages,
      viewer.currentPageNumber + 1
    );
  });
  el.zoomIn?.addEventListener("click", () => {
    if (!viewer) return;
    viewer.currentScale = Math.min(4, (viewer.currentScale || 1) * 1.15);
    updateToolbar();
  });
  el.zoomOut?.addEventListener("click", () => {
    if (!viewer) return;
    viewer.currentScale = Math.max(0.25, (viewer.currentScale || 1) / 1.15);
    updateToolbar();
  });
  el.fit?.addEventListener("click", () => {
    if (!viewer) return;
    viewer.currentScaleValue = "page-width";
    updateToolbar();
  });
}

export async function loadPdf(url) {
  bindToolbar();
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
    });
    linkService.setViewer(viewer);
    viewer.setDocument(pdf);
    linkService.setDocument(pdf, null);
    eventBus.on("pagechanging", updateToolbar);
    eventBus.on("scalechanging", updateToolbar);
    eventBus.on("pagesinit", () => {
      viewer.currentScaleValue = "page-width";
      updateToolbar();
    });
    updateToolbar();
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
    if (el.loading) el.loading.hidden = true;
  }
}

export async function clearPdf() {
  loadToken += 1;
  try {
    if (viewer) viewer.setDocument(null);
  } catch (error) {
    /* 已销毁 */
  }
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
  updateToolbar();
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
