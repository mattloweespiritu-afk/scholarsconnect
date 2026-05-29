/* =========================================================
   ScholarsConnect \u25C6 System Settings
   File: ESTECH/Javascript/adminsettings.js

   Firebase-backed preview settings.
========================================================= */
import { auth, db, doc, setDoc, collection, addDoc, serverTimestamp } from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    initAdminLogout();
    initAdminMobileSidebar();
    loadAdminProfile();
    initAdminNotificationPopover();
    initTabs();
    initAppPortalToggle();
    initCategoryToggles();
    initUnsavedIndicator();
    initSaveButtons();
    initDangerButtons();
  });

  /* -- Helpers -- */
  function qs(selector, parent) {
    return (parent || document).querySelector(selector);
  }

  function qsa(selector, parent) {
    return Array.from((parent || document).querySelectorAll(selector));
  }

  /* -- Notification Popover -- */
  function initAdminNotificationPopover() {
    var bell    = qs("#adminNotifBell");
    var popover = qs("#adminNotificationPopover");
    var markAll = qs("#adminNotifMarkAll");

    if (!bell || !popover) return;

    bell.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = popover.classList.toggle("show");
      bell.setAttribute("aria-expanded", String(isOpen));
    });

    bell.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bell.click(); }
    });

    popover.addEventListener("click", function (e) { e.stopPropagation(); });

    document.addEventListener("click", function () {
      popover.classList.remove("show");
      bell.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        popover.classList.remove("show");
        bell.setAttribute("aria-expanded", "false");
      }
    });

    qsa("[data-admin-notif]", popover).forEach(function (item) {
      item.addEventListener("click", function () {
        item.classList.remove("unread");
        var dot = qs(".admin-notif-dot", item);
        if (dot) dot.remove();
        updateUnreadCount();
      });
    });

    if (markAll) {
      markAll.addEventListener("click", function () {
        qsa(".admin-notif-item.unread", popover).forEach(function (item) {
          item.classList.remove("unread");
          var dot = qs(".admin-notif-dot", item);
          if (dot) dot.remove();
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

  /* -- Tab switching -- */
  function initTabs() {
    var tabs   = qsa(".stg-tab");
    var panels = qsa(".stg-panel");
    if (!tabs.length) return;

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t)   { t.classList.remove("active"); });
        panels.forEach(function (p) { p.classList.remove("active"); });
        tab.classList.add("active");
        var target = qs("#stg-tab-" + tab.dataset.tab);
        if (target) target.classList.add("active");
      });
    });
  }

  /* -- Application portal toggle label -- */
  function initAppPortalToggle() {
    var toggle = qs("#stg-app-portal");
    var state  = qs("#stg-app-portal-state");
    if (!toggle || !state) return;

    toggle.addEventListener("change", function () {
      state.textContent = toggle.checked ? "Open" : "Closed";
      markUnsaved();
    });
  }

  /* -- Category toggles -- */
  function initCategoryToggles() {
    qsa(".stg-cat-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var active = btn.classList.contains("active");
        btn.classList.toggle("active", !active);
        btn.textContent = active ? "Inactive" : "Active";
        markUnsaved();
      });
    });
  }

  /* -- Unsaved indicator -- */
  var unsavedPill = null;

  function initUnsavedIndicator() {
    unsavedPill = qs("#stg-unsaved-pill");

    qsa(".stg-input, .stg-select").forEach(function (el) {
      el.addEventListener("input",  markUnsaved);
      el.addEventListener("change", markUnsaved);
    });

    qsa(".stg-toggle input").forEach(function (el) {
      el.addEventListener("change", markUnsaved);
    });
  }

  function markUnsaved() {
    if (unsavedPill) unsavedPill.style.display = "flex";
  }

  function clearUnsaved() {
    if (unsavedPill) unsavedPill.style.display = "none";
  }

  /* -- Save buttons -- */
  var SAVE_MSGS = {
    "stg-save-general":       "General settings saved.",
    "stg-save-applications":  "Application settings saved.",
    "stg-save-documents":     "Document settings saved.",
    "stg-save-notifications": "Notification settings saved.",
    "stg-save-security":      "Security settings saved."
  };

  var SAVE_KEYS = {
    "stg-save-general":       "general",
    "stg-save-applications":  "applications",
    "stg-save-documents":     "documents",
    "stg-save-notifications": "notifications",
    "stg-save-security":      "security"
  };

  function initSaveButtons() {
    Object.keys(SAVE_MSGS).forEach(function (id) {
      var btn = qs("#" + id);
      if (!btn) return;
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        try {
          await saveSettingsSection(SAVE_KEYS[id] || id);
          showToast(SAVE_MSGS[id]);
          clearUnsaved();
        } catch (e) {
          console.error("Settings save error:", e);
          showToast("Settings could not be saved. Check Firestore rules.");
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function saveSettingsSection(section) {
    var panel = qs(".stg-panel.active") || document;
    var values = {};

    qsa(".stg-input, .stg-select", panel).forEach(function (input) {
      if (!input.id) return;
      values[input.id] = input.type === "checkbox" ? input.checked : input.value;
    });

    qsa(".stg-toggle input", panel).forEach(function (input) {
      if (!input.id) return;
      values[input.id] = input.checked;
    });

    qsa(".stg-cat-toggle", panel).forEach(function (button, index) {
      values[button.dataset.category || "category_" + index] = button.classList.contains("active");
    });

    await setDoc(doc(db, "settings", section), {
      values: values,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser ? auth.currentUser.uid : null
    }, { merge: true });

    await writeAuditLog("Settings Updated", "Settings", "Info", "Updated " + section + " settings.");
  }

  /* -- Danger zone buttons -- */
  function initDangerButtons() {
    var clearBtn = qs("#stg-clear-sessions");
    var resetBtn = qs("#stg-force-reset");

    if (clearBtn) {
      clearBtn.addEventListener("click", async function () {
        await writeAuditLog("Admin Sessions Marked for Review", "Security", "Warning", "Admin requested a session clear in preview mode.");
        showToast("Session clear request recorded.");
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", async function () {
        await writeAuditLog("Password Reset Flag Recorded", "Security", "Warning", "Admin recorded a force-reset request in preview mode.");
        showToast("Password reset flag recorded.");
      });
    }
  }

  async function writeAuditLog(title, type, severity, description) {
    try {
      await addDoc(collection(db, "auditLogs"), {
        title: title,
        type: type,
        severity: severity,
        description: description,
        adminUid: auth.currentUser ? auth.currentUser.uid : null,
        adminEmail: auth.currentUser ? auth.currentUser.email : "",
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("Audit log save skipped:", e);
    }
  }

  /* -- Toast -- */
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
    toast.innerHTML = '<i class="bi bi-check-circle-fill"></i> ' + message;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove("show"); }, 3200);
  }

})();


