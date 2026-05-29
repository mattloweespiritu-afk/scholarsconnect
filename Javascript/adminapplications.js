/* =========================================================
   ScholarsConnect Admin Applications List
   File: ESTECH/Javascript/adminapplications.js
========================================================= */
import { auth, db, collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, addDoc, serverTimestamp } from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

let applyApplicationFilters = function () {};
let unsubApplications = null;

document.addEventListener("DOMContentLoaded", async function () {
  initAdminLogout();
  initAdminMobileSidebar();
  loadAdminProfile();
  initAdminNotificationPopover();
  initApplicationFilters();
  loadApplications();
  initRemoveRejected();
  initClearAllRejected();
  window.addEventListener("beforeunload", function () {
    if (unsubApplications) unsubApplications();
  });
});

/* ── Load applications from Firestore (real-time) ── */
function loadApplications() {
  const tbody = document.getElementById("apl-tbody");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr id="apl-loading-row">
      <td colspan="6" style="text-align:center;padding:32px;color:#999;">
        <i class="bi bi-arrow-repeat" style="font-size:18px;"></i>
        <span style="margin-left:8px;">Loading applications…</span>
      </td>
    </tr>`;

  if (unsubApplications) unsubApplications();

  const q = query(collection(db, "applications"), orderBy("submittedAt", "desc"), limit(100));

  unsubApplications = onSnapshot(q, function (snap) {
    const apps = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    tbody.innerHTML = "";

    if (apps.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;padding:48px;color:#999;">
            No applications yet.
          </td>
        </tr>`;
      updateTabCounts(computeCounts(apps));
      return;
    }

    const dupKeyCount = buildDuplicateKeyCount(apps);
    apps.forEach(app => tbody.insertAdjacentHTML("beforeend", buildRow(app, dupKeyCount)));
    updateTabCounts(computeCounts(apps));
    const countTotal = document.getElementById("apl-count-total");
    if (countTotal) countTotal.textContent = apps.length;
    applyApplicationFilters();

  }, function (e) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;padding:32px;color:#c0392b;">
          Failed to load applications. Check your connection.
        </td>
      </tr>`;
    console.error("Load applications error:", e);
  });
}

function computeCounts(apps) {
  return {
    all: apps.length,
    submitted:      apps.filter(a => a.status === "submitted").length,
    "under-review": apps.filter(a => a.status === "under_review").length,
    approved:       apps.filter(a => a.status === "approved").length,
    rejected:       apps.filter(a => a.status === "rejected").length
  };
}

function buildDuplicateKeyCount(apps) {
  const counts = new Map();
  apps.forEach(function (app) {
    const key = app.duplicateKey || (app.userId + "_" + app.scholarshipId + "_" + (app.academicYear || ""));
    if (!key || key === "__") return;
    const ACTIVE = new Set(["submitted", "under_review", "approved", "active", "needs_reupload", "needs-reupload"]);
    const s = String(app.status || "").toLowerCase().replace(/-/g, "_");
    if (!ACTIVE.has(s)) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function buildRow(app, dupKeyCount) {
  const name    = escHtml(app.applicantName  || "Unknown");
  const studId  = escHtml(app.studentId      || "—");
  const sc      = escHtml(app.scholarshipName || "—");
  const scType  = escHtml(app.scholarshipType || "");
  const date    = app.submittedAt ? fmtDate(app.submittedAt.toDate ? app.submittedAt.toDate() : new Date(app.submittedAt)) : "—";
  const ref     = escHtml(app.refNumber      || app.id.slice(0, 12).toUpperCase());
  const status  = app.status || "submitted";
  const filterStatus = status === "under_review" ? "under-review" : status;
  const badgeMap = {
    submitted:    ["apl-submitted",   "Submitted"],
    "under_review": ["apl-review",   "Under Review"],
    approved:     ["apl-approved",    "Approved"],
    rejected:     ["apl-rejected",    "Rejected"]
  };
  const [badgeCls, badgeTxt] = badgeMap[status] || ["apl-submitted", "Submitted"];
  const initials = name.split(" ").map(w => w[0] || "").join("").slice(0, 2).toUpperCase();

  const appDupKey = app.duplicateKey || (app.userId + "_" + app.scholarshipId + "_" + (app.academicYear || ""));
  const isDupRow  = app.isDuplicate === true || (dupKeyCount && dupKeyCount.get(appDupKey) > 1);
  const dupBadge  = isDupRow ? `<span class="apl-badge apl-dup" title="Possible duplicate application"><i class="bi bi-copy"></i> Duplicate</span>` : "";

  return `
    <tr data-status="${escAttr(filterStatus)}" data-sc="${escAttr(app.scholarshipName || "")}" data-name="${escAttr(name.toLowerCase())}">
      <td>
        <div class="apl-name-cell">
          <div class="apl-av" style="background:#4A1212;">${escHtml(initials)}</div>
          <div>
            <div class="apl-name">${name}</div>
            <div class="apl-stid">${studId}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="apl-sc-name">${sc}</div>
        ${scType ? `<span class="as-type-tag merit">${escHtml(scType)}</span>` : ""}
      </td>
      <td class="apl-date">${date}</td>
      <td><span class="apl-ref">${ref}</span></td>
      <td>
        <span class="apl-badge ${badgeCls}">${badgeTxt}</span>
        ${dupBadge}
      </td>
      <td>
        <div class="apl-actions-cell">
          <a href="adminapplicationreview.html?id=${escAttr(app.id)}" class="apl-review-btn">
            <i class="bi bi-clipboard2-check"></i> Review
          </a>
          <button class="apl-remove-btn" data-id="${escAttr(app.id)}" data-name="${escAttr(name)}" type="button"><i class="bi bi-trash"></i> Remove</button>
        </div>
      </td>
    </tr>`;
}


function updateTabCounts(counts) {
  document.querySelectorAll(".apl-tab").forEach(tab => {
    const key = tab.dataset.filter;
    const count = tab.querySelector(".apl-tab-ct");
    if (count && counts[key] !== undefined) count.textContent = counts[key];
  });

  var pending = (counts.submitted || 0) + (counts["under-review"] || 0);
  var approved = counts.approved || 0;

  var statPending  = document.getElementById("apl-stat-pending");
  var statApproved = document.getElementById("apl-stat-approved");
  var navBadge     = document.getElementById("apl-nav-badge");

  if (statPending)  statPending.textContent  = pending;
  if (statApproved) statApproved.textContent = approved;
  if (navBadge)     navBadge.textContent     = pending;

  var clearBtn = document.getElementById("aplClearRejected");
  if (clearBtn) clearBtn.style.display = (counts.rejected > 0) ? "" : "none";
}

function initApplicationFilters() {
  const tbody = document.getElementById("apl-tbody");
  if (!tbody) return;

  const searchInput = document.getElementById("apl-search");
  const scholarshipFilter = document.getElementById("apl-filter-sc");
  const tabs = Array.from(document.querySelectorAll(".apl-tab"));
  const emptyState = document.getElementById("apl-empty");
  let activeFilter = "all";

  applyApplicationFilters = function () {
    const term = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const scholarship = scholarshipFilter ? scholarshipFilter.value.toLowerCase() : "";
    let visible = 0;

    Array.from(tbody.querySelectorAll("tr")).forEach(row => {
      const status = row.dataset.status || "";
      const rowScholarship = (row.dataset.sc || "").toLowerCase();
      const name = (row.dataset.name || "").toLowerCase();
      const reference = (row.querySelector(".apl-ref")?.textContent || "").toLowerCase();

      const matchesTab = activeFilter === "all" || status === activeFilter;
      const matchesScholarship = !scholarship || rowScholarship.includes(scholarship);
      const matchesTerm = !term || name.includes(term) || reference.includes(term);
      const shouldShow = matchesTab && matchesScholarship && matchesTerm;

      row.style.display = shouldShow ? "" : "none";
      if (shouldShow) visible++;
    });

    if (emptyState) emptyState.style.display = visible === 0 ? "block" : "none";

    const countVisible = document.getElementById("apl-count-visible");
    if (countVisible) countVisible.textContent = visible;
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(item => item.classList.remove("active"));
      tab.classList.add("active");
      activeFilter = tab.dataset.filter || "all";
      applyApplicationFilters();
    });
  });

  if (searchInput) searchInput.addEventListener("input", applyApplicationFilters);
  if (scholarshipFilter) scholarshipFilter.addEventListener("change", applyApplicationFilters);
}

/* ── Remove rejected application ── */
function initRemoveRejected() {
  var tbody = document.getElementById("apl-tbody");
  if (!tbody) return;

  tbody.addEventListener("click", async function (e) {
    var btn = e.target.closest(".apl-remove-btn");
    if (!btn) return;

    if (!btn.dataset.confirming) {
      btn.dataset.confirming = "true";
      btn.classList.add("confirming");
      btn.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Confirm Remove?';
      btn._resetTimer = setTimeout(function () {
        btn.dataset.confirming = "";
        btn.classList.remove("confirming");
        btn.innerHTML = '<i class="bi bi-trash"></i> Remove';
      }, 4000);
      return;
    }

    clearTimeout(btn._resetTimer);
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Removing…';

    var appId   = btn.dataset.id;
    var appName = btn.dataset.name || "Unknown";

    try {
      await deleteDoc(doc(db, "applications", appId));
      await addDoc(collection(db, "auditLogs"), {
        action:      "application_removed",
        targetId:    appId,
        targetName:  appName,
        performedBy: auth.currentUser ? auth.currentUser.uid   : "unknown",
        adminEmail:  auth.currentUser ? auth.currentUser.email : "unknown",
        timestamp:   serverTimestamp(),
        note:        "Rejected application permanently removed by admin"
      });
    } catch (err) {
      btn.disabled = false;
      btn.dataset.confirming = "";
      btn.classList.remove("confirming");
      btn.innerHTML = '<i class="bi bi-trash"></i> Remove';
      console.error("Remove application error:", err);
    }
  });
}

/* ── Remove ALL rejected applications at once ── */
function initClearAllRejected() {
  var btn = document.getElementById("aplClearRejected");
  if (!btn) return;

  btn.addEventListener("click", async function () {
    if (!btn.dataset.confirming) {
      btn.dataset.confirming = "true";
      btn.classList.add("confirming");
      btn.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Confirm Remove All?';
      btn._resetTimer = setTimeout(function () {
        btn.dataset.confirming = "";
        btn.classList.remove("confirming");
        btn.innerHTML = '<i class="bi bi-trash3"></i> Remove All Rejected';
      }, 5000);
      return;
    }

    clearTimeout(btn._resetTimer);
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Removing…';

    var rejectedRows = Array.from(document.querySelectorAll("#apl-tbody tr[data-status='rejected']"));
    var ids = rejectedRows.map(function (row) {
      var removeBtn = row.querySelector(".apl-remove-btn");
      return removeBtn ? removeBtn.dataset.id : null;
    }).filter(Boolean);

    if (ids.length === 0) {
      btn.disabled = false;
      btn.dataset.confirming = "";
      btn.innerHTML = '<i class="bi bi-trash3"></i> Remove All Rejected';
      return;
    }

    try {
      await Promise.all(ids.map(function (id) {
        return deleteDoc(doc(db, "applications", id));
      }));
      await addDoc(collection(db, "auditLogs"), {
        action:      "bulk_rejected_removed",
        count:       ids.length,
        performedBy: auth.currentUser ? auth.currentUser.uid   : "unknown",
        adminEmail:  auth.currentUser ? auth.currentUser.email : "unknown",
        timestamp:   serverTimestamp(),
        note:        "All " + ids.length + " rejected application(s) removed in bulk by admin"
      });
    } catch (err) {
      btn.disabled = false;
      btn.dataset.confirming = "";
      btn.classList.remove("confirming");
      btn.innerHTML = '<i class="bi bi-trash3"></i> Remove All Rejected';
      console.error("Bulk remove error:", err);
    }
  });
}

/* ── Helpers ── */
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(s) { return String(s).replace(/"/g, "&quot;"); }
function fmtDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ── Admin notification popover ── */
function initAdminNotificationPopover() {
  const bell    = document.getElementById("adminNotifBell");
  const popover = document.getElementById("adminNotificationPopover");
  const markAll = document.getElementById("adminNotifMarkAll");
  if (!bell || !popover) return;

  bell.addEventListener("click", e => { e.stopPropagation(); popover.classList.toggle("show"); });
  popover.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", () => popover.classList.remove("show"));
  document.addEventListener("keydown", e => { if (e.key === "Escape") popover.classList.remove("show"); });

  document.querySelectorAll("[data-admin-notif]").forEach(item => {
    item.addEventListener("click", () => { item.classList.remove("unread"); updateUnreadCount(); });
  });
  if (markAll) {
    markAll.addEventListener("click", () => {
      document.querySelectorAll(".admin-notif-item.unread").forEach(i => i.classList.remove("unread"));
      updateUnreadCount();
    });
  }
  updateUnreadCount();
}

function updateUnreadCount() {
  const count = document.querySelectorAll(".admin-notif-item.unread").length;
  const badge = document.getElementById("adminNotifCount");
  const sub   = document.getElementById("adminNotifSubtitle");
  if (badge) { badge.textContent = count; badge.classList.toggle("hidden", count === 0); }
  if (sub)   sub.textContent = count === 0 ? "No unread alerts" : count + " unread alert" + (count > 1 ? "s" : "");
}


