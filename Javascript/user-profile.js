/* =========================================================
   ScholarsConnect — Shared User Profile Module
   Imported by all student and admin page JS files.
========================================================= */
import { auth, db, doc, getDoc, signOut, onAuthStateChanged } from "./firebase.js";

var SC_PROFILE_KEY       = 'sc_profile';
var SC_ADMIN_PROFILE_KEY = 'sc_admin_profile';

function getInitials(first, last, email) {
  if (first) return (first[0] + (last ? last[0] : "")).toUpperCase();
  return email ? email[0].toUpperCase() : "?";
}

function clearSessionAuth() {
  sessionStorage.removeItem("sc_role");
  sessionStorage.removeItem("sc_uid");
  sessionStorage.removeItem("sc_email");
  sessionStorage.removeItem("sc_admin_verified");
  sessionStorage.removeItem(SC_PROFILE_KEY);
}

function applyStudentProfileToDOM(name, ini, courseOrRole) {
  var av    = document.getElementById("sidebarAvatar");
  var uname = document.querySelector(".sb-uname");
  var urole = document.querySelector(".sb-urole");
  if (av && !av.classList.contains('has-photo')) av.textContent = ini;
  if (uname) uname.textContent = name;
  if (urole) urole.textContent = courseOrRole;
  var topAv = document.querySelector("#topUserAvatar span") ||
              document.querySelector(".top-user span") ||
              document.querySelector(".tb-user-av");
  var topNm = document.querySelector(".tb-user-name");
  if (topAv) topAv.textContent = ini;
  if (topNm) topNm.textContent = name;

  // Apply saved profile photo to sidebar + topbar on every page
  var photo = localStorage.getItem("scholarsconnectProfilePhoto");
  if (photo) {
    if (av) {
      av.style.backgroundImage = 'url("' + photo + '")';
      av.style.backgroundSize = 'cover';
      av.style.backgroundPosition = 'center';
      av.classList.add("has-photo");
      av.textContent = "";
    }
    var topEl = document.getElementById("topUserAvatar") || document.querySelector(".top-user");
    if (topEl) {
      topEl.style.backgroundImage = 'url("' + photo + '")';
      topEl.style.backgroundSize = 'cover';
      topEl.style.backgroundPosition = 'center';
      topEl.classList.add("has-photo");
    }
    if (topAv) topAv.textContent = "";
  }
}

/* ── Load & populate student sidebar ── */
export async function loadStudentProfile() {
  // Paint DOM instantly from sessionStorage cache (zero network wait)
  var cached = sessionStorage.getItem(SC_PROFILE_KEY);
  if (cached) {
    try {
      var c = JSON.parse(cached);
      applyStudentProfileToDOM(c.name, c.ini, c.course || 'Student');
    } catch(_) {}
  }

  // Use auth.currentUser synchronously — auth-guard has already confirmed login
  var user = auth.currentUser;
  if (!user) {
    // One-shot fallback for very fast page loads before auth resolves
    user = await new Promise(function(resolve) {
      var unsub = onAuthStateChanged(auth, function(u) { unsub(); resolve(u); });
    });
  }
  if (!user) return null;

  try {
    var snap = await getDoc(doc(db, "users", user.uid));
    var d    = snap.exists() ? snap.data() : {};
    var fnParts = (d.fullName || "").trim().split(/\s+/);
    var fn  = d.firstName || fnParts[0] || "";
    var ln  = d.lastName  || fnParts.slice(1).join(" ") || "";
    var name = fn
      ? (fn + (ln ? " " + ln : "")).trim()
      : (d.fullName || user.displayName || user.email);
    var ini  = getInitials(fn, ln, user.email);
    var course = d.course || 'Student';

    // Cache for instant paint on next page navigation
    sessionStorage.setItem(SC_PROFILE_KEY, JSON.stringify({ name: name, ini: ini, course: course }));

    applyStudentProfileToDOM(name, ini, course);

    // Sync Firestore photo to localStorage and apply to both avatars
    var photoData = d.photoBase64 || null;
    if (photoData) {
      localStorage.setItem("scholarsconnectProfilePhoto", photoData);
      var av   = document.getElementById("sidebarAvatar");
      var topEl = document.getElementById("topUserAvatar") || document.querySelector(".top-user");
      if (av) {
        av.style.backgroundImage  = 'url("' + photoData + '")';
        av.style.backgroundSize   = "cover";
        av.style.backgroundPosition = "center";
        av.classList.add("has-photo");
        av.textContent = "";
      }
      if (topEl) {
        topEl.style.backgroundImage  = 'url("' + photoData + '")';
        topEl.style.backgroundSize   = "cover";
        topEl.style.backgroundPosition = "center";
        topEl.classList.add("has-photo");
        var span = topEl.querySelector("span") || topEl.querySelector(".tb-user-av");
        if (span) span.textContent = "";
      }
    }

    return { user: user, uid: user.uid, displayName: name, initials: ini, firstName: fn, lastName: ln, ...d };
  } catch(e) {
    var name2 = user.displayName || user.email;
    var ini2  = user.email ? user.email[0].toUpperCase() : "?";
    return { user: user, uid: user.uid, displayName: name2, initials: ini2 };
  }
}

function applyAdminProfileToDOM(name, ini) {
  var sbAv   = document.querySelector(".sb-avatar");
  var sbName = document.querySelector(".sb-profile-name");
  var sbRole = document.querySelector(".sb-profile-role");
  var topNm  = document.querySelector(".topbar-admin-name");
  var topAv  = document.querySelector(".topbar-admin-avatar");
  if (sbAv)   sbAv.textContent   = ini;
  if (sbName) sbName.textContent = name;
  if (sbRole) sbRole.textContent = "Administrator";
  if (topNm)  topNm.textContent  = name;
  if (topAv)  topAv.textContent  = ini;
}

/* ── Load & populate admin sidebar ── */
export async function loadAdminProfile() {
  // Paint instantly from sessionStorage cache
  var cached = sessionStorage.getItem(SC_ADMIN_PROFILE_KEY);
  if (cached) {
    try {
      var c = JSON.parse(cached);
      applyAdminProfileToDOM(c.name, c.ini);
    } catch(_) {}
  }

  var user = auth.currentUser;
  if (!user) {
    user = await new Promise(function(resolve) {
      var unsub = onAuthStateChanged(auth, function(u) { unsub(); resolve(u); });
    });
  }
  if (!user) return null;

  try {
    var snap = await getDoc(doc(db, "users", user.uid));
    var d    = snap.exists() ? snap.data() : {};
    var name = d.firstName
      ? (d.firstName + " " + (d.lastName || "")).trim()
      : (user.displayName || user.email);
    var ini  = getInitials(d.firstName, d.lastName, user.email);

    sessionStorage.setItem(SC_ADMIN_PROFILE_KEY, JSON.stringify({ name: name, ini: ini }));
    applyAdminProfileToDOM(name, ini);

    return { user: user, uid: user.uid, displayName: name, initials: ini, ...d };
  } catch(e) {
    return { user: user, uid: user.uid, displayName: user.email, initials: user.email[0].toUpperCase() };
  }
}

/* ── Student logout ── */
export function initStudentLogout() {
  var btn = document.getElementById("btnLogout");
  if (!btn) return;
  btn.addEventListener("click", async function () {
    clearSessionAuth();
    await signOut(auth);
    window.location.href = "login.html";
  });
}

/* ── Admin logout (intercepts <a href="login.html">) ── */
export function initAdminLogout() {
  var link = document.querySelector(".sb-signout");
  if (!link) return;
  link.addEventListener("click", async function (e) {
    e.preventDefault();
    clearSessionAuth();
    await signOut(auth);
    window.location.href = "login.html";
  });
}

/* ── Admin mobile sidebar toggle ── */
export function initAdminMobileSidebar() {
  var btn     = document.getElementById("adminSidebarBtn");
  var overlay = document.getElementById("adminSidebarOverlay");

  function openSidebar()  { document.body.classList.add("admin-sidebar-open"); }
  function closeSidebar() { document.body.classList.remove("admin-sidebar-open"); }

  if (btn)     btn.addEventListener("click", openSidebar);
  if (overlay) overlay.addEventListener("click", closeSidebar);

  // Close on nav-item click so the page transition feels instant
  document.querySelectorAll(".sidebar .nav-item").forEach(function (link) {
    link.addEventListener("click", closeSidebar);
  });

  // Close on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSidebar();
  });
}

/* ── Get current user (sync if available, async fallback) ── */
export function getCurrentUser() {
  return new Promise(function (resolve) {
    var u = auth.currentUser;
    if (u) { resolve(u); return; }
    var unsub = onAuthStateChanged(auth, function (user) {
      unsub();
      resolve(user);
    });
  });
}


