/* =========================================================
   ScholarsConnect — Renewal Management
   File: ESTECH/Javascript/adminrenewal.js
   Real-time Firestore renewal feed + decision writes.
========================================================= */
import { auth, db, collection, addDoc, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

(function () {
  "use strict";

  var unsubRenewals    = null;
  var currentRenewalId = null;   /* Firestore doc ID of the renewal currently in the review modal */

  document.addEventListener("DOMContentLoaded", async function () {
    initAdminLogout();
    initAdminMobileSidebar();
    loadAdminProfile();
    initAdminNotificationPopover();
    subscribeRenewals();
    initRenewalDecision();
    initRemoveRenewal();
    initClearAllRenewals();
    window.addEventListener("beforeunload", function () {
      if (unsubRenewals) unsubRenewals();
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

  /* ── Firestore subscription ── */
  function subscribeRenewals() {
    var tbody = qs("#rnl-tbody");
    if (!tbody) return;
    if (unsubRenewals) unsubRenewals();
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Loading…</td></tr>';

    unsubRenewals = onSnapshot(
      query(collection(db, "renewals"), orderBy("submittedAt", "desc")),
      function (snap) {
        if (snap.empty) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">No renewal requests found.</td></tr>';
          return;
        }
        tbody.innerHTML = "";
        snap.docs.forEach(function (d) {
          tbody.insertAdjacentHTML("beforeend", buildRow(d.id, d.data()));
        });
        /* Re-bind app.js modal triggers after render */
        bindRowButtons(tbody);
        updateRenewalCounts(snap.docs.map(function (d) { return d.data().status || "pending"; }));
      },
      function (e) {
        console.warn("Renewals subscription error:", e);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Could not load renewals.</td></tr>';
      }
    );
  }

  function buildRow(id, r) {
    var status   = r.status || "pending";
    var name     = r.applicantName || "—";
    var initials = name.split(" ").map(function (w) { return w[0] || ""; }).join("").toUpperCase().slice(0, 2) || "??";
    var avatarBg = stringToColor(name);
    var scTag    = r.scholarshipName || "—";
    var scClass  = scTagClass(r.scholarshipName || "");
    var period   = r.academicYear   || "—";
    var sem      = r.semester       || "";
    var gwa      = r.gwa != null    ? String(r.gwa) : "—";
    var docsCount = (r.corURL ? 1 : 0) + (r.gradesURL ? 1 : 0) + (r.extraURL ? 1 : 0);
    var docsTotal = 2;
    var dateStr  = r.submittedAt
      ? (r.submittedAt.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt))
          .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";
    var ref      = r.refNumber || ("RNL-" + id.slice(0, 12).toUpperCase());
    var standing = r.academicStanding || "—";

    var docsHtml = docsCount >= docsTotal
      ? '<span class="rnl-docs-ok"><i class="bi bi-check-circle-fill"></i> ' + docsCount + ' / ' + docsTotal + '</span>'
      : '<span class="rnl-docs-miss"><i class="bi bi-exclamation-circle"></i> ' + docsCount + ' / ' + docsTotal + '</span>';

    return (
      '<tr data-status="' + esc(status) + '"' +
          ' data-sc="' + esc(scTag) + '"' +
          ' data-name="' + esc(name.toLowerCase()) + '"' +
          ' data-docid="' + esc(id) + '"' +
          ' data-student="' + esc(name) + '"' +
          ' data-ref="' + esc(ref) + '"' +
          ' data-gwa="' + esc(gwa) + '"' +
          ' data-period="' + esc(period + (sem ? ", " + sem : "")) + '"' +
          ' data-standing="' + esc(standing) + '"' +
          ' data-cor-url="' + esc(r.corURL || "") + '"' +
          ' data-cor-name="' + esc(r.corName || "Certificate of Registration (COR)") + '"' +
          ' data-cor-type="' + esc(r.corType || "") + '"' +
          ' data-cor-preview-id="' + esc(r.corPreviewId || "") + '"' +
          ' data-cor-preview="' + esc(r.corPreviewFile ? "true" : "false") + '"' +
          ' data-grades-url="' + esc(r.gradesURL || "") + '"' +
          ' data-grades-name="' + esc(r.gradesName || "Official Grade Report") + '"' +
          ' data-grades-type="' + esc(r.gradesType || "") + '"' +
          ' data-grades-preview-id="' + esc(r.gradesPreviewId || "") + '"' +
          ' data-grades-preview="' + esc(r.gradesPreviewFile ? "true" : "false") + '"' +
          ' data-extra-url="' + esc(r.extraURL || "") + '"' +
          ' data-extra-name="' + esc(r.extraName || "Additional Supporting Document") + '"' +
          ' data-extra-type="' + esc(r.extraType || "") + '"' +
          ' data-extra-preview-id="' + esc(r.extraPreviewId || "") + '"' +
          ' data-extra-preview="' + esc(r.extraPreviewFile ? "true" : "false") + '">' +
        '<td><div class="rnl-name-cell">' +
          '<div class="rnl-av" style="background:' + esc(avatarBg) + '">' + esc(initials) + '</div>' +
          '<div><div class="rnl-name">' + esc(name) + '</div><div class="rnl-id">' + esc(r.studentId || "") + '</div></div>' +
        '</div></td>' +
        '<td><span class="rnl-sc-tag ' + esc(scClass) + '">' + esc(scTag) + '</span></td>' +
        '<td><div class="rnl-period">' + esc(period) + '</div><div class="rnl-sem">' + esc(sem) + '</div></td>' +
        '<td><strong class="rnl-gwa">' + esc(gwa) + '</strong></td>' +
        '<td>' + docsHtml + '</td>' +
        '<td class="rnl-date">' + esc(dateStr) + '</td>' +
        '<td><span class="rnl-badge ' + esc(status) + '">' + esc(capitalize(status)) + '</span></td>' +
        '<td><div class="rnl-action-row">' +
          '<button class="rnl-review-btn" type="button"' +
            ' data-docid="' + esc(id) + '"' +
            ' data-ref="' + esc(ref) + '"' +
            ' data-student="' + esc(name) + '"' +
            ' data-sc="' + esc(scTag) + '"' +
            ' data-gwa="' + esc(gwa) + '"' +
            ' data-period="' + esc(period + (sem ? ", " + sem : "")) + '"' +
            ' data-standing="' + esc(standing) + '">' +
            '<i class="bi bi-eye-fill"></i> Review' +
          '</button>' +
          '<button class="rnl-remove-btn" type="button"' +
            ' data-id="' + esc(id) + '"' +
            ' data-name="' + esc(name) + '">' +
            '<i class="bi bi-trash"></i> Remove' +
          '</button>' +
        '</div></td>' +
      '</tr>'
    );
  }

  /* Re-bind app.js review button triggers via event delegation */
  function bindRowButtons(tbody) {
    tbody.addEventListener("click", function (e) {
      var btn = e.target.closest(".rnl-review-btn");
      if (!btn) return;
      currentRenewalId = btn.dataset.docid || null;
      /* Let app.js openModal() read the data attributes from the button — it listens on the same tbody */
    });
  }

  /* ── Decision: approve / reject ── */
  function initRenewalDecision() {
    var confirmBtn = qs("#rc-confirm");
    if (!confirmBtn) return;

    confirmBtn.addEventListener("click", async function () {
      var titleEl  = qs("#rc-title");
      var title    = titleEl ? titleEl.textContent : "";
      var isApprove = title.toLowerCase().includes("approve");
      var newStatus = isApprove ? "approved" : "rejected";

      /* Write to Firestore renewal document */
      var id = currentRenewalId;
      if (id) {
        try {
          await updateDoc(doc(db, "renewals", id), {
            status:     newStatus,
            reviewedAt: serverTimestamp(),
            reviewedBy: auth.currentUser ? auth.currentUser.uid : null
          });
        } catch (e) {
          console.warn("Could not update renewal status:", e);
        }
      }

      /* Write audit log */
      await writeAuditLog(
        isApprove ? "Renewal Approved" : "Renewal Rejected",
        "Renewal",
        "Info",
        isApprove ? "Admin approved a renewal request." : "Admin rejected a renewal request."
      );

      setTimeout(function () {
        showToast(isApprove ? "Renewal approved and recorded." : "Renewal rejected and recorded.");
      }, 120);
    });
  }

  /* ── Remove single renewal (2-step confirm) ── */
  function initRemoveRenewal() {
    var tbody = qs("#rnl-tbody");
    if (!tbody) return;

    tbody.addEventListener("click", async function (e) {
      var btn = e.target.closest(".rnl-remove-btn");
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

      var renewalId   = btn.dataset.id;
      var renewalName = btn.dataset.name || "Unknown";

      try {
        await deleteDoc(doc(db, "renewals", renewalId));
        await writeAuditLog(
          "Renewal Removed",
          "Renewal",
          "Warning",
          "Renewal for " + renewalName + " permanently removed by admin."
        );
      } catch (err) {
        btn.disabled = false;
        btn.dataset.confirming = "";
        btn.classList.remove("confirming");
        btn.innerHTML = '<i class="bi bi-trash"></i> Remove';
        console.error("Remove renewal error:", err);
      }
    });
  }

  /* ── Remove ALL rejected renewals at once ── */
  function initClearAllRenewals() {
    var btn = qs("#rnlClearRejected");
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

      var rejectedRows = qsa("#rnl-tbody tr[data-status='rejected']");
      var ids = rejectedRows.map(function (row) {
        var rb = row.querySelector(".rnl-remove-btn");
        return rb ? rb.dataset.id : null;
      }).filter(Boolean);

      if (ids.length === 0) {
        btn.disabled = false;
        btn.dataset.confirming = "";
        btn.innerHTML = '<i class="bi bi-trash3"></i> Remove All Rejected';
        return;
      }

      try {
        await Promise.all(ids.map(function (id) {
          return deleteDoc(doc(db, "renewals", id));
        }));
        await writeAuditLog(
          "Bulk Renewals Removed",
          "Renewal",
          "Warning",
          "All " + ids.length + " rejected renewal(s) removed in bulk by admin."
        );
      } catch (err) {
        btn.disabled = false;
        btn.dataset.confirming = "";
        btn.classList.remove("confirming");
        btn.innerHTML = '<i class="bi bi-trash3"></i> Remove All Rejected';
        console.error("Bulk remove renewals error:", err);
      }
    });
  }

  /* ── Update tab counts + toggle clear button ── */
  function updateRenewalCounts(statuses) {
    var counts = { all: statuses.length, pending: 0, approved: 0, rejected: 0 };
    statuses.forEach(function (s) {
      var k = (s || "pending").toLowerCase();
      if (counts[k] !== undefined) counts[k]++;
    });

    qsa(".rnl-tab").forEach(function (tab) {
      var ct = tab.querySelector(".rnl-tab-ct");
      if (ct && counts[tab.dataset.filter] !== undefined) ct.textContent = counts[tab.dataset.filter];
    });

    var pendingEl  = qs(".rnl-stat-pill.rnl-pending span");
    var approvedEl = qs(".rnl-stat-pill.rnl-approved span");
    if (pendingEl)  pendingEl.textContent  = counts.pending  + " Pending Review";
    if (approvedEl) approvedEl.textContent = counts.approved + " Approved";

    var clearBtn = qs("#rnlClearRejected");
    if (clearBtn) clearBtn.style.display = counts.rejected > 0 ? "" : "none";
  }

  async function writeAuditLog(title, type, severity, description) {
    try {
      await addDoc(collection(db, "auditLogs"), {
        title: title, type: type, severity: severity, description: description,
        adminUid:   auth.currentUser ? auth.currentUser.uid   : null,
        adminEmail: auth.currentUser ? auth.currentUser.email : "",
        createdAt:  serverTimestamp()
      });
    } catch (e) { console.warn("Audit log save skipped:", e); }
  }

  /* ── Utility ── */
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function scTagClass(name) {
    var n = (name || "").toLowerCase();
    if (n.includes("ched") || n.includes("merit")) return "merit";
    if (n.includes("dost") || n.includes("stem"))  return "stem";
    if (n.includes("tes")  || n.includes("need"))  return "need";
    return "merit";
  }

  function stringToColor(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    var colors = ["#7A2323","#4A1212","#2C5F2E","#1A3A5C","#6B2D8B","#8B4513","#2C4770"];
    return colors[Math.abs(hash) % colors.length];
  }

  /* ── Firestore file retrieval (used by app.js renewal preview) ── */
  async function getFirestoreFile(previewId) {
    try {
      var snap = await getDoc(doc(db, "renewalFiles", previewId));
      return snap.exists() ? snap.data() : null;
    } catch (e) {
      console.warn("Could not fetch renewal file:", e);
      return null;
    }
  }
  window.getFirestoreFile = getFirestoreFile;

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
    toast._t = setTimeout(function () { toast.classList.remove("show"); }, 3200);
  }

})();


