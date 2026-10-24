"use strict";

const SETTINGS_FONT_KEY = "learning.readFontSize";
const SETTINGS_LINE_KEY = "learning.readLineHeight";
const SETTINGS_DEFAULT_FONT = 17;
const SETTINGS_DEFAULT_LINE = 1.85;
const PROVIDER_COLORS = {
  qwen: "#615ced",
  moonshot: "#1f2937",
  zhipu: "#2f6fd0",
  deepseek: "#4d6bfe",
  custom: "#a9741b",
};

let settingsProfile = { display_name: "", goal: "", avatar: "" };
let settingsProviders = [];
let settingsActive = {};
let settingsSelectedId = "";
let settingsFontSize = SETTINGS_DEFAULT_FONT;
let settingsLineHeight = SETTINGS_DEFAULT_LINE;
let settingsResetArmed = false;
let settingsDeleteArmed = false;
let settingsReturnFocus = null;
let settingsResetTimer = null;
let settingsDeleteTimer = null;

function settingsById(id) {
  return document.getElementById(id);
}

function settingsClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function settingsProvider() {
  return (
    settingsProviders.find((item) => item.id === settingsSelectedId) ||
    settingsProviders[0] ||
    null
  );
}

function settingsProviderColor(provider) {
  return PROVIDER_COLORS[provider.id] || PROVIDER_COLORS.custom;
}

function settingsEnabledCount(provider) {
  return (provider.models || []).filter((model) => model.enabled).length;
}

function settingsSwitchPanel(panel) {
  const valid = ["settings", "user", "api"];
  const name = valid.includes(panel) ? panel : "settings";
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    const active = button.dataset.settingsTab === name;
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".settings-panel").forEach((section) => {
    section.hidden = section.id !== `settings-panel-${name}`;
  });
}

function settingsOpen(panel = "settings") {
  const modal = settingsById("settings-modal");
  if (!modal) return;
  settingsReturnFocus = document.activeElement;
  modal.hidden = false;
  settingsSwitchPanel(panel);
  settingsLoadAll();
  settingsById("settings-close")?.focus();
}

function settingsClose() {
  const modal = settingsById("settings-modal");
  if (!modal) return;
  modal.hidden = true;
  if (settingsReturnFocus && typeof settingsReturnFocus.focus === "function") {
    settingsReturnFocus.focus();
  }
}

async function settingsLoadAll() {
  await Promise.all([settingsLoadProfile(), settingsLoadProviders()]);
  settingsLoadReading();
}

/* ---------- 阅读设置 ---------- */
function settingsApplyReading(persist = false) {
  const sample = settingsById("modal-reading-sample");
  if (sample) {
    sample.style.setProperty("--modal-read-size", `${settingsFontSize}px`);
    sample.style.setProperty("--modal-read-leading", String(settingsLineHeight));
  }
  const value = settingsById("modal-font-size");
  if (value) value.textContent = `${settingsFontSize} px`;
  document.querySelectorAll("#modal-line-height [data-line]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      Number(button.dataset.line) === settingsLineHeight ? "true" : "false"
    );
  });
  if (!persist) return;
  try {
    localStorage.setItem(SETTINGS_FONT_KEY, String(settingsFontSize));
    localStorage.setItem(SETTINGS_LINE_KEY, String(settingsLineHeight));
  } catch (error) {
    /* 忽略不可写的本地存储 */
  }
  if (typeof loadReadingSettings === "function") loadReadingSettings();
}

function settingsLoadReading() {
  try {
    const size = parseInt(localStorage.getItem(SETTINGS_FONT_KEY) || "", 10);
    const line = parseFloat(localStorage.getItem(SETTINGS_LINE_KEY) || "");
    if (Number.isFinite(size)) settingsFontSize = settingsClamp(size, 14, 24);
    if (Number.isFinite(line)) settingsLineHeight = settingsClamp(line, 1.4, 2.4);
  } catch (error) {
    /* 用默认值 */
  }
  settingsApplyReading(false);
}

/* ---------- 用户档案 ---------- */
function settingsRenderAvatar() {
  const image = settingsById("modal-avatar-img");
  const initial = settingsById("modal-avatar-initial");
  const remove = settingsById("modal-avatar-remove");
  if (!image || !initial) return;
  const name = (settingsProfile.display_name || "").trim();
  initial.textContent = name ? [...name][0] : "读";
  if (settingsProfile.avatar) {
    image.src = settingsProfile.avatar;
    image.hidden = false;
    initial.hidden = true;
    if (remove) remove.hidden = false;
  } else {
    image.hidden = true;
    image.removeAttribute("src");
    initial.hidden = false;
    if (remove) remove.hidden = true;
  }
}

function settingsRenderProfile() {
  const name = (settingsProfile.display_name || "").trim();
  settingsById("modal-user-name").textContent = name || "读者";
  settingsById("modal-user-goal").textContent =
    (settingsProfile.goal || "").trim() || "把读过的资料，变成自己的笔记。";
  settingsById("modal-profile-name").value = name;
  settingsById("modal-profile-goal").value = (settingsProfile.goal || "").trim();
  settingsRenderAvatar();
}

async function settingsLoadProfile() {
  try {
    const [profileData, libraryData] = await Promise.all([
      api("/api/profile"),
      api("/api/library"),
    ]);
    settingsProfile = profileData.profile || {
      display_name: "",
      goal: "",
      avatar: "",
    };
    settingsRenderProfile();
    const overview = libraryData.overview || {};
    settingsById("modal-stat-docs").textContent = String(overview.document_count || 0);
    settingsById("modal-stat-read").textContent = String(overview.read_count || 0);
    settingsById("modal-stat-notes").textContent = String(overview.note_count || 0);
    settingsById("modal-stat-practice").textContent = String(
      overview.practice_count || 0
    );
    settingsById("modal-data-summary").textContent =
      `${overview.document_count || 0} 份资料 · 已读 ${overview.read_count || 0} · ` +
      `笔记 ${overview.note_count || 0} · 练习 ${overview.practice_count || 0}`;
  } catch (error) {
    showToast(error.message, 5000);
  }
}

/* ---------- API 服务 ---------- */
function settingsRenderProviderList() {
  const list = settingsById("modal-provider-list");
  if (!list) return;
  if (!settingsProviders.length) {
    list.innerHTML = "";
    return;
  }
  const order = ["qwen", "moonshot", "zhipu", "deepseek"];
  const providers = [...settingsProviders].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  list.innerHTML = providers
    .map((provider) => {
      const active = provider.id === settingsActive.provider_id;
      return `<button type="button" class="modal-provider-btn${
        provider.id === settingsSelectedId ? " is-active" : ""
      }" data-provider="${escapeAttr(provider.id)}" style="--provider-color:${settingsProviderColor(
        provider
      )}">
        <span class="modal-provider-dot" aria-hidden="true"></span>
        <span>${escapeHtml(provider.name)}</span>
        <span class="settings-help">${active ? "当前" : ""}</span>
      </button>`;
    })
    .join("");
}

function settingsRenderModels(provider) {
  const list = settingsById("modal-model-list");
  const summary = settingsById("modal-model-summary");
  if (!list || !provider) return;
  const models = provider.models || [];
  summary.textContent = `${settingsEnabledCount(provider)} / ${models.length} 个启用`;
  if (!models.length) {
    list.innerHTML =
      '<p class="settings-help">还没有模型。保存服务后点“扫描模型”，或手动添加。</p>';
    return;
  }
  list.innerHTML = models
    .map((model) => {
      const active =
        settingsActive.provider_id === provider.id &&
        settingsActive.model === model.id;
      return `<div class="modal-model-row${active ? " is-active" : ""}" data-model="${escapeAttr(
        model.id
      )}">
        <label class="switch" title="${model.enabled ? "停用" : "启用"}">
          <input type="checkbox" data-role="toggle"${model.enabled ? " checked" : ""}>
          <span aria-hidden="true"></span>
        </label>
        <span class="modal-model-id">${escapeHtml(model.id)}</span>
        ${active ? '<span class="modal-model-current">首页正在用</span>' : ""}
        <button type="button" class="text-link" data-role="activate"${
          model.enabled ? "" : " disabled"
        }>设为当前</button>
      </div>`;
    })
    .join("");
}

function settingsRenderProvider() {
  const provider = settingsProvider();
  const detail = settingsById("modal-provider-detail");
  const empty = settingsById("modal-provider-empty");
  if (!provider) {
    detail.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  detail.hidden = false;
  settingsById("modal-provider-name").textContent = provider.name;
  settingsById("modal-provider-meta").textContent =
    `${provider.api_base} · ${settingsEnabledCount(provider)} 个模型`;
  const state = settingsById("modal-provider-state");
  state.className = "modal-provider-state";
  if (!provider.has_key) {
    state.textContent = "未填 Key";
    state.classList.add("is-warn");
  } else if (!settingsEnabledCount(provider)) {
    state.textContent = "没有启用模型";
    state.classList.add("is-warn");
  } else {
    state.textContent = "可调用";
    state.classList.add("is-ok");
  }
  settingsById("modal-edit-base").value = provider.api_base || "";
  settingsById("modal-edit-timeout").value = provider.timeout || 180;
  settingsById("modal-edit-temperature").value = provider.temperature ?? 0.7;
  const key = settingsById("modal-edit-key");
  key.value = "";
  key.placeholder = provider.has_key
    ? `已保存 ${provider.api_key_masked}，留空不修改`
    : "填写 API Key";
  settingsRenderModels(provider);
}

function settingsRenderProviders() {
  settingsRenderProviderList();
  settingsRenderProvider();
}

async function settingsLoadProviders(preferredId = "") {
  try {
    const data = await api("/api/providers");
    settingsProviders = data.providers || [];
    settingsActive = data.active || {};
    if (preferredId) settingsSelectedId = preferredId;
    if (
      !settingsSelectedId ||
      !settingsProviders.some((item) => item.id === settingsSelectedId)
    ) {
      settingsSelectedId =
        settingsActive.provider_id ||
        (settingsProviders[0] && settingsProviders[0].id) ||
        "";
    }
    settingsRenderProviders();
  } catch (error) {
    showToast(error.message, 5000);
  }
}

async function settingsSaveProvider() {
  const provider = settingsProvider();
  if (!provider) return;
  const payload = {
    id: provider.id,
    name: provider.name,
    api_base: settingsById("modal-edit-base").value.trim(),
    timeout: settingsById("modal-edit-timeout").value,
    temperature: settingsById("modal-edit-temperature").value,
  };
  const key = settingsById("modal-edit-key").value.trim();
  if (key) payload.api_key = key;
  const data = await postJson("/api/providers", payload);
  settingsProviders = data.state.providers;
  settingsActive = data.state.active;
  settingsSelectedId = data.provider.id;
  settingsRenderProviders();
  showToast("服务设置已保存");
}

async function settingsScanModels() {
  const provider = settingsProvider();
  if (!provider) return;
  const button = settingsById("modal-scan-models");
  button.disabled = true;
  button.textContent = "扫描中…";
  try {
    if (settingsById("modal-edit-key").value.trim()) {
      const payload = {
        id: provider.id,
        name: provider.name,
        api_base: settingsById("modal-edit-base").value.trim(),
        timeout: settingsById("modal-edit-timeout").value,
        temperature: settingsById("modal-edit-temperature").value,
        api_key: settingsById("modal-edit-key").value.trim(),
      };
      const saved = await postJson("/api/providers", payload);
      settingsProviders = saved.state.providers;
      settingsActive = saved.state.active;
      settingsSelectedId = saved.provider.id;
    }
    const data = await postJson(
      `/api/providers/${encodeURIComponent(provider.id)}/scan`,
      {}
    );
    settingsProviders = data.state.providers;
    settingsActive = data.state.active;
    settingsSelectedId = data.provider.id;
    settingsRenderProviders();
    showToast(
      data.provider.models.length
        ? `扫描到 ${data.provider.models.length} 个模型`
        : "服务没有返回模型"
    );
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    button.disabled = false;
    button.textContent = "扫描模型";
  }
}

async function settingsToggleModel(modelId, enabled) {
  const provider = settingsProvider();
  if (!provider) return;
  try {
    const data = await patchJson(
      `/api/providers/${encodeURIComponent(provider.id)}/models`,
      { model: modelId, enabled }
    );
    settingsProviders = data.state.providers;
    settingsActive = data.state.active;
    settingsRenderProviders();
    showToast(enabled ? "已启用模型" : "已停用模型");
  } catch (error) {
    showToast(error.message, 5000);
    settingsRenderProviders();
  }
}

async function settingsActivateModel(modelId) {
  const provider = settingsProvider();
  if (!provider) return;
  try {
    const data = await postJson("/api/active-model", {
      provider_id: provider.id,
      model: modelId,
    });
    settingsProviders = data.state.providers;
    settingsActive = data.state.active;
    settingsRenderProviders();
    if (typeof updateLlmStatus === "function") updateLlmStatus();
    showToast("首页模型已切换");
  } catch (error) {
    showToast(error.message, 5000);
  }
}

async function settingsAddModel() {
  const provider = settingsProvider();
  if (!provider) return;
  const input = settingsById("modal-model-add");
  const modelId = input.value.trim();
  if (!modelId) return;
  if ((provider.models || []).some((model) => model.id === modelId)) {
    return showToast("这个模型已经在列表里", 2600);
  }
  const models = (provider.models || []).map((model) => ({
    id: model.id,
    enabled: model.enabled,
  }));
  models.push({ id: modelId, enabled: true });
  try {
    const data = await postJson("/api/providers", {
      id: provider.id,
      name: provider.name,
      api_base: provider.api_base,
      timeout: provider.timeout,
      temperature: provider.temperature,
      models,
    });
    settingsProviders = data.state.providers;
    settingsActive = data.state.active;
    settingsSelectedId = data.provider.id;
    settingsRenderProviders();
    input.value = "";
    showToast("模型已添加并启用");
  } catch (error) {
    showToast(error.message, 5000);
  }
}

async function settingsEnableAll() {
  const provider = settingsProvider();
  if (!provider) return;
  const disabled = (provider.models || []).filter((model) => !model.enabled);
  if (!disabled.length) return showToast("所有模型都已启用", 2600);
  try {
    for (const model of disabled) {
      const data = await patchJson(
        `/api/providers/${encodeURIComponent(provider.id)}/models`,
        { model: model.id, enabled: true }
      );
      settingsProviders = data.state.providers;
      settingsActive = data.state.active;
    }
    settingsRenderProviders();
    showToast("已启用全部模型");
  } catch (error) {
    showToast(error.message, 5000);
    settingsRenderProviders();
  }
}

async function settingsClearKey() {
  const provider = settingsProvider();
  if (!provider || !provider.has_key) return showToast("这个服务还没有 Key", 2600);
  if (!window.confirm(`清除「${provider.name}」的 API Key？`)) return;
  try {
    const data = await postJson("/api/providers", {
      id: provider.id,
      name: provider.name,
      api_base: provider.api_base,
      timeout: provider.timeout,
      temperature: provider.temperature,
      clear_key: true,
    });
    settingsProviders = data.state.providers;
    settingsActive = data.state.active;
    settingsRenderProviders();
    showToast("Key 已清除");
  } catch (error) {
    showToast(error.message, 5000);
  }
}

function settingsDisarmDelete() {
  settingsDeleteArmed = false;
  clearTimeout(settingsDeleteTimer);
  const button = settingsById("modal-delete-provider");
  button.textContent = "删除服务";
  button.classList.remove("is-armed");
}

async function settingsDeleteProvider() {
  const provider = settingsProvider();
  if (!provider) return;
  const button = settingsById("modal-delete-provider");
  if (!settingsDeleteArmed) {
    settingsDeleteArmed = true;
    button.textContent = "再次点击确认删除";
    button.classList.add("is-armed");
    settingsDeleteTimer = setTimeout(settingsDisarmDelete, 4000);
    return;
  }
  try {
    const data = await api(
      `/api/providers/${encodeURIComponent(provider.id)}`,
      { method: "DELETE" }
    );
    settingsDisarmDelete();
    settingsSelectedId = "";
    settingsProviders = data.state.providers;
    settingsActive = data.state.active;
    settingsLoadProviders(data.state.active.provider_id);
    showToast("服务已删除");
  } catch (error) {
    showToast(error.message, 5000);
    settingsRenderProviders();
  }
}

async function settingsAddCustomProvider(event) {
  event.preventDefault();
  const name = settingsById("modal-custom-name").value.trim();
  const apiBase = settingsById("modal-custom-base").value.trim();
  const key = settingsById("modal-custom-key").value.trim();
  if (!name || !apiBase) return;
  try {
    const payload = { name, api_base: apiBase };
    if (key) payload.api_key = key;
    const data = await postJson("/api/providers", payload);
    settingsProviders = data.state.providers;
    settingsActive = data.state.active;
    settingsSelectedId = data.provider.id;
    settingsRenderProviders();
    event.target.reset();
    showToast("自定义服务已添加，可以扫描模型了");
  } catch (error) {
    showToast(error.message, 5000);
  }
}

/* ---------- 档案与数据操作 ---------- */
async function settingsSaveProfile(event) {
  event.preventDefault();
  try {
    const data = await postJson("/api/profile", {
      display_name: settingsById("modal-profile-name").value,
      goal: settingsById("modal-profile-goal").value,
    });
    settingsProfile = data.profile || settingsProfile;
    settingsRenderProfile();
    if (typeof loadTopbarProfile === "function") loadTopbarProfile();
    showToast("档案已保存");
  } catch (error) {
    showToast(error.message, 5000);
  }
}

async function settingsUploadAvatar(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const body = new FormData();
  body.append("file", file);
  try {
    showToast("正在处理头像…", 2600);
    const data = await api("/api/profile/avatar", { method: "POST", body });
    settingsProfile.avatar = data.avatar || "";
    settingsRenderAvatar();
    if (typeof loadTopbarProfile === "function") loadTopbarProfile();
    showToast("头像已更新");
  } catch (error) {
    showToast(error.message, 5000);
  }
}

async function settingsRemoveAvatar() {
  try {
    await api("/api/profile/avatar", { method: "DELETE" });
    settingsProfile.avatar = "";
    settingsRenderAvatar();
    if (typeof loadTopbarProfile === "function") loadTopbarProfile();
    showToast("已恢复默认头像");
  } catch (error) {
    showToast(error.message, 5000);
  }
}

async function settingsRescan() {
  const button = settingsById("modal-rescan");
  button.disabled = true;
  button.textContent = "扫描中…";
  try {
    const data = await postJson("/api/library/scan", {});
    const scan = data.scan || {};
    showToast(
      scan.jobs
        ? `已登记 ${scan.registered || 0} 个文件，正在解析 ${scan.jobs} 个资料`
        : `已登记 ${scan.registered || 0} 个文件`
    );
    if (typeof refreshLibrary === "function") await refreshLibrary();
    await settingsLoadProfile();
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    button.disabled = false;
    button.textContent = "重新扫描";
  }
}

function settingsDisarmReset() {
  settingsResetArmed = false;
  clearTimeout(settingsResetTimer);
  const button = settingsById("modal-reset");
  button.textContent = "清空学习记录";
  button.classList.remove("is-armed");
}

async function settingsReset() {
  const button = settingsById("modal-reset");
  if (!settingsResetArmed) {
    settingsResetArmed = true;
    button.textContent = "再次点击确认清空";
    button.classList.add("is-armed");
    settingsResetTimer = setTimeout(settingsDisarmReset, 4500);
    return;
  }
  button.disabled = true;
  try {
    await postJson("/api/reset", {});
    settingsDisarmReset();
    if (typeof loadPage === "function") await loadPage();
    await settingsLoadProfile();
    showToast("学习记录已清空，文档和 API 配置保留");
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    button.disabled = false;
  }
}

/* ---------- 事件绑定 ---------- */
document.querySelectorAll("[data-settings-tab]").forEach((button) => {
  button.addEventListener("click", () => settingsSwitchPanel(button.dataset.settingsTab));
});

settingsById("settings-close").addEventListener("click", settingsClose);
settingsById("settings-modal").addEventListener("mousedown", (event) => {
  if (event.target.id === "settings-modal") settingsClose();
});

settingsById("modal-font-dec").addEventListener("click", () => {
  settingsFontSize = settingsClamp(settingsFontSize - 1, 14, 24);
  settingsApplyReading(true);
});
settingsById("modal-font-inc").addEventListener("click", () => {
  settingsFontSize = settingsClamp(settingsFontSize + 1, 14, 24);
  settingsApplyReading(true);
});
document.querySelectorAll("#modal-line-height [data-line]").forEach((button) => {
  button.addEventListener("click", () => {
    settingsLineHeight = settingsClamp(
      parseFloat(button.dataset.line) || SETTINGS_DEFAULT_LINE,
      1.4,
      2.4
    );
    settingsApplyReading(true);
  });
});

settingsById("modal-profile-form").addEventListener("submit", settingsSaveProfile);
settingsById("modal-avatar-input").addEventListener("change", settingsUploadAvatar);
settingsById("modal-avatar-remove").addEventListener("click", settingsRemoveAvatar);
settingsById("modal-rescan").addEventListener("click", settingsRescan);
settingsById("modal-reset").addEventListener("click", settingsReset);

settingsById("modal-provider-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-provider]");
  if (!button) return;
  settingsSelectedId = button.dataset.provider;
  settingsRenderProviders();
});
settingsById("modal-provider-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await settingsSaveProvider();
  } catch (error) {
    showToast(error.message, 5000);
  }
});
settingsById("modal-scan-models").addEventListener("click", settingsScanModels);
settingsById("modal-clear-key").addEventListener("click", settingsClearKey);
settingsById("modal-delete-provider").addEventListener("click", settingsDeleteProvider);
settingsById("modal-enable-all").addEventListener("click", settingsEnableAll);
settingsById("modal-add-model").addEventListener("click", settingsAddModel);
settingsById("modal-model-add").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    settingsAddModel();
  }
});
settingsById("modal-custom-form").addEventListener("submit", settingsAddCustomProvider);
settingsById("modal-model-list").addEventListener("change", (event) => {
  const toggle = event.target.closest('[data-role="toggle"]');
  if (!toggle) return;
  const row = toggle.closest("[data-model]");
  settingsToggleModel(row.dataset.model, toggle.checked);
});
settingsById("modal-model-list").addEventListener("click", (event) => {
  const button = event.target.closest('[data-role="activate"]');
  if (!button) return;
  const row = button.closest("[data-model]");
  settingsActivateModel(row.dataset.model);
});

document.getElementById("btn-settings").addEventListener("click", () => settingsOpen("settings"));
document.getElementById("btn-avatar").addEventListener("click", () => settingsOpen("user"));

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!settingsById("settings-modal").hidden) settingsClose();
});

const panel = new URLSearchParams(window.location.search).get("panel");
if (["settings", "user", "api"].includes(panel)) {
  settingsOpen(panel);
}
