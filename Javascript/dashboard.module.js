/* =========================================================
   ScholarsConnect Dashboard Script
   File: ESTECH/Javascript/dashboard.module.js
========================================================= */
import { auth, db, collection, query, where, onSnapshot, getDocs, onAuthStateChanged } from "./firebase.js";
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";

var unsubDashApps   = null;
var unsubDashDocs   = null;
var unsubDashNotifs = null;

document.addEventListener("DOMContentLoaded", function () {
  initMobileSidebar();
  initStudentLogout();
  initSearch();
  loadStudentProfile().then(function(profile) {
    if (profile && profile.firstName) {
      var greet = document.getElementById("dashboardGreeting");
      if (greet) greet.textContent = "Welcome back, " + profile.firstName + "!";
    }
  });
  onAuthStateChanged(auth, function (user) {
    if (!user) return;
    subscribeDashboardData(user.uid);
  });
  window.addEventListener("beforeunload", function () {
    if (unsubDashApps)   unsubDashApps();
    if (unsubDashDocs)   unsubDashDocs();
    if (unsubDashNotifs) unsubDashNotifs();
  });
});

function getEl(id) { return document.getElementById(id); }

function setText(id, val) {
  var el = getEl(id);
  if (el) el.textContent = val;
}

function escHtml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─────────────────────────────────────────────
   SUBSCRIBE ALL DASHBOARD DATA
───────────────────────────────────────────── */
function subscribeDashboardData(uid) {
  /* Applications */
  if (unsubDashApps) unsubDashApps();
  unsubDashApps = onSnapshot(
    query(collection(db, "applications"), where("userId", "==", uid)),
    function (snap) {
      var apps = snap.docs.map(function (d) { var o = d.data(); o._id = d.id; return o; });
      updateAppStats(apps);
      renderApplicationList(apps);
      updateNextStep(apps);
    },
    function (e) { console.warn("Dashboard apps error:", e); }
  );

  /* Documents */
  if (unsubDashDocs) unsubDashDocs();
  unsubDashDocs = onSnapshot(
    query(collection(db, "documents"), where("userId", "==", uid)),
    function (snap) {
      var docs = snap.docs.map(function (d) { return d.data(); });
      updateDocStats(docs);
      renderDocChecklist(docs);
    },
    function (e) { console.warn("Dashboard docs error:", e); }
  );

  /* Notifications — for activity feed + bell badge */
  if (unsubDashNotifs) unsubDashNotifs();
  unsubDashNotifs = onSnapshot(
    query(collection(db, "notifications"), where("userId", "==", uid)),
    function (snap) {
      var notifs = snap.docs.map(function (d) { var o = d.data(); o._id = d.id; return o; });
      notifs.sort(function (a, b) {
        var ta = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
        var tb = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
        return tb - ta;
      });
      updateNotifBadge(notifs);
      renderActivity(notifs);
    },
    function (e) { console.warn("Dashboard notifs error:", e); }
  );

  /* Scholarships (one-shot for recommended panel) */
  loadScholarships();
}

/* ─────────────────────────────────────────────
   APP STATS + NEXT STEP
───────────────────────────────────────────── */
function updateAppStats(apps) {
  var total    = apps.length;
  var approved = apps.filter(function (a) { return a.status === "approved"; }).length;
  var pending  = apps.filter(function (a) { return a.status === "submitted" || a.status === "under_review"; }).length;
  setText("dashStatApps",     total || "0");
  setText("dashStatApproved", approved || "0");
  var approvedApp = apps.find(function (a) { return a.status === "approved"; });
  setText("dashStatApprovedText", approvedApp ? approvedApp.scholarshipName || "—" : "None yet");
  setText("dashStatPendingText",  pending > 0 ? pending + " pending review" : total > 0 ? "All processed" : "No applications yet");
}

function updateNextStep(apps) {
  var approved   = apps.find(function (a) { return a.status === "approved"; });
  var reviewing  = apps.find(function (a) { return a.status === "under_review"; });
  var submitted  = apps.find(function (a) { return a.status === "submitted"; });

  var title, desc;
  if (approved) {
    title = "Scholarship approved: " + (approved.scholarshipName || "Your application");
    desc  = "Check My Stipend for disbursement updates.";
  } else if (reviewing) {
    title = "Application under review";
    desc  = (reviewing.scholarshipName || "Your application") + " is currently being evaluated.";
  } else if (submitted) {
    title = "Application submitted";
    desc  = (submitted.scholarshipName || "Your application") + " is waiting for review assignment.";
  } else {
    title = "Browse available scholarships";
    desc  = "Apply now to start your scholarship journey.";
  }

  setText("dashNextStepTitle", title);
  setText("dashNextStepDesc",  desc);
  setText("dashHeroNextTitle", title);
  setText("dashHeroNextDesc",  desc);

  /* Profile card progress */
  var progress = approved ? 100 : reviewing ? 75 : submitted ? 50 : 10;
  var bar = getEl("dashProgressBar");
  if (bar) bar.style.width = progress + "%";

  var checklist = getEl("dashProfileChecklist");
  if (checklist) {
    var items = [];
    if (submitted || reviewing || approved) items.push({ ok: true,  label: "Application submitted" });
    if (reviewing  || approved)             items.push({ ok: true,  label: "Under review" });
    if (approved)                           items.push({ ok: true,  label: "Scholarship approved" });
    if (!submitted && !reviewing && !approved) items.push({ ok: false, label: "No application yet" });

    checklist.innerHTML = items.map(function (item) {
      return '<span class="' + (item.ok ? "" : "warning") + '">' +
        '<i class="bi ' + (item.ok ? "bi-check-circle-fill" : "bi-exclamation-circle-fill") + '"></i> ' +
        escHtml(item.label) + '</span>';
    }).join("");
  }
}

/* ─────────────────────────────────────────────
   RENDER ACTIVE APPLICATIONS LIST
───────────────────────────────────────────── */
function renderApplicationList(apps) {
  var list = getEl("dashAppList");
  if (!list) return;

  if (!apps.length) {
    list.innerHTML = '<div class="dash-empty-row">No applications yet. <a href="scholarships.html">Browse scholarships</a></div>';
    return;
  }

  var sorted = apps.slice().sort(function (a, b) {
    var ta = a.submittedAt ? (a.submittedAt.toDate ? a.submittedAt.toDate().getTime() : new Date(a.submittedAt).getTime()) : 0;
    var tb = b.submittedAt ? (b.submittedAt.toDate ? b.submittedAt.toDate().getTime() : new Date(b.submittedAt).getTime()) : 0;
    return tb - ta;
  }).slice(0, 3);

  var cfg = {
    approved:     { cls: "green",  icon: "bi-patch-check-fill", label: "Approved",     action: "View" },
    under_review: { cls: "gold",   icon: "bi-hourglass-split",  label: "Under Review", action: "Track" },
    submitted:    { cls: "maroon", icon: "bi-send-check-fill",  label: "Submitted",    action: "Track" },
    rejected:     { cls: "red",    icon: "bi-x-circle-fill",    label: "Rejected",     action: "View" }
  };

  list.innerHTML = sorted.map(function (app) {
    var c   = cfg[app.status] || cfg.submitted;
    var ref = app.refNumber || (app._id || "").slice(0, 10).toUpperCase();
    return '<div class="application-row">' +
      '<div class="row-icon ' + c.cls + '"><i class="bi ' + c.icon + '"></i></div>' +
      '<div><strong>' + escHtml(app.scholarshipName || "—") + '</strong>' +
      '<span>' + c.label + ' · Ref ' + escHtml(ref) + '</span></div>' +
      '<a href="myapplication.html">' + c.action + '</a>' +
      '</div>';
  }).join("");
}

/* ─────────────────────────────────────────────
   RENDER SCHOLARSHIPS PANEL
───────────────────────────────────────────── */
async function loadScholarships() {
  var list = getEl("dashScholarshipList");
  if (!list) return;

  list.innerHTML = '<div class="dash-empty-row">Loading…</div>';
  try {
    var snap = await getDocs(query(collection(db, "scholarships"), where("status", "==", "published")));
    if (snap.empty) {
      snap = await getDocs(query(collection(db, "scholarships"), where("archived", "!=", true)));
    }

    setText("dashStatScholarships", snap.size || "0");

    if (snap.empty) {
      list.innerHTML = '<div class="dash-empty-row">No open scholarships at this time.</div>';
      return;
    }

    list.innerHTML = snap.docs.slice(0, 2).map(function (d) {
      var s    = d.data();
      var name = escHtml(s.title || "Scholarship");
      var desc = escHtml(s.description || s.desc || s.subtitle || "");
      var slots = s.slots ? (s.slots - (s.filledSlots || 0)) + " slots left" : "Open";
      return '<div class="recommend-card">' +
        '<span class="rec-badge green">' + slots + '</span>' +
        '<strong>' + name + '</strong>' +
        (desc ? '<p>' + desc + '</p>' : '') +
        '<a href="application.html?scholarship=' + encodeURIComponent(s.title || "") + '">Apply now</a>' +
        '</div>';
    }).join("");
  } catch (e) {
    console.warn("Could not load scholarships:", e);
    list.innerHTML = '<div class="dash-empty-row"><a href="scholarships.html">Browse scholarships</a></div>';
  }
}

/* ─────────────────────────────────────────────
   RENDER DOCUMENT CHECKLIST
───────────────────────────────────────────── */
function updateDocStats(docs) {
  var verified = docs.filter(function (d) { return d.status === "verified"; }).length;
  var pending  = docs.filter(function (d) { return !d.status || d.status === "pending"; }).length;
  setText("dashStatDocs",    docs.length || "0");
  setText("dashStatDocsText", verified + " verified, " + pending + " pending");
}

function renderDocChecklist(docs) {
  var list = getEl("dashDocList");
  if (!list) return;

  if (!docs.length) {
    list.innerHTML = '<div class="dash-empty-row">No documents uploaded. <a href="mydocuments.html">Upload now</a></div>';
    return;
  }

  list.innerHTML = docs.slice(0, 4).map(function (d) {
    var ok    = d.status === "verified";
    var label = escHtml(d.name || d.filename || "Document");
    return '<div class="doc-check ' + (ok ? "done" : "warning") + '">' +
      '<i class="bi ' + (ok ? "bi-check-circle-fill" : "bi-exclamation-circle-fill") + '"></i>' +
      '<span>' + label + '</span></div>';
  }).join("");
}

/* ─────────────────────────────────────────────
   RENDER RECENT ACTIVITY
───────────────────────────────────────────── */
function renderActivity(notifs) {
  var list = getEl("dashActivityList");
  if (!list) return;

  if (!notifs.length) {
    list.innerHTML = '<div class="dash-empty-row">No recent activity yet.</div>';
    return;
  }

  list.innerHTML = notifs.slice(0, 3).map(function (n) {
    return '<div class="activity-row"><span></span><div>' +
      '<strong>' + escHtml(n.title || "Notification") + '</strong>' +
      '<p>' + escHtml(n.message || "") + '</p>' +
      '</div></div>';
  }).join("");
}

/* ─────────────────────────────────────────────
   NOTIFICATION BELL BADGE
───────────────────────────────────────────── */
function updateNotifBadge(notifs) {
  var unread = notifs.filter(function (n) { return !n.read; }).length;
  var badge  = getEl("notifCount");
  var dot    = getEl("notifDot");
  var sub    = getEl("notifSubtitle");
  if (badge) badge.textContent = unread > 0 ? unread : "";
  if (dot)   dot.style.display  = unread > 0 ? "" : "none";
  if (sub)   sub.textContent    = unread > 0
    ? unread + " unread update" + (unread !== 1 ? "s" : "")
    : "No new notifications";
}

/* ─────────────────────────────────────────────
   MOBILE SIDEBAR
───────────────────────────────────────────── */
function initMobileSidebar() {
  var toggle  = getEl("sidebarToggle");
  var overlay = getEl("sidebarOverlay");
  if (toggle)  toggle.addEventListener("click",  function () { document.body.classList.toggle("sidebar-open"); });
  if (overlay) overlay.addEventListener("click", function () { document.body.classList.remove("sidebar-open"); });
  document.querySelectorAll(".sb-item").forEach(function (link) {
    link.addEventListener("click", function () { document.body.classList.remove("sidebar-open"); });
  });
}

function initSearch() {
  var input = getEl("dashboardSearch");
  var clear = getEl("clearSearch");
  if (!input || !clear) return;
  input.addEventListener("input", function () { clear.classList.toggle("show", input.value.trim().length > 0); });
  clear.addEventListener("click", function () { input.value = ""; clear.classList.remove("show"); input.focus(); });
}

function showToast(message) {
  var toast    = getEl("toast");
  var toastMsg = getEl("toastMsg");
  if (!toast || !toastMsg) return;
  toastMsg.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { toast.classList.remove("show"); }, 2800);
}


