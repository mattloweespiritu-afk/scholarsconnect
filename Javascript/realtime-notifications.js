import {
  subscribeNotifications,
  markNotificationRead,
  markNotificationsRead
} from "./notification-store.js";
import {
  db,
  collection,
  onSnapshot,
  query,
  where
} from "./firebase.js";

document.addEventListener("DOMContentLoaded", function () {
  initStudentNotificationBell();
  initAdminNotificationBell();
  initAdminSidebarCounts();
});

let adminSidebarCountsStarted = false;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setHidden(element, hidden) {
  if (element) element.classList.toggle("hidden", hidden);
}

function initAdminSidebarCounts() {
  if (adminSidebarCountsStarted) return;

  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  /* Each entry: href to match nav link, and a Firestore query to count */
  const targets = [
    {
      href: "adminapplications.html",
      /* Needs-action: submitted + under_review */
      q: query(collection(db, "applications"), where("status", "in", ["submitted", "under_review"]))
    },
    {
      href: "adminscholarships.html",
      q: collection(db, "scholarships")
    },
    {
      href: "adminrenewal.html",
      q: collection(db, "renewals")
    },
    {
      href: "admindisbursement.html",
      /* Approved scholars = disbursement-eligible */
      q: query(collection(db, "applications"), where("status", "==", "approved"))
    }
  ]
    .map((target) => ({
      ...target,
      badge: sidebar.querySelector(`a[href="${target.href}"] .nav-badge`)
    }))
    .filter((target) => target.badge);

  if (targets.length === 0) return;

  adminSidebarCountsStarted = true;

  targets.forEach((target) => {
    target.badge.textContent = "0";
    onSnapshot(target.q, function (snapshot) {
      target.badge.textContent = String(snapshot.size);
    }, function (error) {
      console.warn("Admin sidebar count error:", error);
    });
  });
}

function initStudentNotificationBell() {
  const popover = document.getElementById("notificationPopover");
  if (!popover) return;

  const list = popover.querySelector(".notif-pop-list");
  const markAll = document.getElementById("notifMarkAll");

  // Immediately clear stale static content before Firebase responds
  updateStudentCount(0);
  if (list) list.innerHTML = "";

  subscribeNotifications(function (items) {
    const unread = items.filter((item) => !item.read);
    renderStudentList(list, unread.slice(0, 5));
    updateStudentCount(unread.length);

    if (markAll) {
      markAll.disabled = unread.length === 0;
      markAll.dataset.notificationIds = unread.map((item) => item.id).join(",");
    }
  }, function (error) {
    console.warn("Notification listener error:", error);
  });

  if (markAll) {
    markAll.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopPropagation();
      const ids = (markAll.dataset.notificationIds || "").split(",").filter(Boolean);
      await markNotificationsRead(ids);
    });
  }
}

function renderStudentList(list, items) {
  if (!list) return;

  if (items.length === 0) {
    list.innerHTML = `
      <div class="notif-pop-item" style="cursor:default;">
        <div class="notif-mini-icon application">
          <i class="bi bi-bell"></i>
        </div>
        <div class="notif-mini-body">
          <div>
            <strong>No unread notifications</strong>
            <time>Now</time>
          </div>
          <p>New scholarship updates will appear here.</p>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = items.map((item) => `
    <a class="notif-pop-item unread" href="${escapeHtml(item.actionUrl)}" data-realtime-notif="${escapeHtml(item.id)}">
      <span class="notif-mini-dot"></span>
      <div class="notif-mini-icon ${escapeHtml(item.subtype || item.category)}">
        <i class="bi ${escapeHtml(item.icon)}"></i>
      </div>
      <div class="notif-mini-body">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <time>${escapeHtml(item.time)}</time>
        </div>
        <p>${escapeHtml(item.message)}</p>
      </div>
    </a>
  `).join("");

  list.querySelectorAll("[data-realtime-notif]").forEach((item) => {
    item.addEventListener("click", async function (event) {
      event.preventDefault();
      await markNotificationRead(item.dataset.realtimeNotif);
      window.location.href = item.getAttribute("href");
    });
  });
}

function updateStudentCount(unreadCount) {
  updateText("notifCount", unreadCount);
  updateText(
    "notifSubtitle",
    unreadCount === 0
      ? "No unread updates"
      : unreadCount + " unread update" + (unreadCount > 1 ? "s" : "")
  );

  setHidden(document.getElementById("notifCount"), unreadCount === 0);
  setHidden(document.getElementById("notifDot"), unreadCount === 0);
  setHidden(document.getElementById("topNotifDot"), unreadCount === 0);
}

function initAdminNotificationBell() {
  const popover = document.getElementById("adminNotificationPopover");
  if (!popover) return;

  const list = popover.querySelector(".admin-notif-list");
  const markAll = document.getElementById("adminNotifMarkAll");

  /* Clear stale static content immediately */
  if (list) list.innerHTML = "";
  updateAdminCount(0);

  subscribeNotifications(function (items) {
    const unread = items.filter((item) => !item.read);
    renderAdminList(list, unread.slice(0, 5));
    updateAdminCount(unread.length);

    if (markAll) {
      markAll.disabled = unread.length === 0;
      markAll.dataset.notificationIds = unread.map((item) => item.id).join(",");
    }
  }, function (error) {
    console.warn("Admin notification listener error:", error);
  });

  if (markAll) {
    markAll.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopPropagation();
      const ids = (markAll.dataset.notificationIds || "").split(",").filter(Boolean);
      await markNotificationsRead(ids);
    });
  }
}

function renderAdminList(list, items) {
  if (!list) return;

  if (items.length === 0) {
    list.innerHTML = `
      <div class="admin-notif-item" style="cursor:default;">
        <div class="admin-notif-icon applications">
          <i class="bi bi-bell-fill"></i>
        </div>
        <div class="admin-notif-body">
          <div>
            <strong>No unread admin alerts</strong>
            <time>Now</time>
          </div>
          <p>New student activity and system alerts will appear here.</p>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = items.map((item) => `
    <a class="admin-notif-item unread ${item.priority === "high" ? "urgent" : ""}" href="${escapeHtml(item.actionUrl)}" data-realtime-notif="${escapeHtml(item.id)}">
      <span class="admin-notif-dot"></span>
      <div class="admin-notif-icon ${escapeHtml(item.category)}">
        <i class="bi ${escapeHtml(item.icon)}"></i>
      </div>
      <div class="admin-notif-body">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <time>${escapeHtml(item.time)}</time>
        </div>
        <p>${escapeHtml(item.message)}</p>
      </div>
    </a>
  `).join("");

  list.querySelectorAll("[data-realtime-notif]").forEach((item) => {
    item.addEventListener("click", async function (event) {
      event.preventDefault();
      await markNotificationRead(item.dataset.realtimeNotif);
      window.location.href = item.getAttribute("href");
    });
  });
}

function updateAdminCount(unreadCount) {
  updateText("adminNotifCount", unreadCount);
  updateText(
    "adminNotifSubtitle",
    unreadCount === 0
      ? "No unread alerts"
      : unreadCount + " unread alert" + (unreadCount > 1 ? "s" : "")
  );

  setHidden(document.getElementById("adminNotifCount"), unreadCount === 0);
}


