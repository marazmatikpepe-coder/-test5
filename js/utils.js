// js/utils.js
export function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// подсвечивает #хештеги и @упоминания в тексте
export function richText(str = "") {
  const escaped = escapeHtml(str);
  return escaped
    .replace(/#([а-яА-Яa-zA-Z0-9_]+)/g, '<span class="tag">#$1</span>')
    .replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention">@$1</span>');
}

export function toast(msg) {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function formatMessageDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();
  const beforeYest = new Date(now); beforeYest.setDate(now.getDate() - 2);
  const isBeforeYesterday = d.toDateString() === beforeYest.toDateString();

  if (isToday) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (isYesterday) return "вчера";
  if (isBeforeYesterday) return "позавчера";

  const diffDays = Math.round((now - d) / 86400000);
  if (diffDays < 7) return `в ${WEEKDAYS[d.getDay()]}`;

  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dateSepLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

export function timeShort(ts) {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function extractHashtags(text = "") {
  return [...text.matchAll(/#([а-яА-Яa-zA-Z0-9_]+)/g)].map((m) => m[1]);
}
export function extractMentions(text = "") {
  return [...text.matchAll(/@([a-zA-Z0-9_]+)/g)].map((m) => m[1]);
}

export function openModal(id) { document.getElementById(id).classList.add("active"); }
export function closeModal(id) { document.getElementById(id).classList.remove("active"); }

export function fmtCount(n = 0) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

export const REACTIONS = ["👍","❤️","👌","🤝","🙌","🔥","👏","🎉","🤩","🚀","😂","🤣","🤡","🤨","😢","😭","😱","🤯","😡","🤬","💩","🤮","🤔","🙏"];
