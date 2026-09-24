// js/profile.js
import { db, ref, get, set, update, query, orderByChild, equalTo } from "./firebase-config.js";
import { uploadImage } from "./firebase-config.js";
import { ICONS } from "./icons.js";
import { escapeHtml, richText, fmtCount, toast, openModal, closeModal } from "./utils.js";
import { getMe, getUserByUsername, refreshMe } from "./main.js";

let viewingUid = null;
let activeTab = "posts";

export function initProfileTab() {
  const me = getMe();
  renderProfile(me.uid);
}

export async function renderProfile(uid) {
  viewingUid = uid;
  activeTab = "posts";
  const me = getMe();
  const isMe = uid === me.uid;
  const snap = await get(ref(db, `users/${uid}`));
  if (!snap.exists()) return;
  const u = snap.val();
  const iFollow = u.followers && u.followers[me.uid];

  const el = document.getElementById("profile-content");
  el.innerHTML = `
    <div class="profile-banner" style="${u.bannerURL ? `background-image:url(${u.bannerURL})` : ""}"></div>
    <div class="profile-head">
      <img class="profile-avatar-lg" src="${u.avatarURL || ""}" />
      <div class="profile-name-block">
        <div class="profile-name">${escapeHtml(u.displayName)} ${u.verified ? `<img class="verified-icon icon--noinvert" src="${ICONS.verified}" />` : ""}</div>
        <div class="profile-username">@${escapeHtml(u.username)}</div>
      </div>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><b>${fmtCount(u.postsCount || 0)}</b><span>постов</span></div>
      <div class="profile-stat"><b>${fmtCount(u.followersCount || 0)}</b><span>подписчиков</span></div>
      <div class="profile-stat"><b>${fmtCount(u.followingCount || 0)}</b><span>подписок</span></div>
      <div class="profile-stat"><b>${fmtCount(u.likesCount || 0)}</b><span>лайков</span></div>
      <div class="profile-stat"><b>${fmtCount(u.repostsCount || 0)}</b><span>репостов</span></div>
    </div>
    ${u.bio ? `<p style="padding:0 20px 10px;font-size:13.5px;color:var(--text-dim);">${richText(u.bio)}</p>` : ""}
    <div class="profile-actions">
      ${isMe ? `<button class="pill-btn" id="pf-edit">Редактировать профиль</button>` : `
        <button class="pill-btn primary" id="pf-follow">${iFollow ? "Отписаться" : "Подписаться"}</button>
        <button class="pill-btn" id="pf-msg">Написать в лс</button>
        <button class="icon-btn" id="pf-notif"><img class="icon" src="${iFollow ? ICONS.bellOn : ICONS.bellOff}" /></button>
      `}
    </div>
    ${isMe ? `<div class="compose-fab-wrap"><button class="compose-fab" id="pf-new-post">+ Опубликовать слайс</button></div>` : ""}
    <div class="profile-tabs">
      <button class="active" data-ptab="posts">Посты</button>
      <button data-ptab="reposts">Репосты</button>
    </div>
    <div class="feed" id="profile-feed" style="padding-top:14px;"></div>
  `;

  if (isMe) {
    document.getElementById("pf-edit").onclick = openEditProfileModal;
    document.getElementById("pf-new-post").onclick = () => document.getElementById("fab-new-post").click();
  } else {
    document.getElementById("pf-follow").onclick = () => toggleFollowProfile(uid, u);
    document.getElementById("pf-msg").onclick = () => { document.querySelector('[data-tab="chats"]').click(); toast("Открой + → личный чат → @" + u.username); };
    document.getElementById("pf-notif").onclick = (e) => toast("Уведомления о постах переключены");
  }
  el.querySelectorAll("[data-ptab]").forEach((b) => b.onclick = () => {
    el.querySelectorAll("[data-ptab]").forEach((x) => x.classList.remove("active"));
    b.classList.add("active"); activeTab = b.dataset.ptab; loadProfileFeed(uid);
  });

  loadProfileFeed(uid);
}

async function loadProfileFeed(uid) {
  const container = document.getElementById("profile-feed");
  const snap = await get(query(ref(db, "posts"), orderByChild("authorId"), equalTo(uid)));
  const posts = [];
  snap.forEach((c) => posts.push({ id: c.key, ...c.val() }));
  const filtered = posts.filter((p) => (activeTab === "reposts" ? p.repostOf : !p.repostOf));
  filtered.reverse();
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">${activeTab === "reposts" ? "Репостов пока нет" : "Постов пока нет"}</div>`;
    return;
  }
  // используем упрощённый рендер (без интерактивных обработчиков лайков — открой в ленте Slices для полного функционала)
  container.innerHTML = filtered.map((p) => `
    <div class="post-card">
      <div class="post-top">
        <img class="post-avatar" src="${p.authorAvatar || ""}" />
        <div class="post-who">
          <div class="post-name-row"><span class="post-name">${escapeHtml(p.authorName)}</span></div>
          <div class="post-username">@${escapeHtml(p.authorUsername)}</div>
        </div>
      </div>
      ${p.text ? `<p class="post-text">${richText(p.text)}</p>` : ""}
      ${p.imageURL ? `<div class="post-image"><img src="${p.imageURL}" /></div>` : ""}
      <div class="post-actions">
        <span class="post-action">👍 ${fmtCount(p.likesCount || 0)}</span>
        <span class="post-action">🔁 ${fmtCount(p.repostsCount || 0)}</span>
        <span class="post-action">💬 ${fmtCount(p.commentsCount || 0)}</span>
      </div>
    </div>`).join("");
}

async function toggleFollowProfile(uid, u) {
  const me = getMe();
  const followRef = ref(db, `users/${uid}/followers/${me.uid}`);
  const snap = await get(followRef);
  if (snap.exists()) {
    await set(followRef, null);
    await set(ref(db, `users/${me.uid}/following/${uid}`), null);
  } else {
    await set(followRef, true);
    await set(ref(db, `users/${me.uid}/following/${uid}`), true);
  }
  renderProfile(uid);
}

function openEditProfileModal() {
  const me = getMe();
  const body = document.getElementById("modal-new-chat-body"); // переиспользуем обёртку
  body.innerHTML = `
    <div class="modal-head"><h3>Редактировать профиль</h3><button class="btn-ghost" id="ep-close">✕</button></div>
    <div class="modal-body">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <img id="ep-avatar-preview" src="${me.avatarURL}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;" />
        <label class="pill-btn" style="cursor:pointer;">Сменить фото<input type="file" id="ep-avatar-input" accept="image/*" class="hidden" /></label>
      </div>
      <div class="field"><label>Имя</label><input type="text" id="ep-name" value="${escapeHtml(me.displayName)}" /></div>
      <div class="field"><label>@username</label><input type="text" id="ep-username" value="${escapeHtml(me.username)}" /></div>
      <div class="field"><label>Описание</label><input type="text" id="ep-bio" value="${escapeHtml(me.bio || "")}" /></div>
    </div>
    <div class="modal-foot">
      <button class="btn-ghost" id="ep-cancel">Отмена</button>
      <button class="btn-accent" id="ep-save">Сохранить</button>
    </div>`;
  document.getElementById("ep-close").onclick = () => closeModal("modal-new-chat");
  document.getElementById("ep-cancel").onclick = () => closeModal("modal-new-chat");
  let newAvatarURL = null;
  document.getElementById("ep-avatar-input").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    document.getElementById("ep-avatar-preview").style.opacity = .5;
    try { newAvatarURL = await uploadImage(f); document.getElementById("ep-avatar-preview").src = newAvatarURL; }
    catch { toast("Не удалось загрузить фото"); }
    document.getElementById("ep-avatar-preview").style.opacity = 1;
  };
  document.getElementById("ep-save").onclick = async () => {
    const patch = {
      displayName: document.getElementById("ep-name").value.trim(),
      username: document.getElementById("ep-username").value.trim().replace(/^@/, "").toLowerCase(),
      bio: document.getElementById("ep-bio").value.trim(),
    };
    if (newAvatarURL) patch.avatarURL = newAvatarURL;
    await update(ref(db, `users/${me.uid}`), patch);
    await refreshMe();
    closeModal("modal-new-chat");
    renderProfile(me.uid);
    toast("Профиль обновлён");
  };
  openModal("modal-new-chat");
}
