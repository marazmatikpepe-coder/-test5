// js/settings.js
import { db, ref, get, set, update, remove, signOut, auth, uploadImage } from "./firebase-config.js";
import { ICONS, WALLPAPERS } from "./icons.js";
import { escapeHtml, toast } from "./utils.js";
import { getMe, refreshMe } from "./main.js";

const LANGS = [
  ["ru", "Русский"], ["en", "English"], ["es", "Español"], ["zh", "中文"],
  ["ko", "한국어"], ["fr", "Français"], ["de", "Deutsch"],
];

export function initSettingsTab() {
  renderSettingsMain();
}

function root() { return document.getElementById("settings-content"); }

function header(title, onBack) {
  return `<div class="chats-header">
    ${onBack ? `<button class="icon-btn" id="st-back">←</button>` : ""}
    <h1>${title}</h1>
    <span></span>
  </div>`;
}

function bindBack(fn) {
  const b = document.getElementById("st-back");
  if (b) b.onclick = fn;
}

// ---------------- MAIN ----------------
function renderSettingsMain() {
  const me = getMe();
  root().innerHTML = `
    ${header("Настройки")}
    <div class="settings-list">
      <div class="settings-row" id="st-profile" style="cursor:pointer;">
        <img src="${me.avatarURL}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" />
        <div class="settings-row-main">
          <div class="settings-row-title">${escapeHtml(me.displayName)}</div>
          <div class="settings-row-sub">@${escapeHtml(me.username)} · ${escapeHtml(me.email || "")}</div>
        </div>
        <img class="icon chevron" src="${ICONS.edit}" />
      </div>

      <div class="settings-group-title">Общие</div>
      ${row("privacy", "Конфиденциальность", "Чёрный список, кто может писать", ICONS.privacy)}
      ${row("appearance", "Оформление", "Тема, цвет, обои", ICONS.palette)}
      ${row("notifications", "Уведомления", "Push, звуки, исключения", ICONS.notifSettings)}
      ${row("storage", "Хранилище", "Кеш, авто-скачивание", ICONS.storage)}
      ${row("power", "Энергосбережение", "Только на телефонах", ICONS.powerSaving)}
      ${row("language", "Язык", LANGS.find(l => l[0] === (me.settings?.language || "ru"))[1], ICONS.language)}
      ${row("devices", "Подключённые устройства", "Активные сессии", ICONS.devices)}

      <div class="settings-group-title"></div>
      <div class="settings-row" id="st-logout" style="cursor:pointer;color:var(--danger);">
        <div class="icon-wrap"><img class="icon icon--noinvert" src="${ICONS.blacklist}" /></div>
        <div class="settings-row-main"><div class="settings-row-title" style="color:var(--danger);">Выйти из аккаунта</div></div>
      </div>
    </div>`;

  function row(id, title, sub, icon) {
    return `<div class="settings-row" data-go="${id}" style="cursor:pointer;">
      <div class="icon-wrap"><img class="icon" src="${icon}" /></div>
      <div class="settings-row-main"><div class="settings-row-title">${title}</div><div class="settings-row-sub">${sub}</div></div>
      <span class="chevron">›</span>
    </div>`;
  }

  root().querySelectorAll("[data-go]").forEach((n) => n.onclick = () => {
    const map = {
      privacy: renderPrivacy, appearance: renderAppearance, notifications: renderNotifications,
      storage: renderStorage, power: renderPower, language: renderLanguage, devices: renderDevices,
    };
    map[n.dataset.go]();
  });
  document.getElementById("st-profile").onclick = () => toast("Открой вкладку Профиль → «Редактировать профиль»");
  document.getElementById("st-logout").onclick = () => signOut(auth);
}

function switchRow(checked) {
  return `<div class="switch ${checked ? "on" : ""}"></div>`;
}

function bindSwitch(el, path, currentVal, onChange) {
  const sw = el.querySelector(".switch");
  el.onclick = async () => {
    const now = !sw.classList.contains("on");
    sw.classList.toggle("on", now);
    if (onChange) await onChange(now);
  };
}

// ---------------- PRIVACY ----------------
function renderPrivacy() {
  const me = getMe();
  const p = me.privacy || {};
  const fields = [
    ["whoCanMessage", "Кто может мне писать"],
    ["whoCanSeeAvatar", "Кто видит аватарку"],
    ["whoCanSeeName", "Кто видит имя"],
    ["whoCanSeeBio", "Кто видит описание"],
    ["whoCanAddToGroups", "Кто может добавлять в группы"],
    ["whoCanSendPhotos", "Кто может отправлять мне фото"],
    ["whoCanCall", "Кто может мне звонить"],
  ];
  root().innerHTML = `
    ${header("Конфиденциальность", true)}
    <div class="settings-list">
      <div class="settings-row" id="st-blacklist" style="cursor:pointer;">
        <div class="icon-wrap"><img class="icon icon--noinvert" src="${ICONS.blacklist}" /></div>
        <div class="settings-row-main"><div class="settings-row-title">Чёрный список</div><div class="settings-row-sub">Заблокированные пользователи</div></div>
        <span class="chevron">›</span>
      </div>
      <div class="settings-group-title">Кто что видит</div>
      ${fields.map(([key, label]) => `
        <div class="settings-row" data-field="${key}" style="cursor:pointer;">
          <div class="settings-row-main">
            <div class="settings-row-title">${label}</div>
            <div class="settings-row-sub">${labelFor(p[key])}</div>
          </div>
          <span class="chevron">›</span>
        </div>`).join("")}
    </div>`;
  bindBack(renderSettingsMain);
  document.getElementById("st-blacklist").onclick = renderBlacklist;
  root().querySelectorAll("[data-field]").forEach((n) => n.onclick = () => renderPrivacyField(n.dataset.field, fields.find(f => f[0] === n.dataset.field)[1]));

  function labelFor(v) { return { none: "Никто", contacts: "Контакты", all: "Все" }[v] || "Все"; }
}

function renderPrivacyField(key, label) {
  const me = getMe();
  const current = me.privacy?.[key] || "all";
  root().innerHTML = `
    ${header(label, true)}
    <div class="settings-list">
      ${["none", "contacts", "all"].map((v) => `
        <div class="radio-row" data-v="${v}" style="cursor:pointer;">
          <div class="radio-dot ${current === v ? "checked" : ""}"></div>
          <span>${{ none: "Никто", contacts: "Контакты", all: "Все" }[v]}</span>
        </div>`).join("")}
      <div class="settings-row" id="st-exceptions" style="cursor:pointer;margin-top:10px;">
        <div class="settings-row-main"><div class="settings-row-title">✏️ Настроить исключения</div></div>
        <span class="chevron">›</span>
      </div>
    </div>`;
  bindBack(renderPrivacy);
  root().querySelectorAll("[data-v]").forEach((n) => n.onclick = async () => {
    await update(ref(db, `users/${me.uid}/privacy`), { [key]: n.dataset.v });
    await refreshMe();
    renderPrivacyField(key, label);
  });
  document.getElementById("st-exceptions").onclick = () => toast("Список исключений — добавь @username кому сделать исключение (скоро полноценный UI)");
}

async function renderBlacklist() {
  const me = getMe();
  const snap = await get(ref(db, `users/${me.uid}/blacklist`));
  const list = snap.exists() ? Object.keys(snap.val()) : [];
  root().innerHTML = `
    ${header("Чёрный список", true)}
    <div class="settings-list">
      <div class="field" style="padding:0 12px;"><label>Добавить @username</label>
        <div style="display:flex;gap:8px;"><input type="text" id="bl-add" style="flex:1;padding:11px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);" /><button class="btn-accent" id="bl-add-btn">Добавить</button></div>
      </div>
      ${list.length ? list.map((u) => `
        <div class="settings-row">
          <div class="settings-row-main"><div class="settings-row-title">@${escapeHtml(u)}</div></div>
          <button class="pill-btn" data-remove="${u}">Убрать</button>
        </div>`).join("") : `<div class="empty-state">Чёрный список пуст</div>`}
    </div>`;
  bindBack(renderPrivacy);
  document.getElementById("bl-add-btn").onclick = async () => {
    const u = document.getElementById("bl-add").value.trim().replace(/^@/, "");
    if (!u) return;
    await set(ref(db, `users/${me.uid}/blacklist/${u}`), true);
    toast(`@${u} добавлен в чёрный список`);
    renderBlacklist();
  };
  root().querySelectorAll("[data-remove]").forEach((b) => b.onclick = async () => {
    await remove(ref(db, `users/${me.uid}/blacklist/${b.dataset.remove}`));
    renderBlacklist();
  });
}

// ---------------- APPEARANCE ----------------
function renderAppearance() {
  const me = getMe();
  const s = me.settings || {};
  const theme = s.theme || "dark";
  const color = s.color || "green";
  root().innerHTML = `
    ${header("Оформление", true)}
    <div class="settings-list">
      <div class="settings-group-title">Тема</div>
      ${["light", "dark", "system"].map((t) => `
        <div class="radio-row" data-theme-v="${t}" style="cursor:pointer;">
          <div class="radio-dot ${theme === t ? "checked" : ""}"></div>
          <span>${{ light: "Светлая", dark: "Тёмная", system: "Системная" }[t]}</span>
        </div>`).join("")}
      <div class="settings-group-title">Цвет темы</div>
      <div style="display:flex;gap:14px;padding:10px 12px;">
        ${["green", "turquoise", "blue", "purple"].map((c) => `
          <button class="color-swatch ${color === c ? "checked" : ""}" data-color-v="${c}" style="background:${{ green: "#34c266", turquoise: "#22b8ba", blue: "#3d8bf5", purple: "#8b5cf6" }[c]};"></button>`).join("")}
      </div>
      <div class="settings-group-title">Обои чата</div>
      <div class="settings-row" data-wp="auto" style="cursor:pointer;"><div class="settings-row-main"><div class="settings-row-title">В зависимости от цвета</div></div></div>
      <div class="settings-row" data-wp="dark" style="cursor:pointer;"><div class="settings-row-main"><div class="settings-row-title">Обои тёмной темы</div></div></div>
      <div class="settings-row" data-wp="light" style="cursor:pointer;"><div class="settings-row-main"><div class="settings-row-title">Обои светлой темы</div></div></div>
      <label class="settings-row" style="cursor:pointer;"><div class="settings-row-main"><div class="settings-row-title">Свои обои: загрузить</div></div><input type="file" class="hidden" id="wp-upload" accept="image/*" /></label>
    </div>`;
  bindBack(renderSettingsMain);
  root().querySelectorAll("[data-theme-v]").forEach((n) => n.onclick = async () => {
    document.documentElement.dataset.theme = n.dataset.themeV === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : n.dataset.themeV;
    await update(ref(db, `users/${me.uid}/settings`), { theme: n.dataset.themeV });
    await refreshMe(); renderAppearance();
  });
  root().querySelectorAll("[data-color-v]").forEach((n) => n.onclick = async () => {
    document.documentElement.dataset.color = n.dataset.colorV;
    await update(ref(db, `users/${me.uid}/settings`), { color: n.dataset.colorV });
    await refreshMe(); renderAppearance();
  });
  root().querySelectorAll("[data-wp]").forEach((n) => n.onclick = async () => {
    await update(ref(db, `users/${me.uid}/settings/wallpaper`), { mode: n.dataset.wp });
    await refreshMe();
    toast("Обои применены — открой любой чат, чтобы увидеть");
  });
  document.getElementById("wp-upload").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    toast("Загружаем обои…");
    try {
      const url = await uploadImage(f);
      await update(ref(db, `users/${me.uid}/settings/wallpaper`), { mode: "custom", customURL: url });
      await refreshMe();
      toast("Свои обои загружены и применены");
    } catch { toast("Не удалось загрузить обои"); }
  };
}

// ---------------- NOTIFICATIONS ----------------
function renderNotifications() {
  const me = getMe();
  const n = me.settings?.notifications || {};
  root().innerHTML = `
    ${header("Уведомления", true)}
    <div class="settings-list">
      ${toggle("enabled", "Уведомления", n.enabled !== false)}
      ${toggle("showText", "Показывать текст в уведомлениях", n.showText !== false)}
      ${toggle("showSenderInfo", "Показывать аватарку и имя отправителя", n.showSenderInfo !== false)}
      <div class="settings-group-title">Показывать уведомления от</div>
      ${toggle("chats", "Чатов", n.chats !== false)}
      ${toggle("channels", "Каналов", n.channels !== false)}
      ${toggle("groups", "Групп", n.groups !== false)}
      ${toggle("newPostsFromSubs", "Новых постов моих подписок", n.newPostsFromSubs !== false)}
      <div class="settings-row" id="nt-always" style="cursor:pointer;"><div class="settings-row-main"><div class="settings-row-title">✏️ Всегда получать (даже если всё заглушено)</div></div></div>
      <div class="settings-row" id="nt-never" style="cursor:pointer;"><div class="settings-row-main"><div class="settings-row-title">✏️ Никогда не показывать</div></div></div>
    </div>`;
  bindBack(renderSettingsMain);
  root().querySelectorAll("[data-toggle]").forEach((el) => bindSwitch(el, null, null, async (v) => {
    await update(ref(db, `users/${me.uid}/settings/notifications`), { [el.dataset.toggle]: v });
    await refreshMe();
  }));
  document.getElementById("nt-always").onclick = () => toast("Добавь @username — исключения будут получать уведомления всегда");
  document.getElementById("nt-never").onclick = () => toast("Добавь @username — от них уведомлений не будет никогда");

  function toggle(key, label, val) {
    return `<div class="settings-row" data-toggle="${key}">
      <div class="settings-row-main"><div class="settings-row-title">${label}</div></div>
      ${switchRow(val)}
    </div>`;
  }
}

// ---------------- STORAGE ----------------
function renderStorage() {
  const me = getMe();
  const dl = me.settings?.autoDownload || { contacts: true, groups: true, channels: false };
  root().innerHTML = `
    ${header("Хранилище", true)}
    <div class="settings-list">
      <div class="settings-row" id="st-clear-cache" style="cursor:pointer;">
        <div class="settings-row-main"><div class="settings-row-title">Очистить кеш</div><div class="settings-row-sub">Освободить место на устройстве</div></div>
      </div>
      <div class="settings-group-title">Авто-скачивание фото</div>
      ${["contacts", "groups", "channels"].map((k) => `
        <div class="settings-row" data-dl="${k}">
          <div class="settings-row-main"><div class="settings-row-title">${{ contacts: "Контакты", groups: "Группы", channels: "Каналы" }[k]}</div></div>
          ${switchRow(dl[k])}
        </div>`).join("")}
    </div>`;
  bindBack(renderSettingsMain);
  document.getElementById("st-clear-cache").onclick = () => toast("Кеш очищен");
  root().querySelectorAll("[data-dl]").forEach((el) => bindSwitch(el, null, null, async (v) => {
    await update(ref(db, `users/${me.uid}/settings/autoDownload`), { [el.dataset.dl]: v });
    await refreshMe();
  }));
}

// ---------------- POWER SAVING ----------------
function renderPower() {
  const me = getMe();
  const p = me.settings?.powerSaving || { enabled: false, threshold: 20, noGlass: false, noAnim: false, reduceNetwork: false, loadSpeed: 100 };
  root().innerHTML = `
    ${header("Энергосбережение", true)}
    <div class="settings-list">
      <div class="settings-row" data-toggle-p="enabled"><div class="settings-row-main"><div class="settings-row-title">Включать энергосбережение автоматически</div><div class="settings-row-sub">Когда заряд ниже порога</div></div>${switchRow(p.enabled)}</div>
      <div class="slider-row">
        <div class="settings-row-sub" style="margin-bottom:6px;">Порог: ${p.threshold}%</div>
        <input type="range" min="10" max="50" value="${p.threshold}" id="pw-threshold" />
      </div>
      <div class="settings-group-title">Настройки при энергосбережении</div>
      <div class="settings-row" data-toggle-p="noGlass"><div class="settings-row-main"><div class="settings-row-title">Отключить жидкое стекло</div></div>${switchRow(p.noGlass)}</div>
      <div class="settings-row" data-toggle-p="noAnim"><div class="settings-row-main"><div class="settings-row-title">Анимации</div></div>${switchRow(!p.noAnim)}</div>
      <div class="settings-row" data-toggle-p="reduceNetwork"><div class="settings-row-main"><div class="settings-row-title">Снизить потребление сети</div></div>${switchRow(p.reduceNetwork)}</div>
      <div class="slider-row">
        <div class="settings-row-sub" style="margin-bottom:6px;">Скорость загрузки: ${p.loadSpeed}%</div>
        <input type="range" min="10" max="70" value="${p.loadSpeed}" id="pw-speed" />
      </div>
    </div>`;
  bindBack(renderSettingsMain);
  root().querySelectorAll("[data-toggle-p]").forEach((el) => bindSwitch(el, null, null, async (v) => {
    const key = el.dataset.toggleP;
    await update(ref(db, `users/${me.uid}/settings/powerSaving`), { [key]: key === "noAnim" ? !v : v });
    await refreshMe();
  }));
  document.getElementById("pw-threshold").onchange = async (e) => { await update(ref(db, `users/${me.uid}/settings/powerSaving`), { threshold: Number(e.target.value) }); await refreshMe(); renderPower(); };
  document.getElementById("pw-speed").onchange = async (e) => { await update(ref(db, `users/${me.uid}/settings/powerSaving`), { loadSpeed: Number(e.target.value) }); await refreshMe(); renderPower(); };
}

// ---------------- LANGUAGE ----------------
function renderLanguage() {
  const me = getMe();
  const current = me.settings?.language || "ru";
  root().innerHTML = `
    ${header("Язык", true)}
    <div class="settings-list">
      ${LANGS.map(([code, label]) => `
        <div class="radio-row" data-lang="${code}" style="cursor:pointer;">
          <div class="radio-dot ${current === code ? "checked" : ""}"></div><span>${label}</span>
        </div>`).join("")}
    </div>`;
  bindBack(renderSettingsMain);
  root().querySelectorAll("[data-lang]").forEach((n) => n.onclick = async () => {
    await update(ref(db, `users/${me.uid}/settings`), { language: n.dataset.lang });
    await refreshMe(); renderLanguage();
    toast("Полный перевод интерфейса появится позже — сейчас сохранён выбор языка");
  });
}

// ---------------- DEVICES ----------------
async function renderDevices() {
  root().innerHTML = `${header("Подключённые устройства", true)}<div class="settings-list" id="dev-list"></div>`;
  bindBack(renderSettingsMain);
  const list = document.getElementById("dev-list");
  const thisDevice = { name: navigator.platform || "Этот браузер", info: navigator.userAgent.split(") ")[0].split(" (")[1] || "", current: true };
  list.innerHTML = `
    <div class="settings-row">
      <div class="icon-wrap"><img class="icon" src="${ICONS.devices}" /></div>
      <div class="settings-row-main"><div class="settings-row-title">${escapeHtml(thisDevice.name)} · сейчас</div><div class="settings-row-sub">Текущая сессия</div></div>
    </div>
    <div class="empty-state">Другие сессии появятся здесь при входе с других устройств</div>`;
}

export function applyThemeFromUser(me) {
  const s = me.settings || {};
  const theme = s.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : (s.theme || "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.color = s.color || "green";
}
