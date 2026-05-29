/* =========================================================
   ScholarsConnect — Audit Logs
   File: ESTECH/Javascript/adminauditlogs.js
   Real-time Firestore audit log feed.
========================================================= */
import { db, collection, onSnapshot, query, orderBy, limit } from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

(function () {
  "use strict";

  var LOG_CACHE  = {};
  var unsubLogs  = null;
  var totalCount = 0;

  document.addEventListener("DOMContentLoaded", async function () {
    initAdminLogout();
    initAdminMobileSidebar();
    loadAdminProfile();
    initAdminNotificationPopover();
    initFilters();
    initExportButton();
    initLoadMore();
    initDetailModal();
    subscribeAuditLogs();
    window.addEventListener("beforeunload", function () {
      if (unsubLogs) unsubLogs();
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
  function subscribeAuditLogs() {
    var tbody = qs("#alog-tbody");
    if (!tbody) return;
    if (unsubLogs) unsubLogs();
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Loading…</td></tr>';

    unsubLogs = onSnapshot(
      query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(50)),
      function (snap) {
        LOG_CACHE  = {};
        totalCount = snap.size;
        if (snap.empty) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">No audit log entries found.</td></tr>';
          setCountLabel(0);
          return;
        }
        tbody.innerHTML = "";
        snap.docs.forEach(function (d) {
          LOG_CACHE[d.id] = d.data();
          tbody.insertAdjacentHTML("beforeend", buildRow(d.id, d.data()));
        });
        setCountLabel(snap.size);
      },
      function (e) {
        console.warn("Audit logs subscription error:", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Could not load audit logs.</td></tr>';
      }
    );
  }

  function buildRow(id, log) {
    var type     = (log.type     || "info").toLowerCase().replace(/[\s/]+/g, "-");
    var severity = (log.severity || "Info").toLowerCase();
    var ts       = log.createdAt
      ? (log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt))
      : new Date();
    var dateStr  = ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    var timeStr  = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    var iconMap  = {
      security:     "bi-shield-exclamation",
      login:        "bi-box-arrow-in-right",
      application:  "bi-file-earmark-text-fill",
      document:     "bi-file-earmark-check-fill",
      "data-change":"bi-pencil-fill",
      settings:     "bi-gear-fill",
      disbursement: "bi-cash-stack",
      renewal:      "bi-arrow-repeat",
      student:      "bi-person-fill"
    };
    var icon = iconMap[type] || "bi-info-circle-fill";
    var sub  = (log.description || "").slice(0, 65) + ((log.description || "").length > 65 ? "…" : "");
    var user = log.adminEmail ? log.adminEmail.split("@")[0] : "System";

    return (
      '<tr data-type="' + esc(type) + '" data-severity="' + esc(severity) + '">' +
        '<td class="alog-time">' +
          '<div class="alog-date">' + esc(dateStr) + '</div>' +
          '<div class="alog-clock">' + esc(timeStr) + '</div>' +
        '</td>' +
        '<td><div class="alog-event-wrap">' +
          '<div class="alog-event-icon ' + esc(severity) + '"><i class="bi ' + esc(icon) + '"></i></div>' +
          '<div>' +
            '<div class="alog-event-name">' + esc(log.title || "Event") + '</div>' +
            '<div class="alog-event-sub">'  + esc(sub) + '</div>' +
          '</div>' +
        '</div></td>' +
        '<td>' +
          '<div class="alog-user">' + esc(user) + '</div>' +
          '<div class="alog-uid">'  + esc(log.adminEmail || "") + '</div>' +
        '</td>' +
        '<td><code class="alog-ip">' + esc(log.ip || "—") + '</code></td>' +
        '<td><span class="alog-badge ' + esc(severity) + '">' + esc(log.severity || "Info") + '</span></td>' +
        '<td><button class="alog-detail-btn" type="button" data-log="' + esc(id) + '">View</button></td>' +
      '</tr>'
    );
  }

  function setCountLabel(visible) {
    var el = qs("#alog-count-label");
    if (el) el.textContent = "Showing " + visible + " of " + totalCount + " events";
  }

  /* ── Search / filter ── */
  function initFilters() {
    var tbody  = qs("#alog-tbody");
    var search = qs("#alog-search");
    var fType  = qs("#alog-filter-type");
    var fSev   = qs("#alog-filter-severity");
    var empty  = qs("#alog-empty");
    if (!tbody) return;

    function filterRows() {
      var q = search ? search.value.toLowerCase().trim() : "";
      var t = fType  ? fType.value  : "";
      var s = fSev   ? fSev.value   : "";
      var rows = qsa("tr", tbody);
      var visible = 0;
      rows.forEach(function (row) {
        var match = (!q || row.textContent.toLowerCase().includes(q)) &&
                    (!t || row.dataset.type     === t) &&
                    (!s || row.dataset.severity === s);
        row.style.display = match ? "" : "none";
        if (match) visible++;
      });
      if (empty) empty.style.display = visible === 0 ? "block" : "none";
      setCountLabel(visible);
    }

    if (search) search.addEventListener("input",  filterRows);
    if (fType)  fType.addEventListener("change",  filterRows);
    if (fSev)   fSev.addEventListener("change",   filterRows);
  }

  /* ── Export button ── */
  function initExportButton() {
    var btn = qs("#alog-export-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      exportVisibleLogs();
      showToast("Audit log CSV exported.");
    });
  }

  function exportVisibleLogs() {
    var rows = [["Event", "Type", "Severity", "Admin", "Timestamp"]];
    qsa("#alog-tbody tr").forEach(function (row) {
      if (row.style.display === "none") return;
      rows.push(Array.from(row.children).slice(0, 5).map(function (cell) {
        return cell.textContent.trim().replace(/\s+/g, " ");
      }));
    });
    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell || "").replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var a    = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "scholarsconnect-audit-logs.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  }

  /* ── Load more (loads 50; stub for pagination) ── */
  function initLoadMore() {
    var btn = qs("#alog-load-more");
    if (!btn) return;
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "All events loaded";
      showToast("All available audit events are loaded.");
    });
  }

  /* ── Detail modal ── */
  function initDetailModal() {
    var tbody      = qs("#alog-tbody");
    var modal      = qs("#alog-modal");
    var modalTitle = qs("#alog-modal-title");
    var modalBody  = qs("#alog-modal-body");
    var closeBtn   = qs("#alog-modal-close");
    if (!modal) return;

    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var btn = e.target.closest(".alog-detail-btn");
        if (!btn) return;
        var d = LOG_CACHE[btn.dataset.log];
        if (!d) return;
        var ts = d.createdAt
          ? (d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt)).toLocaleString("en-US")
          : "—";
        if (modalTitle) modalTitle.textContent = d.title || "Event Detail";
        if (modalBody) {
          modalBody.innerHTML = [
            detailRow("Event Type",  d.type        || "—"),
            detailRow("Severity",    d.severity    || "—"),
            detailRow("Admin User",  d.adminEmail  || "System"),
            detailRow("Timestamp",   ts),
            detailRow("Description", d.description || "—")
          ].join("");
        }
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
      });
    }

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.style.display !== "none") closeModal();
    });

    function closeModal() {
      modal.style.display = "none";
      document.body.style.overflow = "";
    }
  }

  function detailRow(label, val) {
    return "<div class='alog-detail-row'><span class='alog-detail-lbl'>" + esc(label) + "</span><span class='alog-detail-val'>" + esc(val) + "</span></div>";
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
    document.addEventListener("click", function () {
      popover.classList.remove("show"); bell.setAttribute("aria-expanded", "false");
    });
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


