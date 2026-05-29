/* =========================================================
   ScholarsConnect Notifications Script
   File: ESTECH/Javascript/notifications.js
========================================================= */
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";
import {
  subscribeNotifications,
  markNotificationRead,
  markNotificationsRead
} from "./notification-store.js";

(function () {
  "use strict";

  let activeFilter = "all";
  let searchQuery = "";
  let activeNotification = null;

  let NOTIFICATIONS = [];

  document.addEventListener("DOMContentLoaded", function () {
    initStudentLogout();
    loadStudentProfile();
    initMobileSidebar();
    initTopButtons();
    initSearch();
    initFilters();
    initModal();
    initBulkActions();
    loadNotificationsFromFirestore();
  });

  function loadNotificationsFromFirestore() {
    subscribeNotifications(function (items) {
      NOTIFICATIONS = items;
      renderSummary();
      applyFilters();
    }, function (error) {
      console.warn("Notification listener error:", error);
      renderSummary();
      applyFilters();
    });
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

  function initSearch() {
    const searchInput = getEl("notificationSearch");
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
        const searchInput = getEl("notificationSearch");
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

  function initBulkActions() {
    const markAllReadTop = getEl("markAllReadTop");
    const markAllReadBtn = getEl("markAllReadBtn");

    if (markAllReadTop) {
      markAllReadTop.addEventListener("click", markAllAsRead);
    }

    if (markAllReadBtn) {
      markAllReadBtn.addEventListener("click", markAllAsRead);
    }
  }

  function applyFilters() {
    const filtered = NOTIFICATIONS.filter(function (item) {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "unread" && !item.read) ||
        item.category === activeFilter;

      const searchableText = [
        item.title,
        item.message,
        item.categoryLabel,
        item.priority,
        item.time
      ].join(" ").toLowerCase();

      const matchesSearch = !searchQuery || searchableText.includes(searchQuery);

      return matchesFilter && matchesSearch;
    });

    renderNotifications(filtered);
    updateCounts(filtered.length);
  }

  function renderSummary() {
    const total = NOTIFICATIONS.length;
    const unread = NOTIFICATIONS.filter(item => !item.read).length;
    const deadlines = NOTIFICATIONS.filter(item => item.category === "deadline").length;
    const updates = NOTIFICATIONS.filter(item => item.category === "application").length;
    const applications = NOTIFICATIONS.filter(item => item.category === "application").length;
    const documents = NOTIFICATIONS.filter(item => item.category === "document").length;
    const scholarships = NOTIFICATIONS.filter(item => item.category === "scholarship").length;

    setText("totalNotifications", total);
    setText("unreadNotifications", unread);
    setText("deadlineNotifications", deadlines);
    setText("updateNotifications", updates);

    setText("countAll", total);
    setText("countUnread", unread);
    setText("countApplication", applications);
    setText("countDocument", documents);
    setText("countDeadline", deadlines);
    setText("countScholarship", scholarships);

    const topNotifDot = getEl("topNotifDot");

    if (topNotifDot) {
      topNotifDot.classList.toggle("hidden", unread === 0);
    }

    const priorityHeadline = getEl("priorityHeadline");

    if (priorityHeadline) {
      const priorityCount = NOTIFICATIONS.filter(item => !item.read && item.priority === "high").length;
      priorityHeadline.textContent =
        priorityCount > 0
          ? priorityCount + " urgent action" + (priorityCount > 1 ? "s" : "") + " needed"
          : unread + " unread notification" + (unread === 1 ? "" : "s");
    }
  }

  function updateCounts(visible) {
    const visibleCount = getEl("visibleCount");
    const totalCount = getEl("totalCount");
    const emptyState = getEl("emptyState");

    if (visibleCount) visibleCount.textContent = visible;
    if (totalCount) totalCount.textContent = NOTIFICATIONS.length;

    if (emptyState) {
      emptyState.style.display = visible === 0 ? "block" : "none";
    }
  }

  function renderNotifications(items) {
    const list = getEl("notificationList");

    if (!list) return;

    list.innerHTML = items.map(createNotificationCard).join("");

    document.querySelectorAll("[data-open]").forEach(function (button) {
      button.addEventListener("click", function () {
        openModal(button.dataset.open);
      });
    });

    document.querySelectorAll("[data-mark-read]").forEach(function (button) {
      button.addEventListener("click", function () {
        markAsRead(button.dataset.markRead);
      });
    });

    document.querySelectorAll("[data-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        openRelatedPage(button.dataset.action);
      });
    });
  }

  function createNotificationCard(item) {
    const unreadPill = !item.read ? '<span class="unread-pill">Unread</span>' : "";
    const priorityPill = `<span class="priority-pill ${item.priority}">${item.priority}</span>`;
    const readButton = !item.read
      ? `
        <button class="card-btn" type="button" data-mark-read="${item.id}">
          <i class="bi bi-check2"></i>
          Read
        </button>
      `
      : "";

    const iconClass = item.subtype || item.category;

    return `
      <article class="notification-card ${item.read ? "" : "unread"}">
        <div class="notification-icon ${iconClass}">
          <i class="bi ${item.icon}"></i>
        </div>

        <div class="notification-main">
          <div class="notification-topline">
            <h2 class="notification-title">${escapeHtml(item.title)}</h2>
            ${unreadPill}
            ${priorityPill}
          </div>

          <p class="notification-message">${escapeHtml(item.message)}</p>

          <div class="notification-meta">
            <span>
              <i class="bi bi-tag"></i>
              ${escapeHtml(item.categoryLabel)}
            </span>

            <span>
              <i class="bi bi-clock"></i>
              ${escapeHtml(item.time)}
            </span>
          </div>
        </div>

        <div class="notification-actions">
          ${readButton}

          <button class="card-btn" type="button" data-open="${item.id}">
            Details
          </button>

          <button class="card-btn primary" type="button" data-action="${item.id}">
            Open
          </button>
        </div>
      </article>
    `;
  }

  function initModal() {
    const overlay = getEl("notificationModalOverlay");
    const close = getEl("modalClose");
    const cancel = getEl("modalCancel");
    const markRead = getEl("modalMarkRead");
    const primaryAction = getEl("modalPrimaryAction");

    if (overlay) {
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeModal();
        }
      });
    }

    if (close) close.addEventListener("click", closeModal);
    if (cancel) cancel.addEventListener("click", closeModal);

    if (markRead) {
      markRead.addEventListener("click", function () {
        if (!activeNotification) return;

        markAsRead(activeNotification.id);
        openModal(activeNotification.id);
      });
    }

    if (primaryAction) {
      primaryAction.addEventListener("click", function () {
        if (!activeNotification) return;

        openRelatedPage(activeNotification.id);
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeModal();
      }
    });
  }

  function openModal(id) {
    const item = findNotification(id);

    if (!item) return;

    activeNotification = item;

    setText("modalType", item.categoryLabel);
    setText("modalTitle", item.title);
    setText("modalTime", item.time);
    setText("modalMessage", item.message);
    setText("modalCategory", item.categoryLabel);
    setText("modalPriority", capitalize(item.priority));
    setText("modalReadState", item.read ? "Read" : "Unread");
    setText("modalActionText", item.actionLabel);

    const modalStatus = getEl("modalStatus");

    if (modalStatus) {
      modalStatus.className = "modal-status " + (item.read ? "read" : "unread");
      modalStatus.innerHTML = `
        <i class="bi ${item.read ? "bi-check-circle-fill" : "bi-circle-fill"}"></i>
        <span>${item.read ? "Read" : "Unread"}</span>
      `;
    }

    const modalMarkRead = getEl("modalMarkRead");

    if (modalMarkRead) {
      modalMarkRead.disabled = item.read;
      modalMarkRead.classList.toggle("disabled-btn", item.read);
    }

    const modalPrimaryAction = getEl("modalPrimaryAction");

    if (modalPrimaryAction) {
      modalPrimaryAction.innerHTML = `
        ${escapeHtml(item.actionLabel)}
        <i class="bi bi-arrow-right"></i>
      `;
    }

    const overlay = getEl("notificationModalOverlay");

    if (overlay) {
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
    }
  }

  function closeModal() {
    const overlay = getEl("notificationModalOverlay");

    if (!overlay) return;

    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    activeNotification = null;
  }

  async function markAsRead(id) {
    const item = findNotification(id);

    if (!item) return;

    if (item.read) {
      showToast("Notification is already marked as read.");
      return;
    }

    item.read = true;
    renderSummary();
    applyFilters();
    await markNotificationRead(id);
    showToast("Notification marked as read.");
  }

  async function markAllAsRead() {
    const unreadCount = NOTIFICATIONS.filter(item => !item.read).length;

    if (unreadCount === 0) {
      showToast("All notifications are already read.");
      return;
    }

    NOTIFICATIONS.forEach(function (item) {
      item.read = true;
    });

    renderSummary();
    applyFilters();
    await markNotificationsRead(NOTIFICATIONS.map(item => item.id));
    showToast("All notifications marked as read.");
  }

  async function openRelatedPage(id) {
    const item = findNotification(id);

    if (!item) return;

    item.read = true;
    renderSummary();
    await markNotificationRead(id);

    window.location.href = item.actionUrl;
  }

  function findNotification(id) {
    return NOTIFICATIONS.find(function (item) {
      return item.id === id;
    });
  }

  function setText(id, value) {
    const element = getEl(id);

    if (element) {
      element.textContent = value;
    }
  }

  function capitalize(value) {
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
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
})();


