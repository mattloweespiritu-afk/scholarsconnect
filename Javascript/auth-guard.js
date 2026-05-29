/* =========================================================
   ScholarsConnect Auth Guard
   Protects student/admin pages using Firebase Auth + Firestore role.
   - Blocks unverified students from dashboard
   - Enforces 30-minute session inactivity timeout for students
   - Prevents role cross-access (admin ↔ student)
========================================================= */
import {
  auth, db, onAuthStateChanged, signOut, doc, getDoc,
  collection, addDoc, getDocs, query, where, limit, serverTimestamp
} from "./firebase.js";

(function () {
  const ROLE_KEY             = "sc_role";
  const UID_KEY              = "sc_uid";
  const EMAIL_KEY            = "sc_email";
  const ADMIN_VERIFIED_KEY   = "sc_admin_verified";
  const STUDENT_VERIFIED_KEY = "sc_student_verified";
  const ROLE_ERROR           = "Account role is missing. Please contact the administrator.";
  const SECURITY_PAGE_ADMIN  = "securityverificationadmin.html";
  const SECURITY_PAGE_STUDENT = "securityverification.html";
  const TIMEOUT_MS           = 30 * 60 * 1000; /* 30 minutes inactivity */

  const adminPages = [
    "admindashboard.html",
    "adminapplications.html",
    "adminapplicationreview.html",
    "adminscholarships.html",
    "adminstudents.html",
    "adminrenewal.html",
    "admindisbursement.html",
    "adminreport.html",
    "adminauditlogs.html",
    "adminsettings.html",
    "securityverificationadmin.html"
  ];

  const studentPages = [
    "dashboard.html",
    "scholarships.html",
    "application.html",
    "myapplication.html",
    "mydocuments.html",
    "myprofile.html",
    "notifications.html",
    "renewal.html",
    "appeal.html",
    "disbursement.html",
    "securityverification.html"
  ];

  const body = document.body;
  const page = window.location.pathname.split("/").pop().toLowerCase();
  const isAdminPage   = adminPages.includes(page) || body.classList.contains("admin-layout");
  const isStudentPage = studentPages.includes(page) || !isAdminPage;

  function normalizeRole(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function isAllowedRole(role) {
    return role === "admin" || role === "student";
  }

  function hasCachedSession(role) {
    return Boolean(sessionStorage.getItem(UID_KEY)) && isAllowedRole(role);
  }

  function hidePage() {
    body.style.opacity = "0";
    body.style.transition = "opacity 0.12s ease";
  }

  function showPage() {
    body.style.opacity = "";
  }

  function clearSession() {
    sessionStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem(UID_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
    sessionStorage.removeItem(ADMIN_VERIFIED_KEY);
    sessionStorage.removeItem(STUDENT_VERIFIED_KEY);
    sessionStorage.removeItem("sc_demo_student_otp");
    sessionStorage.removeItem("sc_demo_admin_otp");
  }

  function showRoleError() {
    showPage();
    body.innerHTML = [
      '<main style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Roboto,Arial,sans-serif;background:#f8f5f5;color:#2b1515;">',
      '<section style="max-width:440px;background:#fff;border:1px solid #eadede;border-radius:8px;padding:24px;text-align:center;box-shadow:0 12px 32px rgba(74,18,18,.08);">',
      '<h1 style="margin:0 0 10px;font-size:20px;">Account Access Issue</h1>',
      '<p style="margin:0 0 18px;line-height:1.5;">' + ROLE_ERROR + '</p>',
      '<a href="login.html" style="color:#7A2323;font-weight:700;text-decoration:none;">Back to login</a>',
      '</section>',
      '</main>'
    ].join("");
  }

  async function fetchNormalizedRole(user) {
    var snap = await getDoc(doc(db, "users", user.uid));
    var userDoc = null;

    if (snap.exists()) {
      userDoc = snap.data();
    } else if (user.email) {
      var emailSnap = await getDocs(query(
        collection(db, "users"),
        where("email", "==", user.email),
        limit(1)
      ));
      userDoc = emailSnap.empty ? null : emailSnap.docs[0].data();
    }

    return normalizeRole(userDoc ? userDoc.role || "" : "");
  }

  /* ── Routing logic ── */
  function routeForRole(role) {
    if (role === "admin") {
      /* Admin on student page → go to admin dashboard */
      if (isStudentPage && page !== SECURITY_PAGE_ADMIN) {
        window.location.replace("admindashboard.html");
        return true;
      }

      var adminVerified = sessionStorage.getItem(ADMIN_VERIFIED_KEY) === "true";

      /* Admin not yet verified → go to admin security page */
      if (page !== SECURITY_PAGE_ADMIN && !adminVerified) {
        window.location.replace(SECURITY_PAGE_ADMIN);
        return true;
      }

      /* Admin already verified and tries to open security page again → skip to dashboard */
      if (page === SECURITY_PAGE_ADMIN && adminVerified) {
        window.location.replace("admindashboard.html");
        return true;
      }

      return false;
    }

    if (role === "student") {
      /* Student on admin page → go to student dashboard */
      if (isAdminPage) {
        window.location.replace("dashboard.html");
        return true;
      }

      var studentVerified = sessionStorage.getItem(STUDENT_VERIFIED_KEY) === "true";

      /* Student not yet OTP-verified → go to student security page */
      if (page !== SECURITY_PAGE_STUDENT && !studentVerified) {
        window.location.replace(SECURITY_PAGE_STUDENT);
        return true;
      }

      /* Student already verified and tries to open security page again → skip to dashboard */
      if (page === SECURITY_PAGE_STUDENT && studentVerified) {
        window.location.replace("dashboard.html");
        return true;
      }

      return false;
    }

    return false;
  }

  /* ── Session timeout (students only) ── */
  var timeoutHandle = null;

  function resetInactivityTimer() {
    var role = normalizeRole(sessionStorage.getItem(ROLE_KEY));
    if (role !== "student") return;

    clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(function () {
      var uid   = sessionStorage.getItem(UID_KEY)   || "";
      var email = sessionStorage.getItem(EMAIL_KEY) || "";
      if (uid) {
        addDoc(collection(db, "auditLogs"), {
          action:    "session_timeout_logout",
          userId:    uid,
          email:     email,
          createdAt: serverTimestamp()
        }).catch(function () {});
      }
      clearSession();
      signOut(auth).catch(function () {}).finally(function () {
        var loginUrl = window.location.pathname.includes("/html/")
          ? "login.html"
          : "html/login.html";
        var sep = loginUrl.includes("?") ? "&" : "?";
        window.location.replace(loginUrl + sep + "timeout=1");
      });
    }, TIMEOUT_MS);
  }

  function initInactivityTimer() {
    var role = normalizeRole(sessionStorage.getItem(ROLE_KEY));
    if (role !== "student") return;

    ["mousemove", "keydown", "click", "touchstart", "scroll"].forEach(function (evt) {
      document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
  }

  /* ── Boot sequence ── */
  var cachedRole = normalizeRole(sessionStorage.getItem(ROLE_KEY));

  if (hasCachedSession(cachedRole)) {
    routeForRole(cachedRole);
  } else {
    hidePage();
  }

  onAuthStateChanged(auth, async function (user) {
    if (!user) {
      clearSession();
      window.location.href = "login.html";
      return;
    }

    var role        = "";
    var cachedUid   = sessionStorage.getItem(UID_KEY);
    var cachedRoleNow = normalizeRole(sessionStorage.getItem(ROLE_KEY));

    if (cachedUid === user.uid && isAllowedRole(cachedRoleNow)) {
      role = cachedRoleNow;
    } else {
      try {
        role = await fetchNormalizedRole(user);
      } catch (_) {
        showRoleError();
        return;
      }
    }

    if (!isAllowedRole(role)) {
      clearSession();
      showRoleError();
      return;
    }

    sessionStorage.setItem(ROLE_KEY,  role);
    sessionStorage.setItem(EMAIL_KEY, user.email || "");
    sessionStorage.setItem(UID_KEY,   user.uid);

    if (routeForRole(role)) return;

    initInactivityTimer();
    showPage();
  });
})();
