/* =========================================================
   ScholarsConnect — Disbursement Management
   File: ESTECH/Javascript/admindisbursement.js
   Firestore-backed disbursement workflow.
========================================================= */
import { auth, db, doc, setDoc, collection, addDoc, query, where, onSnapshot, serverTimestamp } from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

(function () {
  "use strict";

  var adminDisplayName      = "Administrator";
  var unsubApplications     = null;
  var unsubDisbursements    = null;
  var unsubScholarships     = null;
  var releasedByUserId      = {}; /* { userId: { ref, dateStr } } — shared between subscriptions */
  var scholarshipStipendMap = {}; /* { "Scholarship Title": numericAmount } */

  document.addEventListener("DOMContentLoaded", function () {
    initAdminLogout();
    initAdminMobileSidebar();
    loadAdminProfile().then(function(profile) {
      if (profile && profile.displayName) adminDisplayName = profile.displayName;
    });
    initAdminNotificationPopover();
    initTabFilter();
    initCheckboxes();
    initReleaseModal();
    initReceiptModal();
    initBatchReleaseModal();
    subscribeScholarshipStipends();
    subscribeApprovedScholars();
    window.addEventListener("beforeunload", function () {
      if (unsubApplications)  unsubApplications();
      if (unsubDisbursements) unsubDisbursements();
      if (unsubScholarships)  unsubScholarships();
    });
  });

  /* ── Helpers ── */
  function qs(selector, parent)  { return (parent || document).querySelector(selector); }
  function qsa(selector, parent) { return Array.from((parent || document).querySelectorAll(selector)); }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  /* ── Subscribe to scholarships to build stipend map ── */
  function subscribeScholarshipStipends() {
    if (unsubScholarships) unsubScholarships();
    unsubScholarships = onSnapshot(
      collection(db, "scholarships"),
      function (snap) {
        scholarshipStipendMap = {};
        snap.docs.forEach(function (d) {
          var s = d.data();
          var title = s.title || s.name || "";
          var amt   = parseFloat(s.monthlyStipend) || 0;
          if (title) scholarshipStipendMap[title] = amt;
        });
        applyScholarshipAmounts();
      },
      function (e) { console.warn("Scholarships subscription error:", e); }
    );
  }

  /* After scholarship map loads, update any rows that still show "—" */
  function applyScholarshipAmounts() {
    qsa("#dsb-tbody tr").forEach(function (row) {
      var scName  = row.dataset.sc || "";
      var stipend = scholarshipStipendMap[scName];
      if (!stipend) return;
      var amtEl = qs(".dsb-amount", row);
      if (amtEl && (amtEl.textContent === "—" || !amtEl.textContent.trim())) {
        amtEl.textContent = "\u20B1" + stipend.toLocaleString("en-US");
      }
      var btn = qs(".dsb-release-btn", row);
      if (btn) btn.dataset.amount = "\u20B1" + stipend.toLocaleString("en-US");
    });
    updateSummaryCards();
  }

  /* ── Load approved scholars from Firestore ── */
  function subscribeApprovedScholars() {
    var tbody = qs("#dsb-tbody");
    if (!tbody) return;
    if (unsubApplications) unsubApplications();
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#999">Loading scholars…</td></tr>';

    unsubApplications = onSnapshot(
      query(collection(db, "applications"), where("status", "==", "approved")),
      function (snap) {
        tbody.innerHTML = "";
        if (snap.empty) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#999">No approved scholars yet.</td></tr>';
          updateSummaryCards();
          return;
        }
        snap.docs.forEach(function (d) {
          tbody.insertAdjacentHTML("beforeend", buildDisbRow(d.id, d.data()));
        });
        applyReleasedStatus();
        updateSummaryCards();
        if (!unsubDisbursements) subscribeDisbursements();
      },
      function (e) {
        console.warn("Applications subscription error:", e);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#999">Could not load scholars.</td></tr>';
      }
    );
  }

  function buildDisbRow(appId, app) {
    var name     = app.applicantName || app.displayName || "—";
    var initials = name.split(" ").map(function (w) { return w[0] || ""; }).join("").toUpperCase().slice(0, 2) || "??";
    var avatarBg = stringToColor(name);
    var studentId = app.studentId || app.schoolId || "—";
    var sc       = app.scholarshipName || "—";
    var scClass  = scTagClass(sc);
    var rawAmt   = parseFloat(app.monthlyStipend || app.stipendAmount || 0)
                  || scholarshipStipendMap[sc]
                  || 0;
    var amount   = rawAmt ? "\u20B1" + rawAmt.toLocaleString("en-US") : "—";
    var period   = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
    var semester = app.semester || "1st Semester";
    var userId   = app.userId || "";
    var ref      = "DSB-" + appId.slice(-8).toUpperCase(); /* stable per application */
    var relDate  = getNextReleaseDate();

    return (
      '<tr data-status="pending"' +
          ' data-sc="' + escapeHtml(sc) + '"' +
          ' data-name="' + escapeHtml(name.toLowerCase()) + '"' +
          ' data-month="' + escapeHtml(period) + '"' +
          ' data-userid="' + escapeHtml(userId) + '"' +
          ' data-appid="' + escapeHtml(appId) + '">' +
        '<td><input type="checkbox" class="dsb-chk dsb-row-chk"/></td>' +
        '<td><div class="dsb-name-cell">' +
          '<div class="dsb-av" style="background:' + escapeHtml(avatarBg) + '">' + escapeHtml(initials) + '</div>' +
          '<div><div class="dsb-name">' + escapeHtml(name) + '</div><div class="dsb-id">' + escapeHtml(studentId) + '</div></div>' +
        '</div></td>' +
        '<td><span class="dsb-sc-tag ' + escapeHtml(scClass) + '">' + escapeHtml(sc) + '</span></td>' +
        '<td><div class="dsb-period">' + escapeHtml(period) + '</div><div class="dsb-sem">' + escapeHtml(semester) + '</div></td>' +
        '<td><strong class="dsb-amount">' + escapeHtml(amount) + '</strong></td>' +
        '<td><span class="dsb-ref">' + escapeHtml(ref) + '</span></td>' +
        '<td class="dsb-date dsb-date-sched">' + escapeHtml(relDate) + '</td>' +
        '<td><span class="dsb-badge pending">Pending</span></td>' +
        '<td><div class="dsb-action-row">' +
          '<button class="dsb-release-btn"' +
            ' data-ref="'     + escapeHtml(ref)     + '"' +
            ' data-student="' + escapeHtml(name)    + '"' +
            ' data-sc="'      + escapeHtml(sc)      + '"' +
            ' data-amount="'  + escapeHtml(amount)  + '"' +
            ' data-period="'  + escapeHtml(period)  + '"' +
            ' data-userid="'  + escapeHtml(userId)  + '"' +
            ' data-appid="'   + escapeHtml(appId)   + '">' +
            '<i class="bi bi-send-fill"></i> Release' +
          '</button>' +
        '</div></td>' +
      '</tr>'
    );
  }

  /* ── Cross-reference disbursements to mark released rows ── */
  function subscribeDisbursements() {
    if (unsubDisbursements) unsubDisbursements();
    unsubDisbursements = onSnapshot(
      collection(db, "disbursements"),
      function (snap) {
        releasedByUserId = {};
        snap.docs.forEach(function (d) {
          var data = d.data();
          if (data.userId && data.status === "released") {
            releasedByUserId[data.userId] = {
              ref:     data.reference || data.referenceNo || d.id,
              dateStr: data.releasedAt
                ? (data.releasedAt.toDate ? data.releasedAt.toDate() : new Date(data.releasedAt))
                    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            };
          }
        });
        applyReleasedStatus();
        updateSummaryCards();
      },
      function (e) { console.warn("Disbursements subscription error:", e); }
    );
  }

  function applyReleasedStatus() {
    qsa("#dsb-tbody tr[data-userid]").forEach(function (row) {
      var uid = row.dataset.userid;
      if (uid && releasedByUserId[uid] && row.dataset.status !== "released") {
        markRowReleased(row, releasedByUserId[uid].ref, releasedByUserId[uid].dateStr);
      }
    });
  }

  /* ── Utility: stable color from name string ── */
  function stringToColor(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    var colors = ["#7A2323","#4A1212","#2C5F2E","#1A3A5C","#6B2D8B","#8B4513","#2C4770"];
    return colors[Math.abs(hash) % colors.length];
  }

  function scTagClass(name) {
    var n = (name || "").toLowerCase();
    if (n.includes("ched") || n.includes("merit")) return "merit";
    if (n.includes("dost") || n.includes("stem"))  return "stem";
    if (n.includes("tes")  || n.includes("need") || n.includes("unifast")) return "need";
    if (n.includes("lgu")  || n.includes("cebu"))  return "gov-lgu";
    return "merit";
  }

  function getNextReleaseDate() {
    var d = new Date();
    d.setDate(15);
    if (d <= new Date()) d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function updateSummaryCards() {
    var pendingRows  = qsa("#dsb-tbody tr[data-status='pending']");
    var releasedRows = qsa("#dsb-tbody tr[data-status='released']");
    var pending      = pendingRows.length;
    var released     = releasedRows.length;
    var total        = pending + released;

    /* Compute "Due This Batch" — sum of pending scholars' amounts */
    var dueAmt = 0;
    pendingRows.forEach(function (row) {
      var amtText = ((qs(".dsb-amount", row) || {}).textContent || "").replace(/[\u20B1,\s]/g, "");
      dueAmt += parseFloat(amtText) || 0;
    });

    /* Compute "Total Released (AY)" — sum of all released amounts */
    var releasedAmt = 0;
    releasedRows.forEach(function (row) {
      var amtText = ((qs(".dsb-amount", row) || {}).textContent || "").replace(/[\u20B1,\s]/g, "");
      releasedAmt += parseFloat(amtText) || 0;
    });

    var pendingValEl  = qs(".dsb-sum-pending .dsb-sum-value");
    var dueValEl      = qs(".dsb-sum-amount .dsb-sum-value");
    var releasedValEl = qs(".dsb-sum-released .dsb-sum-value");
    var scholarsValEl = qs(".dsb-sum-scholars .dsb-sum-value");

    if (pendingValEl)  pendingValEl.textContent  = pending;
    if (dueValEl)      dueValEl.textContent       = dueAmt > 0 ? "\u20B1" + dueAmt.toLocaleString("en-US") : "\u20B10";
    if (releasedValEl) releasedValEl.textContent  = releasedAmt > 0 ? "\u20B1" + releasedAmt.toLocaleString("en-US") : "\u20B10";
    if (scholarsValEl) scholarsValEl.textContent  = total;

    var tabAll      = qs(".dsb-tab[data-filter='all'] .dsb-tab-ct");
    var tabPending  = qs(".dsb-tab[data-filter='pending'] .dsb-tab-ct");
    var tabReleased = qs(".dsb-tab[data-filter='released'] .dsb-tab-ct");
    if (tabAll)      tabAll.textContent      = total;
    if (tabPending)  tabPending.textContent  = pending;
    if (tabReleased) tabReleased.textContent = released;
  }

  /* ── Tab Filter + Search (queries rows dynamically) ── */
  function initTabFilter() {
    var tabs        = qsa(".dsb-tab");
    var emptyEl     = qs("#dsb-empty");
    var searchInput = qs("#dsb-search");
    var scFilter    = qs("#dsb-filter-sc");
    var monthFilter = qs("#dsb-filter-month");
    var activeFilter = "all";

    function applyFilters() {
      var rows    = qsa("#dsb-tbody tr");
      var search  = searchInput ? searchInput.value.trim().toLowerCase() : "";
      var sc      = scFilter    ? scFilter.value : "";
      var month   = monthFilter ? monthFilter.value : "";
      var visible = 0;

      rows.forEach(function (row) {
        var status   = row.dataset.status || "";
        var name     = (row.dataset.name  || "").toLowerCase();
        var rowSc    = row.dataset.sc     || "";
        var rowMonth = row.dataset.month  || "";
        var refText  = ((qs(".dsb-ref", row) || {}).textContent || "").toLowerCase();

        var matchTab    = activeFilter === "all" || status === activeFilter;
        var matchSearch = !search || name.includes(search) || refText.includes(search);
        var matchSc     = !sc    || rowSc    === sc;
        var matchMonth  = !month || rowMonth === month;

        var show = matchTab && matchSearch && matchSc && matchMonth;
        row.style.display = show ? "" : "none";
        if (show) visible++;
      });

      if (emptyEl) emptyEl.style.display = visible === 0 ? "flex" : "none";
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        activeFilter = tab.dataset.filter || "all";
        applyFilters();
      });
    });

    if (searchInput) searchInput.addEventListener("input",  applyFilters);
    if (scFilter)    scFilter.addEventListener("change",    applyFilters);
    if (monthFilter) monthFilter.addEventListener("change", applyFilters);
  }

  /* ── Checkboxes + Bulk Bar ── */
  function initCheckboxes() {
    var checkAll    = qs("#dsb-check-all");
    var bulkBar     = qs("#dsb-bulk-bar");
    var bulkCount   = qs("#dsb-bulk-count");
    var bulkRelease = qs("#dsb-bulk-release-btn");
    var bulkCancel  = qs("#dsb-bulk-cancel-btn");

    function updateBulkBar() {
      var checked = qsa(".dsb-row-chk:not(:disabled):checked");
      if (bulkBar)   bulkBar.style.display = checked.length > 0 ? "flex" : "none";
      if (bulkCount) bulkCount.textContent = checked.length + " scholar" + (checked.length !== 1 ? "s" : "") + " selected";
    }

    if (checkAll) {
      checkAll.addEventListener("change", function () {
        qsa(".dsb-row-chk:not(:disabled)").forEach(function (c) { c.checked = checkAll.checked; });
        updateBulkBar();
      });
    }

    var tbody = qs("#dsb-tbody");
    if (tbody) {
      tbody.addEventListener("change", function (e) {
        if (!e.target.classList.contains("dsb-row-chk")) return;
        if (checkAll) {
          var all = qsa(".dsb-row-chk:not(:disabled)");
          checkAll.checked = all.length > 0 && all.every(function (c) { return c.checked; });
        }
        updateBulkBar();
      });
    }

    if (bulkCancel) {
      bulkCancel.addEventListener("click", function () {
        qsa(".dsb-row-chk").forEach(function (c) { c.checked = false; });
        if (checkAll) checkAll.checked = false;
        if (bulkBar)  bulkBar.style.display = "none";
      });
    }

    if (bulkRelease) {
      bulkRelease.addEventListener("click", async function () {
        var checked = qsa(".dsb-row-chk:not(:disabled):checked");
        var rows = checked.map(function (chk) { return chk.closest("tr"); }).filter(Boolean);
        if (!rows.length) { showToast("Select at least one scholar to release."); return; }
        await releaseRows(rows, "Selected stipend release");
        qsa(".dsb-row-chk").forEach(function (c) { c.checked = false; });
        if (checkAll) checkAll.checked = false;
        if (bulkBar)  bulkBar.style.display = "none";
        showToast("Batch release recorded for " + rows.length + " scholar" + (rows.length !== 1 ? "s" : "") + ".");
      });
    }
  }

  /* ── Release Modal — event delegation ── */
  function initReleaseModal() {
    var overlay    = qs("#dsb-modal");
    var closeBtn   = qs("#dsb-modal-close");
    var cancelBtn  = qs("#dm-cancel");
    var confirmBtn = qs("#dm-confirm");
    var notesEl    = qs("#dm-notes");
    var tbody      = qs("#dsb-tbody");

    if (!overlay) return;

    function openReleaseModal(btn) {
      var row = btn.closest("tr");
      if (!row) return;

      var student = btn.dataset.student || (qs(".dsb-name",   row) || {}).textContent || "—";
      var sc      = btn.dataset.sc      || (qs(".dsb-sc-tag", row) || {}).textContent || "—";
      var amount  = btn.dataset.amount  || (qs(".dsb-amount", row) || {}).textContent || "—";
      var period  = btn.dataset.period  || (qs(".dsb-period", row) || {}).textContent || "—";
      var ref     = btn.dataset.ref     || (qs(".dsb-ref",    row) || {}).textContent || "—";
      var id      = (qs(".dsb-id",      row) || {}).textContent || "—";
      var date    = (qs(".dsb-date",    row) || {}).textContent || "—";

      var rawAmount = parseFloat((amount || "").replace(/[\u20B1,\s]/g, "")) || 0;
      /* Fallback: use scholarship stipend map if the row shows "—" */
      if (!rawAmount) rawAmount = scholarshipStipendMap[sc] || 0;
      var amtInput = qs("#dm-amount");
      if (amtInput) amtInput.value = rawAmount > 0 ? rawAmount : "";

      var grid = qs("#dm-grid");
      if (grid) {
        grid.innerHTML = [
          makeModalItem("Recipient",      student),
          makeModalItem("Student ID",     id),
          makeModalItem("Scholarship",    sc),
          makeModalItem("Period",         period),
          makeModalItem("Amount",         amount, "dsb-val-amount"),
          makeModalItem("Reference #",    ref),
          makeModalItem("Scheduled Date", date)
        ].join("");
      }

      var titleEl = qs("#dm-title");
      if (titleEl) titleEl.textContent = "Confirm Release — " + student;
      if (notesEl) notesEl.value = "";

      overlay._sourceRow = row;
      overlay.style.display = "flex";
    }

    function closeReleaseModal() { overlay.style.display = "none"; overlay._sourceRow = null; }

    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var btn = e.target.closest(".dsb-release-btn");
        if (btn) openReleaseModal(btn);
      });
    }

    if (closeBtn)  closeBtn.addEventListener("click", closeReleaseModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeReleaseModal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeReleaseModal(); });

    if (confirmBtn) {
      confirmBtn.addEventListener("click", async function () {
        var row = overlay._sourceRow;
        if (!row) { closeReleaseModal(); return; }
        await releaseRows([row], notesEl ? notesEl.value.trim() : "");
        closeReleaseModal();
        showToast("Stipend released and recorded. Receipt is now available.");
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.style.display !== "none") closeReleaseModal();
    });
  }

  function makeModalItem(label, value, extraClass) {
    return '<div class="dsb-modal-item">' +
      '<div class="dsb-modal-item-label">' + label + '</div>' +
      '<div class="dsb-modal-item-value' + (extraClass ? ' ' + extraClass : '') + '">' + value + '</div>' +
      '</div>';
  }

  /* ── Receipt Modal — event delegation ── */
  function openReceiptForRow(row) {
    if (!row) return;
    var name   = (qs(".dsb-name",    row) || {}).textContent || "—";
    var id     = (qs(".dsb-id",      row) || {}).textContent || "—";
    var sc     = (qs(".dsb-sc-tag",  row) || {}).textContent || "—";
    var period = (qs(".dsb-period",  row) || {}).textContent || "—";
    var sem    = (qs(".dsb-sem",     row) || {}).textContent || "";
    var amountRaw  = parseFloat(((qs(".dsb-amount",  row) || {}).textContent || "").replace(/[\u20B1,\s]/g, "")) || 0;
    var amount     = amountRaw > 0 ? "\u20B1" + amountRaw.toLocaleString("en-US", {minimumFractionDigits:2}) : "—";
    var date   = (qs(".dsb-date",    row) || {}).textContent || "—";
    var refBtn = qs(".dsb-receipt-btn", row);
    var ref    = (qs(".dsb-ref",     row) || {}).textContent || (refBtn && refBtn.dataset.ref) || "—";

    function setElText(elId, text) { var el = document.getElementById(elId); if (el) el.textContent = text; }
    setElText("rcpt-ref",    ref);
    setElText("rcpt-name",   name);
    setElText("rcpt-id",     id);
    setElText("rcpt-sc",     sc);
    setElText("rcpt-period", period + (sem ? " · " + sem : ""));
    setElText("rcpt-date",   date);
    setElText("rcpt-amount", amount);
    setElText("rcpt-admin",  adminDisplayName);

    var modal = qs("#dsb-receipt-modal");
    if (modal) modal.style.display = "flex";
  }

  function initReceiptModal() {
    var overlay   = qs("#dsb-receipt-modal");
    var closeBtn  = qs("#dsb-receipt-close");
    var cancelBtn = qs("#dsb-receipt-cancel");
    var printBtn  = qs("#dsb-receipt-print");
    var tbody     = qs("#dsb-tbody");

    if (!overlay) return;

    function closeReceipt() { overlay.style.display = "none"; }

    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var btn = e.target.closest(".dsb-receipt-btn");
        if (btn) openReceiptForRow(btn.closest("tr"));
      });
    }

    if (closeBtn)  closeBtn.addEventListener("click", closeReceipt);
    if (cancelBtn) cancelBtn.addEventListener("click", closeReceipt);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeReceipt(); });
    if (printBtn)  printBtn.addEventListener("click", function () { window.print(); });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.style.display !== "none") closeReceipt();
    });
  }

  /* ── Batch Release Modal ── */
  function initBatchReleaseModal() {
    var relAllBtn  = qs("#dsb-release-all-btn");
    var batchModal = qs("#dsb-batch-modal");
    var batchClose = qs("#dsb-batch-close");
    var bmCancel   = qs("#bm-cancel");
    var bmConfirm  = qs("#bm-confirm");

    if (!batchModal) return;

    function openBatch()  { batchModal.style.display = "flex"; }
    function closeBatch() { batchModal.style.display = "none"; }

    if (relAllBtn)  relAllBtn.addEventListener("click", openBatch);
    if (batchClose) batchClose.addEventListener("click", closeBatch);
    if (bmCancel)   bmCancel.addEventListener("click", closeBatch);
    batchModal.addEventListener("click", function (e) { if (e.target === batchModal) closeBatch(); });

    if (bmConfirm) {
      bmConfirm.addEventListener("click", async function () {
        var pendingRows = qsa("#dsb-tbody tr").filter(function (row) {
          return (row.dataset.status || "") === "pending";
        });
        await releaseRows(pendingRows, ((qs("#bm-notes") || {}).value || "").trim());
        closeBatch();
        showToast("Batch release recorded. " + pendingRows.length + " receipt" + (pendingRows.length !== 1 ? "s" : "") + " generated.");
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && batchModal.style.display !== "none") closeBatch();
    });
  }

  /* ── releaseRows ── */
  async function releaseRows(rows, notes) {
    var validRows = rows.filter(Boolean);
    await Promise.all(validRows.map(function (row) {
      markRowReleased(row);
      return recordDisbursementRelease(row, notes);
    }));
  }

  function markRowReleased(row, ref, dateStr) {
    var badgeEl = qs(".dsb-badge", row);
    if (badgeEl) { badgeEl.className = "dsb-badge released"; badgeEl.textContent = "Released"; }
    row.dataset.status = "released";

    var chkEl = qs(".dsb-row-chk", row);
    if (chkEl) { chkEl.checked = false; chkEl.disabled = true; }

    var dateEl = qs(".dsb-date", row);
    if (dateEl) {
      dateEl.classList.remove("dsb-date-sched");
      dateEl.textContent = dateStr || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    var displayRef = ref || (qs(".dsb-ref", row) || {}).textContent || "";
    if (ref) {
      var refEl = qs(".dsb-ref", row);
      if (refEl) refEl.textContent = ref;
    }

    var actionDiv = qs(".dsb-action-row", row);
    if (actionDiv) {
      actionDiv.innerHTML =
        '<button class="dsb-receipt-btn" data-ref="' + escapeHtml(displayRef) + '">' +
        '<i class="bi bi-receipt"></i> Receipt</button>';
    }
  }

  async function recordDisbursementRelease(row, notes) {
    var ref = "DSB-" + Date.now().toString().slice(-8);
    /* Update the reference displayed in the row immediately */
    var refEl = qs(".dsb-ref", row);
    if (refEl) refEl.textContent = ref;

    /* Read numeric amount from the input the admin confirmed */
    var amtInput  = qs("#dm-amount");
    var amountNum = amtInput ? (parseFloat(amtInput.value) || 0) : 0;
    /* Fallback: parse from row display text */
    if (!amountNum) {
      var amtText = ((qs(".dsb-amount", row) || {}).textContent || "").trim();
      amountNum = parseFloat(amtText.replace(/[\u20B1,\s]/g, "")) || 0;
    }

    var payload = {
      referenceNo:     ref,
      reference:       ref,        /* student side reads 'reference' */
      userId:          (row.dataset.userid || ""),   /* CRITICAL — student queries by this */
      applicationId:   (row.dataset.appid  || ""),
      studentName:     ((qs(".dsb-name",   row) || {}).textContent || "").trim(),
      studentId:       ((qs(".dsb-id",     row) || {}).textContent || "").trim(),
      scholarship:     ((qs(".dsb-sc-tag", row) || {}).textContent || "").trim(),
      period:          ((qs(".dsb-period", row) || {}).textContent || "").trim(),
      semester:        ((qs(".dsb-sem",    row) || {}).textContent || "").trim(),
      amount:          amountNum,  /* stored as number — student reads and formats this */
      status:          "released",
      releaseDate:     serverTimestamp(),  /* student side reads 'releaseDate' */
      notes:           notes || "",
      releasedByUid:   auth.currentUser ? auth.currentUser.uid   : null,
      releasedByEmail: auth.currentUser ? auth.currentUser.email : "",
      releasedAt:      serverTimestamp(),
      updatedAt:       serverTimestamp()
    };

    await setDoc(doc(db, "disbursements", makeDocId(ref)), payload, { merge: true });
    await addDoc(collection(db, "auditLogs"), {
      title:       "Stipend Released",
      type:        "Disbursement",
      severity:    "Info",
      description: "Admin released stipend " + ref + " for " + (payload.studentName || "a scholar") + ".",
      referenceNo: ref,
      studentName: payload.studentName,
      amount:      amountNum,
      adminUid:    payload.releasedByUid,
      adminEmail:  payload.releasedByEmail,
      createdAt:   serverTimestamp()
    });
  }

  function makeDocId(value) {
    return String(value || Date.now()).trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || String(Date.now());
  }

  /* ── Notification Popover ── */
  function initAdminNotificationPopover() {
    var bell    = qs("#adminNotifBell");
    var popover = qs("#adminNotificationPopover");
    var markAll = qs("#adminNotifMarkAll");
    if (!bell || !popover) return;
    bell.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var isOpen = popover.classList.toggle("show");
      bell.setAttribute("aria-expanded", String(isOpen));
    });
    bell.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bell.click(); }
    });
    popover.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () { popover.classList.remove("show"); bell.setAttribute("aria-expanded", "false"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { popover.classList.remove("show"); bell.setAttribute("aria-expanded", "false"); }
    });
    qsa("[data-admin-notif]", popover).forEach(function (item) {
      item.addEventListener("click", function () {
        item.classList.remove("unread");
        var dot = qs(".admin-notif-dot", item); if (dot) dot.remove();
        updateUnreadCount();
      });
    });
    if (markAll) {
      markAll.addEventListener("click", function () {
        qsa(".admin-notif-item.unread", popover).forEach(function (item) {
          item.classList.remove("unread");
          var dot = qs(".admin-notif-dot", item); if (dot) dot.remove();
        });
        updateUnreadCount();
        showToast("All admin alerts marked as read.");
      });
    }
    updateUnreadCount();
  }

  function updateUnreadCount() {
    var popover  = qs("#adminNotificationPopover");
    var badge    = qs("#adminNotifCount");
    var subtitle = qs("#adminNotifSubtitle");
    if (!popover) return;
    var n = qsa(".admin-notif-item.unread", popover).length;
    if (badge)    { badge.textContent = n; badge.classList.toggle("hidden", n === 0); }
    if (subtitle) { subtitle.textContent = n === 0 ? "No unread alerts" : n + " unread alert" + (n > 1 ? "s" : ""); }
  }

  /* ── Toast ── */
  function showToast(message) {
    var toast = document.getElementById("scToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "scToast";
      toast.className = "admin-toast";
      toast.setAttribute("role", "alert");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<i class="bi bi-check-circle-fill"></i> ' + message;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove("show"); }, 3000);
  }

})();


