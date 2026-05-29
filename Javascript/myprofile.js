/* =========================================================
   ScholarsConnect My Profile Script
   File: ESTECH/Javascript/myprofile.js
========================================================= */
import { auth, db, doc, getDoc, setDoc, collection, getDocs, query, where, limit } from "./firebase.js";
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";

(function () {
  "use strict";

  const originalValues = {};

  const LOCKED_IDENTITY_FIELDS = ["fullName", "studentId", "course", "yearLevel", "birthDate"];
  const ACTIVE_APP_STATUSES = [
    "submitted", "under_review", "under-review",
    "approved", "active", "needs_reupload", "needs-reupload"
  ];

  document.addEventListener("DOMContentLoaded", function () {
    initStudentLogout();
    initMobileSidebar();
    initTopButtons();
    initEditButtons();
    initSaveButtons();
    initResetButton();
    initConsent();
    initProfilePhotoUpload();
    storeOriginalValues();
    updateCompletion();
    loadStudentProfile().then(function(profile) {
      return loadProfileFromFirestore(profile);
    });
    loadEligibilityList();
  });

  async function loadProfileFromFirestore(preloaded) {
    try {
      const user = (preloaded && preloaded.user) || auth.currentUser;
      if (!user) return;
      let p;
      if (preloaded) {
        p = preloaded;
      } else {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;
        p = snap.data();
      }
      const fullName = (preloaded && preloaded.displayName) || p.displayName || p.fullName || "";
      const fields = [
        ["fullName",              fullName],
        ["email",                 user.email || p.email || ""],
        ["mobile",                p.mobile || ""],
        ["address",               p.address || ""],
        ["studentId",             p.studentId || ""],
        ["campus",                p.campus || p.school || ""],
        ["course",                p.course || ""],
        ["yearLevel",             p.yearLevel || ""],
        ["gwa",                   p.gwa || ""],
        ["enrollmentStatus",      p.enrollmentStatus || "Currently Enrolled"],
        ["familyIncome",          p.familyIncome || ""],
        ["dependents",            (p.dependents !== undefined && p.dependents !== null) ? String(p.dependents) : ""],
        ["guardianName",          p.guardianName || ""],
        ["guardianRelationship",  p.guardianRelationship || p.guardianOccupation || ""],
        ["guardianContact",       p.guardianContact || ""],
        ["birthDate",             p.birthDate || ""]
      ];
      fields.forEach(([id, val]) => { const f = getEl(id); if (f && val) f.value = val; });
      const cc = getEl("consentCheck"); if (cc && p.consent) cc.checked = p.consent;
      const gwaBadge = getEl("profileGwaBadge");
      const gwaSpan  = getEl("profileDisplayGwa");
      if (p.gwa && gwaBadge && gwaSpan) {
        gwaSpan.textContent = parseFloat(p.gwa).toFixed(2);
        gwaBadge.style.display = "";
      }
      updateDisplayCard();
      storeOriginalValues();
      updateCompletion();
      checkApplicationLock(user);
    } catch (_) {}
  }

  async function checkApplicationLock(user) {
    if (!user) return;
    try {
      const snap = await getDocs(query(
        collection(db, "applications"),
        where("userId", "==", user.uid)
      ));
      const hasActive = snap.docs.some(function (d) {
        return ACTIVE_APP_STATUSES.includes(d.data().status);
      });
      if (!hasActive) return;

      LOCKED_IDENTITY_FIELDS.forEach(function (id) {
        const field = getEl(id);
        if (!field) return;
        field.disabled = true;
        field.dataset.appLocked = "true";
      });

      const firstCard = document.querySelector(".form-card");
      if (firstCard && firstCard.parentNode) {
        const notice = document.createElement("div");
        notice.style.cssText = "background:#fff8e1;border:1px solid #f0c040;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:0.875rem;color:#7a5a00;display:flex;align-items:center;gap:8px;";
        notice.innerHTML = '<i class="bi bi-lock-fill"></i> Some fields are locked because you have an active application. Contact the administrator to update them.';
        firstCard.parentNode.insertBefore(notice, firstCard);
      }
    } catch (_) {}
  }

  async function loadEligibilityList() {
    var list = document.getElementById('eligibilityList');
    if (!list) return;
    try {
      var snap = await getDocs(query(collection(db, 'scholarships'), limit(10)));
      if (snap.empty) {
        list.innerHTML = '<div class="eligibility-item"><div><span>No scholarships available at this time.</span></div></div>';
        return;
      }
      list.innerHTML = snap.docs.map(function(d) {
        var s = d.data();
        var name = s.title || 'Scholarship';
        var desc = s.description || s.desc || 'Review the program requirements before applying.';
        return '<div class="eligibility-item match">' +
          '<div><strong>' + name + '</strong><span>' + desc + '</span></div>' +
          '<a href="application.html?scholarship=' + encodeURIComponent(name) + '" class="mini-action">Apply</a>' +
          '</div>';
      }).join('');
    } catch (e) {
      list.innerHTML = '<div class="eligibility-item"><div><span>Could not load scholarships. <a href="scholarships.html">Browse scholarships</a></span></div></div>';
    }
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function updateDisplayCard() {
    const fullName  = (getEl("fullName")  || {}).value || "";
    const studentId = (getEl("studentId") || {}).value || "";
    const email     = (getEl("email")     || {}).value || "";
    const mobile    = (getEl("mobile")    || {}).value || "";
    const course    = (getEl("course")    || {}).value || "";
    const yearLevel = (getEl("yearLevel") || {}).value || "";

    const parts    = fullName.trim().split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (parts[0] ? parts[0][0].toUpperCase() : "?");
    const courseYear = [course, yearLevel || ""].filter(Boolean).join(" \u25C6 ");

    const dn = getEl("profileDisplayName");      if (dn) dn.textContent = fullName  || "-";
    const dc = getEl("profileDisplayCourse");    if (dc) dc.textContent = courseYear || "Student";
    const di = getEl("profileAvatarInitials");   if (di) di.textContent = initials;
    const ds = getEl("profileDisplayStudentId"); if (ds) ds.textContent = studentId || "-";
    const de = getEl("profileDisplayEmail");     if (de) de.textContent = email     || "-";
    const dm = getEl("profileDisplayMobile");    if (dm) dm.textContent = mobile    || "-";
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

  function initEditButtons() {
    document.querySelectorAll("[data-edit-section]").forEach(function (button) {
      button.addEventListener("click", function () {
        const section = button.dataset.editSection;
        toggleSectionEdit(section, button);
      });
    });

    document.querySelectorAll("[data-section], #consentCheck").forEach(function (field) {
      field.addEventListener("input", function () {
        field.classList.remove("error");
        setSaveState("Unsaved changes");
        updateCompletion();
      });

      field.addEventListener("change", function () {
        field.classList.remove("error");
        setSaveState("Unsaved changes");
        updateCompletion();
      });
    });
  }

  function toggleSectionEdit(section, button) {
    const fields = document.querySelectorAll(`[data-section="${section}"]`);
    const isEditing = button.classList.contains("active");

    fields.forEach(function (field) {
      if (field.dataset.appLocked) return;
      field.disabled = isEditing;
    });

    button.classList.toggle("active", !isEditing);

    button.innerHTML = isEditing
      ? '<i class="bi bi-pencil-square"></i> Edit'
      : '<i class="bi bi-lock-fill"></i> Lock';

    if (!isEditing) {
      const firstEditable = Array.from(fields).find(function (f) { return !f.dataset.appLocked; });
      if (firstEditable) firstEditable.focus();
      showToast("You can now edit this section.");
    } else {
      showToast("Section locked.");
    }
  }

  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var canvas = document.createElement("canvas");
        canvas.width  = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function initProfilePhotoUpload() {
    const input = getEl("profilePhotoInput");
    const mainImage = getEl("profileAvatarImage");
    const mainInitials = getEl("profileAvatarInitials");
    const sidebarAvatar = getEl("sidebarAvatar");
    const topUserAvatar = getEl("topUserAvatar");

    const savedPhoto = localStorage.getItem("scholarsconnectProfilePhoto");

    if (savedPhoto) {
      applyProfilePhoto(savedPhoto);
    }

    if (!input) return;

    input.addEventListener("change", async function () {
      const file = input.files[0];

      if (!file) return;

      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

      if (!allowedTypes.includes(file.type)) {
        showToast("Invalid profile image. Please upload JPG, PNG, or WEBP only.");
        input.value = "";
        return;
      }

      const maxSize = 5 * 1024 * 1024;

      if (file.size > maxSize) {
        showToast("Profile picture must be 5 MB or smaller.");
        input.value = "";
        return;
      }

      const compressed = await compressImage(file, 260, 0.72);
      if (!compressed) { showToast("Could not process image. Please try again."); return; }

      localStorage.setItem("scholarsconnectProfilePhoto", compressed);
      applyProfilePhoto(compressed);
      setSaveState("Profile photo updated");
      showToast("Profile picture updated.");

      const user = auth.currentUser;
      if (user) {
        try {
          await setDoc(doc(db, "users", user.uid), { photoBase64: compressed }, { merge: true });
        } catch (_) {}
      }
    });

    function applyProfilePhoto(imageData) {
      if (mainImage) {
        mainImage.src = imageData;
        mainImage.hidden = false;
      }

      if (mainInitials) {
        mainInitials.hidden = true;
      }

      if (sidebarAvatar) {
        sidebarAvatar.classList.add("has-photo");
        sidebarAvatar.style.backgroundImage = `url("${imageData}")`;
      }

      if (topUserAvatar) {
        topUserAvatar.classList.add("has-photo");
        topUserAvatar.style.backgroundImage = `url("${imageData}")`;
      }
    }
  }

  function initSaveButtons() {
    const saveTop = getEl("saveProfileTop");
    const saveBottom = getEl("saveProfileBottom");

    if (saveTop) {
      saveTop.addEventListener("click", saveProfile);
    }

    if (saveBottom) {
      saveBottom.addEventListener("click", saveProfile);
    }
  }

  async function saveProfile() {
    if (!validateProfile()) {
      showToast("Please complete required fields before saving.");
      return;
    }

    setSaveState("Saving profile...");

    const buttons = [getEl("saveProfileTop"), getEl("saveProfileBottom")];

    buttons.forEach(function (button) {
      if (!button) return;

      button.disabled = true;
      button.dataset.originalHtml = button.innerHTML;
      button.innerHTML = '<span class="mini-spinner"></span> Saving...';
    });

    const user = auth.currentUser;
    const profileData = {};
    ["fullName","email","mobile","address","studentId","campus","course","yearLevel","gwa","enrollmentStatus","familyIncome","dependents","guardianName","guardianRelationship","guardianContact","birthDate"].forEach(id => {
      const f = getEl(id); if (f) profileData[id] = f.value.trim();
    });
    const cc = getEl("consentCheck"); if (cc) profileData.consent = cc.checked;
    if (profileData.fullName) profileData.displayName = profileData.fullName;
    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid), profileData, { merge: true });
      } catch (_) {}
    }
    disableAllProfileFields();
    storeOriginalValues();
    updateLastUpdated();
    updateCompletion();
    setSaveState("Profile saved");
    updateDisplayCard();
    showToast("Profile saved successfully.");
    buttons.forEach(function (button) {
      if (!button) return;
      button.disabled = false;
      button.innerHTML = button.dataset.originalHtml || 'Save Profile <i class="bi bi-check2-circle"></i>';
    });
  }

  function validateProfile() {
    const requiredIds = [
      "fullName",
      "birthDate",
      "email",
      "mobile",
      "address",
      "studentId",
      "campus",
      "course",
      "yearLevel",
      "gwa",
      "enrollmentStatus",
      "familyIncome",
      "dependents",
      "guardianName",
      "guardianRelationship"
    ];

    let valid = true;

    requiredIds.forEach(function (id) {
      const field = getEl(id);

      if (!field) return;

      const empty = String(field.value).trim() === "";

      field.classList.toggle("error", empty);

      if (empty) {
        valid = false;
      }
    });

    const email = getEl("email");

    if (email && !email.value.includes("@")) {
      email.classList.add("error");
      valid = false;
    }

    const gwa = getEl("gwa");

    if (gwa) {
      const value = Number(gwa.value);

      if (Number.isNaN(value) || value < 75 || value > 100) {
        gwa.classList.add("error");
        valid = false;
      }
    }

    const consent = getEl("consentCheck");

    if (consent && !consent.checked) {
      valid = false;
      showToast("Data processing consent is required for scholarship matching.");
    }

    return valid;
  }

  function disableAllProfileFields() {
    document.querySelectorAll("[data-section]").forEach(function (field) {
      field.disabled = true;
    });

    document.querySelectorAll("[data-edit-section]").forEach(function (button) {
      button.classList.remove("active");
      button.innerHTML = '<i class="bi bi-pencil-square"></i> Edit';
    });
  }

  function initResetButton() {
    const reset = getEl("resetProfileBtn");

    if (!reset) return;

    reset.addEventListener("click", function () {
      Object.keys(originalValues).forEach(function (id) {
        const field = getEl(id);

        if (!field) return;

        if (field.type === "checkbox") {
          field.checked = originalValues[id];
        } else {
          field.value = originalValues[id];
        }

        field.classList.remove("error");
      });

      disableAllProfileFields();
      updateCompletion();
      updateConsentSummary();
      setSaveState("Profile restored");
      showToast("Unsaved changes were reset.");
    });
  }

  function initConsent() {
    const consent = getEl("consentCheck");

    if (!consent) return;

    consent.addEventListener("change", function () {
      updateConsentSummary();
      setSaveState("Unsaved changes");

      if (!consent.checked) {
        showToast("Consent is required for scholarship matching and application review.");
      }
    });
  }

  function updateConsentSummary() {
    const consent = getEl("consentCheck");
    const consentSummary = getEl("consentSummary");

    if (!consent || !consentSummary) return;

    consentSummary.textContent = consent.checked ? "Given" : "Missing";
  }

  function storeOriginalValues() {
    document.querySelectorAll("[data-section], #consentCheck").forEach(function (field) {
      if (!field.id) return;

      originalValues[field.id] = field.type === "checkbox" ? field.checked : field.value;
    });
  }

  function updateCompletion() {
    const trackedFields = [
      "fullName",
      "birthDate",
      "email",
      "mobile",
      "address",
      "studentId",
      "campus",
      "course",
      "yearLevel",
      "gwa",
      "enrollmentStatus",
      "familyIncome",
      "dependents",
      "guardianName",
      "guardianRelationship",
      "consentCheck"
    ];

    let completed = 0;

    trackedFields.forEach(function (id) {
      const field = getEl(id);

      if (!field) return;

      if (field.type === "checkbox") {
        if (field.checked) completed += 1;
        return;
      }

      if (String(field.value).trim() !== "") {
        completed += 1;
      }
    });

    const percentage = Math.round((completed / trackedFields.length) * 100);

    const completionText = getEl("completionText");
    const completionFill = getEl("completionFill");
    const summaryCompletion = getEl("summaryCompletion");

    if (completionText) {
      completionText.textContent = percentage;
    }

    if (summaryCompletion) {
      summaryCompletion.textContent = percentage + '%';
    }

    if (completionFill) {
      completionFill.style.width = percentage + "%";
    }
  }

  function updateLastUpdated() {
    const lastUpdated = getEl("lastUpdated");

    if (!lastUpdated) return;

    const now = new Date();
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    lastUpdated.textContent =
      months[now.getMonth()] + " " + now.getDate() + ", " + now.getFullYear();
  }

  function setSaveState(message) {
    const saveState = getEl("saveState");

    if (!saveState) return;

    saveState.textContent = message;
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

