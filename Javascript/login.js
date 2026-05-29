/* =========================================================
   ScholarsConnect Login Script
   Firebase auth — Email/Password + Google Sign-In
========================================================= */
import {
  auth, db, googleProvider,
  signInWithEmailAndPassword, signInWithRedirect, getRedirectResult,
  doc, getDoc, setDoc, addDoc, serverTimestamp,
  collection, getDocs, query, where, limit
} from "./firebase.js";

/* Set to false when deploying to production with real email verification */
const USE_LOCAL_DEMO = true;

document.addEventListener("DOMContentLoaded", async function () {
  /* Show session-expired message if redirected here after inactivity timeout */
  if (new URLSearchParams(window.location.search).get("timeout") === "1") {
    showError("Session expired for security. Please log in again.");
  }

  initPasswordToggle();
  initNormalLogin();
  initGooglePicker();

  /* Handle return from Google redirect sign-in */
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      await ensureUserDoc(result.user);
      await routeByRole(result.user);
    }
  } catch (err) {
    if (err.code && err.code !== "auth/popup-closed-by-user") {
      showError(authErrorMessage(err.code));
    }
  }
});

/* ── Helpers ── */
function getEl(id) { return document.getElementById(id); }

function showError(message) {
  const alert = getEl("error-alert");
  const msg   = getEl("error-msg");
  if (msg)   msg.textContent = message;
  if (alert) alert.classList.add("show");
}

function hideError() {
  const alert = getEl("error-alert");
  if (alert) alert.classList.remove("show");
}

function setLoading(button, isLoading) {
  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);
}

function normalizeRole(rawRole) {
  return String(rawRole || "").trim().toLowerCase();
}

function isAllowedRole(role) {
  return role === "admin" || role === "student";
}

/* ── Auth error messages ── */
function authErrorMessage(code) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-email":
      return "Invalid email or password. Please try again.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact the administrator.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/unauthorized-domain":
      return "Sign-in is not allowed from this address. Please use the official portal URL.";
    default:
      return "Sign-in failed (" + (code || "unknown") + "). Please try again.";
  }
}

/* ── Route by role after login ── */
async function routeByRole(user) {
  sessionStorage.removeItem("sc_role");
  sessionStorage.removeItem("sc_uid");
  sessionStorage.removeItem("sc_email");
  sessionStorage.removeItem("sc_admin_verified");
  sessionStorage.removeItem("sc_student_verified");

  async function fetchRole() {
    let userDoc = null;
    const snap = await getDoc(doc(db, "users", user.uid));

    if (snap.exists()) {
      userDoc = snap.data();
    } else if (user.email) {
      const emailSnap = await getDocs(query(
        collection(db, "users"),
        where("email", "==", user.email),
        limit(1)
      ));
      userDoc = emailSnap.empty ? null : emailSnap.docs[0].data();
    }

    const rawRole = userDoc?.role || "";
    return normalizeRole(rawRole);
  }

  let role = "";
  try {
    role = await fetchRole();
  } catch (e) {
    /* First attempt failed — auth token may not have propagated yet. Retry once. */
    await new Promise(function (r) { setTimeout(r, 800); });
    try {
      role = await fetchRole();
    } catch (e2) {
      const code = e2?.code || "";
      if (code === "permission-denied" || code === "firestore/permission-denied") {
        showError("Could not verify your account. Please try again or contact support.");
      } else if (code === "unavailable" || code.includes("network")) {
        showError("Network error while verifying account. Check your connection.");
      } else {
        showError("Account verification failed. Please try again.");
      }
      return false;
    }
  }

  if (!isAllowedRole(role)) {
    showError("Your account is not set up yet. Please contact the administrator to assign your role.");
    return false;
  }

  /* ── Block unverified student emails (skipped in demo mode) ── */
  if (!USE_LOCAL_DEMO && role === "student" && !user.emailVerified) {
    showError("Please verify your email before continuing. Check your inbox for the verification link.");
    return false;
  }

  sessionStorage.setItem("sc_role",  role);
  sessionStorage.setItem("sc_email", user.email || "");
  sessionStorage.setItem("sc_uid",   user.uid);

  if (role === "admin") {
    window.location.href = "securityverificationadmin.html";
  } else {
    /* Student goes to security verification before dashboard */
    sessionStorage.removeItem("sc_student_verified");
    try {
      await addDoc(collection(db, "auditLogs"), {
        action:    "student_login",
        userId:    user.uid,
        email:     user.email || "",
        createdAt: serverTimestamp()
      });
    } catch (_) {}
    window.location.href = "securityverification.html";
  }
  return true;
}

/* ── Password Toggle ── */
function initPasswordToggle() {
  const input  = getEl("inp-pass");
  const btn    = getEl("toggle-pass");
  const icon   = getEl("pass-icon");

  if (!input || !btn || !icon) return;

  btn.addEventListener("click", function () {
    const show = input.type === "password";
    input.type  = show ? "text" : "password";
    icon.className = show ? "bi bi-eye" : "bi bi-eye-slash";
  });
}

/* ── Normal Login ── */
function initNormalLogin() {
  const loginBtn  = getEl("btn-login");
  const emailInp  = getEl("inp-email");
  const passInp   = getEl("inp-pass");

  if (!loginBtn || !emailInp || !passInp) return;

  loginBtn.addEventListener("click", function (e) {
    e.preventDefault();
    handleLogin();
  });

  [emailInp, passInp].forEach(function (inp) {
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); handleLogin(); }
    });
  });

  async function handleLogin() {
    const email    = emailInp.value.trim().toLowerCase();
    const password = passInp.value;

    hideError();

    if (!email || !password) {
      showError("Please enter your email and password.");
      return;
    }

    setLoading(loginBtn, true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const routed = await routeByRole(cred.user);
      if (!routed) {
        setLoading(loginBtn, false);
      }
    } catch (err) {
      setLoading(loginBtn, false);
      showError(authErrorMessage(err.code));
    }
  }
}

/* ── Create Firestore user doc for new Google sign-ins ── */
async function ensureUserDoc(user) {
  const ref  = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const name = (user.displayName || "").split(" ");
    await setDoc(ref, {
      role:       "student",
      email:      user.email,
      firstName:  name[0] || "",
      lastName:   name.slice(1).join(" ") || "",
      photoURL:   user.photoURL || null,
      createdAt:  serverTimestamp()
    });
  }
}

/* ── Google Account Picker ── */
function initGooglePicker() {
  const overlay    = getEl("googlePickerOverlay");
  const gpView1    = getEl("gpView1");
  const gpView2    = getEl("gpView2");
  const gpLoading  = getEl("gpLoading");
  const gpEmailInp = getEl("gpEmailInput");
  const gpEmailErr = getEl("gpEmailError");
  const btnGoogle  = getEl("btnGoogle");
  const gpClose    = getEl("gpClose");
  const gpAccount  = getEl("gpAccount");
  const gpContinue = getEl("gpContinue");
  const gpOther    = getEl("gpOther");
  const gpBack     = getEl("gpBack");
  const gpEmailNext = getEl("gpEmailNext");

  if (!overlay || !gpView1 || !gpView2 || !gpLoading || !gpEmailInp || !btnGoogle) return;

  function openPicker()  { showView(1); gpLoading.classList.remove("show"); overlay.classList.add("show"); }
  function closePicker() { overlay.classList.remove("show"); }

  function showView(n) {
    gpView1.style.display = n === 1 ? "" : "none";
    gpView2.style.display = n === 2 ? "" : "none";
  }

  async function signInGoogle() {
    gpLoading.classList.add("show");
    try {
      await signInWithRedirect(auth, googleProvider);
      /* Page navigates away — getRedirectResult handles the return */
    } catch (err) {
      gpLoading.classList.remove("show");
      closePicker();
      showError(authErrorMessage(err.code));
    }
  }

  function validateAndSignIn() {
    const email = gpEmailInp.value.trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    gpEmailInp.classList.toggle("error", !valid);
    if (gpEmailErr) gpEmailErr.classList.toggle("show", !valid);
    if (valid) signInGoogle();
  }

  btnGoogle.addEventListener("click", openPicker);
  if (gpClose)    gpClose.addEventListener("click", closePicker);
  if (gpAccount)  gpAccount.addEventListener("click", signInGoogle);
  if (gpContinue) gpContinue.addEventListener("click", signInGoogle);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closePicker();
  });

  if (gpOther) {
    gpOther.addEventListener("click", function () {
      gpEmailInp.value = "";
      gpEmailInp.classList.remove("error");
      if (gpEmailErr) gpEmailErr.classList.remove("show");
      showView(2);
      gpEmailInp.focus();
    });
  }

  if (gpBack)      gpBack.addEventListener("click", function () { showView(1); });
  if (gpEmailNext) gpEmailNext.addEventListener("click", validateAndSignIn);

  gpEmailInp.addEventListener("keydown", function (e) {
    if (e.key === "Enter") validateAndSignIn();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePicker();
  });
}


