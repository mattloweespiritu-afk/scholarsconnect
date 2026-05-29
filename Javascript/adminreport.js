/* =========================================================
   ScholarsConnect — Reports & Analytics
   File: ESTECH/Javascript/adminreport.js
   Real-time stats from Firestore.
========================================================= */
import { db, collection, onSnapshot, query } from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

(function () {
  "use strict";

  var unsubApps   = null;
  var unsubSchols = null;

  document.addEventListener("DOMContentLoaded", async function () {
    initAdminLogout();
    initAdminMobileSidebar();
    loadAdminProfile();
    initAdminNotificationPopover();
    initExportButton();
    initForecastChart();
    subscribeReportData();
    window.addEventListener("beforeunload", function () {
      if (unsubApps)   unsubApps();
      if (unsubSchols) unsubSchols();
    });
  });

  /* ── Helpers ── */
  function qs(selector, parent)  { return (parent || document).querySelector(selector); }
  function qsa(selector, parent) { return Array.from((parent || document).querySelectorAll(selector)); }
  function setEl(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  /* ── Firestore subscriptions ── */
  var appsCache   = [];
  var scholsCache = [];

  function subscribeReportData() {
    if (unsubApps) unsubApps();
    unsubApps = onSnapshot(
      collection(db, "applications"),
      function (snap) {
        appsCache = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        updateBarChart(appsCache);
        updateSummaryTable(appsCache, scholsCache);
      },
      function (e) { console.warn("Report apps subscription error:", e); }
    );

    if (unsubSchols) unsubSchols();
    unsubSchols = onSnapshot(
      collection(db, "scholarships"),
      function (snap) {
        scholsCache = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        updateSummaryTable(appsCache, scholsCache);
      },
      function (e) { console.warn("Report schols subscription error:", e); }
    );
  }

  function updateBarChart(apps) {
    var total      = apps.length;
    var approved   = apps.filter(function (a) { return a.status === "approved"; }).length;
    var review     = apps.filter(function (a) { return a.status === "under_review"; }).length;
    var submitted  = apps.filter(function (a) { return a.status === "submitted"; }).length;
    var rejected   = apps.filter(function (a) { return a.status === "rejected"; }).length;
    var max        = Math.max(approved, review, submitted, rejected, 1);

    setEl("rpt-val-approved",  approved);
    setEl("rpt-val-review",    review);
    setEl("rpt-val-submitted", submitted);
    setEl("rpt-val-rejected",  rejected);
    setEl("rpt-total-apps",    total);

    function setBar(id, count) {
      var el = document.getElementById(id);
      if (el) el.style.width = Math.round((count / max) * 100) + "%";
    }
    setBar("rpt-fill-approved",  approved);
    setBar("rpt-fill-review",    review);
    setBar("rpt-fill-submitted", submitted);
    setBar("rpt-fill-rejected",  rejected);
  }

  function updateSummaryTable(apps, schols) {
    var tbody = document.getElementById("rpt-summary-tbody");
    if (!tbody) return;

    var sources = schols.length > 0 ? schols : [];
    if (sources.length === 0) {
      /* Fallback: derive scholarship names from applications */
      var seen = {};
      apps.forEach(function (a) {
        if (a.scholarshipName && !seen[a.scholarshipName]) seen[a.scholarshipName] = true;
      });
      Object.keys(seen).forEach(function (name) {
        sources.push({ id: name, title: name, slots: null });
      });
    }
    if (sources.length === 0) return;

    tbody.innerHTML = sources.map(function (sc) {
      var scName   = sc.title || sc.name || "—";
      var scApps   = apps.filter(function (a) {
        return a.scholarshipName === scName || a.scholarshipId === sc.id;
      });
      var count    = scApps.length;
      var approved = scApps.filter(function (a) { return a.status === "approved"; }).length;
      var slots    = sc.slots ? parseInt(sc.slots, 10) : 0;
      var fillPct  = slots > 0 ? Math.min(100, Math.round((approved / slots) * 100)) : (count > 0 ? 100 : 0);
      var gwas     = scApps.filter(function (a) { return a.gwa; }).map(function (a) { return parseFloat(a.gwa); }).filter(function (g) { return !isNaN(g); });
      var avgGwa   = gwas.length > 0 ? (gwas.reduce(function (s, g) { return s + g; }, 0) / gwas.length).toFixed(1) : "—";
      var chipClass = fillPct >= 80 ? "rpt-fill-chip rpt-fill-high" : "rpt-fill-chip";

      return (
        "<tr>" +
          '<td class="rpt-sc-name">' + esc(scName) + "</td>" +
          '<td class="rpt-td-num">'  + (count > 0 ? count : '<span class="rpt-muted-val">0</span>') + "</td>" +
          "<td>" + approved + "</td>" +
          '<td><span class="' + chipClass + '" style="--fill:' + fillPct + '%;">' + fillPct + "%</span></td>" +
          "<td><strong>" + esc(avgGwa) + "</strong></td>" +
        "</tr>"
      );
    }).join("");
  }

  /* ── Export/Generate button ── */
  function initExportButton() {
    var genBtn = qs("#rpt-gen-btn");
    if (!genBtn) return;
    genBtn.addEventListener("click", function () {
      var aySelect = qs("#rpt-ay");
      var ay = aySelect ? aySelect.value : "current";
      exportReportCsv(ay);
      showToast("Report CSV generated for " + ay + ".");
    });
  }

  function exportReportCsv(ay) {
    var rows = [
      ["ScholarsConnect Report", ay],
      ["Generated", new Date().toLocaleString()],
      [],
      ["Metric", "Value"]
    ];
    qsa(".rpt-bar-item").forEach(function (item) {
      var label = qs(".rpt-bar-label", item);
      var val   = qs(".rpt-bar-val",   item);
      if (label && val) rows.push([label.textContent.trim(), val.textContent.trim()]);
    });
    var totalEl = qs(".rpt-dist-total-val");
    if (totalEl) rows.push(["Total Applications", totalEl.textContent.trim()]);

    rows.push([]);
    rows.push(["Scholarship", "Applicants", "Approved", "Fill Rate", "Avg GWA"]);
    qsa("#rpt-summary-tbody tr").forEach(function (row) {
      rows.push(Array.from(row.children).map(function (td) { return td.textContent.trim(); }));
    });

    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell || "").replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var a    = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "scholarsconnect-report-" + ay + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  }

  /* ── Forecast chart (visual — kept as-is) ── */
  function initForecastChart() {
    var chartWrap     = qs("#rpt-forecast-chart");
    var aySelect      = qs("#rpt-ay");
    var forecastTitle = qs("#rpt-forecast-title");
    if (!chartWrap) return;

    var forecastData = {
      "2025-2026": [
        { month: "Jan", value: 2.4 }, { month: "Feb", value: 3.8 },
        { month: "Mar", value: 5.1 }, { month: "Apr", value: 4.2 },
        { month: "May", value: 5.8 }, { month: "Jun", value: 4.9 }
      ],
      "2024-2025": [
        { month: "Jan", value: 1.9 }, { month: "Feb", value: 3.2 },
        { month: "Mar", value: 4.6 }, { month: "Apr", value: 3.5 },
        { month: "May", value: 4.8 }, { month: "Jun", value: 4.1 }
      ],
      "2023-2024": [
        { month: "Jan", value: 1.5 }, { month: "Feb", value: 2.7 },
        { month: "Mar", value: 3.9 }, { month: "Apr", value: 3.1 },
        { month: "May", value: 4.0 }, { month: "Jun", value: 3.5 }
      ]
    };

    function drawChart(ayKey) {
      var data        = forecastData[ayKey] || forecastData["2025-2026"];
      var width       = chartWrap.clientWidth || 380;
      var height      = 165, padLeft = 42, padRight = 18, padTop = 14, padBottom = 34;
      var chartWidth  = width - padLeft - padRight;
      var chartHeight = height - padTop - padBottom;
      var maxValue    = Math.ceil(Math.max.apply(null, data.map(function (item) { return item.value; })));
      var ticks       = [0, Math.round(maxValue * 0.25 * 2) / 2, Math.round(maxValue * 0.5 * 2) / 2, Math.round(maxValue * 0.75 * 2) / 2, maxValue];
      var px          = function (i) { return (i / (data.length - 1)) * chartWidth; };
      var py          = function (v) { return chartHeight - (v / maxValue) * chartHeight; };
      var points      = data.map(function (item, i) { return [px(i), py(item.value)]; });
      var line        = points.map(function (point, i) {
        if (i === 0) return "M " + point[0] + "," + point[1];
        var prev = points[i - 1], cx = (prev[0] + point[0]) / 2;
        return "C " + cx + "," + prev[1] + " " + cx + "," + point[1] + " " + point[0] + "," + point[1];
      }).join(" ");
      var area        = line + " L " + points[points.length - 1][0] + "," + chartHeight + " L 0," + chartHeight + " Z";
      var gridLines   = ticks.map(function (v) {
        var y = py(v);
        return '<line x1="0" y1="' + y.toFixed(1) + '" x2="' + chartWidth + '" y2="' + y.toFixed(1) + '" stroke="#EBEBEB" stroke-width="1"/>' +
               '<text x="-7" y="' + (y + 4).toFixed(1) + '" text-anchor="end" fill="#B8B8B8" font-size="9.5" font-family="Roboto,sans-serif">' + v + 'M</text>';
      }).join("");
      var xLabels     = data.map(function (item, i) {
        return '<text x="' + px(i).toFixed(1) + '" y="' + (chartHeight + 22) + '" text-anchor="middle" fill="#999" font-size="11" font-family="Roboto,sans-serif">' + item.month + '</text>';
      }).join("");
      var dots        = points.map(function (point, i) {
        return '<circle cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="4.5" fill="#00ACC1" stroke="#fff" stroke-width="2.5"><title>PHP ' + data[i].value + 'M</title></circle>';
      }).join("");
      chartWrap.innerHTML = '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="fGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#00ACC1" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="#00ACC1" stop-opacity="0.02"/>' +
        '</linearGradient></defs>' +
        '<g transform="translate(' + padLeft + ',' + padTop + ')">' +
        gridLines + '<path d="' + area + '" fill="url(#fGrad)"/>' +
        '<path d="' + line + '" fill="none" stroke="#00ACC1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        dots + xLabels + '</g></svg>';
    }

    function update() {
      var ay = aySelect ? aySelect.value : "2025-2026";
      if (forecastTitle) {
        var label = aySelect ? aySelect.options[aySelect.selectedIndex].text : "AY 2025-2026";
        forecastTitle.textContent = "Disbursement Forecast (" + label + ")";
      }
      drawChart(ay);
    }
    var resizeTimer = null;
    window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(update, 120); });
    if (aySelect) aySelect.addEventListener("change", update);
    update();
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
    toast.innerHTML = '<i class="bi bi-info-circle-fill"></i> ' + esc(message);
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove("show"); }, 3200);
  }

})();


