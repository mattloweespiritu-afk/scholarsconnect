/* =========================================================
   ScholarsConnect — Manage Scholarships
   File: ESTECH/Javascript/adminscholarships.js
   Real-time Firestore scholarship feed + CRUD writes.
========================================================= */
import { db, doc, setDoc, addDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, query, orderBy, where, serverTimestamp } from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

(function () {
  "use strict";

  var unsubScholarships  = null;
  var unsubApproved      = null;
  var approvedCountMap   = {}; /* { "Scholarship Title": count } */

  document.addEventListener("DOMContentLoaded", async function () {
    initAdminLogout();
    initAdminMobileSidebar();
    loadAdminProfile();
    initAdminNotificationPopover();
    subscribeScholarships();
    subscribeApprovedCounts();
    initSaveHandler();
    initDeleteConfirm();
    window.addEventListener("beforeunload", function () {
      if (unsubScholarships) unsubScholarships();
      if (unsubApproved)     unsubApproved();
    });
  });

  /* ── Helpers ── */
  function qs(selector, parent)  { return (parent || document).querySelector(selector); }
  function qsa(selector, parent) { return Array.from((parent || document).querySelectorAll(selector)); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  /* ── Subscribe to approved+active applications to count filled slots ── */
  function subscribeApprovedCounts() {
    if (unsubApproved) unsubApproved();
    unsubApproved = onSnapshot(
      query(collection(db, "applications"), where("status", "in", ["approved", "active"])),
      function (snap) {
        approvedCountMap = {};
        snap.docs.forEach(function (d) {
          var name = d.data().scholarshipName || "";
          if (name) approvedCountMap[name] = (approvedCountMap[name] || 0) + 1;
        });
        applyFilledCounts();
      },
      function (e) { console.warn("Approved applications count error:", e); }
    );
  }

  /* Update filled bar + number for each scholarship row */
  function applyFilledCounts() {
    var tbody = qs("#as-tbody");
    if (!tbody) return;
    qsa("tr[data-name]", tbody).forEach(function (row) {
      var name    = row.dataset.name || "";
      var filled  = approvedCountMap[name] || 0;
      var slotsNum = parseInt(row.dataset.slots, 10) || 0;
      var fillPct  = slotsNum > 0 ? Math.min(100, Math.round((filled / slotsNum) * 100)) : 0;

      /* Update fill bar */
      var inner = row.querySelector(".as-fill-inner");
      if (inner) inner.style.width = fillPct + "%";
      if (inner) inner.classList.toggle("full", fillPct >= 80);

      /* Update filled number */
      var label = row.querySelector(".as-fill-label");
      if (label) label.textContent = filled;
    });
  }

  /* ── Firestore subscription ── */
  function subscribeScholarships() {
    var tbody = qs("#as-tbody");
    if (!tbody) return;
    if (unsubScholarships) unsubScholarships();
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Loading…</td></tr>';

    unsubScholarships = onSnapshot(
      query(collection(db, "scholarships"), orderBy("createdAt", "desc")),
      function (snap) {
        if (snap.empty) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">No scholarships found. Add one above.</td></tr>';
          return;
        }
        tbody.innerHTML = "";
        snap.docs.forEach(function (d) {
          tbody.insertAdjacentHTML("beforeend", buildRow(d.id, d.data()));
        });
        applyFilledCounts();
      },
      function (e) {
        console.warn("Scholarships subscription error:", e);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Could not load scholarships.</td></tr>';
      }
    );
  }

  function buildRow(id, s) {
    var name     = s.title || s.name || "—";
    var sub      = s.subtitle || s.sub || "";
    var type     = s.type || "merit";
    var slots    = s.slotsTotal != null ? String(s.slotsTotal) : s.slots != null ? String(s.slots) : "—";
    var filled   = s.slotsFilled != null ? parseInt(s.slotsFilled, 10) : s.filledSlots != null ? parseInt(s.filledSlots, 10) : 0;
    var slotsNum = slots !== "—" ? parseInt(slots, 10) : 0;
    var fillPct  = slotsNum > 0 ? Math.min(100, Math.round((filled / slotsNum) * 100)) : 0;
    var deadline = s.deadline ? formatDeadline(s.deadline) : "—";
    var status   = s.status || "draft";
    var desc     = s.description || s.desc || "";
    var requirements = requirementsToText(s.requirements || s.requiredDocuments || s.documents);

    return (
      '<tr data-docid="' + esc(id) + '"' +
          ' data-name="' + esc(name) + '"' +
          ' data-type="' + esc(type) + '"' +
          ' data-status="' + esc(status) + '"' +
          ' data-slots="' + esc(slots) + '"' +
          ' data-deadline="' + esc(s.deadline || "") + '"' +
          ' data-sponsor="' + esc(s.sponsor || "") + '"' +
          ' data-desc="' + esc(desc) + '"' +
          ' data-award="' + esc(s.award || s.benefit || "") + '"' +
          ' data-monthly-stipend="' + esc(s.monthlyStipend || "") + '"' +
          ' data-min-gwa="' + esc(s.minGwa || "") + '"' +
          ' data-year-level="' + esc(s.yearLevel || "") + '"' +
          ' data-course="' + esc(s.course || "") + '"' +
          ' data-requirements="' + esc(requirements) + '"' +
          ' data-renewal="' + esc(s.renewal || "") + '"' +
          ' data-contact="' + esc(s.contact || "") + '">' +
        '<td>' +
          '<div class="as-sc-name">' + esc(name) + '</div>' +
          '<div class="as-sc-sub">'  + esc(sub)  + '</div>' +
        '</td>' +
        '<td><span class="as-type-tag ' + esc(type) + '">' + esc(capitalize(type)) + '</span></td>' +
        '<td>' + esc(slots) + '</td>' +
        '<td><div class="as-fill-wrap">' +
          '<div class="as-fill-bar"><div class="as-fill-inner' + (fillPct >= 80 ? " full" : "") + '" style="width:' + fillPct + '%"></div></div>' +
          '<span class="as-fill-label">' + filled + '</span>' +
        '</div></td>' +
        '<td><span class="as-deadline"><i class="bi bi-calendar3"></i> ' + esc(deadline) + '</span></td>' +
        '<td><span class="as-badge ' + esc(status) + '">' + esc(capitalize(status)) + '</span></td>' +
        '<td><div class="as-action-row">' +
          '<button class="as-action-btn scholars" title="View Scholars" type="button"><i class="bi bi-people-fill"></i></button>' +
          '<button class="as-action-btn edit"    title="Edit"    type="button"><i class="bi bi-pencil-fill"></i></button>' +
          '<button class="as-action-btn archive" title="Archive" type="button"><i class="bi bi-archive-fill"></i></button>' +
          '<button class="as-action-btn del"     title="Delete"  type="button"><i class="bi bi-trash-fill"></i></button>' +
        '</div></td>' +
      '</tr>'
    );
  }

  function formatDeadline(val) {
    if (!val) return "—";
    var d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function readValue(selector) {
    var el = qs(selector);
    return el ? String(el.value || "").trim() : "";
  }

  function textToRequirements(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function requirementsToText(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join("\n");
    return String(value || "");
  }

  /* ── Save handler: write to Firestore when modal is saved ── */
  function initSaveHandler() {
    var saveBtn = qs("#as-modal-save");
    if (!saveBtn) return;
    saveBtn.addEventListener("click", async function () {
      var name     = (qs("#as-inp-name")     || {}).value || "";
      var type     = (qs("#as-inp-type")     || {}).value || "";
      var status   = (qs("#as-inp-status")   || {}).value || "draft";
      var slots    = (qs("#as-inp-slots")    || {}).value || "";
      var deadline = (qs("#as-inp-deadline") || {}).value || "";
      var desc     = (qs("#as-inp-desc")     || {}).value || "";
      var sponsor  = readValue("#as-inp-sponsor");
      var award    = readValue("#as-inp-award");
      var minGwa   = readValue("#as-inp-min-gwa");
      var yearLevel = readValue("#as-inp-year-level");
      var course   = readValue("#as-inp-course");
      var requirementsText = readValue("#as-inp-requirements");
      var renewal  = readValue("#as-inp-renewal");
      var contact  = readValue("#as-inp-contact");
      var stipend  = parseFloat(readValue("#as-inp-stipend")) || 0;

      if (!name || !type) return; /* app.js already shows error */

      /* Determine if editing or new: check which row is currently highlighted/editing */
      var tbody    = qs("#as-tbody");
      var editing  = tbody ? tbody.querySelector("tr[data-editing='true']") : null;
      var docId    = editing ? editing.dataset.docid : null;

      var payload = {
        title: name,
        type: type,
        typeLabel: capitalize(type),
        status: status,
        description: desc,
        sponsor: sponsor,
        award: award,
        minGwa: minGwa,
        yearLevel: yearLevel,
        course: course,
        requirements: textToRequirements(requirementsText),
        renewal: renewal,
        contact: contact,
        monthlyStipend: stipend,
        updatedAt: serverTimestamp()
      };
      if (slots) {
        payload.slots = parseInt(slots, 10);
        payload.slotsTotal = parseInt(slots, 10);
      }
      if (deadline) {
        payload.deadline = deadline;
        payload.deadlineValue = deadline;
      }

      try {
        if (docId) {
          await updateDoc(doc(db, "scholarships", docId), payload);
        } else {
          payload.createdAt = serverTimestamp();
          await addDoc(collection(db, "scholarships"), payload);
        }
        /* Clear editing marker */
        if (editing) editing.removeAttribute("data-editing");
      } catch (e) {
        console.error("Save scholarship error:", e);
        showToast("Could not save scholarship. Please try again.");
      }
    });

    /* Mark row as editing when edit button is clicked */
    var tbody = qs("#as-tbody");
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var btn = e.target.closest(".as-action-btn.edit");
        if (!btn) return;
        var row = btn.closest("tr");
        if (!row) return;
        /* Clear previous editing markers */
        qsa("[data-editing='true']", tbody).forEach(function (r) { r.removeAttribute("data-editing"); });
        row.setAttribute("data-editing", "true");
      });

      /* Archive button */
      tbody.addEventListener("click", async function (e) {
        var btn = e.target.closest(".as-action-btn.archive");
        if (!btn) return;
        var row = btn.closest("tr");
        if (!row || !row.dataset.docid) return;
        try {
          await updateDoc(doc(db, "scholarships", row.dataset.docid), {
            status: "archived", archivedAt: serverTimestamp()
          });
          showToast((row.dataset.name || "Scholarship") + " archived.");
        } catch (e2) {
          console.error("Archive error:", e2);
          showToast("Could not archive scholarship.");
        }
      });
    }
  }

  /* ── Delete confirm: write to Firestore ── */
  function initDeleteConfirm() {
    var confirmBtn = qs("#as-del-confirm");
    if (!confirmBtn) return;
    var originalHandler = null; /* We wrap the existing app.js handler */

    confirmBtn.addEventListener("click", async function () {
      var tbody   = qs("#as-tbody");
      /* Find the row that has data-editing or the last-clicked del row */
      var delRow  = tbody ? tbody.querySelector("tr[data-deleting='true']") : null;
      if (delRow && delRow.dataset.docid) {
        try {
          await deleteDoc(doc(db, "scholarships", delRow.dataset.docid));
          delRow.removeAttribute("data-deleting");
        } catch (e) {
          console.error("Delete scholarship error:", e);
          showToast("Could not delete scholarship.");
        }
      }
    });

    /* Mark row as deleting when del button is clicked */
    var tbody = qs("#as-tbody");
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var btn = e.target.closest(".as-action-btn.del");
        if (!btn) return;
        var row = btn.closest("tr");
        if (!row) return;
        qsa("[data-deleting='true']", tbody).forEach(function (r) { r.removeAttribute("data-deleting"); });
        row.setAttribute("data-deleting", "true");
      });
    }
  }

  /* ══════════════════════════════════════════════════════
     SCHOLARS ROSTER PANEL
  ══════════════════════════════════════════════════════ */
  var unsubRoster = null;
  var rosterAllScholars = [];

  document.addEventListener("DOMContentLoaded", function () {
    initScholarsPanel();
  });

  function initScholarsPanel() {
    var overlay   = document.getElementById("scRosterOverlay");
    var panel     = document.getElementById("scRosterPanel");
    var closeBtn  = document.getElementById("scRosterClose");
    var searchInp = document.getElementById("scRosterSearch");
    var tbody     = document.getElementById("as-tbody");
    if (!panel) return;

    /* Open when "View Scholars" button is clicked */
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var btn = e.target.closest(".as-action-btn.scholars");
        if (!btn) return;
        var row = btn.closest("tr");
        if (!row) return;
        var scholarshipName  = row.dataset.name  || "Unknown Scholarship";
        var scholarshipSlots = parseInt(row.dataset.slots, 10) || 0;
        openRosterPanel(scholarshipName, scholarshipSlots);
      });
    }

    function closePanel() {
      panel.classList.remove("open");
      if (overlay) overlay.classList.remove("open");
      if (unsubRoster) { unsubRoster(); unsubRoster = null; }
      rosterAllScholars = [];
    }

    if (closeBtn) closeBtn.addEventListener("click", closePanel);
    if (overlay)  overlay.addEventListener("click", closePanel);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("open")) closePanel();
    });

    /* Live search */
    if (searchInp) {
      searchInp.addEventListener("input", function () {
        renderRosterList(searchInp.value.trim().toLowerCase());
      });
    }

    /* Cancel duplicate — inline confirm → revoke approval + release slot */
    panel.addEventListener("click", async function (e) {
      var btn = e.target.closest(".sc-roster-cancel-dup");
      if (!btn) return;
      var appId = btn.dataset.appId;
      if (!appId) return;

      /* First click: switch to "confirm" state */
      if (!btn.dataset.confirming) {
        btn.dataset.confirming = "true";
        btn.classList.add("confirming");
        btn.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Confirm Remove?';
        /* Auto-reset after 4 s if admin doesn't confirm */
        btn._resetTimer = setTimeout(function () {
          if (btn.dataset.confirming) {
            delete btn.dataset.confirming;
            btn.classList.remove("confirming");
            btn.innerHTML = '<i class="bi bi-x-circle-fill"></i> Remove';
          }
        }, 4000);
        return;
      }

      /* Second click: confirmed — proceed */
      clearTimeout(btn._resetTimer);
      btn.disabled = true;
      btn.classList.remove("confirming");
      btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Removing…';

      try {
        await updateDoc(doc(db, "applications", appId), {
          status: "cancelled",
          isDuplicate: true,
          cancelledReason: "duplicate",
          cancelledAt: serverTimestamp()
        });
        showToast("Duplicate removed. Slot released and count updated.");
      } catch (err) {
        console.error("Cancel duplicate error:", err);
        btn.disabled = false;
        delete btn.dataset.confirming;
        btn.innerHTML = '<i class="bi bi-x-circle-fill"></i> Remove';
        showToast("Could not remove duplicate. Please try again.");
      }
    });
  }

  function openRosterPanel(scholarshipName, slotsTotal) {
    var panel     = document.getElementById("scRosterPanel");
    var overlay   = document.getElementById("scRosterOverlay");
    var title     = document.getElementById("scRosterTitle");
    var statsEl   = document.getElementById("scRosterStats");
    var listEl    = document.getElementById("scRosterList");
    var searchInp = document.getElementById("scRosterSearch");
    if (!panel) return;

    if (title)     title.textContent = scholarshipName;
    if (searchInp) { searchInp.value = ""; }
    if (listEl)    listEl.innerHTML  = '<div class="sc-roster-loading"><i class="bi bi-arrow-repeat spin"></i> Loading scholars…</div>';
    if (statsEl)   statsEl.innerHTML = "";

    panel.classList.add("open");
    if (overlay) overlay.classList.add("open");

    /* Unsubscribe any previous listener */
    if (unsubRoster) { unsubRoster(); unsubRoster = null; }
    rosterAllScholars = [];

    /* Subscribe to approved applications for this scholarship */
    unsubRoster = onSnapshot(
      query(
        collection(db, "applications"),
        where("scholarshipName", "==", scholarshipName),
        where("status", "in", ["approved", "active"])
      ),
      async function (snap) {
        if (snap.empty) {
          rosterAllScholars = [];
          if (statsEl) renderRosterStats(statsEl, 0, slotsTotal);
          if (listEl)  listEl.innerHTML = '<div class="sc-roster-empty"><i class="bi bi-people"></i><p>No approved scholars yet for this scholarship.</p></div>';
          return;
        }

        /* One entry per application (not per user — same student can have 2 apps) */
        var allApps = snap.docs.map(function (d) {
          var a = d.data();
          return {
            appId:       d.id,
            uid:         a.userId || a.uid || "",
            submittedAt: a.submittedAt,
            refNo:       a.referenceNo || d.id,
            status:      a.status || "approved",
            /* Fallback name from application document if user lookup fails */
            applicantName: a.applicantName || a.fullName || ""
          };
        });

        /* Collect unique user IDs for batch user-profile fetch */
        var uniqueUids = allApps
          .map(function (a) { return a.uid; })
          .filter(function (uid, i, arr) { return uid && arr.indexOf(uid) === i; });

        /* Batch-fetch user profiles */
        var userMap = {};
        try {
          for (var i = 0; i < uniqueUids.length; i += 30) {
            var chunk = uniqueUids.slice(i, i + 30);
            var uSnap = await getDocs(query(collection(db, "users"), where("__name__", "in", chunk)));
            uSnap.docs.forEach(function (u) { userMap[u.id] = u.data(); });
          }
        } catch (_) { /* degrade gracefully to application-stored name */ }

        rosterAllScholars = allApps.map(function (a) {
          var u    = userMap[a.uid] || {};
          var name = u.firstName
            ? ((u.firstName || "") + " " + (u.lastName || "")).trim()
            : (u.fullName || u.displayName || a.applicantName || u.email || "Unknown");
          return {
            uid:       a.uid,
            name:      name,
            email:     u.email || "",
            studentId: u.studentId || "",
            course:    u.course || "",
            yearLevel: u.yearLevel || "",
            initials:  name ? name.split(/\s+/).slice(0, 2).map(function (n) { return n[0]; }).join("").toUpperCase() : "?",
            appId:     a.appId,
            refNo:     a.refNo,
            status:    a.status,
            submittedAt: a.submittedAt
          };
        });

        rosterAllScholars.sort(function (a, b) { return a.name.localeCompare(b.name); });

        if (statsEl) renderRosterStats(statsEl, rosterAllScholars.length, slotsTotal);
        var q = document.getElementById("scRosterSearch");
        renderRosterList(q ? q.value.trim().toLowerCase() : "");
      },
      function (e) {
        console.warn("Roster subscription error:", e);
        if (listEl) listEl.innerHTML = '<div class="sc-roster-empty"><i class="bi bi-exclamation-circle"></i><p>Could not load scholars. Please try again.</p></div>';
      }
    );
  }

  function renderRosterStats(el, count, slotsTotal) {
    var pct = slotsTotal > 0 ? Math.min(100, Math.round((count / slotsTotal) * 100)) : 0;
    el.innerHTML =
      '<div class="sc-roster-stat"><span class="sc-roster-stat-val">' + count + '</span><span class="sc-roster-stat-lbl">Total Scholars</span></div>' +
      '<div class="sc-roster-stat"><span class="sc-roster-stat-val">' + count + ' / ' + (slotsTotal || '—') + '</span><span class="sc-roster-stat-lbl">Slots Filled</span></div>' +
      '<div class="sc-roster-stat sc-roster-stat-bar">' +
        '<div class="sc-roster-slots-bar"><div class="sc-roster-slots-fill' + (pct >= 80 ? ' full' : '') + '" style="width:' + pct + '%"></div></div>' +
        '<span class="sc-roster-slots-pct">' + pct + '%</span>' +
      '</div>';
  }

  function renderRosterList(filter) {
    var listEl = document.getElementById("scRosterList");
    if (!listEl) return;

    /* Detect duplicates: scan ALL scholars sorted by submittedAt; 2nd+ appearance of same uid is a duplicate */
    var dupAppIds = new Set();
    var uidFirstAppId = {};
    var byTime = rosterAllScholars.slice().sort(function (a, b) {
      var ta = a.submittedAt ? (a.submittedAt.toDate ? a.submittedAt.toDate().getTime() : new Date(a.submittedAt).getTime()) : 0;
      var tb = b.submittedAt ? (b.submittedAt.toDate ? b.submittedAt.toDate().getTime() : new Date(b.submittedAt).getTime()) : 0;
      return ta - tb;
    });
    byTime.forEach(function (s) {
      if (!s.uid) return;
      if (uidFirstAppId[s.uid] === undefined) {
        uidFirstAppId[s.uid] = s.appId;
      } else {
        dupAppIds.add(s.appId);
      }
    });

    var scholars = filter
      ? rosterAllScholars.filter(function (s) {
          return (s.name + " " + s.email + " " + s.studentId).toLowerCase().includes(filter);
        })
      : rosterAllScholars;

    if (scholars.length === 0) {
      listEl.innerHTML = filter
        ? '<div class="sc-roster-empty"><i class="bi bi-search"></i><p>No scholars match "<strong>' + esc(filter) + '</strong>"</p></div>'
        : '<div class="sc-roster-empty"><i class="bi bi-people"></i><p>No approved scholars yet.</p></div>';
      return;
    }

    listEl.innerHTML = scholars.map(function (s, idx) {
      var dateStr = "—";
      if (s.submittedAt) {
        var d = s.submittedAt.toDate ? s.submittedAt.toDate() : new Date(s.submittedAt);
        dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
      var isDup = dupAppIds.has(s.appId);
      return (
        '<div class="sc-roster-item' + (isDup ? ' sc-roster-item-dup' : '') + '" data-app-id="' + esc(s.appId) + '">' +
          '<div class="sc-roster-num">' + (idx + 1) + '</div>' +
          '<div class="sc-roster-avatar' + (isDup ? ' dup' : '') + '">' + esc(s.initials) + '</div>' +
          '<div class="sc-roster-info">' +
            '<div class="sc-roster-name">' + esc(s.name) +
              (isDup ? ' <span class="sc-roster-dup-badge"><i class="bi bi-exclamation-triangle-fill"></i> DUPLICATE</span>' : '') +
            '</div>' +
            '<div class="sc-roster-meta">' +
              (s.studentId ? '<span><i class="bi bi-credit-card"></i> ' + esc(s.studentId) + '</span>' : '') +
              (s.course    ? '<span><i class="bi bi-book"></i> ' + esc(s.course) + '</span>' : '') +
              (s.yearLevel ? '<span><i class="bi bi-mortarboard"></i> ' + esc(s.yearLevel) + '</span>' : '') +
              (s.email     ? '<span><i class="bi bi-envelope"></i> ' + esc(s.email) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="sc-roster-right">' +
            '<span class="sc-roster-badge sc-roster-badge-' + esc(s.status) + '">' + esc(s.status === "active" ? "Active" : "Approved") + '</span>' +
            '<div class="sc-roster-date">' + esc(dateStr) + '</div>' +
            (isDup
              ? '<button class="sc-roster-cancel-dup" data-app-id="' + esc(s.appId) + '" type="button"><i class="bi bi-x-circle-fill"></i> Remove</button>'
              : (s.appId ? '<a class="sc-roster-view-btn" href="adminapplicationreview.html?id=' + esc(s.appId) + '">View <i class="bi bi-arrow-right"></i></a>' : '')) +
          '</div>' +
        '</div>'
      );
    }).join("");
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
    toast.innerHTML = '<i class="bi bi-check-circle-fill"></i> ' + esc(message);
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove("show"); }, 3000);
  }

})();


