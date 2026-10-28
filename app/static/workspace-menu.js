/* 所有非主页面统一放入设置弹窗，保持阅读台和未保存的输入在原位。 */
(() => {
  "use strict";
  const trigger = document.getElementById("btn-avatar");
  const dialog = document.getElementById("workspace-settings");
  const close = document.getElementById("btn-settings-close");
  const sections = [...dialog.querySelectorAll(".workspace-section")];
  const nav = dialog.querySelector(".workspace-settings-nav");
  const navButtons = [...nav.querySelectorAll("[data-settings-section]")];
  let activeSection = "user";
  const legacyPanels = { "/user": "user", "/api-config": "api", "/settings": "reading" };

  function openSettings(name = activeSection) {
    if (!sections.some((section) => section.id === `settings-${name}`)) return;
    activeSection = name;
    sections.forEach((section) => { section.hidden = section.id !== `settings-${name}`; });
    navButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.settingsSection === name));
    });
    dialog.querySelector(".workspace-settings-content").scrollTop = 0;
    if (!dialog.open) dialog.showModal();
    trigger.setAttribute("aria-expanded", "true");
    dialog.dispatchEvent(new CustomEvent("settings:open", { detail: { section: name } }));
  }
  trigger.addEventListener("click", () => {
    openSettings();
    dialog.querySelector(".workspace-section:not([hidden]) h2").focus();
  });
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-settings-section]");
    if (button) openSettings(button.dataset.settingsSection);
    if (event.target.closest("[data-settings-close]")) dialog.close();
  });
  nav.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const index = navButtons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? navButtons.length - 1 :
      (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + navButtons.length) % navButtons.length;
    navButtons[next].focus();
    openSettings(navButtons[next].dataset.settingsSection);
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    trigger.setAttribute("aria-expanded", "false");
    const url = new URL(window.location.href);
    url.searchParams.delete("panel");
    url.searchParams.delete("provider");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    trigger.focus();
  });
  // 旧地址的站内链接也直接打开板块，不重新加载阅读台。
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== location.origin || !legacyPanels[url.pathname]) return;
    event.preventDefault();
    openSettings(legacyPanels[url.pathname]);
  });
  let backdropDown = false;
  function isBackdrop(event) {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
  }
  dialog.addEventListener("pointerdown", (event) => { backdropDown = isBackdrop(event); });
  dialog.addEventListener("click", (event) => {
    if (backdropDown && isBackdrop(event)) dialog.close();
    backdropDown = false;
  });
  const requested = new URLSearchParams(window.location.search).get("panel");
  if (requested && sections.some((section) => section.id === `settings-${requested}`)) {
    openSettings(requested);
    dialog.querySelector(".workspace-section:not([hidden]) h2").focus();
  }
})();
