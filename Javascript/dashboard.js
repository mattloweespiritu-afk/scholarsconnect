/* =========================================================
   ScholarsConnect Dashboard Script
   File: ESTECH/Javascript/dashboard.module.js
========================================================= */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    initMobileSidebar();
    initLogout();
    initSearch();
    initStoredProfilePhoto();
  });

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

  function initLogout() {
    const logoutButton = getEl("btnLogout");

    if (!logoutButton) return;

    logoutButton.addEventListener("click", function () {
      window.location.href = "login.html";
    });
  }

  function initSearch() {
    const searchInput = getEl("dashboardSearch");
    const clearSearch = getEl("clearSearch");

    if (!searchInput || !clearSearch) return;

    searchInput.addEventListener("input", function () {
      clearSearch.classList.toggle("show", searchInput.value.trim().length > 0);
    });

    clearSearch.addEventListener("click", function () {
      searchInput.value = "";
      clearSearch.classList.remove("show");
      searchInput.focus();
    });

    searchInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;

      const query = searchInput.value.trim();

      if (!query) {
        showToast("Type something to search.");
        return;
      }

      showToast("Search preview: " + query);
    });
  }

  function initStoredProfilePhoto() {
    const savedPhoto = localStorage.getItem("scholarsconnectProfilePhoto");
    const sidebarAvatar = getEl("sidebarAvatar");
    const topUserAvatar = getEl("topUserAvatar");

    if (!savedPhoto) return;

    if (sidebarAvatar) {
      sidebarAvatar.classList.add("has-photo");
      sidebarAvatar.style.backgroundImage = `url("${savedPhoto}")`;
    }

    if (topUserAvatar) {
      topUserAvatar.classList.add("has-photo");
      topUserAvatar.style.backgroundImage = `url("${savedPhoto}")`;
    }
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
})();

