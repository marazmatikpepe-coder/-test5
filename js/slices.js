// js/slices.js
import {
  db, ref, push, set, get, update, remove, onValue, query, orderByChild,
  equalTo, limitToLast, serverTimestamp, runTransaction,
} from "./firebase-config.js";
import { uploadImage, uploadFile } from "./firebase-config.js";
import { ICONS } from "./icons.js";
import {
  richText, toast, openModal, closeModal, fmtCount, extractHashtags,
  extractMentions, escapeHtml, timeShort, REACTIONS,
} from "./utils.js";
import { getMe, getUserById, goToProfile } from "./main.js";

const feedEl = () => document.getElementById("feed-container");
let feedUnsub = null;

export function initSlicesTab() {
  document.getElementById("fab-new-post").onclick = openNewPostModal;
  document.getElementById("icon-search-slices").src = ICONS.search;
  loadFeed();
}

function loadFeed() {
  const q = query(ref(db, "posts"), orderByChild("createdAt"), limitToLast(50));
  onValue(q, (snap) => {
    const posts = [];
    snap.forEach((child) => posts.push({ id: child.key, ...child.val() }));
    posts.reverse();
    renderFeed(posts);
  });
}

function renderFeed(posts) {
  const el = feedEl();
  if (!posts.length) {
    el.innerHTML = `<div class="empty-state">Лента пуста. Опубликуй первый слайс →</div>`;
    return;
  }
  el.innerHTML = posts.map(renderPostCard).join("");
  el.querySelectorAll("[data-open-comments]").forEach((n) =>
    n.addEventListener("click", () => openComments(n.dataset.openComments))
  );
  el.querySelectorAll("[data-like]").forEach((n) =>
    n.addEventListener("click", (e) => { e.stopPropagation(); toggleLike(n.dataset.like); })
  );
  el.querySelectorAll("[data-follow]").forEach((n) =>
    n.addEventListener("click", (e) => { e.stopPropagation(); toggleFollow(n.dataset.follow, n); })
  );
  el.querySelectorAll("[data-repost]").forEach((n) =>
    n.addEventListener("click", (e) => { e.stopPropagation(); doRepost(n.dataset.repost); })
  );
  el.querySelectorAll(".post-card").forEach((card) =>
    card.addEventListener("click", () => registerView(card.dataset.id))
  );
  el.querySelectorAll("[data-open-profile]").forEach((n) =>
    n.addEventListener("click", (e) => { e.stopPropagation(); goToProfile(n.dataset.openProfile); })
  );
}

function renderPostCard(p) {
  const me = getMe();
  const liked = me && p.likes && p.likes[me.uid];
  const iFollow = me && p.authorFollowedBy && p.authorFollowedBy[me.uid];
  const isMe = me && p.authorId === me.uid;
  return `
  <div class="post-card" data-id="${p.id}">
    <div class="post-top">
      <img class="post-avatar" src="${p.authorAvatar || ""}" ${!p.isChannelPost ? `data-open-profile="${p.authorId}"` : ""} style="cursor:pointer;" />
      <div class="post-who" ${!p.isChannelPost ? `data-open-profile="${p.authorId}"` : ""} style="cursor:${p.isChannelPost ? "default" : "pointer"};">
        <div class="post-name-row">
          <span class="post-name">${escapeHtml(p.authorName || "")}</span>
          ${p.authorVerified ? `<img class="verified-icon icon--noinvert" src="${ICONS.verified}" />` : ""}
        </div>
        <div class="post-username">@${escapeHtml(p.authorUsername || "")}</div>
      </div>
      ${!isMe && !p.isChannelPost ? `<button class="follow-btn ${iFollow ? "following" : ""}" data-follow="${p.authorId}">${iFollow ? "✓" : "+"}</button>` : ""}
      <div class="post-meta-right">
        <span class="post-views">${fmtCount(p.viewsCount || 0)} <img class="icon icon--sm" src="${ICONS.eye}" /></span>
      </div>
    </div>
    ${p.text ? `<p class="post-text">${richText(p.text)}</p>` : ""}
    ${p.imageURL ? `<div class="post-image"><img src="${p.imageURL}" loading="lazy" /></div>` : ""}
    ${p.fileURL ? `<a class="post-file" href="${p.fileURL}" download="${escapeHtml(p.fileName || "file")}" style="text-decoration:none;color:inherit;"><img class="icon" src="${ICONS.file}" />${escapeHtml(p.fileName || "Файл")}</a>` : ""}
    <div class="post-actions">
      <button class="post-action ${liked ? "liked" : ""}" data-like="${p.id}">
        <img class="icon icon--sm ${liked ? "icon--noinvert" : ""}" src="${liked ? ICONS.likeActive : ICONS.likeActive}" style="${liked ? "" : "filter:var(--icon-filter);opacity:.55"}" /> ${fmtCount(p.likesCount || 0)}
      </button>
      <button class="post-action" data-repost="${p.id}"><img class="icon icon--sm" src="${ICONS.repost}" /> ${fmtCount(p.repostsCount || 0)}</button>
      <button class="post-action" data-open-comments="${p.id}"><img class="icon icon--sm" src="${ICONS.comment}" /> ${fmtCount(p.commentsCount || 0)}</button>
    </div>
  </div>`;
}

async function registerView(postId) {
  const me = getMe(); if (!me) return;
  const viewRef = ref(db, `posts/${postId}/views/${me.uid}`);
  const snap = await get(viewRef);
  if (!snap.exists()) {
    await set(viewRef, true);
    await runTransaction(ref(db, `posts/${postId}/viewsCount`), (c) => (c || 0) + 1);
  }
}

async function toggleLike(postId) {
  const me = getMe(); if (!me) return;
  try {
    const likeRef = ref(db, `posts/${postId}/likes/${me.uid}`);
    const snap = await get(likeRef);
    if (snap.exists()) {
      await remove(likeRef);
      await runTransaction(ref(db, `posts/${postId}/likesCount`), (c) => Math.max(0, (c || 1) - 1));
    } else {
      await set(likeRef, true);
      await runTransaction(ref(db, `posts/${postId}/likesCount`), (c) => (c || 0) + 1);
    }
  } catch (e) { toast("Не удалось поставить лайк: " + (e.message || e)); }
}

async function toggleFollow(authorId, btn) {
  const me = getMe(); if (!me || authorId === me.uid) return;
  try {
    const followRef = ref(db, `users/${authorId}/followers/${me.uid}`);
    const snap = await get(followRef);
    if (snap.exists()) {
      await remove(followRef);
      await remove(ref(db, `users/${me.uid}/following/${authorId}`));
      await runTransaction(ref(db, `users/${authorId}/followersCount`), (c) => Math.max(0, (c || 1) - 1));
      await runTransaction(ref(db, `users/${me.uid}/followingCount`), (c) => Math.max(0, (c || 1) - 1));
      btn.classList.remove("following"); btn.textContent = "+";
    } else {
      await set(followRef, true);
      await set(ref(db, `users/${me.uid}/following/${authorId}`), true);
      await runTransaction(ref(db, `users/${authorId}/followersCount`), (c) => (c || 0) + 1);
      await runTransaction(ref(db, `users/${me.uid}/followingCount`), (c) => (c || 0) + 1);
      btn.classList.add("following"); btn.textContent = "✓";
    }
  } catch (e) { toast("Не удалось подписаться: " + (e.message || e)); }
}

async function doRepost(postId) {
  const me = getMe(); if (!me) return;
  try {
    const origSnap = await get(ref(db, `posts/${postId}`));
    if (!origSnap.exists()) return;
    const orig = origSnap.val();
    const newRef = push(ref(db, "posts"));
    await set(newRef, {
      ...orig,
      repostOf: postId,
      repostOfAuthor: orig.authorName,
      authorId: me.uid, authorName: me.displayName, authorUsername: me.username,
      authorAvatar: me.avatarURL, authorVerified: !!me.verified,
      likes: {}, likesCount: 0, views: {}, viewsCount: 0, commentsCount: 0, repostsCount: 0,
      createdAt: serverTimestamp(),
    });
    await runTransaction(ref(db, `posts/${postId}/repostsCount`), (c) => (c || 0) + 1);
    await runTransaction(ref(db, `users/${me.uid}/repostsCount`), (c) => (c || 0) + 1);
    toast("Репост опубликован в твоей ленте");
  } catch (e) { toast("Не удалось репостнуть: " + (e.message || e)); }
}

// ------------------- NEW POST MODAL (3 steps) -------------------

let draft = { asType: "user", channelId: null, channelName: null, channelAvatar: null, text: "", imageFile: null, imageURL: null, file: null, fileURL: null, fileName: null };
let myChannelsCache = [];

async function fetchMyChannels() {
  const me = getMe();
  const snap = await get(query(ref(db, "channels"), orderByChild("ownerId"), equalTo(me.uid)));
  const channels = [];
  snap.forEach((c) => channels.push({ id: c.key, ...c.val() }));
  return channels;
}

function openNewPostModal() {
  draft = { asType: "user", channelId: null, channelName: null, channelAvatar: null, text: "", imageFile: null, imageURL: null, file: null, fileURL: null, fileName: null };
  renderPostStep(1);
  openModal("modal-new-post");
}

async function renderPostStep(step) {
  const me = getMe();
  const body = document.getElementById("modal-new-post-body");
  const dots = [1, 2, 3].map((n) => `<div class="dot-step ${n === step ? "active" : ""}"></div>`).join("");

  if (step === 1) {
    myChannelsCache = await fetchMyChannels();
  }

  if (step === 1) {
    body.innerHTML = `
      <div class="modal-head"><h3>Новый слайс</h3><button class="btn-ghost" id="np-close">✕</button></div>
      <div class="stepper">${dots}<span>Шаг 1 из 3 · Содержимое</span></div>
      <div class="modal-body">
        <div style="font-size:12px;color:var(--text-dim);font-weight:700;margin-bottom:8px;">От чьего лица</div>
        <div class="pub-choice">
          <div class="pub-choice-item ${draft.asType === "user" ? "checked" : ""}" data-as="user">
            <img src="${me?.avatarURL || ""}" /> ${escapeHtml(me?.displayName || "Личная страница")}
          </div>
          ${myChannelsCache.map((c) => `
            <div class="pub-choice-item ${draft.asType === "channel" && draft.channelId === c.id ? "checked" : ""}" data-as="channel" data-channel-id="${c.id}" data-channel-name="${escapeHtml(c.name)}" data-channel-avatar="${c.avatarURL || ""}">
              <img src="${c.avatarURL || ""}" /> ${escapeHtml(c.name)}
            </div>`).join("")}
          <div class="pub-choice-item" id="np-create-channel"><img class="icon icon--sm" src="${ICONS.createChannel}" /> Создать канал</div>
        </div>
        <div id="np-create-channel-form"></div>
        <textarea class="compose-textarea" id="np-text" placeholder="Что нового?">${draft.text}</textarea>
        <div id="np-image-zone">
          ${draft.imageURL ? `<div class="compose-preview"><img src="${draft.imageURL}" /><button class="remove-x" id="np-remove-image">✕</button></div>` : `
          <label class="pill-btn" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;">
            <img class="icon icon--sm" src="${ICONS.picture}" /> Прикрепить фото
            <input type="file" id="np-image-input" accept="image/*" class="hidden" />
          </label>`}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" id="np-cancel">Отмена</button>
        <button class="btn-accent" id="np-next1">Далее</button>
      </div>`;
    document.getElementById("np-close").onclick = () => closeModal("modal-new-post");
    document.getElementById("np-cancel").onclick = () => closeModal("modal-new-post");
    document.getElementById("np-text").oninput = (e) => (draft.text = e.target.value);

    body.querySelectorAll("[data-as]").forEach((n) => n.onclick = () => {
      if (n.dataset.as === "user") { draft.asType = "user"; draft.channelId = null; }
      else { draft.asType = "channel"; draft.channelId = n.dataset.channelId; draft.channelName = n.dataset.channelName; draft.channelAvatar = n.dataset.channelAvatar; }
      renderPostStep(1);
    });
    document.getElementById("np-create-channel").onclick = () => {
      document.getElementById("np-create-channel-form").innerHTML = `
        <div style="background:var(--surface-2);border-radius:var(--radius-m);padding:12px;margin:10px 0;">
          <div class="field"><label>Название канала</label><input type="text" id="nch-name" /></div>
          <div class="field"><label>@username канала</label><input type="text" id="nch-username" /></div>
          <div class="field"><label>Описание</label><input type="text" id="nch-desc" /></div>
          <button class="btn-accent" id="nch-create">Создать</button>
        </div>`;
      document.getElementById("nch-create").onclick = async () => {
        const name = document.getElementById("nch-name").value.trim();
        const username = document.getElementById("nch-username").value.trim().replace(/^@/, "").toLowerCase();
        const description = document.getElementById("nch-desc").value.trim();
        if (!name || !username) { toast("Укажи название и @username канала"); return; }
        const chRef = push(ref(db, "channels"));
        await set(chRef, {
          name, username, description, ownerId: me.uid, admins: { [me.uid]: true },
          avatarURL: "", subscribersCount: 0, createdAt: serverTimestamp(),
        });
        draft.asType = "channel"; draft.channelId = chRef.key; draft.channelName = name; draft.channelAvatar = "";
        toast("Канал создан!");
        renderPostStep(1);
      };
    };
    const imgInput = document.getElementById("np-image-input");
    if (imgInput) imgInput.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      draft.imageFile = file;
      renderPostStep(1);
      try {
        draft.imageURL = await uploadImage(file);
      } catch { toast("Не удалось загрузить фото"); draft.imageURL = null; }
      renderPostStep(1);
    };
    const rm = document.getElementById("np-remove-image");
    if (rm) rm.onclick = () => { draft.imageURL = null; draft.imageFile = null; renderPostStep(1); };
    document.getElementById("np-next1").onclick = () => renderPostStep(2);
  }

  if (step === 2) {
    body.innerHTML = `
      <div class="modal-head"><h3>Новый слайс</h3><button class="btn-ghost" id="np-close">✕</button></div>
      <div class="stepper">${dots}<span>Шаг 2 из 3 · Файл (опционально)</span></div>
      <div class="modal-body">
        ${draft.fileURL ? `
          <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);border-radius:var(--radius-m);padding:12px;">
            <img class="icon" src="${ICONS.file}" /><span style="flex:1;font-size:13px;">${escapeHtml(draft.fileName)}</span>
            <button id="np-remove-file" class="icon-btn">✕</button>
          </div>` : `
          <label class="pill-btn" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;">
            <img class="icon icon--sm" src="${ICONS.clip}" /> Прикрепить файл
            <input type="file" id="np-file-input" class="hidden" />
          </label>
          <p style="font-size:12px;color:var(--text-dim);margin-top:10px;">До ~8 МБ (бесплатный тариф, без Storage).</p>`}
        <div id="np-file-progress"></div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" id="np-back2">Назад</button>
        <button class="btn-accent" id="np-next2">Далее</button>
      </div>`;
    document.getElementById("np-close").onclick = () => closeModal("modal-new-post");
    document.getElementById("np-back2").onclick = () => renderPostStep(1);
    document.getElementById("np-next2").onclick = () => renderPostStep(3);
    const fInput = document.getElementById("np-file-input");
    if (fInput) fInput.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      draft.file = file; draft.fileName = file.name;
      document.getElementById("np-file-progress").innerHTML = `<div class="upload-ring">⋯</div>`;
      try {
        draft.fileURL = await uploadFile(file);
        toast("Файл загружен");
      } catch (err) { toast(err.message || "Не удалось загрузить файл"); draft.fileURL = null; }
      renderPostStep(2);
    };
    const rmF = document.getElementById("np-remove-file");
    if (rmF) rmF.onclick = () => { draft.file = null; draft.fileURL = null; draft.fileName = null; renderPostStep(2); };
  }

  if (step === 3) {
    const tags = extractHashtags(draft.text);
    const mentions = extractMentions(draft.text);
    body.innerHTML = `
      <div class="modal-head"><h3>Новый слайс</h3><button class="btn-ghost" id="np-close">✕</button></div>
      <div class="stepper">${dots}<span>Шаг 3 из 3 · Публикация</span></div>
      <div class="modal-body">
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">Хештеги и упоминания определяются прямо из текста (# и @).</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
          ${tags.map((t) => `<span class="pill-btn" style="background:var(--accent-dim);color:var(--accent);">#${escapeHtml(t)}</span>`).join("") || `<span style="color:var(--text-dim);font-size:12px;">Хештегов нет</span>`}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${mentions.map((m) => `<span class="pill-btn">@${escapeHtml(m)}</span>`).join("") || `<span style="color:var(--text-dim);font-size:12px;">Упоминаний нет</span>`}
        </div>
        ${draft.imageURL ? `<div class="compose-preview" style="margin-top:14px;"><img src="${draft.imageURL}" /></div>` : ""}
        ${draft.text ? `<p class="post-text" style="margin-top:14px;">${richText(draft.text)}</p>` : ""}
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" id="np-back3">Назад</button>
        <button class="btn-accent" id="np-publish" ${!draft.text && !draft.imageURL ? "disabled" : ""}>Опубликовать</button>
      </div>`;
    document.getElementById("np-close").onclick = () => closeModal("modal-new-post");
    document.getElementById("np-back3").onclick = () => renderPostStep(2);
    document.getElementById("np-publish").onclick = publishPost;
  }
}

async function publishPost() {
  const me = getMe(); if (!me) return;
  const btn = document.getElementById("np-publish");
  btn.disabled = true; btn.textContent = "Публикуем…";
  const asChannel = draft.asType === "channel" && draft.channelId;
  const newRef = push(ref(db, "posts"));
  await set(newRef, {
    authorId: asChannel ? draft.channelId : me.uid,
    ownerId: me.uid,
    isChannelPost: !!asChannel,
    authorName: asChannel ? draft.channelName : me.displayName,
    authorUsername: asChannel ? draft.channelName.toLowerCase().replace(/\s+/g, "") : me.username,
    authorAvatar: asChannel ? draft.channelAvatar : me.avatarURL,
    authorVerified: asChannel ? false : !!me.verified,
    text: draft.text || "", imageURL: draft.imageURL || "", fileURL: draft.fileURL || "", fileName: draft.fileName || "",
    hashtags: extractHashtags(draft.text || ""), mentions: extractMentions(draft.text || ""),
    likes: {}, likesCount: 0, views: {}, viewsCount: 0, commentsCount: 0, repostsCount: 0,
    createdAt: serverTimestamp(),
  });
  if (asChannel) await runTransaction(ref(db, `channels/${draft.channelId}/postsCount`), (c) => (c || 0) + 1);
  else await runTransaction(ref(db, `users/${me.uid}/postsCount`), (c) => (c || 0) + 1);
  closeModal("modal-new-post");
  toast("Слайс опубликован!");
}

// ------------------- COMMENTS / REPLIES -------------------

let currentPostId = null;
let replyTarget = null; // { commentId, username }

let pendingCommentImage = null;

export function openComments(postId) {
  currentPostId = postId;
  replyTarget = null;
  pendingCommentImage = null;
  renderCommentsShell();
  document.getElementById("comments-view").classList.add("active");
  loadComments(postId);
}

function renderCommentsShell() {
  const el = document.getElementById("comments-view");
  el.innerHTML = `
    <div class="comments-header">
      <span style="font-weight:800;">Комментарии</span>
      <button class="close-x" id="cm-close">✕</button>
    </div>
    <div class="comments-body" id="comments-body"></div>
    ${pendingCommentImage ? `
      <div style="max-width:640px;margin:0 auto;padding:0 16px;">
        <div class="compose-preview" style="max-width:140px;">
          <img src="${pendingCommentImage}" />
          <button class="remove-x" id="cm-remove-image">✕</button>
        </div>
      </div>` : ""}
    <div class="compose-bar">
      <input type="text" id="cm-input" placeholder="${replyTarget ? "Ответ для @" + replyTarget.username + "…" : "Написать комментарий…"}" />
      <label class="round-btn" style="cursor:pointer;"><img class="icon icon--sm" src="${ICONS.picture}" /><input type="file" accept="image/*" id="cm-attach" class="hidden" /></label>
      <button class="send" id="cm-send">Отпр.</button>
    </div>`;
  document.getElementById("cm-close").onclick = () => document.getElementById("comments-view").classList.remove("active");
  document.getElementById("cm-send").onclick = sendComment;
  document.getElementById("cm-input").addEventListener("keydown", (e) => { if (e.key === "Enter") sendComment(); });
  document.getElementById("cm-attach").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    toast("Загружаем фото…");
    try { pendingCommentImage = await uploadImage(file); renderCommentsShell(); }
    catch { toast("Не удалось загрузить фото"); }
  };
  const rm = document.getElementById("cm-remove-image");
  if (rm) rm.onclick = () => { pendingCommentImage = null; renderCommentsShell(); };
}

function loadComments(postId) {
  const q = query(ref(db, `comments/${postId}`), orderByChild("createdAt"));
  onValue(q, (snap) => {
    const comments = [];
    snap.forEach((c) => comments.push({ id: c.key, ...c.val() }));
    renderComments(comments, postId);
  });
}

async function renderComments(comments, postId) {
  const body = document.getElementById("comments-body");
  if (!comments.length) {
    body.innerHTML = `<div class="empty-state">Комментариев пока нет</div>`;
    return;
  }
  const parts = [];
  for (const c of comments) {
    parts.push(await renderComment(c, postId));
  }
  body.innerHTML = parts.join("");

  body.querySelectorAll("[data-c-like]").forEach((n) => n.onclick = () => toggleCommentLike(postId, n.dataset.cLike));
  body.querySelectorAll("[data-c-repost]").forEach((n) => n.onclick = () => repostComment(postId, n.dataset.cRepost));
  body.querySelectorAll("[data-c-reply]").forEach((n) => n.onclick = () => setReplyTarget(n.dataset.cReply, n.dataset.username));
  body.querySelectorAll("[data-r-like]").forEach((n) => n.onclick = () => toggleReplyLike(postId, n.dataset.commentId, n.dataset.rLike));
}

async function renderComment(c, postId) {
  const repliesSnap = await get(ref(db, `replies/${postId}/${c.id}`));
  let repliesHtml = "";
  if (repliesSnap.exists()) {
    const replies = [];
    repliesSnap.forEach((r) => replies.push({ id: r.key, ...r.val() }));
    replies.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    repliesHtml = replies.map((r) => `
      <div class="reply-item">
        <img class="reply-avatar" src="${r.authorAvatar || ""}" />
        <div>
          <b>${escapeHtml(r.authorName)}</b>
          ${r.replyToUsername ? `<span class="reply-to">→ @${escapeHtml(r.replyToUsername)}</span>` : ""}
          <div>${richText(r.text || "")}</div>
          ${r.imageURL ? `<img src="${r.imageURL}" style="max-width:140px;border-radius:10px;margin-top:6px;" />` : ""}
          <div class="comment-actions">
            <span data-r-like="${r.id}" data-comment-id="${c.id}">👍 ${fmtCount(r.likesCount || 0)}</span>
            <span data-c-reply="${c.id}" data-username="${escapeHtml(r.authorUsername || "")}">Ответить</span>
          </div>
        </div>
      </div>`).join("");
  }
  return `
    <div class="comment-item">
      <img class="comment-avatar" src="${c.authorAvatar || ""}" />
      <div class="comment-body">
        <div class="comment-name">${escapeHtml(c.authorName)}</div>
        <div class="comment-text">${richText(c.text || "")}</div>
        ${c.imageURL ? `<img src="${c.imageURL}" style="max-width:160px;border-radius:10px;margin-top:6px;" />` : ""}
        <div class="comment-actions">
          <span data-c-like="${c.id}">👍 ${fmtCount(c.likesCount || 0)}</span>
          <span data-c-repost="${c.id}">🔁 ${fmtCount(c.repostsCount || 0)}</span>
          <span data-c-reply="${c.id}" data-username="${escapeHtml(c.authorUsername || "")}">Ответить</span>
        </div>
        ${repliesHtml}
      </div>
    </div>`;
}

function setReplyTarget(commentId, username) {
  replyTarget = { commentId, username };
  renderCommentsShell();
  document.getElementById("cm-input").focus();
}

async function sendComment() {
  const me = getMe(); if (!me) return;
  const input = document.getElementById("cm-input");
  const text = input.value.trim();
  if (!text && !pendingCommentImage) return;
  input.value = "";
  const imageURL = pendingCommentImage;
  pendingCommentImage = null;

  if (replyTarget) {
    const rRef = push(ref(db, `replies/${currentPostId}/${replyTarget.commentId}`));
    await set(rRef, {
      authorId: me.uid, authorName: me.displayName, authorUsername: me.username, authorAvatar: me.avatarURL,
      text, imageURL: imageURL || "", replyToUsername: replyTarget.username, likes: {}, likesCount: 0, createdAt: serverTimestamp(),
    });
    replyTarget = null;
    renderCommentsShell();
  } else {
    const cRef = push(ref(db, `comments/${currentPostId}`));
    await set(cRef, {
      authorId: me.uid, authorName: me.displayName, authorUsername: me.username, authorAvatar: me.avatarURL,
      text, imageURL: imageURL || "", likes: {}, likesCount: 0, repostsCount: 0, createdAt: serverTimestamp(),
    });
    await runTransaction(ref(db, `posts/${currentPostId}/commentsCount`), (c) => (c || 0) + 1);
    renderCommentsShell();
  }
}

async function toggleCommentLike(postId, commentId) {
  const me = getMe(); if (!me) return;
  const r = ref(db, `comments/${postId}/${commentId}/likes/${me.uid}`);
  const snap = await get(r);
  if (snap.exists()) { await remove(r); await runTransaction(ref(db, `comments/${postId}/${commentId}/likesCount`), (c) => Math.max(0, (c || 1) - 1)); }
  else { await set(r, true); await runTransaction(ref(db, `comments/${postId}/${commentId}/likesCount`), (c) => (c || 0) + 1); }
}

async function toggleReplyLike(postId, commentId, replyId) {
  const me = getMe(); if (!me) return;
  const r = ref(db, `replies/${postId}/${commentId}/${replyId}/likes/${me.uid}`);
  const snap = await get(r);
  if (snap.exists()) { await remove(r); await runTransaction(ref(db, `replies/${postId}/${commentId}/${replyId}/likesCount`), (c) => Math.max(0, (c || 1) - 1)); }
  else { await set(r, true); await runTransaction(ref(db, `replies/${postId}/${commentId}/${replyId}/likesCount`), (c) => (c || 0) + 1); }
}

async function repostComment(postId, commentId) {
  toast("Комментарий репостнут");
  await runTransaction(ref(db, `comments/${postId}/${commentId}/repostsCount`), (c) => (c || 0) + 1);
}
