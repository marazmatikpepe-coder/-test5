// js/main.js
import {
  auth, db, onAuthStateChanged, signOut, ref, get, query, orderByChild, equalTo,
  set, onValue, onDisconnect, serverTimestamp,
} from "./firebase-config.js";
import { ICONS, DEFAULT_AVATARS } from "./icons.js";
import { initAuthScreen } from "./auth.js";
import { initSlicesTab } from "./slices.js";
import { initChatsTab } from "./chats.js";
import { initProfileTab, renderProfile } from "./profile.js";
import { initSettingsTab, applyThemeFromUser } from "./settings.js";
import { toast } from "./utils.js";

let currentUser = null; // firebase auth user
let meProfile = null;   // /users/{uid} snapshot merged with uid

export function getMe() { return meProfile; }

export async function refreshMe() {
  if (!currentUser) return null;
  const snap = await get(ref(db, `users/${currentUser.uid}`));
  meProfile = { uid: currentUser.uid, ...snap.val() };
  applyThemeFromUser(meProfile);
  document.getElementById("side-avatar").src = meProfile.avatarURL || DEFAULT_AVATARS.user.dark;
  return meProfile;
}

export async function getUserById(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? { uid, ...snap.val() } : null;
}

export async function getUserByUsername(username) {
  const snap = await get(ref(db, `usernames/${username.toLowerCase()}`));
  if (!snap.exists()) return null;
  return getUserById(snap.val());
}

export function watchUserStatus(uid, cb) {
  return onValue(ref(db, `status/${uid}`), (snap) => cb(snap.val() || { online: false, lastSeen: 0 }));
}

function setupPresence(uid) {
  const myStatusRef = ref(db, `status/${uid}`);
  const connectedRef = ref(db, ".info/connected");
  onValue(connectedRef, (snap) => {
    if (snap.val() === false) return;
    onDisconnect(myStatusRef).set({ online: false, lastSeen: serverTimestamp() }).then(() => {
      set(myStatusRef, { online: true, lastSeen: serverTimestamp() });
    });
  });
}

initAuthScreen();

async function waitForProfile(uid, attempts = 15) {
  for (let i = 0; i < attempts; i++) {
    const snap = await get(ref(db, `users/${uid}`));
    if (snap.exists() && snap.val().username) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    await waitForProfile(user.uid);
    await refreshMe();
    setupPresence(user.uid);
    showApp();
  } else {
    meProfile = null;
    showAuth();
  }
});

function showAuth() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app-screen").classList.add("hidden");
}

function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  bootstrapApp();
}

let bootstrapped = false;
function bootstrapApp() {
  if (bootstrapped) { refreshTabIcons(); return; }
  bootstrapped = true;

  document.getElementById("icon-search-slices") && (document.getElementById("icon-search-slices").src = ICONS.search);
  document.getElementById("side-avatar").onclick = () => switchTab("profile");

  document.querySelectorAll(".side-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  initSlicesTab();
  initChatsTab();
  initProfileTab();
  initSettingsTab();

  refreshTabIcons();
  switchTab("slices");
}

export function goToProfile(uid) {
  switchTab("profile");
  renderProfile(uid);
}

function switchTab(tab) {
  document.getElementById("chat-window").classList.remove("active");
  document.getElementById("comments-view").classList.remove("active");
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".side-tab").forEach((b) => b.classList.remove("active"));
  document.getElementById(`view-${tab}`).classList.add("active");
  document.querySelector(`.side-tab[data-tab="${tab}"]`).classList.add("active");
  refreshTabIcons();
  if (tab === "profile") renderProfile(meProfile.uid);
}

function refreshTabIcons() {
  const activeTab = document.querySelector(".side-tab.active")?.dataset.tab;
  const set = (id, url) => { const el = document.getElementById(id); if (el) el.src = url; };
  set("icon-tab-slices", ICONS.posts);
  set("icon-tab-chats", activeTab === "chats" ? ICONS.chatsOn : ICONS.chatsOff);
  set("icon-tab-profile", ICONS.info);
  set("icon-tab-settings", activeTab === "settings" ? ICONS.settingsOn : ICONS.settingsOff);
}

window.addEventListener("beforeunload", () => {});
