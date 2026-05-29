/* =========================================================
   ScholarsConnect Admin Dashboard Script
   File: ESTECH/Javascript/admindashboard.js
========================================================= */
import { auth, db, collection, onSnapshot, query, where, orderBy, limit, getDocs, onAuthStateChanged } from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    initAdminLogout();
    initAdminMobileSidebar();
    loadAdminProfile();
    initGreeting();
    initReportButton();
    initReviewButton();
    initAdminNotificationPopover();
    initPlaceholderLinks();
    initAdminSearch();

    onAuthStateChanged(auth, function (user) {
      if (!user) return;
      subscribeStats();
      subscribeSlotData();
      subscribeActivityLog();
    });
  });

  function qs(selector, parent) { return (parent || document).querySelector(selector); }
  function qsa(selector, parent) { return Array.from((parent || document).querySelectorAll(selector)); }
  function setText(id, value) { var el = document.getElementById(id); if (el) el.textContent = value; }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ── Greeting ── */
  function initGreeting() {
    var title = qs(".admin-page-title");
    if (!title) return;
    var hour = new Date().getHours();
    var g = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    title.textContent = g + ", Administrator";
  }

  /* ── Unsubscribe handles ── */
  var unsubAdminApps   = null;
  var unsubAdminSchols = null;
  var unsubSlotSchols  = null;
  var unsubSlotApps    = null;
  var unsubActivity    = null;

  var dashboardScholarshipsMap  = {};
  var dashboardApprovedCountMap = {};

  /* ── Search cache ── */
  var searchCache = {
    applications: [],
    scholarships:  [],
    students:      [],
    studentsLoaded: false
  };

  /* ── Real-time stats from Firestore ── */
  function subscribeStats() {
    if (unsubAdminApps) unsubAdminApps();
    unsubAdminApps = onSnapshot(
      collection(db, "applications"),
      function (snap) {
        var apps      = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        var total     = apps.length;
        var submitted = apps.filter(function (a) { return a.status === "submitted"; });
        var reviewing = apps.filter(function (a) { return a.status === "under_review"; });
        var pending   = submitted.length + reviewing.length;
        var approved  = apps.filter(function (a) { return a.status === "approved"; });
        var rejected  = apps.filter(function (a) { return a.status === "rejected"; });

        var weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        var newThisWeek = apps.filter(function (a) {
          if (!a.submittedAt) return false;
          var d = a.submittedAt.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt);
          return d >= weekAgo;
        }).length;

        animateNumber(document.getElementById("stat-val-total"),   total);
        animateNumber(document.getElementById("stat-val-pending"),  pending);
        animateNumber(document.getElementById("stat-val-approved"), approved.length);
        animateNumber(document.getElementById("stat-val-rejected"), rejected.length);

        setText("stat-foot-total",    newThisWeek > 0 ? "+" + newThisWeek + " New This Week" : "No new this week");
        setText("stat-foot-pending",  submitted.length + " Submitted · " + reviewing.length + " In Review");
        setText("stat-foot-approved", approved.length + " Scholarship" + (approved.length !== 1 ? "s" : "") + " Confirmed");
        setText("stat-foot-rejected", rejected.length + " Application" + (rejected.length !== 1 ? "s" : "") + " Rejected");

        var alertBanner = qs(".alert-banner");
        if (alertBanner) alertBanner.style.display = submitted.length > 0 ? "" : "none";
        setText("alert-banner-title", submitted.length + " application" + (submitted.length !== 1 ? "s" : "") + " awaiting review");
        setText("alert-banner-sub",   submitted.length > 0 ? "Review and process pending submissions to keep the pipeline moving." : "");

        /* Update search cache */
        searchCache.applications = apps.map(function (a) {
          return {
            id:         a.id,
            name:       a.applicantName || "",
            scholarship: a.scholarshipName || "",
            refNo:      a.referenceNo || a.id || "",
            status:     a.status || "submitted"
          };
        });
      },
      function (e) {
        console.error("Admin stats error:", e.code, e.message);
        ["stat-val-total","stat-val-pending","stat-val-approved","stat-val-rejected"].forEach(function (id) {
          setText(id, "!");
        });
        showToast("Dashboard data failed to load. Check console for details.");
      }
    );

    if (unsubAdminSchols) unsubAdminSchols();
    unsubAdminSchols = onSnapshot(
      query(collection(db, "scholarships"), where("status", "==", "active")),
      function (snap) {
        animateNumber(document.getElementById("stat-val-scholarships"), snap.size);

        var now   = new Date();
        var start = new Date(now.getFullYear(), now.getMonth(), 1);
        var end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        var closing = 0;
        snap.docs.forEach(function (d) {
          var s = d.data();
          var dl = s.deadline || s.endDate || s.closingDate;
          if (!dl) return;
          var date = dl.toDate ? dl.toDate() : new Date(dl);
          if (date >= start && date <= end) closing++;
        });
        setText("stat-foot-scholarships",
          closing > 0 ? closing + " Closing This Month" : "No deadlines this month");
      },
      function (e) { console.error("Scholarships error:", e.code, e.message); setText("stat-val-scholarships", "!"); }
    );

    window.addEventListener("beforeunload", function () {
      if (unsubAdminApps)   unsubAdminApps();
      if (unsubAdminSchols) unsubAdminSchols();
      if (unsubSlotSchols)  unsubSlotSchols();
      if (unsubSlotApps)    unsubSlotApps();
      if (unsubActivity)    unsubActivity();
    });
  }

  /* ── Slot Availability from Firestore ── */
  function subscribeSlotData() {
    function renderSlots() {
      var slotList = document.getElementById("slot-list");
      if (!slotList) return;

      var entries = Object.values(dashboardScholarshipsMap)
        .filter(function (s) { return s.slotsTotal > 0; })
        .sort(function (a, b) { return a.title.localeCompare(b.title); })
        .slice(0, 6);

      if (entries.length === 0) {
        slotList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted,#999);font-size:13px;">No scholarship slots configured.</div>';
        return;
      }

      slotList.innerHTML = entries.map(function (s) {
        var filled = dashboardApprovedCountMap[s.title] || 0;
        var total  = s.slotsTotal;
        var pct    = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
        var full   = pct >= 80 ? " full" : "";
        return (
          '<div class="slot-item">' +
            '<div class="slot-row">' +
              '<span>' + esc(s.title) + '</span>' +
              '<span class="slot-count">' + filled + ' / ' + total + '</span>' +
            '</div>' +
            '<div class="slot-bar-track">' +
              '<div class="slot-bar-fill' + full + '" style="width:' + pct + '%"></div>' +
            '</div>' +
          '</div>'
        );
      }).join("");
    }

    if (unsubSlotSchols) unsubSlotSchols();
    unsubSlotSchols = onSnapshot(
      collection(db, "scholarships"),
      function (snap) {
        Object.keys(dashboardScholarshipsMap).forEach(function (k) { delete dashboardScholarshipsMap[k]; });
        snap.docs.forEach(function (d) {
          var s = d.data();
          var title = s.title || s.name || "";
          var slots = parseInt(s.slotsTotal || s.slots, 10) || 0;
          if (title && slots > 0) dashboardScholarshipsMap[title] = { title: title, slotsTotal: slots };
        });

        /* Update search cache */
        searchCache.scholarships = snap.docs.map(function (d) {
          var s = d.data();
          return { id: d.id, title: s.title || s.name || "", status: s.status || "active" };
        }).filter(function (s) { return s.title; });

        renderSlots();
      },
      function (e) { console.warn("Slot scholarships error:", e); }
    );

    if (unsubSlotApps) unsubSlotApps();
    unsubSlotApps = onSnapshot(
      query(collection(db, "applications"), where("status", "==", "approved")),
      function (snap) {
        Object.keys(dashboardApprovedCountMap).forEach(function (k) { delete dashboardApprovedCountMap[k]; });
        snap.docs.forEach(function (d) {
          var name = d.data().scholarshipName || "";
          if (name) dashboardApprovedCountMap[name] = (dashboardApprovedCountMap[name] || 0) + 1;
        });
        renderSlots();
      },
      function (e) { console.warn("Slot applications error:", e); }
    );
  }

  /* ── Admin Activity Log from auditLogs ── */
  function subscribeActivityLog() {
    var actList = document.getElementById("activity-list");
    if (!actList) return;

    if (unsubActivity) unsubActivity();
    unsubActivity = onSnapshot(
      query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(5)),
      function (snap) {
        if (snap.empty) {
          actList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted,#999);font-size:13px;">No activity recorded yet.</div>';
          return;
        }
        actList.innerHTML = snap.docs.map(function (d) {
          var a   = d.data();
          var dot = a.type === "Disbursement"                             ? "green"
                  : (a.severity === "Error" || a.type === "Rejection")    ? "red"
                  : a.type === "Application"                              ? "gold"
                  :                                                          "muted";
          var ts  = a.createdAt
            ? new Date(a.createdAt.toDate ? a.createdAt.toDate() : a.createdAt)
                .toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            : "—";
          return (
            '<div class="activity-item">' +
              '<div class="activity-dot ' + dot + '"></div>' +
              '<div>' +
                '<div class="activity-text">' + esc(a.title || a.description || "Activity") + '</div>' +
                '<div class="activity-time">' + esc(ts) + '</div>' +
              '</div>' +
            '</div>'
          );
        }).join("");
      },
      function (e) { console.warn("Activity log subscription error:", e); }
    );
  }

  /* ══════════════════════════════════════════════════════
     ADMIN SEARCH
  ══════════════════════════════════════════════════════ */

  var QUICK_NAV = [
    { label: "Applications", icon: "bi-file-earmark-person", cls: "qn-app",    href: "adminapplications.html" },
    { label: "Students",     icon: "bi-people-fill",         cls: "qn-stu",    href: "adminstudents.html" },
    { label: "Scholarships", icon: "bi-award-fill",          cls: "qn-schol",  href: "adminscholarships.html" },
    { label: "Renewals",     icon: "bi-arrow-repeat",        cls: "qn-renew",  href: "adminrenewal.html" },
    { label: "Disbursements",icon: "bi-cash-stack",          cls: "qn-disb",   href: "admindisbursement.html" },
    { label: "Reports",      icon: "bi-bar-chart-fill",      cls: "qn-report", href: "adminreport.html" },
    { label: "Audit Logs",   icon: "bi-journal-text",        cls: "qn-audit",  href: "adminauditlogs.html" },
    { label: "Settings",     icon: "bi-gear-fill",           cls: "qn-set",    href: "adminsettings.html" }
  ];

  function buildQuickNav() {
    return (
      '<div class="search-quicknav-header">' +
        '<span class="search-quicknav-label">Quick Navigation</span>' +
      '</div>' +
      '<div class="search-quicknav-grid">' +
        QUICK_NAV.map(function (item) {
          return (
            '<a class="search-quicknav-item" href="' + item.href + '">' +
              '<div class="search-quicknav-icon ' + item.cls + '">' +
                '<i class="bi ' + item.icon + '"></i>' +
              '</div>' +
              '<span class="search-quicknav-name">' + item.label + '</span>' +
            '</a>'
          );
        }).join("") +
      '</div>'
    );
  }

  function initAdminSearch() {
    var inp     = document.getElementById("adminSearchInput");
    var results = document.getElementById("adminSearchResults");
    if (!inp || !results) return;

    var debounceTimer = null;

    inp.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      var q = inp.value.trim();
      if (q.length < 2) {
        showQuickNav();
        return;
      }
      debounceTimer = setTimeout(function () { runSearch(q); }, 160);
    });

    inp.addEventListener("focus", function () {
      var q = inp.value.trim();
      if (q.length >= 2) { runSearch(q); } else { showQuickNav(); }
    });

    /* Close on outside click or Escape */
    document.addEventListener("click", function (e) {
      if (!inp.closest(".admin-search-wrap").contains(e.target)) closeResults();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeResults(); inp.blur(); }
      if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(1); }
      if (e.key === "ArrowUp")   { e.preventDefault(); moveFocus(-1); }
      if (e.key === "Enter") {
        var active = results.querySelector(".search-result-item.active, .search-quicknav-item.active");
        if (active) active.click();
      }
    });

    function showQuickNav() {
      results.hidden = false;
      results.innerHTML = buildQuickNav();
    }

    function closeResults() {
      results.hidden = true;
      qsa(".search-result-item, .search-quicknav-item", results).forEach(function (el) { el.classList.remove("active"); });
    }

    function moveFocus(dir) {
      if (results.hidden) return;
      var items = qsa(".search-result-item, .search-quicknav-item", results);
      if (!items.length) return;
      var cur = results.querySelector(".search-result-item.active, .search-quicknav-item.active");
      var idx = cur ? items.indexOf(cur) : -1;
      items.forEach(function (i) { i.classList.remove("active"); });
      var next = items[(idx + dir + items.length) % items.length];
      if (next) { next.classList.add("active"); next.scrollIntoView({ block: "nearest" }); }
    }
  }

  function runSearch(q) {
    var results = document.getElementById("adminSearchResults");
    if (!results) return;

    if (q.length < 2) { results.hidden = true; return; }

    var lower = q.toLowerCase();

    /* ── Applications ── */
    var appHits = searchCache.applications.filter(function (a) {
      return (a.name + " " + a.scholarship + " " + a.refNo).toLowerCase().includes(lower);
    }).slice(0, 4);

    /* ── Scholarships ── */
    var scholHits = searchCache.scholarships.filter(function (s) {
      return s.title.toLowerCase().includes(lower);
    }).slice(0, 4);

    /* ── Students (lazy-loaded once from Firestore) ── */
    if (!searchCache.studentsLoaded) {
      searchCache.studentsLoaded = true;
      getDocs(query(collection(db, "users"), where("role", "in", ["student", "Student"])))
        .then(function (snap) {
          searchCache.students = snap.docs.map(function (d) {
            var u = d.data();
            var full = u.firstName
              ? ((u.firstName || "") + " " + (u.lastName || "")).trim()
              : (u.fullName || u.displayName || u.email || "");
            return { id: d.id, name: full, email: u.email || "", studentId: u.studentId || "", course: u.course || "" };
          }).filter(function (u) { return u.name; });
          /* Re-render with students now loaded */
          renderSearchResults(q, appHits, scholHits, getStudentHits(q));
        })
        .catch(function () { /* silently degrade */ });
    }

    renderSearchResults(q, appHits, scholHits, getStudentHits(q));
  }

  function getStudentHits(q) {
    var lower = q.toLowerCase();
    return searchCache.students.filter(function (s) {
      return (s.name + " " + s.email + " " + s.studentId).toLowerCase().includes(lower);
    }).slice(0, 4);
  }

  function renderSearchResults(q, appHits, scholHits, studentHits) {
    var results = document.getElementById("adminSearchResults");
    if (!results) return;

    var total = appHits.length + scholHits.length + studentHits.length;
    if (total === 0) {
      results.hidden = false;
      results.innerHTML =
        '<div class="search-no-results">' +
          '<i class="bi bi-search"></i>' +
          'No results for <strong>' + esc(q) + '</strong>' +
        '</div>';
      return;
    }

    var html = "";

    if (appHits.length) {
      html += '<div class="search-section-label"><i class="bi bi-file-earmark-text"></i> Applications</div>';
      appHits.forEach(function (a) {
        var badge = '<span class="search-result-badge ' + esc(a.status) + '">' + esc(a.status.replace(/_/g," ")) + '</span>';
        html +=
          '<a class="search-result-item" href="adminapplicationreview.html?id=' + esc(a.id) + '">' +
            '<div class="search-result-icon app"><i class="bi bi-file-earmark-person"></i></div>' +
            '<div class="search-result-main">' +
              '<div class="search-result-title">' + esc(a.name || "Unknown Applicant") + '</div>' +
              '<div class="search-result-sub">' + esc(a.scholarship || "—") + '</div>' +
            '</div>' +
            badge +
          '</a>';
      });
      if (searchCache.applications.filter(function(a){ return (a.name+" "+a.scholarship+" "+a.refNo).toLowerCase().includes(q.toLowerCase()); }).length > 4) {
        html += '<a class="search-result-more" href="adminapplications.html">View all matching applications →</a>';
      }
    }

    if (studentHits.length) {
      html += '<div class="search-section-label"><i class="bi bi-person"></i> Students</div>';
      studentHits.forEach(function (s) {
        html +=
          '<a class="search-result-item" href="adminstudents.html">' +
            '<div class="search-result-icon student"><i class="bi bi-person-fill"></i></div>' +
            '<div class="search-result-main">' +
              '<div class="search-result-title">' + esc(s.name) + '</div>' +
              '<div class="search-result-sub">' + esc(s.email || s.studentId || s.course || "Student") + '</div>' +
            '</div>' +
          '</a>';
      });
    }

    if (scholHits.length) {
      html += '<div class="search-section-label"><i class="bi bi-award"></i> Scholarships</div>';
      scholHits.forEach(function (s) {
        html +=
          '<a class="search-result-item" href="adminscholarships.html">' +
            '<div class="search-result-icon schol"><i class="bi bi-award-fill"></i></div>' +
            '<div class="search-result-main">' +
              '<div class="search-result-title">' + esc(s.title) + '</div>' +
              '<div class="search-result-sub">Scholarship program</div>' +
            '</div>' +
            '<span class="search-result-badge active">active</span>' +
          '</a>';
      });
    }

    results.hidden = false;
    results.innerHTML = html;
  }

  /* ── Animate counter ── */
  function animateNumber(element, target, duration) {
    if (!element) return;
    duration = duration || 800;
    var startTime = performance.now();
    function tick(now) {
      var elapsed  = now - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var eased    = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(target * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initReportButton() {
    var btn = qs(".btn-download");
    if (!btn) return;
    btn.addEventListener("click", function () { window.location.href = "adminreport.html"; });
  }

  function initReviewButton() {
    var btn = qs(".btn-review");
    if (!btn) return;
    btn.addEventListener("click", function () { window.location.href = "adminapplications.html"; });
  }

  function initPlaceholderLinks() {
    qsa("[data-placeholder-link]").forEach(function (link) {
      link.addEventListener("click", function (e) { e.preventDefault(); showToast(link.textContent.trim() + " is available from the admin navigation."); });
    });
  }

  function initAdminNotificationPopover() {
    var bell    = qs("#adminNotifBell");
    var popover = qs("#adminNotificationPopover");
    var markAll = qs("#adminNotifMarkAll");
    if (!bell || !popover) return;

    bell.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = popover.classList.toggle("show");
      bell.setAttribute("aria-expanded", String(open));
    });
    popover.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () { popover.classList.remove("show"); bell.setAttribute("aria-expanded", "false"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") popover.classList.remove("show"); });

    qsa("[data-admin-notif]", popover).forEach(function (item) {
      item.addEventListener("click", function () {
        item.classList.remove("unread");
        var dot = item.querySelector(".admin-notif-dot");
        if (dot) dot.remove();
        updateUnreadCount();
      });
    });
    if (markAll) {
      markAll.addEventListener("click", function () {
        qsa(".admin-notif-item.unread", popover).forEach(function (i) {
          i.classList.remove("unread");
          var d = i.querySelector(".admin-notif-dot");
          if (d) d.remove();
        });
        updateUnreadCount();
        showToast("All admin alerts marked as read.");
      });
    }
    updateUnreadCount();
  }

  function updateUnreadCount() {
    var popover = qs("#adminNotificationPopover");
    var badge   = qs("#adminNotifCount");
    var sub     = qs("#adminNotifSubtitle");
    if (!popover) return;
    var n = qsa(".admin-notif-item.unread", popover).length;
    if (badge) { badge.textContent = n; badge.classList.toggle("hidden", n === 0); }
    if (sub)   sub.textContent = n === 0 ? "No unread alerts" : n + " unread alert" + (n > 1 ? "s" : "");
  }

  function showToast(message) {
    var t = document.getElementById("adminDashboardToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "adminDashboardToast";
      t.className = "admin-dashboard-toast";
      t.innerHTML = "<i class='bi bi-info-circle-fill'></i><span></span>";
      document.body.appendChild(t);
    }
    var span = t.querySelector("span");
    if (span) span.textContent = message;
    t.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }
})();
