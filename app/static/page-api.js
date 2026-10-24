"use strict";

const PROVIDER_COLORS = {
  qwen: "#615ced",
  moonshot: "#1f2937",
  zhipu: "#2f6fd0",
  deepseek: "#4d6bfe",
  custom: "#a9741b",
};

let state = { providers: [], active: {}, enabled_models: [] };
let selectedId = "";
let deleteArmed = false;

const providerList = document.getElementById("provider-list");
const providerCount = document.getElementById("provider-count");
const providerPanel = document.getElementById("provider-panel");
const providerEmpty = document.getElementById("provider-empty");
const modelList = document.getElementById("model-list");
const modelSummary = document.getElementById("model-summary");
const form = document.getElementById("provider-form");
const keyInput = document.getElementById("edit-key");
const deleteButton = document.getElementById("btn-delete");
const scanButton = document.getElementById("btn-scan");

function escapeAttr(value) {
  return pageEscape(value);
}

function providerById(id) {
  return state.providers.find((item) => item.id === id);
}

function selectedProvider() {
  return providerById(selectedId) || state.providers[0] || null;
}

function colorFor(provider) {
  return PROVIDER_COLORS[provider.id] || PROVIDER_COLORS.custom;
}

function enabledCount(provider) {
  return (provider.models || []).filter((model) => model.enabled).length;
}

function renderProviderList() {
  providerCount.textContent = String(state.providers.length);
  const order = ["qwen", "moonshot", "zhipu", "deepseek"];
  const providers = [...state.providers].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  providerList.innerHTML = providers
    .map((provider) => {
      const active = provider.id === state.active.provider_id;
      return `<button type="button" class="provider-item${provider.id === selectedId ? " is-selected" : ""}${
        active ? " is-active" : ""
      }" data-provider="${escapeAttr(provider.id)}" style="--provider-color:${colorFor(provider)}">
        <span class="provider-dot" aria-hidden="true"></span>
        <span class="provider-name">${pageEscape(provider.name)}</span>
        <span class="provider-sub">${
          provider.has_key ? `${enabledCount(provider)} 个模型` : "未填 Key"
        }</span>
      </button>`;
    })
    .join("");
}

function renderModelList(provider) {
  const models = provider.models || [];
  const enabled = enabledCount(provider);
  modelSummary.textContent = models.length
    ? `${enabled} / ${models.length} 个启用`
    : "尚未扫描模型";
  if (!models.length) {
    modelList.innerHTML =
      '<p class="sheet-empty">还没有模型。先保存服务，再点「扫描模型」；也可以手动添加自定义服务。</p>';
    return;
  }
  modelList.innerHTML = models
    .map((model) => {
      const isActive =
        state.active.provider_id === provider.id &&
        state.active.model === model.id;
      return `<div class="model-row${isActive ? " is-active" : ""}" data-model="${escapeAttr(model.id)}">
        <label class="switch" title="${model.enabled ? "停用" : "启用"}">
          <input type="checkbox" data-role="toggle"${model.enabled ? " checked" : ""}>
          <span aria-hidden="true"></span>
        </label>
        <span class="model-id">${pageEscape(model.id)}</span>
        ${isActive ? '<span class="model-current">首页正在用</span>' : ""}
        <button type="button" class="text-btn" data-role="activate"${
          model.enabled ? "" : " disabled"
        }>设为当前</button>
      </div>`;
    })
    .join("");
}

function renderDetail() {
  const provider = selectedProvider();
  if (!provider) {
    providerPanel.hidden = true;
    providerEmpty.hidden = false;
    providerEmpty.textContent = "还没有服务。先添加一个自定义服务。";
    return;
  }
  providerEmpty.hidden = true;
  providerPanel.hidden = false;
  document.getElementById("provider-name").textContent = provider.name;
  const enabled = enabledCount(provider);
  document.getElementById("provider-meta").textContent = `${provider.api_base} · ${enabled} 个模型启用`;
  document.getElementById("edit-base").value = provider.api_base || "";
  document.getElementById("edit-timeout").value = provider.timeout || 180;
  document.getElementById("edit-temperature").value = provider.temperature ?? 0.7;
  keyInput.value = "";
  keyInput.placeholder = provider.has_key
    ? `已保存 ${provider.api_key_masked}，留空不修改`
    : "填写 API Key";
  const badge = document.getElementById("provider-state");
  badge.className = "provider-state";
  if (!provider.has_key) {
    badge.textContent = "未填 Key";
    badge.classList.add("is-warn");
  } else if (!enabled) {
    badge.textContent = "没有启用模型";
    badge.classList.add("is-warn");
  } else {
    badge.textContent = "可调用";
    badge.classList.add("is-ok");
  }
  renderModelList(provider);
}

function render() {
  renderProviderList();
  renderDetail();
  deleteArmed = false;
  deleteButton.textContent = "删除服务";
  deleteButton.classList.remove("is-armed");
}

async function reloadState(preferredId = "") {
  state = await pageFetch("/api/providers");
  if (preferredId) selectedId = preferredId;
  if (!selectedId || !providerById(selectedId)) {
    selectedId =
      state.active.provider_id ||
      (state.providers[0] && state.providers[0].id) ||
      "";
  }
  render();
}

async function saveProvider({ silent = false } = {}) {
  const provider = selectedProvider();
  if (!provider) throw new Error("先选择一个服务");
  const payload = {
    id: provider.id,
    name: provider.name,
    api_base: document.getElementById("edit-base").value.trim(),
    timeout: document.getElementById("edit-timeout").value,
    temperature: document.getElementById("edit-temperature").value,
  };
  const key = keyInput.value.trim();
  if (key) payload.api_key = key;
  if (!silent) pageToast("正在保存…", "info");
  const data = await pageJson("/api/providers", "POST", payload);
  await reloadState(data.provider.id);
  if (!silent) pageToast("服务设置已保存");
}

async function scanModels() {
  const provider = selectedProvider();
  if (!provider) return;
  scanButton.disabled = true;
  scanButton.textContent = "扫描中…";
  try {
    if (keyInput.value.trim()) await saveProvider({ silent: true });
    const data = await pageJson(
      `/api/providers/${encodeURIComponent(provider.id)}/scan`,
      "POST",
      {}
    );
    state = data.state;
    selectedId = data.provider.id;
    render();
    pageToast(
      data.provider.models.length
        ? `扫描到 ${data.provider.models.length} 个模型`
        : "服务没有返回模型"
    );
  } catch (error) {
    pageToast(error.message, "err");
  } finally {
    scanButton.disabled = false;
    scanButton.textContent = "扫描模型";
  }
}

async function toggleModel(modelId, enabled) {
  const provider = selectedProvider();
  if (!provider) return;
  try {
    const data = await pageJson(
      `/api/providers/${encodeURIComponent(provider.id)}/models`,
      "PATCH",
      { model: modelId, enabled }
    );
    state = data.state;
    render();
    pageToast(enabled ? "已启用模型" : "已停用模型");
  } catch (error) {
    pageToast(error.message, "err");
    render();
  }
}

async function activateModel(modelId) {
  const provider = selectedProvider();
  if (!provider) return;
  try {
    const data = await pageJson("/api/active-model", "POST", {
      provider_id: provider.id,
      model: modelId,
    });
    state = data.state;
    render();
    pageToast("首页模型已切换");
  } catch (error) {
    pageToast(error.message, "err");
  }
}

async function enableAll() {
  const provider = selectedProvider();
  if (!provider) return;
  const disabled = (provider.models || []).filter((model) => !model.enabled);
  if (!disabled.length) return pageToast("所有模型都已启用", "info");
  try {
    for (const model of disabled) {
      const data = await pageJson(
        `/api/providers/${encodeURIComponent(provider.id)}/models`,
        "PATCH",
        { model: model.id, enabled: true }
      );
      state = data.state;
    }
    render();
    pageToast("已启用全部模型");
  } catch (error) {
    pageToast(error.message, "err");
    render();
  }
}

async function addModel() {
  const provider = selectedProvider();
  if (!provider) return;
  const input = document.getElementById("model-add-input");
  const modelId = input.value.trim();
  if (!modelId) return;
  if ((provider.models || []).some((model) => model.id === modelId)) {
    return pageToast("这个模型已经在列表里", "info");
  }
  const models = (provider.models || []).map((model) => ({
    id: model.id,
    enabled: model.enabled,
  }));
  models.push({ id: modelId, enabled: true });
  try {
    const data = await pageJson("/api/providers", "POST", {
      id: provider.id,
      name: provider.name,
      api_base: provider.api_base,
      timeout: provider.timeout,
      temperature: provider.temperature,
      models,
    });
    state = data.state;
    selectedId = provider.id;
    render();
    input.value = "";
    pageToast("模型已添加并启用");
  } catch (error) {
    pageToast(error.message, "err");
  }
}

async function clearKey() {
  const provider = selectedProvider();
  if (!provider || !provider.has_key) return pageToast("这个服务还没有 Key", "info");
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
    await reloadState(data.provider.id);
    pageToast("Key 已清除");
  } catch (error) {
    pageToast(error.message, "err");
  }
}

async function deleteProvider() {
  const provider = selectedProvider();
  if (!provider) return;
  if (!deleteArmed) {
    deleteArmed = true;
    deleteButton.textContent = "再次点击确认删除";
    deleteButton.classList.add("is-armed");
    setTimeout(() => {
      if (!deleteArmed) return;
      deleteArmed = false;
      deleteButton.textContent = "删除服务";
      deleteButton.classList.remove("is-armed");
    }, 4000);
    return;
  }
  try {
    const data = await pageFetch(
      `/api/providers/${encodeURIComponent(provider.id)}`,
      { method: "DELETE" }
    );
    selectedId = "";
    await reloadState(data.state.active.provider_id);
    pageToast("服务已删除");
  } catch (error) {
    pageToast(error.message, "err");
    render();
  }
}

async function addCustomProvider(event) {
  event.preventDefault();
  const name = document.getElementById("custom-name").value.trim();
  const apiBase = document.getElementById("custom-base").value.trim();
  const key = document.getElementById("custom-key").value.trim();
  if (!name || !apiBase) return;
  try {
    const payload = { name, api_base: apiBase };
    if (key) payload.api_key = key;
    const data = await pageJson("/api/providers", "POST", payload);
    selectedId = data.provider.id;
    state = data.state;
    render();
    event.target.reset();
    pageToast("自定义服务已添加，可以扫描模型了");
    document
      .getElementById("provider-detail")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    pageToast(error.message, "err");
  }
}

providerList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-provider]");
  if (!item) return;
  selectedId = item.dataset.provider;
  render();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveProvider();
  } catch (error) {
    pageToast(error.message, "err");
  }
});

modelList.addEventListener("change", (event) => {
  const toggle = event.target.closest('[data-role="toggle"]');
  if (!toggle) return;
  const row = toggle.closest("[data-model]");
  toggleModel(row.dataset.model, toggle.checked);
});

modelList.addEventListener("click", (event) => {
  const button = event.target.closest('[data-role="activate"]');
  if (!button) return;
  const row = button.closest("[data-model]");
  activateModel(row.dataset.model);
});

scanButton.addEventListener("click", scanModels);
document.getElementById("btn-clear-key").addEventListener("click", clearKey);
deleteButton.addEventListener("click", deleteProvider);
document.getElementById("btn-enable-all").addEventListener("click", enableAll);
document.getElementById("btn-add-model").addEventListener("click", addModel);
document.getElementById("model-add-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addModel();
  }
});
document.getElementById("custom-form").addEventListener("submit", addCustomProvider);

const requestedProvider =
  new URLSearchParams(window.location.search).get("provider") || "";
reloadState(requestedProvider).catch((error) => {
  providerEmpty.hidden = false;
  providerEmpty.textContent = `读取配置失败：${error.message}`;
  pageToast(error.message, "err");
});
