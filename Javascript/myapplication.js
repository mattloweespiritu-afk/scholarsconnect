/* =========================================================
   ScholarsConnect My Applications Script
   File: ESTECH/Javascript/myapplication.js
========================================================= */
import { auth, db, collection, query, where, onSnapshot, onAuthStateChanged, deleteDoc, doc } from "./firebase.js";
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";

(function () {
  "use strict";

  let APPLICATIONS = [];
  let RAW_APPLICATIONS = [];

  let activeFilter = "all";
  let searchQuery = "";
  let activeApplication = null;
  let unsubApps = null;
  let unsubDocs = null;
  let unsubScholarships = null;
  let DOC_COUNTS = { total: 0, verified: 0 };
  let scholarshipCatalogLoaded = false;
  let activeScholarshipIds = new Set();
  let activeScholarshipNames = new Set();
  let activeScholarshipsById = new Map();

  document.addEventListener("DOMContentLoaded", async function () {
    initStudentLogout();
    initMobileSidebar();
    initTopButtons();
    initSearch();
    initFilters();
    initModal();
    loadStudentProfile();
    subscribeScholarshipCatalog();
    subscribeApplications();
    window.addEventListener("beforeunload", function () {
      if (unsubApps) unsubApps();
      if (unsubDocs) unsubDocs();
      if (unsubScholarships) unsubScholarships();
    });
  });

  /* ── Subscribe to real applications + documents from Firestore ── */
  function subscribeScholarshipCatalog() {
    if (unsubScholarships) unsubScholarships();

    unsubScholarships = onSnapshot(
      query(collection(db, "scholarships")),
      function (snap) {
        const ids = new Set();
        const names = new Set();
        const byId = new Map();

        snap.docs.forEach(function (d) {
          const data = d.data();
          if (!isCurrentScholarship(data)) return;

          const name = normalizeScholarshipName(data.title || data.name);
          if (!name) return;

          ids.add(d.id);
          names.add(name);
          byId.set(d.id, {
            name: name,
            title: data.title || data.name || "",
            type: data.type || ""
          });
        });

        activeScholarshipIds = ids;
        activeScholarshipNames = names;
        activeScholarshipsById = byId;
        scholarshipCatalogLoaded = true;
        refreshVisibleApplications();
      },
      function (e) {
        console.warn("Scholarship catalog subscription error:", e);
        scholarshipCatalogLoaded = true;
        refreshVisibleApplications();
      }
    );
  }

  function isCurrentScholarship(data) {
    const status = String((data && data.status) || "").trim().toLowerCase();
    return !status || ["published", "active", "open", "match", "eligible", "ready"].includes(status);
  }

  function normalizeScholarshipName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isApplicationForCurrentScholarship(app) {
    if (!scholarshipCatalogLoaded) return false;
    if (activeScholarshipIds.size === 0 && activeScholarshipNames.size === 0) return false;

    const appName = normalizeScholarshipName(app.title);
    if (app.scholarshipId) {
      const current = activeScholarshipsById.get(app.scholarshipId);
      return !!current && appName === current.name;
    }

    return activeScholarshipNames.has(appName);
  }

  function refreshVisibleApplications() {
    APPLICATIONS = RAW_APPLICATIONS
      .filter(isApplicationForCurrentScholarship)
      .map(function (app) {
        return Object.assign({}, app, {
          docsCompleted: DOC_COUNTS.verified,
          docsTotal:     DOC_COUNTS.total
        });
      });

    renderSummary();
    applyFilters();
  }

  function subscribeApplications() {
    onAuthStateChanged(auth, function (user) {
      if (!user) {
        RAW_APPLICATIONS = [];
        APPLICATIONS = [];
        renderSummary();
        renderApplications(APPLICATIONS);
        updateCounts(APPLICATIONS.length);
        return;
      }

      /* Documents — subscribe for real-time doc counts */
      if (unsubDocs) unsubDocs();
      unsubDocs = onSnapshot(
        query(collection(db, "documents"), where("userId", "==", user.uid)),
        function (snap) {
          DOC_COUNTS.total    = snap.size;
          DOC_COUNTS.verified = snap.docs.filter(function (d) { return d.data().status === "verified"; }).length;
          refreshVisibleApplications();
        },
        function (e) { console.warn("Documents subscription error:", e); }
      );

      /* Applications */
      if (unsubApps) unsubApps();
      const q = query(
        collection(db, "applications"),
        where("userId", "==", user.uid)
      );

      unsubApps = onSnapshot(q, function (snap) {
        const raw = snap.empty ? [] : snap.docs.map(function (d) {
          const app = transformApp(d.id, d.data());
          app.docsCompleted = DOC_COUNTS.verified;
          app.docsTotal     = DOC_COUNTS.total;
          return app;
        });
        raw.sort(function (a, b) {
          const ta = a._submittedMs || 0;
          const tb = b._submittedMs || 0;
          return tb - ta;
        });
        RAW_APPLICATIONS = raw;
        refreshVisibleApplications();
      }, function (e) {
        console.error("Applications subscription error:", e);
        RAW_APPLICATIONS = [];
        APPLICATIONS = [];
        renderSummary();
        renderApplications(APPLICATIONS);
        updateCounts(APPLICATIONS.length);
      });
    });
  }

  function transformApp(id, app) {
    const statusMap = {
      submitted:    { label: "Submitted",    icon: "bi-send-check-fill" },
      under_review: { label: "Under Review", icon: "bi-hourglass-split" },
      approved:     { label: "Approved",     icon: "bi-patch-check-fill" },
      rejected:     { label: "Rejected",     icon: "bi-x-circle-fill" }
    };
    const st   = statusMap[app.status] || statusMap.submitted;
    const submittedDate = app.submittedAt
      ? (app.submittedAt.toDate ? app.submittedAt.toDate() : new Date(app.submittedAt))
      : null;
    const date = submittedDate
      ? submittedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "—";
    const uiStatus = app.status === "under_review" ? "under-review" : (app.status || "submitted");
    const tlMap = {
      submitted:    [{ label: "Submitted", state: "current" }, { label: "Under Review", state: "pending" }, { label: "Decision", state: "pending" }, { label: "Award", state: "pending" }],
      under_review: [{ label: "Submitted", state: "done" }, { label: "Under Review", state: "current" }, { label: "Decision", state: "pending" }, { label: "Award", state: "pending" }],
      approved:     [{ label: "Submitted", state: "done" }, { label: "Under Review", state: "done" }, { label: "Approved", state: "done" }, { label: "Award Released", state: "current" }],
      rejected:     [{ label: "Submitted", state: "done" }, { label: "Under Review", state: "done" }, { label: "Rejected", state: "current" }, { label: "Appeal", state: "pending" }]
    };
    const nextMap = {
      submitted:    "Your application was submitted and is awaiting review.",
      under_review: "Your application is currently being reviewed.",
      approved:     "Your application was approved! Check for disbursement updates.",
      rejected:     "Your application was not approved. " + (app.remarks || "You may file an appeal.")
    };
    const progressMap = { submitted: 25, under_review: 55, approved: 100, rejected: 70 };
    return {
      _submittedMs: submittedDate ? submittedDate.getTime() : 0,
      id: id,
      scholarshipId: app.scholarshipId || "",
      title: app.scholarshipName || "—",
      type: app.scholarshipType || "—",
      ref: app.refNumber || id.slice(0, 12).toUpperCase(),
      date: date,
      status: uiStatus,
      statusLabel: st.label,
      statusIcon: st.icon,
      isDuplicate: app.isDuplicate === true,
      docsCompleted: 0,
      docsTotal: 0,
      progress: progressMap[app.status] || 25,
      remarks: app.remarks || "",
      nextAction: app.remarks || nextMap[app.status] || "—",
      timeline: tlMap[app.status] || tlMap.submitted,
      history: [{ icon: "bi-send-fill", bg: "rgba(192,57,43,0.10)", color: "#C0392B", text: "Application submitted", date: date }],
      documents: [],
      award: app.status === "approved" ? "Scholarship award confirmed." : "Pending review.",
      canDownload: app.status === "approved",
      downloadLabel: app.status === "approved" ? "Download Award Letter" : "No Award Letter Yet",
      canRenew: app.status === "approved",
      canAppeal: app.status === "rejected",
      canWithdraw: app.status === "submitted"
    };
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function initMobileSidebar() {
    const sidebarToggle = getEl("sidebarToggle");
    const sidebarOverlay = getEl("sidebarOverlay");

    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", function () {
        document.body.classList.toggle("sidebar-open");
      });
    }

    if (sidebarOverlay) {
      sidebarOverlay.addEventListener("click", function () {
        document.body.classList.remove("sidebar-open");
      });
    }

    document.querySelectorAll(".sb-item").forEach(function (link) {
      link.addEventListener("click", function () {
        document.body.classList.remove("sidebar-open");
      });
    });
  }

  function initTopButtons() {
    document.querySelectorAll("[data-toast]").forEach(function (button) {
      button.addEventListener("click", function () {
        showToast(button.dataset.toast);
      });
    });
  }

  function initSearch() {
    const searchInput = getEl("applicationSearch");
    const clearSearch = getEl("clearSearch");

    if (!searchInput || !clearSearch) return;

    searchInput.addEventListener("input", function () {
      searchQuery = searchInput.value.trim().toLowerCase();
      clearSearch.classList.toggle("show", searchQuery.length > 0);
      applyFilters();
    });

    clearSearch.addEventListener("click", function () {
      searchInput.value = "";
      searchQuery = "";
      clearSearch.classList.remove("show");
      applyFilters();
      searchInput.focus();
    });
  }

  function initFilters() {
    document.querySelectorAll("[data-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        activeFilter = button.dataset.filter;

        document.querySelectorAll("[data-filter]").forEach(function (tab) {
          tab.classList.remove("active");
        });

        button.classList.add("active");
        applyFilters();
      });
    });

    const resetFilters = getEl("resetFilters");

    if (resetFilters) {
      resetFilters.addEventListener("click", function () {
        const searchInput = getEl("applicationSearch");
        const clearSearch = getEl("clearSearch");

        activeFilter = "all";
        searchQuery = "";

        if (searchInput) searchInput.value = "";
        if (clearSearch) clearSearch.classList.remove("show");

        document.querySelectorAll("[data-filter]").forEach(function (tab) {
          tab.classList.toggle("active", tab.dataset.filter === "all");
        });

        applyFilters();
      });
    }
  }

  function applyFilters() {
    const filtered = APPLICATIONS.filter(function (application) {
      const matchesFilter =
        activeFilter === "all" || application.status === activeFilter;

      const searchableText = [
        application.title,
        application.type,
        application.ref,
        application.date,
        application.statusLabel
      ].join(" ").toLowerCase();

      const matchesSearch =
        !searchQuery || searchableText.includes(searchQuery);

      return matchesFilter && matchesSearch;
    });

    renderApplications(filtered);
    updateCounts(filtered.length);
  }

  function renderSummary() {
    const approved = APPLICATIONS.filter(app => app.status === "approved").length;
    const review = APPLICATIONS.filter(app => app.status === "under-review").length;
    const submitted = APPLICATIONS.filter(app => app.status === "submitted").length;
    const rejected = APPLICATIONS.filter(app => app.status === "rejected").length;

    const needsAction = APPLICATIONS.filter(function (app) {
      return app.canAppeal || app.docsCompleted < app.docsTotal;
    }).length;

    setText("totalApplications", APPLICATIONS.length);
    setText("approvedApplications", approved);
    setText("reviewApplications", review);
    setText("needsActionApplications", needsAction);

    setText("countAll", APPLICATIONS.length);
    setText("countApproved", approved);
    setText("countReview", review);
    setText("countSubmitted", submitted);
    setText("countRejected", rejected);
  }

  function setText(id, value) {
    const element = getEl(id);

    if (element) {
      element.textContent = value;
    }
  }

  function updateCounts(visible) {
    const visibleCount = getEl("visibleCount");
    const totalCount = getEl("totalCount");
    const emptyState = getEl("emptyState");

    if (visibleCount) visibleCount.textContent = visible;
    if (totalCount) totalCount.textContent = visible;

    if (emptyState) {
      emptyState.style.display = visible === 0 ? "block" : "none";
    }
  }

  function renderApplications(items) {
    const list = getEl("applicationsList");

    if (!list) return;

    list.innerHTML = items.map(createApplicationCard).join("");

    document.querySelectorAll("[data-details]").forEach(function (button) {
      button.addEventListener("click", function () {
        openModal(button.dataset.details);
      });
    });

    document.querySelectorAll("[data-upload-docs]").forEach(function (button) {
      button.addEventListener("click", function () {
        const appId = button.dataset.uploadDocs;
        window.location.href = "mydocuments.html" + (appId ? "?appId=" + encodeURIComponent(appId) : "");
      });
    });

    document.querySelectorAll("[data-appeal]").forEach(function (button) {
      button.addEventListener("click", function () {
        const appId = button.dataset.appeal;
        window.location.href = "appeal.html" + (appId ? "?appId=" + encodeURIComponent(appId) : "");
      });
    });

    document.querySelectorAll("[data-withdraw]").forEach(function (button) {
      button.addEventListener("click", function () {
        const appId    = button.dataset.withdraw;
        const appTitle = button.dataset.title || "this application";
        confirmWithdraw(appId, appTitle);
      });
    });
  }

  function createApplicationCard(application) {
    const docsLabel = `${application.docsCompleted}/${application.docsTotal}`;
    const docsComplete = application.docsCompleted === application.docsTotal;
    const footerClass = application.status === "rejected" ? "danger" : "";

    const progressClass =
      application.status === "approved"
        ? "approved"
        : application.status === "rejected"
          ? "rejected"
          : "";

    return `
      <article class="application-card">
        <div class="application-card-head">
          <div>
            <h2 class="application-title">${escapeHtml(application.title)}</h2>
            <p class="application-type">${escapeHtml(application.type)}</p>
          </div>

          <div class="application-badges">
            <span class="status-badge status-${application.status}">
              <i class="bi ${application.statusIcon}"></i>
              ${escapeHtml(application.statusLabel)}
            </span>

            ${application.isDuplicate ? `<span class="status-badge dup-badge"><i class="bi bi-copy"></i> Duplicate</span>` : ""}

            <span class="ref-badge">${escapeHtml(application.ref)}</span>
          </div>
        </div>

        ${application.status === "rejected" ? `
        <div class="rejection-reason-banner">
          <i class="bi bi-x-circle-fill"></i>
          <div>
            <strong>Application Not Approved</strong>
            <span>${escapeHtml(application.remarks || "Your application did not meet the requirements. You may file an appeal.")}</span>
          </div>
        </div>` : ""}

        <div class="application-meta">
          <div class="meta-item">
            <span>Date Applied</span>
            <strong>${escapeHtml(application.date)}</strong>
          </div>

          <div class="meta-item">
            <span>Reference No.</span>
            <strong>${escapeHtml(application.ref)}</strong>
          </div>

          <div class="meta-item">
            <span>Documents</span>
            <strong>${docsLabel} ${docsComplete ? "Ready" : "Pending"}</strong>
          </div>

          <div class="meta-item">
            <span>Status</span>
            <strong>${escapeHtml(application.statusLabel)}</strong>
          </div>
        </div>

        <div class="application-progress">
          <div class="progress-head">
            <span>Application Progress</span>
            <strong>${application.progress}%</strong>
          </div>

          <div class="progress-track">
            <div class="progress-fill ${progressClass}" style="width: ${application.progress}%;"></div>
          </div>
        </div>

        <div class="application-footer">
          <div class="next-action ${footerClass}">
            <i class="bi ${application.status === "rejected" ? "bi-exclamation-triangle-fill" : "bi-lightbulb-fill"}"></i>
            <span>${escapeHtml(application.nextAction)}</span>
          </div>

          <div class="card-actions">
            ${getPrimaryCardAction(application)}

            <button class="card-btn" type="button" data-details="${application.id}">
              View Details
            </button>

            ${application.canWithdraw ? `
            <button class="card-btn card-btn-withdraw" type="button" data-withdraw="${escapeHtml(application.id)}" data-title="${escapeHtml(application.title)}">
              Withdraw
            </button>` : ""}
          </div>
        </div>
      </article>
    `;
  }

  function getPrimaryCardAction(application) {
    if (application.canAppeal) {
      return `
        <button class="card-btn danger" type="button" data-appeal="${application.id}">
          File Appeal
        </button>
      `;
    }

    if (application.docsCompleted < application.docsTotal) {
      return `
        <button class="card-btn primary" type="button" data-upload-docs="${application.id}">
          Upload Document
        </button>
      `;
    }

    if (application.canRenew) {
      return `
        <button class="card-btn primary" type="button" data-details="${application.id}">
          Renewal
        </button>
      `;
    }

    return `
      <button class="card-btn primary" type="button" data-details="${application.id}">
        Track Status
      </button>
    `;
  }

  function initModal() {
    /* Withdraw confirmation modal */
    const withdrawOverlay  = getEl("withdrawConfirmOverlay");
    const withdrawCancel   = getEl("withdrawCancelBtn");
    const withdrawConfirm  = getEl("withdrawConfirmBtn");

    if (withdrawOverlay) {
      withdrawOverlay.addEventListener("click", function (e) {
        if (e.target === withdrawOverlay) withdrawOverlay.classList.remove("show");
      });
    }
    if (withdrawCancel) {
      withdrawCancel.addEventListener("click", function () {
        if (withdrawOverlay) withdrawOverlay.classList.remove("show");
      });
    }
    if (withdrawConfirm) {
      withdrawConfirm.addEventListener("click", function () {
        const appId = withdrawConfirm.dataset.withdrawId;
        if (withdrawOverlay) withdrawOverlay.classList.remove("show");
        if (appId) withdrawApplication(appId);
      });
    }

    /* Application detail modal */
    const overlay = getEl("applicationModalOverlay");
    const close = getEl("modalClose");
    const cancel = getEl("modalCancel");
    const download = getEl("modalDownload");
    const renew = getEl("modalRenew");
    const appeal = getEl("modalAppeal");

    if (overlay) {
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeModal();
        }
      });
    }

    if (close) close.addEventListener("click", closeModal);
    if (cancel) cancel.addEventListener("click", closeModal);

    if (download) {
      download.addEventListener("click", function () {
        if (!activeApplication || !activeApplication.canDownload) {
          showToast("Award letter is not available yet.");
          return;
        }

        showToast("Award letter download active in production.");
      });
    }

    if (renew) {
      renew.addEventListener("click", function () {
        window.location.href = "renewal.html";
      });
    }

    if (appeal) {
      appeal.addEventListener("click", function () {
        window.location.href = "appeal.html";
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeModal();
      }
    });
  }

  function openModal(id) {
    const application = APPLICATIONS.find(app => app.id === id);

    if (!application) return;

    activeApplication = application;

    setText("modalType", application.type);
    setText("modalTitle", application.title);
    setText(
      "modalSubtitle",
      `Ref: ${application.ref} · Applied: ${application.date}`
    );

    const modalStatus = getEl("modalStatus");

    if (modalStatus) {
      modalStatus.className = `modal-status ${application.status}`;
      modalStatus.innerHTML = `
        <i class="bi ${application.statusIcon}"></i>
        <span>${escapeHtml(application.statusLabel)}</span>
      `;
    }

    const modalBody = getEl("modalBody");

    if (modalBody) {
      modalBody.innerHTML = createModalBody(application);
    }

    updateModalActions(application);

    const overlay = getEl("applicationModalOverlay");

    if (overlay) {
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
    }
  }

  function updateModalActions(application) {
    const download = getEl("modalDownload");
    const downloadLabel = getEl("downloadLabel");
    const renew = getEl("modalRenew");
    const appeal = getEl("modalAppeal");

    if (downloadLabel) {
      downloadLabel.textContent = application.downloadLabel;
    }

    if (download) {
      download.disabled = !application.canDownload;
      download.classList.toggle("disabled-btn", !application.canDownload);
      download.style.display = application.canAppeal ? "none" : "";
    }

    if (renew) {
      renew.style.display = application.canRenew ? "" : "none";
    }

    if (appeal) {
      appeal.style.display = application.canAppeal ? "" : "none";
    }
  }

  function createModalBody(application) {
    return `
      <section class="modal-section">
        <h3>Status Timeline</h3>
        ${createTimeline(application.timeline)}
      </section>

      <section class="modal-section">
        <h3>Application Details</h3>

        <div class="detail-grid">
          <div class="detail-item">
            <span>Scholarship</span>
            <strong>${escapeHtml(application.title)}</strong>
          </div>

          <div class="detail-item">
            <span>Type</span>
            <strong>${escapeHtml(application.type)}</strong>
          </div>

          <div class="detail-item">
            <span>Date Applied</span>
            <strong>${escapeHtml(application.date)}</strong>
          </div>

          <div class="detail-item">
            <span>Reference No.</span>
            <strong>${escapeHtml(application.ref)}</strong>
          </div>

          <div class="detail-item">
            <span>Documents</span>
            <strong>${application.docsCompleted}/${application.docsTotal}</strong>
          </div>

          <div class="detail-item">
            <span>Status</span>
            <strong>${escapeHtml(application.statusLabel)}</strong>
          </div>
        </div>
      </section>

      <section class="modal-section">
        <h3>Status History</h3>
        <div class="history-list">
          ${application.history.map(createHistoryItem).join("")}
        </div>
      </section>

      <section class="modal-section">
        <h3>Requirements Checklist</h3>
        <div class="requirement-list">
          ${application.documents.map(createRequirementItem).join("")}
        </div>
      </section>

      <section class="modal-section">
        <h3>${application.status === "rejected" ? "Rejection / Appeal Information" : "Award Information"}</h3>
        <div class="award-box ${application.status === "rejected" ? "danger" : ""}">
          ${escapeHtml(application.award)}
        </div>
      </section>
    `;
  }

  function createTimeline(timeline) {
    return `
      <div class="timeline">
        ${timeline.map(function (step) {
          const icon =
            step.state === "done"
              ? "bi-check"
              : step.state === "current"
                ? "bi-circle-fill"
                : "bi-circle";

          return `
            <div class="timeline-step ${step.state}">
              <div class="timeline-dot ${step.state}">
                <i class="bi ${icon}"></i>
              </div>

              <div class="timeline-label ${step.state === "current" ? "active" : ""}">
                ${escapeHtml(step.label)}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function createHistoryItem(item) {
    return `
      <div class="history-item">
        <div
          class="history-icon"
          style="background:${escapeAttribute(item.bg)}; color:${escapeAttribute(item.color)};"
        >
          <i class="bi ${escapeAttribute(item.icon)}"></i>
        </div>

        <div>
          <strong>${escapeHtml(item.text)}</strong>
          <span>${escapeHtml(item.date)}</span>
        </div>
      </div>
    `;
  }

  function createRequirementItem(item) {
    const icon = item.ok ? "bi-file-earmark-check-fill" : "bi-file-earmark-arrow-up-fill";
    const statusClass = item.ok ? "verified" : "pending";
    const statusLabel = item.ok ? "Verified" : "Pending";

    return `
      <div class="requirement-item ${statusClass}">
        <i class="bi ${icon}"></i>
        <span>${escapeHtml(item.name)}</span>
        <strong class="req-status ${statusClass}">${statusLabel}</strong>
      </div>
    `;
  }

  /* ── Withdraw Application ── */
  function confirmWithdraw(appId, appTitle) {
    const overlay = getEl("withdrawConfirmOverlay");
    const nameEl  = getEl("withdrawAppName");
    const confirmBtn = getEl("withdrawConfirmBtn");

    if (!overlay || !confirmBtn) {
      if (window.confirm("Withdraw your application for \"" + appTitle + "\"? This cannot be undone.")) {
        withdrawApplication(appId);
      }
      return;
    }

    if (nameEl) nameEl.textContent = appTitle;
    confirmBtn.dataset.withdrawId = appId;
    overlay.classList.add("show");
  }

  async function withdrawApplication(appId) {
    const button = document.querySelector("[data-withdraw=\"" + appId + "\"]");
    if (button) { button.disabled = true; button.textContent = "Withdrawing…"; }

    try {
      await deleteDoc(doc(db, "applications", appId));
      showToast("Application withdrawn successfully.");
    } catch (e) {
      console.error("Withdraw error:", e);
      showToast("Failed to withdraw application. Please try again.");
      if (button) { button.disabled = false; button.textContent = "Withdraw"; }
    }
  }

  function closeModal() {
    const overlay = getEl("applicationModalOverlay");

    if (!overlay) return;

    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    activeApplication = null;
  }

  function showToast(message) {
    const toast = getEl("toast");
    const toastMsg = getEl("toastMsg");

    if (!toast || !toastMsg) { return;
    }

    toastMsg.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2800);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
})();


