/* =========================================================
   ScholarsConnect Notification Popover
   File: ESTECH/Javascript/notification-popover.js
========================================================= */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const bell = document.getElementById("notifBell");
    const popover = document.getElementById("notificationPopover");
    const markAll = document.getElementById("notifMarkAll");

    if (!bell || !popover) return;

    bell.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      const isOpen = popover.classList.toggle("show");
      bell.setAttribute("aria-expanded", String(isOpen));
    });

    popover.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    document.addEventListener("click", closePopover);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closePopover();
      }
    });

    popover.querySelectorAll("[data-pop-notif]").forEach(function (item) {
      item.addEventListener("click", function () {
        item.classList.remove("unread");

        const dot = item.querySelector(".notif-mini-dot");

        if (dot) {
          dot.remove();
        }

        updateUnreadCount();
      });
    });

    if (markAll) {
      markAll.addEventListener("click", function () {
        popover.querySelectorAll(".notif-pop-item.unread").forEach(function (item) {
          item.classList.remove("unread");

          const dot = item.querySelector(".notif-mini-dot");

          if (dot) {
            dot.remove();
          }
        });

        updateUnreadCount();
      });
    }

    updateUnreadCount();

    function closePopover() {
      popover.classList.remove("show");
      bell.setAttribute("aria-expanded", "false");
    }

    function updateUnreadCount() {
      const unreadCount = popover.querySelectorAll(".notif-pop-item.unread").length;
      const notifCount = document.getElementById("notifCount");
      const notifDot = document.getElementById("notifDot");
      const subtitle = document.getElementById("notifSubtitle");

      if (notifCount) {
        notifCount.textContent = unreadCount;
        notifCount.classList.toggle("hidden", unreadCount === 0);
      }

      if (notifDot) {
        notifDot.classList.toggle("hidden", unreadCount === 0);
      }

      if (subtitle) {
        subtitle.textContent =
          unreadCount === 0
            ? "No unread updates"
            : unreadCount + " unread update" + (unreadCount > 1 ? "s" : "");
      }
    }
  });
})();

