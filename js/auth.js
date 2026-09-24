// js/auth.js
import {
  auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile, ref, set, get, serverTimestamp,
  googleProvider, signInWithPopup,
} from "./firebase-config.js";
import { DEFAULT_AVATARS } from "./icons.js";
import { toast } from "./utils.js";

const $ = (id) => document.getElementById(id);

export function initAuthScreen() {
  // tabs
  $("tab-login").onclick = () => switchAuthStep("step-login", "tab-login");
  $("tab-register").onclick = () => switchAuthStep("step-register", "tab-register");
  $("link-forgot").onclick = () => showStep("step-forgot");
  $("link-back-login").onclick = () => switchAuthStep("step-login", "tab-login");

  $("btn-login").onclick = onLogin;
  $("btn-register").onclick = onRegister;
  $("btn-forgot").onclick = onForgot;
  const googleBtn = $("btn-google");
  if (googleBtn) googleBtn.onclick = onGoogleLogin;

  ["login-email", "login-password"].forEach((id) =>
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") onLogin(); })
  );
}

function switchAuthStep(stepId, tabId) {
  document.querySelectorAll(".auth-tabs button").forEach((b) => b.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  showStep(stepId);
}
function showStep(stepId) {
  document.querySelectorAll(".auth-step").forEach((s) => s.classList.remove("active"));
  document.getElementById(stepId).classList.add("active");
}

async function onGoogleLogin() {
  $("login-error").textContent = "";
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const existing = await get(ref(db, `users/${user.uid}`));
    if (!existing.exists()) {
      const baseUsername = (user.email || user.displayName || "user").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") || "user";
      let username = baseUsername;
      let suffix = 0;
      while ((await get(ref(db, `usernames/${username}`))).exists()) {
        suffix += 1;
        username = `${baseUsername}${suffix}`;
      }
      await set(ref(db, `users/${user.uid}`), {
        uid: user.uid, displayName: user.displayName || "Пользователь", username, email: user.email || "",
        bio: "", avatarURL: user.photoURL || "", bannerURL: "",
        followersCount: 0, followingCount: 0, postsCount: 0, likesCount: 0, repostsCount: 0,
        isAdmin: false, verified: false,
        privacy: {
          whoCanMessage: "all", whoCanSeeAvatar: "all", whoCanSeeName: "all",
          whoCanSeeBio: "all", whoCanAddToGroups: "all", whoCanSendPhotos: "all", whoCanCall: "all",
        },
        settings: {
          theme: "dark", color: "green", language: "ru",
          notifications: { enabled: true, showText: true, showSenderInfo: true, chats: true, channels: true, groups: true, newPostsFromSubs: true },
          powerSaving: { enabled: false, threshold: 20, noGlass: false, noAnim: false, reduceNetwork: false, loadSpeed: 100 },
        },
        createdAt: serverTimestamp(),
      });
      await set(ref(db, `usernames/${username}`), user.uid);
      toast("Аккаунт создан через Google! Добро пожаловать в K 🎉");
    }
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user") $("login-error").textContent = mapAuthError(e);
  }
}

async function onLogin() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  $("login-error").textContent = "";
  if (!email || !password) { $("login-error").textContent = "Заполни email и пароль"; return; }
  $("btn-login").disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    $("login-error").textContent = mapAuthError(e);
  } finally {
    $("btn-login").disabled = false;
  }
}

async function onRegister() {
  const name = $("reg-name").value.trim();
  const username = $("reg-username").value.trim().replace(/^@/, "");
  const email = $("reg-email").value.trim();
  const password = $("reg-password").value;
  $("register-error").textContent = "";

  if (!name || !username || !email || !password) {
    $("register-error").textContent = "Заполни все поля"; return;
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    $("register-error").textContent = "@username: только латиница, цифры, _ (3–20 симв.)"; return;
  }
  $("btn-register").disabled = true;
  try {
    // проверка уникальности username
    const takenSnap = await get(ref(db, `usernames/${username.toLowerCase()}`));
    if (takenSnap.exists()) {
      $("register-error").textContent = "Этот @username уже занят";
      $("btn-register").disabled = false;
      return;
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    await updateProfile(cred.user, { displayName: name });

    const avatarURL = DEFAULT_AVATARS.user.dark;
    await set(ref(db, `users/${uid}`), {
      uid, displayName: name, username: username.toLowerCase(), email,
      bio: "", avatarURL, bannerURL: "",
      followersCount: 0, followingCount: 0, postsCount: 0, likesCount: 0, repostsCount: 0,
      isAdmin: false, verified: false,
      privacy: {
        whoCanMessage: "all", whoCanSeeAvatar: "all", whoCanSeeName: "all",
        whoCanSeeBio: "all", whoCanAddToGroups: "all", whoCanSendPhotos: "all", whoCanCall: "all",
      },
      settings: {
        theme: "dark", color: "green", language: "ru",
        notifications: { enabled: true, showText: true, showSenderInfo: true, chats: true, channels: true, groups: true, newPostsFromSubs: true },
        powerSaving: { enabled: false, threshold: 20, noGlass: false, noAnim: false, reduceNetwork: false, loadSpeed: 100 },
      },
      createdAt: serverTimestamp(),
    });
    await set(ref(db, `usernames/${username.toLowerCase()}`), uid);
    toast("Аккаунт создан! Добро пожаловать в K 🎉");
  } catch (e) {
    $("register-error").textContent = mapAuthError(e);
  } finally {
    $("btn-register").disabled = false;
  }
}

async function onForgot() {
  const email = $("forgot-email").value.trim();
  $("forgot-error").textContent = "";
  if (!email) { $("forgot-error").textContent = "Укажи email"; return; }
  $("btn-forgot").disabled = true;
  try {
    // NB: код-на-почту требует backend/email-сервис (см. пояснение в чате).
    // Пока используем встроенный механизм Firebase — письмо со ссылкой сброса.
    await sendPasswordResetEmail(auth, email);
    toast("Письмо со ссылкой для сброса пароля отправлено");
    switchAuthStep("step-login", "tab-login");
  } catch (e) {
    $("forgot-error").textContent = mapAuthError(e);
  } finally {
    $("btn-forgot").disabled = false;
  }
}

function mapAuthError(e) {
  const code = e.code || "";
  const map = {
    "auth/email-already-in-use": "Этот email уже зарегистрирован",
    "auth/invalid-email": "Некорректный email",
    "auth/weak-password": "Пароль слишком слабый (минимум 6 символов)",
    "auth/user-not-found": "Пользователь не найден",
    "auth/wrong-password": "Неверный пароль",
    "auth/invalid-credential": "Неверный email или пароль",
    "auth/too-many-requests": "Слишком много попыток. Попробуй позже",
  };
  return map[code] || "Что-то пошло не так, попробуй ещё раз";
}
