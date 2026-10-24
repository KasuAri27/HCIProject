"use strict";

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

Promise.all([loadProfile(), loadStats()]).catch((error) => {
  pageToast(error.message, "err");
});
