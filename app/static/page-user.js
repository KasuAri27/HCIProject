"use strict";

let profileState = { display_name: "", goal: "", avatar: "" };

function initialFor(name) {
  const clean = (name || "").trim();
  return clean ? [...clean][0] : "读";
}

function renderAvatar() {
  const image = document.getElementById("profile-avatar-img");
  const initial = document.getElementById("profile-avatar-initial");
  const remove = document.getElementById("btn-avatar-remove");
  initial.textContent = initialFor(profileState.display_name);
  if (profileState.avatar) {
    image.src = profileState.avatar;
    image.hidden = false;
    initial.hidden = true;
    remove.hidden = false;
  } else {
    image.hidden = true;
    image.removeAttribute("src");
    initial.hidden = false;
    remove.hidden = true;
  }
}

function renderProfile(profile) {
  profileState = {
    display_name: (profile.display_name || "").trim(),
    goal: (profile.goal || "").trim(),
    avatar: profile.avatar || "",
  };
  document.getElementById("user-name").textContent =
    profileState.display_name || "读者";
  document.getElementById("user-goal").textContent =
    profileState.goal || "把读过的资料，变成自己的笔记。";
  document.getElementById("profile-name").value = profileState.display_name;
  document.getElementById("profile-goal").value = profileState.goal;
  renderAvatar();
}

function renderStats(overview) {
  const data = overview || {};
  document.getElementById("stat-docs").textContent = String(data.document_count || 0);
  document.getElementById("stat-read").textContent = String(data.read_count || 0);
  document.getElementById("stat-notes").textContent = String(data.note_count || 0);
  document.getElementById("stat-practice").textContent = String(data.practice_count || 0);
}

async function loadProfile() {
  const data = await pageFetch("/api/profile");
  renderProfile(data.profile || {});
}

async function loadStats() {
  const data = await pageFetch("/api/library");
  renderStats(data.overview || {});
}

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

document.getElementById("avatar-input").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const body = new FormData();
  body.append("file", file);
  try {
    pageToast("正在处理头像…", "info");
    const data = await pageFetch("/api/profile/avatar", { method: "POST", body });
    profileState.avatar = data.avatar || "";
    renderAvatar();
    pageToast("头像已更新");
  } catch (error) {
    pageToast(error.message, "err");
  }
});

document.getElementById("btn-avatar-remove").addEventListener("click", async () => {
  try {
    await pageFetch("/api/profile/avatar", { method: "DELETE" });
    profileState.avatar = "";
    renderAvatar();
    pageToast("已恢复默认头像");
  } catch (error) {
    pageToast(error.message, "err");
  }
});

Promise.all([loadProfile(), loadStats()]).catch((error) => {
  pageToast(error.message, "err");
});
