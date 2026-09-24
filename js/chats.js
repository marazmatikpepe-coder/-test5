// js/chats.js
import {
  db, ref, push, set, get, update, remove, onValue, query, orderByChild,
  equalTo, serverTimestamp, runTransaction,
} from "./firebase-config.js";
import { uploadImage, uploadFile, uploadAudio, uploadVideoNote } from "./firebase-config.js";
import { ICONS, DEFAULT_AVATARS, WALLPAPERS } from "./icons.js";
import {
  escapeHtml, richText, toast, openModal, closeModal, formatMessageDate,
  dateSepLabel, timeShort, REACTIONS,
} from "./utils.js";
import { getMe, getUserByUsername, goToProfile, watchUserStatus } from "./main.js";

let unsubChats = null;
let currentChatId = null;
let currentChatMeta = null;
let msgUnsub = null;
let lastMsgAuthor = null;
const watchedStatuses = new Set();

export function closeChatWindow() {
  document.getElementById("chat-window").classList.remove("active");
  if (msgUnsub) { msgUnsub(); msgUnsub = null; }
}

export function initChatsTab() {
  document.getElementById("btn-new-chat").onclick = openNewChatModal;
  loadChatList();
}

function loadChatList() {
  const me = getMe(); if (!me) return;
  onValue(ref(db, `userChats/${me.uid}`), async (snap) => {
    const rows = [];
    const promises = [];
    snap.forEach((c) => {
      const meta = c.val();
      promises.push(get(ref(db, `chats/${c.key}`)).then((chatSnap) => {
        if (chatSnap.exists()) rows.push({ id: c.key, ...chatSnap.val(), ...meta });
      }));
    });
    await Promise.all(promises);
    rows.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    renderChatList(rows);
    updateChatsBadge(rows);
  });
}

function updateChatsBadge(rows) {
  const total = rows.reduce((s, r) => s + (r.unreadCount || 0), 0);
  const badge = document.getElementById("chats-badge");
  if (total > 0) { badge.textContent = total; badge.classList.remove("hidden"); }
  else badge.classList.add("hidden");
}

function renderChatList(rows) {
  const el = document.getElementById("chats-list");
  if (!rows.length) {
    el.innerHTML = `<div class="empty-state">Пока нет чатов. Нажми + чтобы начать</div>`;
    return;
  }
  el.innerHTML = rows.map((r) => `
    <div class="chat-row" data-open-chat="${r.id}" data-chat-row="${r.id}">
      <div class="avatar-wrap">
        <img class="chat-avatar" src="${r.avatarURL || (r.type === "group" ? DEFAULT_AVATARS.group.dark : DEFAULT_AVATARS.user.dark)}" />
        ${r.type === "direct" ? `<span class="online-dot"></span>` : ""}
      </div>
      <div class="chat-row-main">
        <div class="chat-row-top">
          <span class="chat-row-name">${r.pinned ? "📌 " : ""}${escapeHtml(r.name || "Чат")}</span>
          <span class="chat-row-time">${r.lastMessageAt ? formatMessageDate(r.lastMessageAt) : ""}</span>
        </div>
        <div class="chat-row-bottom">
          <span class="chat-row-msg">${escapeHtml(r.lastMessage || "Нет сообщений")}</span>
          ${r.unreadCount ? `<span class="unread-badge">${r.unreadCount}</span>` : ""}
        </div>
      </div>
    </div>`).join("");

  el.querySelectorAll("[data-open-chat]").forEach((n) => n.addEventListener("click", () => openChat(n.dataset.openChat)));
  el.querySelectorAll("[data-chat-row]").forEach((n) => {
    let pressTimer;
    n.addEventListener("contextmenu", (e) => { e.preventDefault(); showChatRowMenu(n.dataset.chatRow, e.clientX, e.clientY); });
    n.addEventListener("touchstart", () => { pressTimer = setTimeout(() => {
      const r = n.getBoundingClientRect(); showChatRowMenu(n.dataset.chatRow, r.left + 20, r.top + 20);
    }, 500); });
    n.addEventListener("touchend", () => clearTimeout(pressTimer));
  });

  rows.forEach((r) => {
    if (r.type !== "direct" || !r.otherUid) return;
    const dot = el.querySelector(`[data-chat-row="${r.id}"] .online-dot`);
    if (!dot) return;
    if (!watchedStatuses.has(r.otherUid)) {
      watchedStatuses.add(r.otherUid);
      watchUserStatus(r.otherUid, (status) => {
        document.querySelectorAll(`[data-online-uid="${r.otherUid}"]`).forEach((d) => d.classList.toggle("online", !!status.online));
      });
    }
    dot.dataset.onlineUid = r.otherUid;
  });
}

async function showChatRowMenu(chatId, x, y) {
  const me = getMe();
  const snap = await get(ref(db, `userChats/${me.uid}/${chatId}`));
  const meta = snap.val() || {};
  const backdrop = document.getElementById("ctx-backdrop");
  const menu = document.getElementById("ctx-menu");
  menu.innerHTML = `
    <button data-act="mute">${meta.muted ? "🔔 Включить уведомления" : "🔕 Заглушить"}</button>
    <button data-act="unread">✉️ Пометить непрочитанным</button>
    <button data-act="pin">${meta.pinned ? "📌 Открепить" : "📌 Закрепить"}</button>
    <button data-act="report">🚩 Пожаловаться</button>
    <button data-act="block">🚫 Заблокировать</button>
    <button data-act="delete" class="danger">🗑 Удалить чат</button>`;
  positionCtxMenu(menu, x, y);
  backdrop.classList.add("active"); menu.classList.remove("hidden");
  backdrop.onclick = closeCtx;
  menu.querySelectorAll("button").forEach((b) => b.onclick = () => handleChatRowAction(chatId, b.dataset.act, meta));
}

function positionCtxMenu(menu, x, y) {
  menu.style.left = Math.min(x, window.innerWidth - 240) + "px";
  menu.style.top = Math.min(y, window.innerHeight - 260) + "px";
}
function closeCtx() {
  document.getElementById("ctx-backdrop").classList.remove("active");
  document.getElementById("ctx-menu").classList.add("hidden");
}

async function handleChatRowAction(chatId, act, meta) {
  const me = getMe();
  closeCtx();
  const base = `userChats/${me.uid}/${chatId}`;
  if (act === "mute") { await update(ref(db, base), { muted: !meta.muted }); toast(meta.muted ? "Уведомления включены" : "Чат заглушён"); }
  if (act === "unread") { await update(ref(db, base), { unreadCount: 1 }); toast("Помечено как непрочитанное"); }
  if (act === "pin") { await update(ref(db, base), { pinned: !meta.pinned }); toast(meta.pinned ? "Чат откреплён" : "Чат закреплён"); }
  if (act === "report") toast("Жалоба отправлена");
  if (act === "block") await confirmDialog("Заблокировать пользователя?", ["Заблокировать", "Заблокировать и удалить"], async (choice) => {
    toast(choice === 0 ? "Пользователь заблокирован" : "Пользователь заблокирован и чат удалён");
    if (choice === 1) await remove(ref(db, base));
  });
  if (act === "delete") await confirmDialog("Удалить чат?", ["Удалить"], async () => {
    await remove(ref(db, base)); toast("Чат удалён");
  });
}

function confirmDialog(title, actions, cb) {
  const body = document.getElementById("modal-confirm-body");
  body.innerHTML = `
    <div class="modal-head"><h3>${title}</h3></div>
    <div class="modal-foot" style="flex-wrap:wrap;">
      ${actions.map((a, i) => `<button class="btn-accent" data-i="${i}">${a}</button>`).join("")}
      <button class="btn-ghost" id="cf-cancel">Отмена</button>
    </div>`;
  openModal("modal-confirm");
  body.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => { closeModal("modal-confirm"); cb(Number(b.dataset.i)); });
  document.getElementById("cf-cancel").onclick = () => closeModal("modal-confirm");
}

// ------------------- NEW CHAT / GROUP MODAL -------------------

function openNewChatModal() {
  const body = document.getElementById("modal-new-chat-body");
  body.innerHTML = `
    <div class="modal-head"><h3>Новый чат</h3><button class="btn-ghost" id="nc-close">✕</button></div>
    <div class="modal-body">
      <div class="pub-choice" style="margin-bottom:14px;">
        <div class="pub-choice-item checked" data-nc-tab="direct"><img class="icon icon--sm" src="${ICONS.userAdd}" /> Личный чат</div>
        <div class="pub-choice-item" data-nc-tab="group"><img class="icon icon--sm" src="${ICONS.createGroup}" /> Группа</div>
      </div>
      <div id="nc-body"></div>
    </div>`;
  document.getElementById("nc-close").onclick = () => closeModal("modal-new-chat");
  body.querySelectorAll("[data-nc-tab]").forEach((b) => b.onclick = () => {
    body.querySelectorAll("[data-nc-tab]").forEach((x) => x.classList.remove("checked"));
    b.classList.add("checked");
    renderNcBody(b.dataset.ncTab);
  });
  renderNcBody("direct");
  openModal("modal-new-chat");
}

function renderNcBody(tab) {
  const el = document.getElementById("nc-body");
  if (tab === "direct") {
    el.innerHTML = `
      <div class="field"><label>Найти по @username</label><input type="text" id="nc-username" placeholder="username" /></div>
      <button class="btn-accent" id="nc-find">Найти и начать чат</button>
      <div id="nc-find-result" style="margin-top:10px;font-size:13px;color:var(--text-dim);"></div>`;
    document.getElementById("nc-find").onclick = async () => {
      const uname = document.getElementById("nc-username").value.trim().replace(/^@/, "");
      const user = await getUserByUsername(uname);
      if (!user) { document.getElementById("nc-find-result").textContent = "Пользователь не найден"; return; }
      await startDirectChat(user);
    };
  } else {
    el.innerHTML = `
      <div class="field"><label>Название группы</label><input type="text" id="ng-name" /></div>
      <div class="field"><label>@Groupname</label><input type="text" id="ng-username" /></div>
      <div class="field"><label>Описание</label><input type="text" id="ng-desc" /></div>
      <div class="pub-choice">
        <div class="pub-choice-item checked" data-ng-vis="public">Общественная</div>
        <div class="pub-choice-item" data-ng-vis="private">Приватная</div>
      </div>
      <div class="field" style="margin-top:10px;"><label>Добавить участника (@username)</label>
        <div style="display:flex;gap:8px;"><input type="text" id="ng-member" style="flex:1;" /><button class="btn-ghost" id="ng-add-member">+</button></div>
      </div>
      <div id="ng-members" style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;"></div>
      <button class="btn-accent" id="ng-create">Создать группу</button>`;
    let visibility = "public";
    const members = new Map();
    el.querySelectorAll("[data-ng-vis]").forEach((b) => b.onclick = () => {
      el.querySelectorAll("[data-ng-vis]").forEach((x) => x.classList.remove("checked"));
      b.classList.add("checked"); visibility = b.dataset.ngVis;
    });
    document.getElementById("ng-add-member").onclick = async () => {
      const uname = document.getElementById("ng-member").value.trim().replace(/^@/, "");
      const user = await getUserByUsername(uname);
      if (!user) { toast("Пользователь не найден"); return; }
      members.set(user.uid, user);
      document.getElementById("ng-members").innerHTML = [...members.values()].map((u) => `<span class="pill-btn">@${escapeHtml(u.username)}</span>`).join("");
      document.getElementById("ng-member").value = "";
    };
    document.getElementById("ng-create").onclick = async () => {
      const name = document.getElementById("ng-name").value.trim();
      const username = document.getElementById("ng-username").value.trim().replace(/^@/, "");
      const desc = document.getElementById("ng-desc").value.trim();
      if (!name) { toast("Укажи название группы"); return; }
      await createGroup(name, username, desc, visibility, [...members.keys()]);
    };
  }
}

async function startDirectChat(otherUser) {
  const me = getMe();
  const pairId = [me.uid, otherUser.uid].sort().join("_");
  const chatId = `direct_${pairId}`;
  const exists = await get(ref(db, `chats/${chatId}`));
  if (!exists.exists()) {
    await set(ref(db, `chats/${chatId}`), {
      type: "direct", members: { [me.uid]: true, [otherUser.uid]: true },
      createdAt: serverTimestamp(),
    });
    await set(ref(db, `userChats/${me.uid}/${chatId}`), { name: otherUser.displayName, avatarURL: otherUser.avatarURL, otherUid: otherUser.uid, lastMessage: "", lastMessageAt: serverTimestamp(), unreadCount: 0 });
    await set(ref(db, `userChats/${otherUser.uid}/${chatId}`), { name: me.displayName, avatarURL: me.avatarURL, otherUid: me.uid, lastMessage: "", lastMessageAt: serverTimestamp(), unreadCount: 0 });
  }
  closeModal("modal-new-chat");
  openChat(chatId);
}

async function createGroup(name, username, desc, visibility, memberUids) {
  const me = getMe();
  const groupRef = push(ref(db, "chats"));
  const chatId = groupRef.key;
  const members = { [me.uid]: true }; memberUids.forEach((u) => (members[u] = true));
  const admins = { [me.uid]: true };
  await set(groupRef, {
    type: "group", name, username, description: desc, visibility, members, admins,
    avatarURL: DEFAULT_AVATARS.group.dark, createdAt: serverTimestamp(), ownerId: me.uid,
  });
  for (const uid of Object.keys(members)) {
    await set(ref(db, `userChats/${uid}/${chatId}`), { name, avatarURL: DEFAULT_AVATARS.group.dark, lastMessage: "Группа создана", lastMessageAt: serverTimestamp(), unreadCount: 0 });
  }
  closeModal("modal-new-chat");
  openChat(chatId);
  toast("Группа создана");
}

// ------------------- CHAT WINDOW -------------------

async function openChat(chatId) {
  currentChatId = chatId;
  const me = getMe();
  const chatSnap = await get(ref(db, `chats/${chatId}`));
  currentChatMeta = chatSnap.val();
  const myChatMetaSnap = await get(ref(db, `userChats/${me.uid}/${chatId}`));
  const myChatMeta = myChatMetaSnap.val() || {};
  currentChatMeta.otherUid = myChatMeta.otherUid || null;
  currentChatMeta.name = currentChatMeta.name || myChatMeta.name;
  currentChatMeta.avatarURL = currentChatMeta.avatarURL || myChatMeta.avatarURL;
  await update(ref(db, `userChats/${me.uid}/${chatId}`), { unreadCount: 0 });
  renderChatWindowShell();
  document.getElementById("chat-window").classList.add("active");
  loadMessages(chatId);
}

function renderChatWindowShell() {
  const meta = currentChatMeta;
  const win = document.getElementById("chat-window");
  const avatar = meta.avatarURL || DEFAULT_AVATARS[meta.type === "group" ? "group" : "user"].dark;
  win.innerHTML = `
    <div class="chat-win-header">
      <button class="chat-win-back" id="cw-back">←</button>
      <img class="chat-win-avatar" id="cw-avatar" src="${avatar}" />
      <div class="chat-win-info" id="cw-info">
        <div class="chat-win-name">${escapeHtml(meta.name || "Чат")}</div>
        <div class="chat-win-status" id="chat-win-status">${meta.type === "group" ? `${Object.keys(meta.members || {}).length} участников` : "загрузка…"}</div>
      </div>
      <div class="chat-win-actions">
        <button class="icon-btn"><img class="icon" src="${ICONS.call}" /></button>
        <button class="icon-btn"><img class="icon" src="${ICONS.videoCall}" /></button>
        <button class="icon-btn" id="cw-menu"><span style="font-size:20px;">⋮</span></button>
      </div>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="attach-menu" id="chat-attach-menu"></div>
    <div class="chat-input-bar">
      <button class="round-btn" id="cw-attach"><img class="icon" src="${ICONS.clip}" /></button>
      <div class="text-input-pill">
        <input type="text" id="cw-text" placeholder="Сообщение…" />
        <img class="icon icon--sm" src="${ICONS.sticker}" style="cursor:pointer;margin-left:6px;" id="cw-sticker" />
      </div>
      <button class="round-btn" id="cw-video-circle"><img class="icon" src="${ICONS.videoCircle}" /></button>
      <button class="send-btn" id="cw-send"><img class="icon icon--noinvert" style="width:18px;height:18px;filter:invert(1);" id="cw-send-icon" src="${ICONS.mic}" /></button>
    </div>`;
  document.getElementById("cw-back").onclick = () => closeChatWindow();
  document.getElementById("cw-info").onclick = () => {
    if (meta.type === "direct" && meta.otherUid) {
      document.getElementById("chat-window").classList.remove("active");
      goToProfile(meta.otherUid);
    } else {
      toast("Просмотр участников группы — скоро");
    }
  };
  if (meta.type === "direct" && meta.otherUid) {
    watchUserStatus(meta.otherUid, (status) => {
      const el = document.getElementById("chat-win-status");
      if (!el) return;
      el.textContent = status.online ? "в сети" : (status.lastSeen ? "был(а) " + timeShort(status.lastSeen) : "не в сети");
    });
  }
  document.getElementById("cw-menu").onclick = (e) => showChatRowMenu(currentChatId, e.clientX, e.clientY);
  document.getElementById("cw-attach").onclick = () => document.getElementById("chat-attach-menu").classList.add("active");
  applyChatWallpaper();

  const attachMenu = document.getElementById("chat-attach-menu");
  attachMenu.innerHTML = `
    <div class="attach-menu-close" id="am-close">✕</div>
    <div class="attach-options">
      <label class="attach-opt"><div class="round-btn"><img class="icon" src="${ICONS.file}" /></div><span>Файл</span><input type="file" id="am-file" class="hidden" /></label>
      <label class="attach-opt"><div class="round-btn"><img class="icon" src="${ICONS.picture}" /></div><span>Фото</span><input type="file" accept="image/*" id="am-photo" class="hidden" /></label>
      <label class="attach-opt"><div class="round-btn"><img class="icon" src="${ICONS.videoCircle}" /></div><span>Камера</span><input type="file" accept="image/*" capture="environment" id="am-camera" class="hidden" /></label>
      <div class="attach-opt" id="am-sticker"><div class="round-btn"><img class="icon" src="${ICONS.sticker}" /></div><span>Стикер</span></div>
      <div class="attach-opt" id="am-poll"><div class="round-btn"><img class="icon" src="${ICONS.poll}" /></div><span>Опрос</span></div>
    </div>
    <p style="text-align:center;font-size:11.5px;color:var(--text-dim);margin-top:12px;">Файлы/голосовые/видео — до ~8 МБ (бесплатный тариф)</p>`;
  document.getElementById("am-close").onclick = () => attachMenu.classList.remove("active");
  document.getElementById("am-photo").onchange = async (e) => { const f = e.target.files[0]; if (f) await sendPhotoMessage(f); attachMenu.classList.remove("active"); };
  document.getElementById("am-file").onchange = async (e) => { const f = e.target.files[0]; if (f) await sendFileMessage(f); attachMenu.classList.remove("active"); };
  document.getElementById("am-camera").onchange = async (e) => { const f = e.target.files[0]; if (f) await sendPhotoMessage(f); attachMenu.classList.remove("active"); };
  document.getElementById("am-sticker").onclick = () => { attachMenu.classList.remove("active"); openStickerPicker(); };
  document.getElementById("am-poll").onclick = () => { attachMenu.classList.remove("active"); openPollComposer(); };

  const input = document.getElementById("cw-text");
  const sendBtn = document.getElementById("cw-send");
  const sendIcon = document.getElementById("cw-send-icon");
  const videoBtn = document.getElementById("cw-video-circle");

  function refreshSendIcon() {
    const hasText = input.value.trim().length > 0;
    sendIcon.src = hasText ? ICONS.share : ICONS.mic; // "share"-стрелка похожа на отправку, mic — запись голоса
    videoBtn.style.display = hasText ? "none" : "flex";
  }
  input.addEventListener("input", refreshSendIcon);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendTextMessage(); });
  refreshSendIcon();

  document.getElementById("cw-sticker").onclick = openStickerPicker;
  videoBtn.onclick = () => toggleVideoNoteRecording(videoBtn);
  sendBtn.onclick = () => {
    if (input.value.trim()) sendTextMessage();
    else toggleVoiceRecording(sendBtn, sendIcon);
  };
}

// ------------------- STICKERS -------------------
const STICKER_SET = ["😀","😂","😍","😎","🥳","🤔","😴","🤯","🥰","😭","👍","👏","🔥","💯","🎉","🙌","❤️","💔","🐱","🐶","🍕","☕️","🌈","⚡️"];

function openStickerPicker() {
  const backdrop = document.getElementById("ctx-backdrop");
  const menu = document.getElementById("ctx-menu");
  menu.innerHTML = `<div class="ctx-reactions" style="max-width:280px;">${STICKER_SET.map((s) => `<span data-sticker="${s}" style="font-size:26px;">${s}</span>`).join("")}</div>`;
  const rect = document.getElementById("cw-sticker").getBoundingClientRect();
  menu.style.left = Math.max(10, rect.left - 150) + "px";
  menu.style.top = (rect.top - 220) + "px";
  backdrop.classList.add("active"); menu.classList.remove("hidden");
  backdrop.onclick = () => { backdrop.classList.remove("active"); menu.classList.add("hidden"); };
  menu.querySelectorAll("[data-sticker]").forEach((s) => s.onclick = async () => {
    backdrop.classList.remove("active"); menu.classList.add("hidden");
    await pushMessage({ sticker: s.dataset.sticker });
  });
}

// ------------------- VOICE MESSAGES -------------------
let voiceRecorder = null, voiceChunks = [], voiceStream = null;

async function toggleVoiceRecording(btn, iconEl) {
  if (voiceRecorder && voiceRecorder.state === "recording") {
    voiceRecorder.stop();
    return;
  }
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast("Нет доступа к микрофону"); return;
  }
  voiceChunks = [];
  voiceRecorder = new MediaRecorder(voiceStream);
  voiceRecorder.ondataavailable = (e) => voiceChunks.push(e.data);
  voiceRecorder.onstop = async () => {
    voiceStream.getTracks().forEach((t) => t.stop());
    btn.style.background = ""; iconEl.src = ICONS.mic;
    const blob = new Blob(voiceChunks, { type: "audio/webm" });
    if (blob.size < 500) { toast("Слишком коротко — запись отменена"); return; }
    toast("Отправляем голосовое…");
    try { const url = await uploadAudio(blob); await pushMessage({ audioURL: url }); }
    catch (err) { toast(err.message || "Не удалось отправить голосовое"); }
  };
  voiceRecorder.start();
  btn.style.background = "var(--danger)"; iconEl.src = ICONS.trash; toast("Запись… нажми ещё раз чтобы отправить");
}

// ------------------- VIDEO NOTES (кружки) -------------------
let videoRecorder = null, videoChunks = [], videoStream = null;

async function toggleVideoNoteRecording(btn) {
  if (videoRecorder && videoRecorder.state === "recording") {
    videoRecorder.stop();
    return;
  }
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320 }, audio: true });
  } catch {
    toast("Нет доступа к камере"); return;
  }
  videoChunks = [];
  videoRecorder = new MediaRecorder(videoStream);
  videoRecorder.ondataavailable = (e) => videoChunks.push(e.data);
  videoRecorder.onstop = async () => {
    videoStream.getTracks().forEach((t) => t.stop());
    btn.style.background = "";
    const blob = new Blob(videoChunks, { type: "video/webm" });
    toast("Отправляем видео-кружок…");
    try { const url = await uploadVideoNote(blob); await pushMessage({ videoNoteURL: url }); }
    catch (err) { toast(err.message || "Не удалось отправить видео-кружок"); }
  };
  videoRecorder.start();
  btn.style.background = "var(--danger)"; toast("Запись видео-кружка… нажми ещё раз чтобы отправить");
}

// ------------------- POLLS -------------------
function openPollComposer() {
  const body = document.getElementById("modal-confirm-body");
  body.innerHTML = `
    <div class="modal-head"><h3>Новый опрос</h3></div>
    <div class="modal-body">
      <div class="field"><label>Вопрос</label><input type="text" id="poll-q" /></div>
      ${[0, 1, 2, 3].map((i) => `<div class="field"><label>Вариант ${i + 1}${i < 2 ? "" : " (опционально)"}</label><input type="text" id="poll-opt-${i}" /></div>`).join("")}
    </div>
    <div class="modal-foot">
      <button class="btn-ghost" id="poll-cancel">Отмена</button>
      <button class="btn-accent" id="poll-create">Создать опрос</button>
    </div>`;
  openModal("modal-confirm");
  document.getElementById("poll-cancel").onclick = () => closeModal("modal-confirm");
  document.getElementById("poll-create").onclick = async () => {
    const question = document.getElementById("poll-q").value.trim();
    const options = [0, 1, 2, 3].map((i) => document.getElementById(`poll-opt-${i}`).value.trim()).filter(Boolean);
    if (!question || options.length < 2) { toast("Нужен вопрос и минимум 2 варианта"); return; }
    closeModal("modal-confirm");
    await pushMessage({ poll: { question, options: options.map((text) => ({ text, votes: {} })) } });
  };
}

async function voteInPoll(msgId, optIndex) {
  const me = getMe();
  const msgRef = ref(db, `messages/${currentChatId}/${msgId}/poll/options`);
  const snap = await get(msgRef);
  const options = snap.val() || [];
  options.forEach((o, i) => {
    if (!o.votes) o.votes = {};
    if (i === optIndex) o.votes[me.uid] = true;
    else delete o.votes[me.uid];
  });
  await set(msgRef, options);
}

function applyChatWallpaper() {
  const me = getMe();
  const el = document.getElementById("chat-messages");
  if (!el) return;
  const wp = me.settings?.wallpaper || { mode: "auto" };
  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const color = me.settings?.color || "green";
  let url = "";
  if (wp.mode === "custom" && wp.customURL) url = wp.customURL;
  else if (wp.mode === "dark") url = WALLPAPERS[color]?.mobile || WALLPAPERS.green.mobile;
  else if (wp.mode === "light") url = WALLPAPERS[color]?.pc || WALLPAPERS.green.pc;
  else url = theme === "dark" ? (WALLPAPERS[color]?.mobile || "") : (WALLPAPERS[color]?.pc || "");
  el.style.backgroundImage = url ? `url(${url})` : "none";
}

function loadMessages(chatId) {
  lastMsgAuthor = null;
  if (msgUnsub) { msgUnsub(); msgUnsub = null; }
  msgUnsub = onValue(ref(db, `messages/${chatId}`), (snap) => {
    const msgs = [];
    snap.forEach((m) => msgs.push({ id: m.key, ...m.val() }));
    msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    renderMessages(msgs);
  });
}

function renderMessages(msgs) {
  const me = getMe();
  const el = document.getElementById("chat-messages");
  if (!el) return;
  let html = "";
  let prevDate = null;
  msgs.forEach((m) => {
    try {
      const dayLabel = dateSepLabel(m.createdAt || Date.now());
      if (dayLabel !== prevDate) { html += `<div class="date-sep"><span>${dayLabel}</span></div>`; prevDate = dayLabel; }
      html += renderOneMessage(m, me);
    } catch (err) {
      console.error("Не удалось отрисовать сообщение", m.id, m, err);
      html += `<div class="date-sep"><span style="color:var(--danger);">⚠ ошибка показа сообщения (см. консоль)</span></div>`;
    }
  });
  el.innerHTML = html || `<div class="empty-state">Сообщений пока нет — напиши первым!</div>`;
  el.scrollTop = el.scrollHeight;
  attachMessageHandlers(el, msgs, me);
}

function renderOneMessage(m, me) {
  const out = m.senderId === me.uid;
  const showAvatar = currentChatMeta.type === "group" && !out;
  const read = m.readBy && Object.keys(m.readBy).some((u) => u !== m.senderId);

  if (m.sticker) {
    return `<div class="msg-row ${out ? "out" : "in"}" data-msg-id="${m.id}">
      ${showAvatar ? `<img class="msg-group-avatar" src="${m.senderAvatar || ""}" />` : ""}
      <div data-msg="${m.id}" style="font-size:64px;line-height:1;padding:4px;">${m.sticker}</div>
    </div>`;
  }

  let mediaHtml = "";
  if (m.imageURL) mediaHtml = `<img class="msg-img" src="${m.imageURL}" />`;
  else if (m.audioURL) mediaHtml = `<audio controls src="${m.audioURL}" style="max-width:220px;"></audio>`;
  else if (m.videoNoteURL) mediaHtml = `<video src="${m.videoNoteURL}" controls style="width:200px;height:200px;border-radius:50%;object-fit:cover;"></video>`;
  else if (m.fileURL) mediaHtml = `<a href="${m.fileURL}" download="${escapeHtml(m.fileName || "file")}" style="display:flex;gap:8px;align-items:center;color:inherit;text-decoration:none;"><img class="icon icon--sm" src="${ICONS.file}"/> ${escapeHtml(m.fileName || "Файл")}</a>`;

  let pollHtml = "";
  if (m.poll) {
    const totalVotes = m.poll.options.reduce((s, o) => s + Object.keys(o.votes || {}).length, 0);
    pollHtml = `<div style="min-width:220px;">
      <div style="font-weight:700;margin-bottom:8px;">📊 ${escapeHtml(m.poll.question)}</div>
      ${m.poll.options.map((o, i) => {
        const votes = Object.keys(o.votes || {}).length;
        const pct = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;
        const meVoted = me && o.votes && o.votes[me.uid];
        return `<div data-vote="${i}" data-msg-id="${m.id}" style="cursor:pointer;background:var(--surface);border-radius:8px;padding:6px 10px;margin-bottom:6px;position:relative;overflow:hidden;">
          <div style="position:absolute;inset:0;width:${pct}%;background:var(--accent-dim);z-index:0;"></div>
          <div style="position:relative;z-index:1;display:flex;justify-content:space-between;font-size:13px;">
            <span>${meVoted ? "✓ " : ""}${escapeHtml(o.text)}</span><span>${pct}%</span>
          </div>
        </div>`;
      }).join("")}
      <div style="font-size:11px;color:var(--text-dim);">${totalVotes} голосов</div>
    </div>`;
  }

  return `
    <div class="msg-row ${out ? "out" : "in"}" data-msg-id="${m.id}">
      ${showAvatar ? `<img class="msg-group-avatar" src="${m.senderAvatar || ""}" />` : ""}
      <div class="bubble" data-msg="${m.id}">
        ${currentChatMeta.type === "group" && !out ? `<div class="sender-name">${escapeHtml(m.senderName || "")}</div>` : ""}
        ${m.text ? `<div>${richText(m.text)}</div>` : ""}
        ${mediaHtml}
        ${pollHtml}
        <div class="bubble-meta">
          ${m.editedAt ? "ред. " : ""}${timeShort(m.createdAt || Date.now())}
          ${out ? `<span class="ticks ${read ? "read" : ""}">${read ? "✓✓" : "✓"}</span>` : ""}
        </div>
        ${renderReactions(m)}
      </div>
    </div>`;
}

function attachMessageHandlers(el, msgs, me) {
  el.querySelectorAll("[data-vote]").forEach((n) => n.addEventListener("click", (e) => {
    e.stopPropagation();
    voteInPoll(n.dataset.msgId, Number(n.dataset.vote));
  }));

  el.querySelectorAll("[data-msg]").forEach((n) => {
    let pressTimer;
    n.addEventListener("contextmenu", (e) => { e.preventDefault(); showMsgMenu(n.dataset.msg, e.clientX, e.clientY); });
    n.addEventListener("touchstart", () => { pressTimer = setTimeout(() => {
      const r = n.getBoundingClientRect(); showMsgMenu(n.dataset.msg, r.left, r.top);
    }, 500); });
    n.addEventListener("touchend", () => clearTimeout(pressTimer));
  });

  // отметить входящие как прочитанные
  msgs.forEach((m) => {
    if (m.senderId !== me.uid && (!m.readBy || !m.readBy[me.uid])) {
      update(ref(db, `messages/${currentChatId}/${m.id}/readBy`), { [me.uid]: true });
    }
  });
}

function renderReactions(m) {
  if (!m.reactions || !Object.keys(m.reactions).length) return "";
  const counts = {};
  Object.values(m.reactions).forEach((r) => (counts[r] = (counts[r] || 0) + 1));
  return `<div style="display:flex;gap:4px;margin-top:4px;">${Object.entries(counts).map(([emoji, c]) => `<span style="font-size:12px;background:var(--surface);border-radius:8px;padding:1px 5px;">${emoji} ${c}</span>`).join("")}</div>`;
}

function showMsgMenu(msgId, x, y) {
  const me = getMe();
  get(ref(db, `messages/${currentChatId}/${msgId}`)).then((snap) => {
    const msg = snap.val(); if (!msg) return;
    const own = msg.senderId === me.uid;
    const backdrop = document.getElementById("ctx-backdrop");
    const menu = document.getElementById("ctx-menu");
    menu.innerHTML = `
      <div class="ctx-reactions">${REACTIONS.map((r) => `<span data-react="${r}">${r}</span>`).join("")}</div>
      <button data-act="reply">↩️ Ответить</button>
      <button data-act="forward">➡️ Переслать</button>
      <button data-act="copy">📋 Скопировать текст</button>
      ${msg.imageURL ? `<button data-act="save">💾 Сохранить фото</button>` : ""}
      <button data-act="copylink">🔗 Копировать ссылку</button>
      <button data-act="pin">📌 Закрепить</button>
      ${own ? `<button data-act="edit">✏️ Редактировать</button>` : ""}
      <button data-act="delete" class="danger">🗑 Удалить${own ? " у всех" : ""}</button>`;
    positionCtxMenu(menu, x, y);
    backdrop.classList.add("active"); menu.classList.remove("hidden");
    backdrop.onclick = closeCtx;
    menu.querySelectorAll("[data-react]").forEach((s) => s.onclick = () => reactToMessage(msgId, s.dataset.react));
    menu.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => handleMsgAction(msgId, msg, b.dataset.act));
  });
}

async function reactToMessage(msgId, emoji) {
  const me = getMe();
  const r = ref(db, `messages/${currentChatId}/${msgId}/reactions/${me.uid}`);
  const snap = await get(r);
  if (snap.exists() && snap.val() === emoji) await remove(r);
  else await set(r, emoji);
  closeCtx();
}

async function handleMsgAction(msgId, msg, act) {
  closeCtx();
  if (act === "copy") { navigator.clipboard.writeText(msg.text || ""); toast("Текст скопирован"); }
  if (act === "copylink") { navigator.clipboard.writeText(`${location.origin}${location.pathname}#/chat/${currentChatId}/msg/${msgId}`); toast("Ссылка скопирована"); }
  if (act === "save" && msg.imageURL) window.open(msg.imageURL, "_blank");
  if (act === "delete") await remove(ref(db, `messages/${currentChatId}/${msgId}`));
  if (act === "pin") toast("Сообщение закреплено");
  if (act === "reply") { document.getElementById("cw-text").placeholder = `Ответ на: ${(msg.text || "медиа").slice(0, 30)}`; document.getElementById("cw-text").dataset.replyTo = msgId; document.getElementById("cw-text").focus(); }
  if (act === "forward") toast("Пересылка: выбери чат в списке (скоро)");
  if (act === "edit") { const t = prompt("Изменить сообщение:", msg.text || ""); if (t !== null) await update(ref(db, `messages/${currentChatId}/${msgId}`), { text: t, editedAt: Date.now() }); }
}

async function sendTextMessage() {
  const me = getMe();
  const input = document.getElementById("cw-text");
  const text = input.value.trim(); if (!text) return;
  input.value = "";
  const replyTo = input.dataset.replyTo || null; input.dataset.replyTo = "";
  await pushMessage({ text, replyTo });
}

async function sendPhotoMessage(file) {
  const tempTile = document.getElementById("chat-messages");
  toast("Загружаем фото…");
  try {
    const url = await uploadImage(file);
    await pushMessage({ imageURL: url });
  } catch { toast("Не удалось отправить фото"); }
}

async function sendFileMessage(file) {
  toast("Загружаем файл…");
  try {
    const url = await uploadFile(file);
    await pushMessage({ fileURL: url, fileName: file.name });
  } catch (err) { toast(err.message || "Не удалось отправить файл"); }
}

async function pushMessage(data) {
  const me = getMe();
  try {
    const mRef = push(ref(db, `messages/${currentChatId}`));
    await set(mRef, {
      senderId: me.uid, senderName: me.displayName, senderAvatar: me.avatarURL,
      text: "", imageURL: "", fileURL: "", fileName: "", readBy: { [me.uid]: true },
      createdAt: serverTimestamp(), ...data,
    });
    const preview = data.text || (data.imageURL ? "📷 Фото" : data.fileURL ? "📎 Файл" : data.sticker ? "Стикер" : "Сообщение");
    const members = currentChatMeta.members || {};
    for (const uid of Object.keys(members)) {
      const unreadPatch = {};
      if (uid !== me.uid) {
        const curSnap = await get(ref(db, `userChats/${uid}/${currentChatId}/unreadCount`));
        unreadPatch.unreadCount = (curSnap.val() || 0) + 1;
      }
      await update(ref(db, `userChats/${uid}/${currentChatId}`), {
        lastMessage: preview, lastMessageAt: serverTimestamp(), ...unreadPatch,
      });
    }
  } catch (e) {
    toast("Сообщение не отправлено: " + (e.message || e));
  }
}
