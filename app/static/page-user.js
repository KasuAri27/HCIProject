"use strict";

const PROVIDER_COLORS = {
  qwen: "#615ced",
  moonshot: "#1f2937",
  zhipu: "#2f6fd0",
  deepseek: "#4d6bfe",
  custom: "#a9741b",
};

let providers = [];
let active = {};

const serviceList = document.getElementById("service-list");

function colorFor(provider) {
  return PROVIDER_COLORS[provider.id] || PROVIDER_COLORS.custom;
}

function enabledCount(provider) {
  return (provider.models || []).filter((model) => model.enabled).length;
}

function renderProfile(profile) {
  const name = (profile.display_name || "").trim();
  const goal = (profile.goal || "").trim();
  document.getElementById("user-name").textContent = name || "读者";
  document.getElementById("user-goal").textContent =
    goal || "把读过的资料，变成自己的笔记。";
  document.getElementById("profile-name").value = name;
  document.getElementById("profile-goal").value = goal;
}

function renderStats(overview) {
  const data = overview || {};
  document.getElementById("stat-docs").textContent = String(data.document_count || 0);
  document.getElementById("stat-read").textContent = String(data.read_count || 0);
  document.getElementById("stat-notes").textContent = String(data.note_count || 0);
  document.getElementById("stat-practice").textContent = String(data.practice_count || 0);
}

function renderServices() {
  if (!providers.length) {
    serviceList.innerHTML = '<p class="sheet-empty">还没有可用的服务。</p>';
    return;
  }
  serviceList.innerHTML = providers
    .map((provider) => {
      const models = provider.models || [];
      const enabled = enabledCount(provider);
      const isActive = provider.id === active.provider_id;
      const state = provider.has_key
        ? isActive
          ? "首页正在用"
          : "已连接"
        : "未填 Key";
      const stateClass = provider.has_key ? "is-ok" : "is-warn";
      return `<article class="service-row" data-provider="${pageEscape(provider.id)}">
        <div class="service-line">
          <div class="service-main">
            <span class="provider-dot" style="--provider-color:${colorFor(provider)}" aria-hidden="true"></span>
            <h3>${pageEscape(provider.name)}</h3>
            <span class="service-meta">${pageEscape(provider.api_base)} · ${enabled}/${models.length} 个模型</span>
          </div>
          <div class="service-actions">
            <span class="service-state ${stateClass}">${state}</span>
            <button type="button" class="text-btn" data-action="scan">扫描模型</button>
            <button type="button" class="text-btn" data-action="edit">编辑</button>
            <a class="text-link" href="/api-config?provider=${encodeURIComponent(provider.id)}">管理模型</a>
          </div>
        </div>
        <form class="ledger-form service-edit" data-edit hidden>
          <label class="field">
            <span>API 地址</span>
            <input data-base type="text" value="${pageEscape(provider.api_base)}" spellcheck="false">
          </label>
          <label class="field">
            <span>API Key</span>
            <input data-key type="password" autocomplete="off" spellcheck="false" placeholder="${
              provider.has_key
                ? `已保存 ${pageEscape(provider.api_key_masked)}，留空不修改`
                : "填写 API Key"
            }">
          </label>
          <button type="submit" class="pbtn pbtn-primary">保存</button>
          <button type="button" class="pbtn pbtn-quiet" data-action="clear">清除 Key</button>
        </form>
      </article>`;
    })
    .join("");
}

async function loadProviders() {
  const data = await pageFetch("/api/providers");
  providers = data.providers || [];
  active = data.active || {};
  renderServices();
}

async function loadProfile() {
  const data = await pageFetch("/api/profile");
  renderProfile(data.profile || {});
}

async function loadStats() {
  const data = await pageFetch("/api/library");
  renderStats(data.overview || {});
}

async function scanProvider(provider) {
  pageToast("正在扫描模型…", "info");
  try {
    const data = await pageJson(
      `/api/providers/${encodeURIComponent(provider.id)}/scan`,
      "POST",
      {}
    );
    providers = data.state.providers;
    active = data.state.active;
    renderServices();
    pageToast(
      data.provider.models.length
        ? `扫描到 ${data.provider.models.length} 个模型`
        : "服务没有返回模型"
    );
  } catch (error) {
    pageToast(error.message, "err");
  }
}

async function saveService(form) {
  const row = form.closest("[data-provider]");
  const provider = providers.find((item) => item.id === row.dataset.provider);
  if (!provider) return;
  const base = form.querySelector("[data-base]").value.trim();
  const key = form.querySelector("[data-key]").value.trim();
  if (!base) return pageToast("API 地址不能为空", "err");
  const payload = { id: provider.id, name: provider.name, api_base: base };
  if (key) payload.api_key = key;
  try {
    const data = await pageJson("/api/providers", "POST", payload);
    providers = data.state.providers;
    active = data.state.active;
    renderServices();
    pageToast("服务设置已保存");
  } catch (error) {
    pageToast(error.message, "err");
  }
}

async function clearServiceKey(provider) {
  if (!provider.has_key) return pageToast("这个服务还没有 Key", "info");
  if (!window.confirm(`清除「${provider.name}」的 API Key？`)) return;
  try {
    const data = await pageJson("/api/providers", "POST", {
      id: provider.id,
      name: provider.name,
      api_base: provider.api_base,
      timeout: provider.timeout,
      temperature: provider.temperature,
      clear_key: true,
    });
    providers = data.state.providers;
    active = data.state.active;
    renderServices();
    pageToast("Key 已清除");
  } catch (error) {
    pageToast(error.message, "err");
  }
}

serviceList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const row = button.closest("[data-provider]");
  const provider = providers.find((item) => item.id === row.dataset.provider);
  if (!provider) return;
  const action = button.dataset.action;
  if (action === "scan") scanProvider(provider);
  if (action === "edit") {
    const form = row.querySelector("[data-edit]");
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector("[data-base]").focus();
  }
  if (action === "clear") clearServiceKey(provider);
});

serviceList.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-edit]");
  if (!form) return;
  event.preventDefault();
  saveService(form);
});

document.getElementById("profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await pageJson("/api/profile", "POST", {
      display_name: document.getElementById("profile-name").value,
      goal: document.getElementById("profile-goal").value,
    });
    renderProfile(data.profile || {});
    pageToast("档案已保存");
  } catch (error) {
    pageToast(error.message, "err");
  }
});

document.getElementById("custom-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("custom-name").value.trim();
  const base = document.getElementById("custom-base").value.trim();
  const key = document.getElementById("custom-key").value.trim();
  if (!name || !base) return;
  try {
    const payload = { name, api_base: base };
    if (key) payload.api_key = key;
    const data = await pageJson("/api/providers", "POST", payload);
    providers = data.state.providers;
    active = data.state.active;
    renderServices();
    event.target.reset();
    pageToast("自定义服务已添加");
  } catch (error) {
    pageToast(error.message, "err");
  }
});

Promise.all([loadProviders(), loadProfile(), loadStats()]).catch((error) => {
  serviceList.innerHTML = `<p class="sheet-empty">读取档案失败：${pageEscape(error.message)}</p>`;
  pageToast(error.message, "err");
});
