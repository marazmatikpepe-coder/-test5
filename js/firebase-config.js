// js/firebase-config.js
// Firebase (client-side) config. apiKey etc. are safe to ship in client JS —
// Firebase security relies on Realtime Database Rules, not on secrecy of this object.
// The FCM *server* key is intentionally NOT used here — server keys must never
// live in client code. Push sending should go through a Cloud Function later.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getDatabase,
  ref, set, get, update, remove, push, increment,
  onValue, off, query, orderByChild, orderByKey,
  equalTo, limitToLast, serverTimestamp, runTransaction, onDisconnect,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB1V930G7IxvdFkDx66ZOkd0CJT3Np0jII",
  authDomain: "k-messenger-14830.firebaseapp.com",
  databaseURL: "https://k-messenger-14830-default-rtdb.firebaseio.com",
  projectId: "k-messenger-14830",
  storageBucket: "k-messenger-14830.firebasestorage.app",
  messagingSenderId: "138703805707",
  appId: "1:138703805707:web:ebb5ebd66dd8f36418960e",
  measurementId: "G-590SELTJHN",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

export {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, onAuthStateChanged, updateProfile,
  signInWithPopup,
  ref, set, get, update, remove, push, increment, onValue, off, query,
  orderByChild, orderByKey, equalTo, limitToLast, serverTimestamp, runTransaction,
  onDisconnect,
};

// ---- Media upload helpers ----
// Storage требует платный тариф Blaze, на него сейчас не переходим.
// Фото продолжают грузиться через ImgBB (бесплатно, поддерживает CORS).
// Для файлов/голосовых/видео-кружков используем приём из старого проекта:
// небольшие файлы (до ~8 МБ) кодируем в base64 и храним прямо внутри
// сообщения в Realtime Database — бесплатно, без сторонних сервисов.

const IMGBB_API_KEY = "ec0a0f24ab99ee5dbb0efab97e127310";
const BASE64_MAX_SIZE = 8 * 1024 * 1024; // ~8 МБ с запасом под лимиты записи RTDB

export async function uploadImage(file, onProgress) {
  const base64 = await fileToBase64(file);
  const form = new FormData();
  form.append("key", IMGBB_API_KEY);
  form.append("image", base64.split(",")[1]);
  const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
  if (onProgress) onProgress(100);
  const data = await res.json();
  if (!data.success) throw new Error("Не удалось загрузить изображение");
  return data.data.url;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Файлы/голосовые/видео-кружки — как data:-ссылка (base64), с ограничением размера
export async function uploadFile(file) {
  if (file.size > BASE64_MAX_SIZE) throw new Error("Файл слишком большой (максимум ~8 МБ на бесплатном тарифе)");
  return fileToBase64(file);
}
export async function uploadAudio(blob) {
  if (blob.size > BASE64_MAX_SIZE) throw new Error("Запись слишком длинная (максимум ~8 МБ)");
  const file = new File([blob], `voice_${Date.now()}.webm`, { type: blob.type || "audio/webm" });
  return fileToBase64(file);
}
export async function uploadVideoNote(blob) {
  if (blob.size > BASE64_MAX_SIZE) throw new Error("Видео-кружок слишком длинный (максимум ~8 МБ)");
  const file = new File([blob], `video_${Date.now()}.webm`, { type: blob.type || "video/webm" });
  return fileToBase64(file);
}
