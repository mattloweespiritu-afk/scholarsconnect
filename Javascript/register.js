/* =========================================================
   ScholarsConnect Register Page Script
   File path: ESTECH/Javascript/register.js

   Handles:
   - 5-step registration navigation
   - Step progress indicator
   - Frontend validation
   - Password visibility and strength
   - Document uploads and previews
   - Review & Submit summary
   - Save as draft
   - Firebase createUser + Firestore user document
========================================================= */
import {
  auth, db,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  doc, setDoc, addDoc, collection, serverTimestamp
} from "./firebase.js";

(function () {
  "use strict";

  const TOTAL_STEPS = 5;
  const TOTAL_DOCUMENTS = 6;
  const REQUIRED_DOCUMENTS = [1, 2, 3, 4, 6];

  const MAX_BYTES_DEFAULT = 5 * 1024 * 1024;
  const MAX_BYTES_IMAGE = 2 * 1024 * 1024;

  const ALLOWED_DEFAULT_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png"
  ];

  const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png"
  ];

  const uploadedDocuments = new Set();
  const documentFiles = {};

  const documentNames = {
    1: "PSA Birth Certificate",
    2: "Certificate of Registration",
    3: "Latest Grades / Transcript",
    4: "Good Moral Certificate",
    5: "Barangay Certificate of Indigency",
    6: "2×2 ID Photo"
  };

  let currentStep = 1;

  document.addEventListener("DOMContentLoaded", function () {
    initStepNavigation();
    initPasswordTools();
    initUploadEngine();
    initDraftButtons();
    initReviewListeners();
    initSubmitValidation();
    updatePasswordStrength(getValue("s1-pass"));
    showStep(currentStep);
  });

  /* =========================================================
     BASIC HELPERS
  ========================================================= */

  function getEl(id) {
    return document.getElementById(id);
  }

  function getValue(id) {
    const el = getEl(id);
    return el ? el.value.trim() : "";
  }

  function showToast(message) {
    const toast = getEl("toast");

    if (!toast) { return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2800);
  }

  function scrollToRegisterCard() {
    const card = document.querySelector(".register-card");

    if (card) {
      card.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function setError(input, message) {
    if (!input) return;

    input.classList.add("input-error");

    let parent = input.parentElement;

    if (parent && parent.classList.contains("input-icon-wrap")) {
      parent = parent.parentElement;
    }

    if (!parent) return;

    let error = parent.querySelector(".field-error");

    if (!error) {
      error = document.createElement("p");
      error.className = "field-error";
      parent.appendChild(error);
    }

    error.textContent = message;
  }

  function clearError(input) {
    if (!input) return;

    input.classList.remove("input-error");

    let parent = input.parentElement;

    if (parent && parent.classList.contains("input-icon-wrap")) {
      parent = parent.parentElement;
    }

    if (!parent) return;

    const error = parent.querySelector(".field-error");

    if (error) {
      error.remove();
    }
  }

  function clearStepErrors(stepNumber) {
    const step = getEl("step-" + stepNumber);

    if (!step) return;

    step.querySelectorAll(".form-control").forEach(clearError);
  }

  /* =========================================================
     STEP NAVIGATION
  ========================================================= */

  function initStepNavigation() {
    document.querySelectorAll(".btn-next").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!validateStep(currentStep)) {
          showToast("Please complete the required fields before continuing.");
          return;
        }

        if (currentStep < TOTAL_STEPS) {
          currentStep++;

          if (currentStep === 5) {
            buildReview();
          }

          showStep(currentStep);
        }
      });
    });

    document.querySelectorAll(".btn-prev").forEach(function (button) {
      button.addEventListener("click", function () {
        if (currentStep > 1) {
          currentStep--;
          showStep(currentStep);
        }
      });
    });
  }

  function showStep(stepNumber) {
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const stepCard = getEl("step-" + i);
      const stepItem = getEl("si-" + i);
      const stepLabel = stepItem ? stepItem.querySelector(".step-lbl") : null;
      const stepLine = getEl("sl-" + (i - 1));

      if (stepCard) {
        stepCard.classList.toggle("active", i === stepNumber);
      }

      if (stepItem) {
        stepItem.classList.remove("s-active", "s-inactive", "s-complete");

        if (i < stepNumber) {
          stepItem.classList.add("s-complete");
        } else if (i === stepNumber) {
          stepItem.classList.add("s-active");
        } else {
          stepItem.classList.add("s-inactive");
        }
      }

      if (stepLabel) {
        stepLabel.classList.toggle("active", i <= stepNumber);
      }

      if (stepLine) {
        stepLine.classList.toggle("complete", i <= stepNumber);
      }
    }

    updateReviewReadiness();
    scrollToRegisterCard();
  }

  function validateStep(stepNumber) {
    if (stepNumber === 1) return validateAccountStep();
    if (stepNumber === 2) return validateGenericStep(2);
    if (stepNumber === 3) return validateGenericStep(3);
    if (stepNumber === 4) return validateDocumentStep(false);
    if (stepNumber === 5) return validateFinalStep();

    return true;
  }

  function validateAccountStep() {
    clearStepErrors(1);

    const firstName = getEl("s1-fname");
    const lastName = getEl("s1-lname");
    const email = getEl("s1-email");
    const password = getEl("s1-pass");
    const confirmPassword = getEl("s1-cpass");

    let valid = true;

    if (!firstName || firstName.value.trim().length < 2) {
      setError(firstName, "First name is required.");
      valid = false;
    }

    if (!lastName || lastName.value.trim().length < 2) {
      setError(lastName, "Last name is required.");
      valid = false;
    }

    if (!email || !isValidEmail(email.value.trim())) {
      setError(email, "Please enter a valid email address.");
      valid = false;
    }

    if (!password || password.value.length < 8) {
      setError(password, "Password must be at least 8 characters.");
      valid = false;
    }

    if (!confirmPassword || confirmPassword.value !== password.value) {
      setError(confirmPassword, "Passwords do not match.");
      valid = false;
    }

    return valid;
  }

  function validateGenericStep(stepNumber) {
    const step = getEl("step-" + stepNumber);

    if (!step) return true;

    clearStepErrors(stepNumber);

    const requiredFields = step.querySelectorAll(".form-label .req");
    let valid = true;

    requiredFields.forEach(function (reqMark) {
      const group = reqMark.closest(".form-group");
      if (!group) return;

      const input = group.querySelector("input, select");

      if (!input || !input.value.trim()) {
        setError(input, "This field is required.");
        valid = false;
      }
    });

    return valid;
  }

  function validateDocumentStep(showDetailedError) {
    const missingRequiredDocs = getMissingRequiredDocuments();

    if (missingRequiredDocs.length > 0) {
      if (showDetailedError) {
        const names = missingRequiredDocs.map(function (documentNumber) {
          return documentNames[documentNumber];
        });

        showSubmitError("Missing required documents: " + names.join(", ") + ".");
      }

      return false;
    }

    return true;
  }

  function validateFinalStep() {
    const agreeTerms = getEl("agree-terms");
    const agreeAccurate = getEl("agree-accurate");

    if (!validateAccountStep() || !validateGenericStep(2) || !validateGenericStep(3)) {
      showSubmitError("Please check your account, academic, and personal information.");
      return false;
    }

    if (!validateDocumentStep(true)) {
      return false;
    }

    if (!agreeTerms || !agreeTerms.checked) {
      showSubmitError("You must agree to the Terms of Use and Privacy Policy.");
      return false;
    }

    if (!agreeAccurate || !agreeAccurate.checked) {
      showSubmitError("You must certify that all submitted information is true and accurate.");
      return false;
    }

    hideSubmitError();
    return true;
  }

  /* =========================================================
     PASSWORD TOOLS
  ========================================================= */

  function initPasswordTools() {
    const passwordInput = getEl("s1-pass");
    const confirmInput = getEl("s1-cpass");
    const togglePassword = getEl("toggle-pass");

    if (togglePassword && passwordInput) {
      togglePassword.addEventListener("click", function () {
        const shouldShow = passwordInput.type === "password";

        passwordInput.type = shouldShow ? "text" : "password";
        togglePassword.className = shouldShow
          ? "bi bi-eye input-icon"
          : "bi bi-eye-slash input-icon";
      });
    }

    if (passwordInput) {
      passwordInput.addEventListener("input", function () {
        updatePasswordStrength(passwordInput.value);

        if (confirmInput && confirmInput.value) {
          clearError(confirmInput);

          if (confirmInput.value !== passwordInput.value) {
            setError(confirmInput, "Passwords do not match.");
          }
        }
      });
    }

    if (confirmInput && passwordInput) {
      confirmInput.addEventListener("input", function () {
        clearError(confirmInput);

        if (confirmInput.value !== passwordInput.value) {
          setError(confirmInput, "Passwords do not match.");
        }
      });
    }
  }

  function updatePasswordStrength(password) {
    const segments = document.querySelectorAll(".pw-seg");
    const label = document.querySelector(".pw-strength-label");

    if (!segments.length || !label) return;

    let score = 0;

    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    segments.forEach(function (segment, index) {
      segment.classList.remove("active-strong", "active-fair");

      if (index < score) {
        segment.classList.add(score >= 3 ? "active-strong" : "active-fair");
      }
    });

    if (!password) {
      label.textContent = "Password strength";
      label.className = "pw-strength-label";
    } else if (score <= 1) {
      label.textContent = "Weak password";
      label.className = "pw-strength-label text-red";
    } else if (score === 2) {
      label.textContent = "Fair password";
      label.className = "pw-strength-label text-gold";
    } else {
      label.textContent = "Strong password";
      label.className = "pw-strength-label text-green";
    }
  }

  /* =========================================================
     UPLOAD ENGINE
  ========================================================= */

  function initUploadEngine() {
    for (let n = 1; n <= TOTAL_DOCUMENTS; n++) {
      wireDocumentUploader(n);
    }

    document.querySelectorAll(".fp-remove").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        removeDocument(Number(button.dataset.doc));
      });
    });

    syncDocumentSummary();
  }

  function wireDocumentUploader(n) {
    const dropZone = getEl("dz-" + n);
    const input = getEl("file-" + n);

    if (!dropZone || !input) return;

    dropZone.addEventListener("click", function () {
      input.click();
    });

    input.addEventListener("change", function () {
      if (input.files && input.files[0]) {
        processFile(input.files[0], n);
      }
    });

    dropZone.addEventListener("dragover", function (event) {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", function () {
      dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", function (event) {
      event.preventDefault();
      dropZone.classList.remove("drag-over");

      const file = event.dataTransfer.files[0];

      if (file) {
        processFile(file, n);
      }
    });
  }

  function processFile(file, documentNumber) {
    const isImageOnlyDocument = documentNumber === 6;

    const maxBytes = isImageOnlyDocument
      ? MAX_BYTES_IMAGE
      : MAX_BYTES_DEFAULT;

    const allowedTypes = isImageOnlyDocument
      ? ALLOWED_IMAGE_TYPES
      : ALLOWED_DEFAULT_TYPES;

    if (!allowedTypes.includes(file.type)) {
      const allowedText = isImageOnlyDocument ? "JPG or PNG" : "PDF, JPG, or PNG";
      showUploadError(documentNumber, "Invalid file type. Please upload " + allowedText + ".");
      return;
    }

    if (file.size > maxBytes) {
      const limitText = isImageOnlyDocument ? "2 MB" : "5 MB";
      showUploadError(documentNumber, "File is too large. Maximum size is " + limitText + ".");
      return;
    }

    clearUploadError(documentNumber);
    animateUpload(file, documentNumber);
  }

  function animateUpload(file, documentNumber) {
    const dropZone = getEl("dz-" + documentNumber);
    const progress = getEl("uprog-" + documentNumber);
    const fill = getEl("uprog-fill-" + documentNumber);

    if (!dropZone || !progress || !fill) return;

    dropZone.style.pointerEvents = "none";
    dropZone.style.opacity = "0.55";
    progress.classList.add("show");

    let percentage = 0;

    const timer = setInterval(function () {
      percentage += Math.random() * 12 + 6;

      if (percentage >= 100) {
        percentage = 100;
        fill.style.width = "100%";
        clearInterval(timer);

        setTimeout(function () {
          finishUpload(file, documentNumber);
        }, 250);
      } else {
        fill.style.width = percentage + "%";
      }
    }, 45);
  }

  function finishUpload(file, documentNumber) {
    const dropZone = getEl("dz-" + documentNumber);
    const progress = getEl("uprog-" + documentNumber);
    const fill = getEl("uprog-fill-" + documentNumber);
    const preview = getEl("fp-" + documentNumber);
    const nameEl = getEl("fpname-" + documentNumber);
    const sizeEl = getEl("fpsize-" + documentNumber);
    const icon = getEl("fpicon-" + documentNumber);
    const item = getEl("doc-" + documentNumber);
    const docIcon = getEl("dicon-" + documentNumber);

    if (!dropZone || !progress || !fill || !preview || !nameEl || !sizeEl || !icon || !item || !docIcon) {
      return;
    }

    progress.classList.remove("show");
    fill.style.width = "0%";

    dropZone.style.display = "none";
    dropZone.style.opacity = "1";
    dropZone.style.pointerEvents = "auto";

    const isPdf = file.type === "application/pdf";

    nameEl.textContent = file.name;
    sizeEl.textContent = formatFileSize(file.size);

    icon.className = isPdf
      ? "bi bi-file-earmark-pdf fp-icon pdf"
      : "bi bi-image fp-icon img";

    preview.classList.add("show");

    item.classList.add("uploaded");
    item.classList.remove("has-error");

    docIcon.classList.add("done");
    docIcon.innerHTML = '<i class="bi bi-check-lg"></i>';

    uploadedDocuments.add(documentNumber);
    documentFiles[documentNumber] = file;

    syncDocumentSummary();
    updateReviewReadiness();
    showToast(documentNames[documentNumber] + " uploaded successfully.");
  }

  function removeDocument(documentNumber) {
    const item = getEl("doc-" + documentNumber);
    const dropZone = getEl("dz-" + documentNumber);
    const preview = getEl("fp-" + documentNumber);
    const docIcon = getEl("dicon-" + documentNumber);
    const input = getEl("file-" + documentNumber);

    if (!item || !dropZone || !preview || !docIcon || !input) return;

    const isImageOnlyDocument = documentNumber === 6;

    preview.classList.remove("show");

    dropZone.style.display = "flex";
    dropZone.style.opacity = "1";
    dropZone.style.pointerEvents = "auto";

    item.classList.remove("uploaded", "has-error");

    docIcon.classList.remove("done");
    docIcon.innerHTML = isImageOnlyDocument
      ? '<i class="bi bi-image"></i>'
      : '<i class="bi bi-file-earmark-text"></i>';

    if (isImageOnlyDocument) {
      docIcon.classList.add("img");
    } else {
      docIcon.classList.remove("img");
    }

    input.value = "";
    uploadedDocuments.delete(documentNumber);
    delete documentFiles[documentNumber];

    syncDocumentSummary();
    updateReviewReadiness();
    showToast(documentNames[documentNumber] + " removed.");
  }

  function showUploadError(documentNumber, message) {
    const item = getEl("doc-" + documentNumber);
    const error = getEl("uerr-" + documentNumber);

    if (!item || !error) return;

    item.classList.add("has-error");

    const messageSpan = error.querySelector("span");

    if (messageSpan) {
      messageSpan.textContent = message;
    }

    error.classList.add("show");
  }

  function clearUploadError(documentNumber) {
    const item = getEl("doc-" + documentNumber);
    const error = getEl("uerr-" + documentNumber);

    if (item) {
      item.classList.remove("has-error");
    }

    if (error) {
      error.classList.remove("show");
    }
  }

  function syncDocumentSummary() {
    const uploadedCount = getEl("uploaded-count");
    const progressFill = getEl("doc-prog");

    if (!uploadedCount || !progressFill) return;

    const count = uploadedDocuments.size;
    const percentage = Math.round((count / TOTAL_DOCUMENTS) * 100);

    uploadedCount.textContent = count;
    progressFill.style.width = percentage + "%";

    progressFill.style.background = count === TOTAL_DOCUMENTS
      ? "var(--success)"
      : "var(--gold)";
  }

  function getMissingRequiredDocuments() {
    return REQUIRED_DOCUMENTS.filter(function (documentNumber) {
      return !uploadedDocuments.has(documentNumber);
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
      return Math.round(bytes / 1024) + " KB";
    }

    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  /* =========================================================
     REVIEW STEP
  ========================================================= */

  function initReviewListeners() {
    document.querySelectorAll(".review-field").forEach(function (field) {
      field.addEventListener("input", function () {
        if (currentStep === 5) {
          buildReview();
        }
      });

      field.addEventListener("change", function () {
        if (currentStep === 5) {
          buildReview();
        }
      });
    });

    const agreeTerms = getEl("agree-terms");
    const agreeAccurate = getEl("agree-accurate");

    if (agreeTerms) {
      agreeTerms.addEventListener("change", updateReviewReadiness);
    }

    if (agreeAccurate) {
      agreeAccurate.addEventListener("change", updateReviewReadiness);
    }
  }

  function buildReview() {
    const reviewGrid = getEl("reviewGrid");

    if (!reviewGrid) return;

    reviewGrid.innerHTML = "";

    document.querySelectorAll(".review-field").forEach(function (field) {
      const label = field.dataset.review || "Field";
      const value = field.value || "Not provided";

      const item = document.createElement("div");
      item.className = "review-item";
      item.innerHTML = "<span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong>";

      reviewGrid.appendChild(item);
    });

    updateReviewReadiness();
  }

  function updateReviewReadiness() {
    const percentEl = getEl("reviewPercent");
    const readinessText = getEl("reviewReadinessText");
    const ring = document.querySelector(".review-score-ring");

    const infoComplete = validateAccountStepSilent() && validateGenericStepSilent(2) && validateGenericStepSilent(3);
    const docsComplete = getMissingRequiredDocuments().length === 0;

    const agreeTerms = getEl("agree-terms");
    const agreeAccurate = getEl("agree-accurate");
    const agreementsComplete = !!(agreeTerms && agreeTerms.checked && agreeAccurate && agreeAccurate.checked);

    let score = 0;
    if (infoComplete) score += 40;
    if (docsComplete) score += 40;
    if (agreementsComplete) score += 20;

    if (percentEl) {
      percentEl.textContent = score + "%";
    }

    if (ring) {
      ring.style.background = "conic-gradient(var(--gold) 0 " + score + "%, #E8E8E8 " + score + "% 100%)";
    }

    if (readinessText) {
      readinessText.textContent = score === 100
        ? "Your registration is ready for submission."
        : "Complete missing requirements before submitting.";
    }

    setReviewCheck("reviewInfoCheck", infoComplete);
    setReviewCheck("reviewDocsCheck", docsComplete);
    setReviewCheck("reviewAgreementCheck", agreementsComplete);
  }

  function setReviewCheck(id, done) {
    const item = getEl(id);
    if (!item) return;

    const icon = item.querySelector("i");

    item.classList.toggle("done", done);

    if (icon) {
      icon.className = done
        ? "bi bi-check-circle-fill"
        : "bi bi-circle";
    }
  }

  function validateAccountStepSilent() {
    const firstName = getEl("s1-fname");
    const lastName = getEl("s1-lname");
    const email = getEl("s1-email");
    const password = getEl("s1-pass");
    const confirmPassword = getEl("s1-cpass");

    return !!(
      firstName && firstName.value.trim().length >= 2 &&
      lastName && lastName.value.trim().length >= 2 &&
      email && isValidEmail(email.value.trim()) &&
      password && password.value.length >= 8 &&
      confirmPassword && confirmPassword.value === password.value
    );
  }

  function validateGenericStepSilent(stepNumber) {
    const step = getEl("step-" + stepNumber);

    if (!step) return true;

    let valid = true;

    step.querySelectorAll(".form-label .req").forEach(function (reqMark) {
      const group = reqMark.closest(".form-group");
      if (!group) return;

      const input = group.querySelector("input, select");

      if (!input || !input.value.trim()) {
        valid = false;
      }
    });

    return valid;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* =========================================================
     SAVE DRAFT
  ========================================================= */

  function initDraftButtons() {
    document.querySelectorAll(".btn-draft").forEach(function (button) {
      button.addEventListener("click", saveDraft);
    });
  }

  function saveDraft() {
    const draft = {};

    document.querySelectorAll(".review-field").forEach(function (field) {
      const key = field.dataset.review || field.name || field.id || "field";
      draft[key] = field.value;
    });

    draft.currentStep = currentStep;
    draft.uploadedDocuments = Array.from(uploadedDocuments);
    draft.savedAt = new Date().toISOString();

    localStorage.setItem("scholarsconnect_register_draft", JSON.stringify(draft));

    showToast("Draft saved successfully.");
  }

  /* =========================================================
     FILE HELPERS
  ========================================================= */

  async function hashPassword(password) {
    const encoded = new TextEncoder().encode(password);
    const buffer  = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buffer))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload  = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  /* =========================================================
     FINAL SUBMIT
  ========================================================= */

  function initSubmitValidation() {
    const submitButton = getEl("submit-reg");

    if (!submitButton) return;

    submitButton.addEventListener("click", async function () {
      if (!validateFinalStep()) return;

      hideSubmitError();

      submitButton.disabled = true;
      submitButton.innerHTML = '<i class="bi bi-arrow-repeat"></i> Submitting...';

      try {
        /* ── Step 1: Account ── */
        const email     = getValue("s1-email");
        const password  = getValue("s1-pass");
        const firstName = getValue("s1-fname");
        const lastName  = getValue("s1-lname");

        /* ── Step 2: Academic ── */
        const studentId = getValue("s2-student-id");
        const school    = getValue("s2-school");
        const campus    = getValue("s2-campus");
        const course    = getValue("s2-course");
        const yearLevel = getValue("s2-year-level");
        const gwa       = getValue("s2-gwa");
        const semester  = getValue("s2-semester");

        /* ── Step 3: Personal ── */
        const dob             = getValue("s3-dob");
        const sex             = getValue("s3-sex");
        const civilStatus     = getValue("s3-civil-status");
        const contactNumber   = getValue("s3-contact");
        const address         = getValue("s3-address");
        const province        = getValue("s3-province");
        const city            = getValue("s3-city");
        const guardianName    = getValue("s3-guardian-name");
        const guardianRel     = getValue("s3-guardian-rel");
        const guardianContact = getValue("s3-guardian-contact");
        const income          = getValue("s3-income");
        const is4ps           = getValue("s3-4ps") === "Yes";

        /* ── Document metadata (filenames/sizes only — goes in main user doc) ── */
        const docsMeta = {};
        for (const n of uploadedDocuments) {
          const f = documentFiles[n];
          if (f) docsMeta[String(n)] = { fileName: f.name, fileSize: f.size, fileType: f.type, uploaded: true };
        }

        /* ── 2×2 photo as photoBase64 (only if small enough for Firestore 1MB limit) ── */
        let photoBase64 = null;
        const photoFile = documentFiles[6];
        if (photoFile && photoFile.size <= 750 * 1024) {
          try { photoBase64 = await readFileAsBase64(photoFile); } catch (e) { /* skip oversized photo */ }
        }

        /* ── Hash password for Firestore record (SHA-256 — plaintext never stored) ── */
        const passwordHash = await hashPassword(password);

        /* ── Create Firebase Auth user ── */
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid  = cred.user.uid;

        /* ── Send email verification ── */
        try { await sendEmailVerification(cred.user); } catch (_) { /* non-fatal */ }

        /* ── Save complete user profile to Firestore ── */
        await setDoc(doc(db, "users", uid), {
          role:         "student",
          email:        email,
          firstName:    firstName,
          lastName:     lastName,
          displayName:  firstName + " " + lastName,
          photoURL:     null,
          photoBase64:  photoBase64,
          passwordHash: passwordHash,
          createdAt:    serverTimestamp(),

          studentId:   studentId,
          school:      school,
          campus:      campus,
          course:      course,
          yearLevel:   yearLevel,
          gwa:         gwa,
          semester:    semester,

          birthDate:            dob,
          sex:                  sex,
          civilStatus:          civilStatus,
          mobile:               contactNumber,
          address:              address,
          province:             province,
          city:                 city,
          guardianName:         guardianName,
          guardianRelationship: guardianRel,
          guardianContact:      guardianContact,
          familyIncome:         income,
          is4PsBeneficiary:     is4ps,

          documents: docsMeta
        });

        /* ── Save registration documents to top-level documents collection ── */
        /* mydocuments.js and adminapplicationreview.js both read from here  */
        const INLINE_LIMIT = 640 * 1024;
        const docSavePromises = Object.entries(documentFiles).map(async function ([nStr, file]) {
          const n = Number(nStr);
          const isImage = file.type !== "application/pdf";
          const record = {
            userId:    uid,
            name:      documentNames[n] || ("Document " + n),
            filename:  file.name,
            fileType:  isImage ? "Image" : "PDF",
            size:      formatFileSize(file.size),
            status:    "pending",
            category:  "Registration Document",
            required:  REQUIRED_DOCUMENTS.includes(n),
            linkedTo:  "Registration",
            uploadedAt: serverTimestamp()
          };
          try {
            const base64 = await readFileAsBase64(file);
            if (file.size <= INLINE_LIMIT) {
              record.downloadURL  = base64;
              record.storagePath  = "inline-preview://" + file.name;
              record.storageMode  = "firestore-inline-preview";
            }
            await addDoc(collection(db, "documents"), record);
          } catch (e) {
            /* Save metadata-only record if base64 read or Firestore write fails */
            try { await addDoc(collection(db, "documents"), record); } catch (_) {}
            console.warn("Document " + n + " preview not saved:", e.message);
          }
        });
        await Promise.all(docSavePromises);

        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="bi bi-send-check"></i> Submit Registration';

        const modal = getEl("successModal");
        const refEl  = getEl("regRefNo");
        if (refEl) refEl.textContent = "SC-" + uid.slice(0, 8).toUpperCase();

        /* Show email verification notice inside the modal */
        const verifyNote = getEl("reg-verify-note");
        if (verifyNote) verifyNote.style.display = "";

        if (modal) modal.classList.add("show");

        showToast("Verification email sent. Please check your email before logging in.");

      } catch (err) {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="bi bi-send-check"></i> Submit Registration';

        if (err.code === "auth/email-already-in-use") {
          showSubmitError("This email is already registered. Please use a different email or log in.");
        } else if (err.code === "auth/weak-password") {
          showSubmitError("Password is too weak. Please choose a stronger password.");
        } else if (err.code === "auth/network-request-failed") {
          showSubmitError("Network error. Please check your connection and try again.");
        } else {
          showSubmitError("Registration failed. Please try again.");
        }
      }
    });
  }

  function showSubmitError(message) {
    const submitError = getEl("submit-error");
    const submitErrorMessage = getEl("submit-error-msg");

    if (!submitError || !submitErrorMessage) {
      alert(message);
      return;
    }

    submitError.style.display = "flex";
    submitErrorMessage.textContent = message;

    submitError.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function hideSubmitError() {
    const submitError = getEl("submit-error");
    const submitErrorMessage = getEl("submit-error-msg");

    if (submitError) {
      submitError.style.display = "none";
    }

    if (submitErrorMessage) {
      submitErrorMessage.textContent = "";
    }
  }
})();

