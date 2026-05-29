/* =========================================================
   ScholarsConnect Scholarships Page Script
   File: ESTECH/Javascript/scholarships.js
========================================================= */
import { db, collection, onSnapshot, query, limit } from "./firebase.js";
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";

(function () {
  "use strict";

  let SCHOLARSHIPS = [];

  let activeScholarship = null;

  let unsubScholarships = null;

  document.addEventListener("DOMContentLoaded", async function () {
    initStudentLogout();
    initMobileSidebar();
    initTopButtons();
    initFilters();
    initModal();
    loadStudentProfile();
    subscribeScholarships();
    window.addEventListener("beforeunload", function () {
      if (unsubScholarships) unsubScholarships();
    });
  });

  function subscribeScholarships() {
    if (unsubScholarships) unsubScholarships();

    unsubScholarships = onSnapshot(
      query(collection(db, "scholarships"), limit(50)),
      function (snap) {
        SCHOLARSHIPS.length = 0;

        snap.docs.forEach(function (d) {
          const s = d.data();
          const slotsTotal = numberFrom(s.slotsTotal, s.slots, 1);
          const studentStatus = normalizeStudentStatus(s);
          SCHOLARSHIPS.push({
            id: d.id,
            title: s.title || "Scholarship",
            type: s.type || "government",
            typeLabel: firstText(s.typeLabel, formatTypeLabel(s.type), "Government"),
            sponsor: firstText(s.sponsor, s.office, "Scholarship Office"),
            description: firstText(s.description, s.desc, "No description has been posted yet."),
            award: firstText(s.award, s.benefit, s.scholarshipBenefit, "Benefit details will be announced by the scholarship office."),
            minGwa: firstText(s.minGwa, s.minimumGwa, "No minimum GWA specified"),
            yearLevel: firstText(s.yearLevel, "All year levels"),
            course: firstText(s.course, s.program, "All programs"),
            slotsFilled: numberFrom(s.slotsFilled, s.filledSlots, 0),
            slotsTotal: slotsTotal,
            deadline: firstText(s.deadline, "—"),
            deadlineValue: s.deadlineValue || s.deadline || "2099-12-31",
            status: studentStatus,
            statusLabel: firstText(s.statusLabel, statusLabelFor(studentStatus)),
            statusIcon: firstText(s.statusIcon, statusIconFor(studentStatus)),
            reason: firstText(s.reason, studentStatus === "not" ? "This scholarship is not open for application yet." : ""),
            note: firstText(s.note, "Review the program details before applying."),
            matchScore: s.matchScore || 0,
            requirements: normalizeRequirements(s.requirements || s.requiredDocuments || s.documents),
            renewal: firstText(s.renewal, s.renewalRequirement, "Renewal details will be announced by the scholarship office."),
            contact: firstText(s.contact, s.contactEmail, "Scholarship Office")
          });
        });

        renderScholarships(SCHOLARSHIPS);
        updateCounts(SCHOLARSHIPS.length);
      },
      function (e) {
        console.warn("Scholarships subscription error:", e);
        renderScholarships(SCHOLARSHIPS);
        updateCounts(SCHOLARSHIPS.length);
      }
    );
  }

  function firstText() {
    for (let i = 0; i < arguments.length; i++) {
      const value = arguments[i];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return "";
  }

  function numberFrom() {
    for (let i = 0; i < arguments.length; i++) {
      if (arguments[i] === undefined || arguments[i] === null || String(arguments[i]).trim() === "") continue;
      const value = Number(arguments[i]);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  function normalizeRequirements(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return String(item || "").trim(); }).filter(Boolean);
    }

    return String(value || "")
      .split(/\r?\n|,/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function formatTypeLabel(type) {
    return String(type || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, function (char) { return char.toUpperCase(); });
  }

  function normalizeStudentStatus(data) {
    const raw = String(data.eligibilityStatus || data.studentStatus || data.matchStatus || data.status || "").trim().toLowerCase();
    if (raw === "match" || raw === "ready" || raw === "eligible" || raw === "published") return "match";
    if (raw === "needs" || raw === "needs_document" || raw === "needs-document") return "needs";
    return "not";
  }

  function statusLabelFor(status) {
    return {
      match: "Ready to Apply",
      needs: "Needs Document",
      not: "Not Eligible"
    }[status] || "Not Eligible";
  }

  function statusIconFor(status) {
    return {
      match: "bi-check-circle-fill",
      needs: "bi-exclamation-circle-fill",
      not: "bi-x-circle-fill"
    }[status] || "bi-info-circle-fill";
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function initMobileSidebar() {
    const sidebarToggle = getEl("sidebarToggle");
    const sidebarOverlay = getEl("sidebarOverlay");
    const logoutButton = getEl("btnLogout");

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

  function initFilters() {
    const searchInput = getEl("scholarshipSearch");
    const clearSearch = getEl("clearSearch");
    const filterType = getEl("filterType");
    const filterStatus = getEl("filterStatus");
    const sortBy = getEl("sortBy");
    const resetFilters = getEl("resetFilters");

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        if (clearSearch) {
          clearSearch.classList.toggle("show", searchInput.value.trim().length > 0);
        }

        applyFilters();
      });
    }

    if (clearSearch && searchInput) {
      clearSearch.addEventListener("click", function () {
        searchInput.value = "";
        clearSearch.classList.remove("show");
        applyFilters();
        searchInput.focus();
      });
    }

    [filterType, filterStatus, sortBy].forEach(function (control) {
      if (control) {
        control.addEventListener("change", applyFilters);
      }
    });

    if (resetFilters && searchInput && filterType && filterStatus && sortBy) {
      resetFilters.addEventListener("click", function () {
        searchInput.value = "";
        clearSearch.classList.remove("show");
        filterType.value = "all";
        filterStatus.value = "all";
        sortBy.value = "deadline";
        applyFilters();
      });
    }
  }

  function applyFilters() {
    const searchInput = getEl("scholarshipSearch");
    const filterType = getEl("filterType");
    const filterStatus = getEl("filterStatus");
    const sortBy = getEl("sortBy");

    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const type = filterType ? filterType.value : "all";
    const status = filterStatus ? filterStatus.value : "all";
    const sort = sortBy ? sortBy.value : "deadline";

    let results = SCHOLARSHIPS.filter(function (scholarship) {
      const searchableText = [
        scholarship.title,
        scholarship.typeLabel,
        scholarship.sponsor,
        scholarship.description,
        scholarship.course,
        scholarship.yearLevel
      ].join(" ").toLowerCase();

      const matchesQuery = !query || searchableText.includes(query);
      const matchesType = type === "all" || scholarship.type === type;
      const matchesStatus = status === "all" || scholarship.status === status;

      return matchesQuery && matchesType && matchesStatus;
    });

    results = sortScholarships(results, sort);

    renderScholarships(results);
    updateCounts(results.length);
  }

  function sortScholarships(items, sortBy) {
    return [...items].sort(function (a, b) {
      if (sortBy === "match") {
        return b.matchScore - a.matchScore;
      }

      if (sortBy === "slots") {
        const aRemaining = a.slotsTotal - a.slotsFilled;
        const bRemaining = b.slotsTotal - b.slotsFilled;
        return bRemaining - aRemaining;
      }

      return new Date(a.deadlineValue) - new Date(b.deadlineValue);
    });
  }

  function updateCounts(visible) {
    const visibleCount = getEl("visibleCount");
    const totalCount = getEl("totalCount");
    const emptyState = getEl("emptyState");

    if (visibleCount) visibleCount.textContent = visible;
    if (totalCount) totalCount.textContent = SCHOLARSHIPS.length;
    updateMatchSummary();

    if (emptyState) {
      emptyState.style.display = visible === 0 ? "block" : "none";
    }
  }

  function updateMatchSummary() {
    const ready = SCHOLARSHIPS.filter(function (item) { return item.status === "match"; }).length;
    const needs = SCHOLARSHIPS.filter(function (item) { return item.status === "needs"; }).length;
    const notEligible = SCHOLARSHIPS.filter(function (item) { return item.status === "not"; }).length;

    setText("matchSummaryText", ready + " Ready to Apply");
    setText("matchReadyCount", ready + " program" + (ready === 1 ? "" : "s"));
    setText("matchNeedsCount", needs + " program" + (needs === 1 ? "" : "s"));
    setText("matchNotCount", notEligible + " program" + (notEligible === 1 ? "" : "s"));
  }

  function setText(id, value) {
    const el = getEl(id);
    if (el) el.textContent = value;
  }

  function renderScholarships(items) {
    const grid = getEl("scholarshipGrid");

    if (!grid) return;

    grid.innerHTML = items.map(createScholarshipCard).join("");

    document.querySelectorAll("[data-details]").forEach(function (button) {
      button.addEventListener("click", function () {
        openModal(button.dataset.details);
      });
    });

    document.querySelectorAll("[data-apply]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyNow(button.dataset.apply);
      });
    });

    document.querySelectorAll("[data-requirement]").forEach(function (button) {
      button.addEventListener("click", function () {
        window.location.href = "mydocuments.html";
      });
    });
  }

  function createScholarshipCard(scholarship) {
    const slotsTotal = Math.max(1, Number(scholarship.slotsTotal) || 1);
    const slotsFilled = Math.max(0, Number(scholarship.slotsFilled) || 0);
    const filledPct = Math.round((slotsFilled / slotsTotal) * 100);
    const remaining = Math.max(0, slotsTotal - slotsFilled);
    const progressClass = filledPct >= 80 ? "warning" : "";
    const action = getCardAction(scholarship);

    return `
      <article class="sc-card">
        <div class="sc-card-top">
          <span class="type-badge type-${scholarship.type}">
            ${escapeHtml(scholarship.typeLabel)}
          </span>

          <span class="status-badge status-${scholarship.status}">
            <i class="bi ${scholarship.statusIcon}"></i>
            ${escapeHtml(scholarship.statusLabel)}
          </span>
        </div>

        <h2 class="sc-title">${escapeHtml(scholarship.title)}</h2>

        <p class="sc-desc">${escapeHtml(scholarship.description)}</p>

        <div class="sc-meta">
          <div class="sc-meta-row">
            <i class="bi bi-star-fill"></i>
            <span>Min GWA: ${escapeHtml(scholarship.minGwa)}</span>
          </div>

          <div class="sc-meta-row">
            <i class="bi bi-people-fill"></i>
            <span>${escapeHtml(scholarship.yearLevel)}</span>
          </div>

          <div class="sc-meta-row">
            <i class="bi bi-book-fill"></i>
            <span>${escapeHtml(scholarship.course)}</span>
          </div>

          <div class="sc-meta-row">
            <i class="bi bi-calendar-event"></i>
            <span>Deadline: ${escapeHtml(scholarship.deadline)}</span>
          </div>
        </div>

        <div class="sc-slots">
          <div class="sc-slots-head">
            <span>${slotsFilled} of ${slotsTotal} slots filled</span>
            <strong>${remaining} remaining</strong>
          </div>

          <div class="progress-track">
            <div class="progress-fill ${progressClass}" style="width: ${filledPct}%;"></div>
          </div>
        </div>

        <div class="sc-note ${scholarship.status}">
          <i class="bi ${scholarship.status === "not" ? "bi-info-circle-fill" : "bi-lightbulb-fill"}"></i>
          <span>${escapeHtml(scholarship.note)}</span>
        </div>

        <div class="sc-actions">
          <button class="card-btn" type="button" data-details="${scholarship.id}">
            View Details
          </button>

          ${action}
        </div>
      </article>
    `;
  }

  function getCardAction(scholarship) {
    if (scholarship.status === "match") {
      return `
        <button class="card-btn apply" type="button" data-apply="${scholarship.id}">
          Apply Now
        </button>
      `;
    }

    if (scholarship.status === "needs") {
      return `
        <button class="card-btn apply" type="button" data-requirement="${scholarship.id}">
          Complete Requirement
        </button>
      `;
    }

    return `
      <button class="card-btn disabled-btn" type="button" disabled>
        Not Eligible
      </button>
    `;
  }

  function initModal() {
    const overlay = getEl("modalOverlay");
    const close = getEl("modalClose");
    const cancel = getEl("modalCancel");
    const apply = getEl("modalApply");

    if (overlay) {
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeModal();
        }
      });
    }

    if (close) {
      close.addEventListener("click", closeModal);
    }

    if (cancel) {
      cancel.addEventListener("click", closeModal);
    }

    if (apply) {
      apply.addEventListener("click", function () {
        if (!activeScholarship) return;

        if (activeScholarship.status === "needs") {
          window.location.href = "mydocuments.html";
          return;
        }

        if (activeScholarship.status === "match") {
          applyNow(activeScholarship.id);
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeModal();
      }
    });
  }

  function openModal(id) {
    const scholarship = SCHOLARSHIPS.find(function (item) {
      return item.id === id;
    });

    if (!scholarship) return;

    activeScholarship = scholarship;

    getEl("modalType").textContent = scholarship.typeLabel;
    getEl("modalTitle").textContent = scholarship.title;
    getEl("modalSponsor").textContent = scholarship.sponsor;

    const modalStatus = getEl("modalStatus");
    modalStatus.className = `modal-status ${scholarship.status}`;
    modalStatus.innerHTML = `
      <i class="bi ${scholarship.statusIcon}"></i>
      <span>${scholarship.statusLabel}</span>
    `;

    const modalApply = getEl("modalApply");

    if (scholarship.status === "match") {
      modalApply.disabled = false;
      modalApply.classList.remove("disabled-btn");
      modalApply.innerHTML = `Apply Now <i class="bi bi-arrow-right"></i>`;
    } else if (scholarship.status === "needs") {
      modalApply.disabled = false;
      modalApply.classList.remove("disabled-btn");
      modalApply.innerHTML = `Complete Requirement <i class="bi bi-upload"></i>`;
    } else {
      modalApply.disabled = true;
      modalApply.classList.add("disabled-btn");
      modalApply.innerHTML = `Not Eligible`;
    }

    getEl("modalBody").innerHTML = createModalBody(scholarship);

    const overlay = getEl("modalOverlay");
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
  }

  function createModalBody(scholarship) {
    const remainingSlots = Math.max(0, (Number(scholarship.slotsTotal) || 1) - (Number(scholarship.slotsFilled) || 0));
    const requirements = scholarship.requirements.length
      ? scholarship.requirements.map(function (requirement) {
        return `
          <div class="requirement-item">
            <i class="bi bi-file-earmark-check-fill"></i>
            <span>${escapeHtml(requirement)}</span>
          </div>
        `;
      }).join("")
      : `
        <div class="requirement-empty">
          <i class="bi bi-info-circle-fill"></i>
          <span>No required documents listed yet. Please contact the scholarship office before applying.</span>
        </div>
      `;

    const reasonBox = scholarship.status !== "match"
      ? `
        <div class="reason-box ${scholarship.status}">
          <i class="bi ${scholarship.status === "needs" ? "bi-exclamation-circle-fill" : "bi-x-circle-fill"}"></i>
          <span>${escapeHtml(scholarship.reason)}</span>
        </div>
      `
      : "";

    return `
      ${reasonBox}

      <div class="award-box">
        <span>Scholarship Benefit</span>
        <strong>${escapeHtml(scholarship.award)}</strong>
      </div>

      <section class="modal-section">
        <h3>Scholarship Overview</h3>

        <div class="detail-grid">
          <div class="detail-item">
            <span>Type</span>
            <strong>${escapeHtml(scholarship.typeLabel)}</strong>
          </div>

          <div class="detail-item">
            <span>Min GWA</span>
            <strong>${escapeHtml(scholarship.minGwa)}</strong>
          </div>

          <div class="detail-item">
            <span>Year Level</span>
            <strong>${escapeHtml(scholarship.yearLevel)}</strong>
          </div>

          <div class="detail-item">
            <span>Course</span>
            <strong>${escapeHtml(scholarship.course)}</strong>
          </div>

          <div class="detail-item">
            <span>Slots</span>
            <strong>${remainingSlots} remaining</strong>
          </div>

          <div class="detail-item">
            <span>Deadline</span>
            <strong>${escapeHtml(scholarship.deadline)}</strong>
          </div>
        </div>
      </section>

      <section class="modal-section">
        <h3>Required Documents</h3>

        <div class="requirement-list">
          ${requirements}
        </div>
      </section>

      <section class="modal-section">
        <h3>Renewal Requirement</h3>
        <p class="modal-text">${escapeHtml(scholarship.renewal)}</p>
      </section>

      <section class="modal-section">
        <h3>Contact</h3>
        <p class="modal-text">${escapeHtml(scholarship.contact)}</p>
      </section>
    `;
  }

  function closeModal() {
    const overlay = getEl("modalOverlay");

    if (!overlay) return;

    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    activeScholarship = null;
  }

  function applyNow(id) {
    const scholarship = SCHOLARSHIPS.find(function (item) {
      return item.id === id;
    });

    if (!scholarship) {
      window.location.href = "application.html";
      return;
    }

    if (scholarship.status === "not") {
      showToast("You are not eligible for this scholarship yet.");
      return;
    }

    window.location.href = `application.html?scholarship=${encodeURIComponent(scholarship.title)}`;
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
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();


