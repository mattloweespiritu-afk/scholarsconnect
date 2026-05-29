/* =========================================================
   ScholarsConnect Application Page Script
   File: ESTECH/Javascript/application.js
========================================================= */
import {
  auth,
  db,
  storage,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc as firestoreDoc,
  query,
  where,
  serverTimestamp,
  ref,
  uploadBytesResumable,
  getDownloadURL
} from "./firebase.js";

function getAcademicYear() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 8 ? y + "-" + (y + 1) : (y - 1) + "-" + y;
}
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";

(function () {
  "use strict";

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const INLINE_PREVIEW_FILE_LIMIT = 640 * 1024;
  const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

  var SCHOLARSHIP_CACHE = {};   /* docId -> Firestore scholarship data */

  const documents = [
    {
      id: 1,
      name: "PSA Birth Certificate",
      metaReady: "birth_certificate.pdf · 1.2 MB · Verified",
      metaMissing: "Required identity document",
      required: true,
      conditional: false,
      ready: false
    },
    {
      id: 2,
      name: "Certificate of Registration (COR)",
      metaReady: "cor_2026.pdf · 0.8 MB · Verified",
      metaMissing: "Proof of current enrollment",
      required: true,
      conditional: false,
      ready: false
    },
    {
      id: 3,
      name: "Official Transcript of Records / Grades",
      metaReady: "tor_2nd_sem.pdf · 2.1 MB · Verified",
      metaMissing: "Latest academic record",
      required: true,
      conditional: false,
      ready: false
    },
    {
      id: 4,
      name: "Certificate of Good Moral Character",
      metaReady: "good_moral.pdf · 0.5 MB · Verified",
      metaMissing: "Issued by school or authorized office",
      required: true,
      conditional: false,
      ready: false
    },
    {
      id: 5,
      name: "Barangay Certificate of Indigency / ITR",
      metaReady: "indigency_certificate.pdf · Pending Review",
      metaMissing: "Required for need-based scholarship verification",
      required: false,
      conditional: true,
      ready: false
    },
    {
      id: 6,
      name: "2×2 ID Photo",
      metaReady: "id_photo.png · Pending Review",
      metaMissing: "Recent photo with white background",
      required: true,
      conditional: false,
      ready: false
    }
  ];

  let currentStep = 1;
  let selectedScholarship = null;

  /* Keywords that map each application document slot to vault document names.
     Registration names differ from application names, so we use partial matching. */
  const DOC_VAULT_KEYWORDS = {
    1: ["psa birth", "birth certificate"],
    2: ["certificate of registration", " cor", "(cor)"],
    3: ["grades", "transcript", "latest grades"],
    4: ["good moral"],
    5: ["barangay", "indigency", "itr"],
    6: ["2×2", "2x2", "id photo"]
  };

  async function prefillDocumentsFromVault(uid) {
    try {
      var snap = await getDocs(query(collection(db, "documents"), where("userId", "==", uid)));
      if (snap.empty) return;
      var changed = false;
      snap.docs.forEach(function (d) {
        var data = d.data();
        var nameNorm = (data.name || "").toLowerCase();
        documents.forEach(function (docItem) {
          if (docItem.ready) return;
          var keywords = DOC_VAULT_KEYWORDS[docItem.id] || [];
          var matched = keywords.some(function (kw) { return nameNorm.includes(kw); });
          /* Also accept an exact name match (for docs previously uploaded via application form) */
          if (!matched) matched = nameNorm === docItem.name.toLowerCase();
          if (!matched) return;
          docItem.ready = true;
          docItem.firestoreDocId = d.id;
          var statusLabel = data.status === "verified" ? "Verified" : "Pending Review";
          docItem.metaReady = (data.filename || data.name || "Document") +
            (data.size ? " · " + data.size : "") +
            " · " + statusLabel;
          changed = true;
        });
      });
      if (changed) {
        renderDocuments();
        updateDocumentSummary();
      }
    } catch (e) {
      console.warn("Could not prefill documents from vault:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initStudentLogout();
    loadStudentProfile().then(function(profile) {
      if (profile) {
        var fill = function(id, val) { var el = document.getElementById(id); if (el && !el.value && val) el.value = val; };
        fill("fName",      profile.displayName);
        fill("fEmail",     profile.user && profile.user.email);
        fill("fDob",       profile.birthDate);
        fill("fMobile",    profile.mobile);
        fill("fAddress",   profile.address);
        fill("fStudentId", profile.studentId);
        fill("fCourse",    profile.course);
        fill("fGwa",        profile.gwa);
        fill("fAwards",     profile.awards);
        if (profile.dependents !== undefined && profile.dependents !== null) {
          fill("fDependents", String(profile.dependents));
        }
        var yl = document.getElementById("fYear");
        if (yl && !yl.value && profile.yearLevel) yl.value = profile.yearLevel;
        var inc = document.getElementById("fIncome");
        if (inc && !inc.value && profile.familyIncome) inc.value = profile.familyIncome;
        /* Pre-fill documents from student's vault (registration + previous uploads) */
        prefillDocumentsFromVault(profile.uid || (profile.user && profile.user.uid));
      }
    });
    initMobileSidebar();
    initTopButtons();
    initScholarshipSelection();
    initStepButtons();
    initDeclaration();
    initFormDraftStatus();
    initDuplicateModal();
    renderDocuments();
    updateDocumentSummary();
    loadScholarships(); /* async — calls preselectFromUrl() internally after render */
  });

  function getEl(id) {
    return document.getElementById(id);
  }

  function normalizeDocumentKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, "/");
  }

  async function saveOrReplaceApplicationDocument(uid, docItem, payload) {
    const record = Object.assign({}, payload, {
      userId: uid,
      name: docItem.name,
      documentKey: normalizeDocumentKey(docItem.name),
      scholarshipId: selectedScholarship || "",
      status: "pending",
      uploadedAt: serverTimestamp(),
      replacedAt: serverTimestamp()
    });

    if (docItem.firestoreDocId) {
      await updateDoc(firestoreDoc(db, "documents", docItem.firestoreDocId), record);
      return { id: docItem.firestoreDocId, replaced: true };
    }

    /* Single-field query only — compound queries need composite indexes. Filter in-memory. */
    const existingSnap = await getDocs(query(
      collection(db, "documents"),
      where("userId", "==", uid)
    ));

    let latest = null;
    existingSnap.docs.forEach(function (d) {
      const data = d.data();
      if ((data.name || "") !== docItem.name) return;
      if ((data.scholarshipId || "") !== (selectedScholarship || "")) return;
      const uploadedAt = data.uploadedAt
        ? (data.uploadedAt.toDate ? data.uploadedAt.toDate() : new Date(data.uploadedAt))
        : null;
      const uploadedMillis = uploadedAt ? uploadedAt.getTime() : 0;
      if (!latest || uploadedMillis > latest.uploadedMillis) {
        latest = { id: d.id, uploadedMillis: uploadedMillis };
      }
    });

    if (latest) {
      await updateDoc(firestoreDoc(db, "documents", latest.id), record);
      return { id: latest.id, replaced: true };
    }

    const created = await addDoc(collection(db, "documents"), record);
    return { id: created.id, replaced: false };
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

  function initScholarshipSelection() {
    /* Event delegation — works for dynamically rendered cards */
    var grid = getEl("scholarship-grid");
    if (!grid) return;
    grid.addEventListener("click", function (e) {
      var card = e.target.closest("[data-scholarship]");
      if (card) selectScholarship(card.dataset.scholarship);
    });
  }

  /* ── Load scholarships from Firestore ── */
  function loadScholarships() {
    var grid = getEl("scholarship-grid");
    if (!grid) return;

    /* Try published first; fall back to all non-archived if none published */
    getDocs(query(collection(db, "scholarships"), where("status", "==", "published")))
      .then(function (snap) {
        if (snap.empty) {
          return getDocs(query(collection(db, "scholarships"), where("status", "!=", "archived")));
        }
        return snap;
      })
      .then(function (snap) {
        SCHOLARSHIP_CACHE = {};
        if (!snap || snap.empty) {
          grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa">No scholarships are currently open for applications.</div>';
          return;
        }
        snap.docs.forEach(function (d) {
          SCHOLARSHIP_CACHE[d.id] = Object.assign({ id: d.id }, d.data());
        });
        grid.innerHTML = snap.docs.map(function (d) {
          return buildScholarshipOption(d.id, d.data());
        }).join("");
        preselectFromUrl();
      })
      .catch(function (e) {
        console.warn("Could not load scholarships:", e);
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa">Could not load scholarships. Please refresh the page.</div>';
      });
  }

  function buildScholarshipOption(id, s) {
    var name      = s.title || s.name || "—";
    var desc      = s.description || s.desc || s.subtitle || s.sub || "";
    var type      = (s.type || "merit").toLowerCase();
    var typeLabel = capitalize(type);
    var slotsNum  = s.slots     != null ? parseInt(s.slots, 10)     : 0;
    var filled    = s.filledSlots != null ? parseInt(s.filledSlots, 10) : 0;
    var remaining = slotsNum > 0 ? (slotsNum - filled) : null;
    var fillPct   = slotsNum > 0 ? Math.min(100, Math.round((filled / slotsNum) * 100)) : 0;
    var deadline  = s.deadline ? formatScholarshipDeadline(s.deadline) : null;
    var urgent    = deadline && isDeadlineUrgent(s.deadline);
    var slotsText = remaining !== null ? remaining + " of " + slotsNum + " slots remaining" : "Open enrollment";

    return (
      '<button class="scholarship-option" type="button" data-scholarship="' + escapeHtml(id) + '">' +
        '<span class="option-check"><i class="bi bi-check"></i></span>' +
        '<span class="type-pill ' + escapeHtml(type) + '">' + escapeHtml(typeLabel) + '</span>' +
        '<strong>' + escapeHtml(name) + '</strong>' +
        (desc ? '<span class="option-desc">' + escapeHtml(desc) + '</span>' : '') +
        (deadline
          ? '<span class="option-meta' + (urgent ? ' urgent' : '') + '">' +
              '<i class="bi ' + (urgent ? 'bi-exclamation-triangle-fill' : 'bi-calendar-event') + '"></i> ' +
              'Deadline: ' + escapeHtml(deadline) +
            '</span>'
          : '') +
        '<span class="slots-row">' +
          '<span>' + escapeHtml(slotsText) + '</span>' +
          (slotsNum > 0 ? '<b>' + fillPct + '% filled</b>' : '') +
        '</span>' +
        (slotsNum > 0 ? '<span class="mini-progress"><span style="width:' + fillPct + '%;"></span></span>' : '') +
      '</button>'
    );
  }

  function formatScholarshipDeadline(val) {
    if (!val) return null;
    var d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function isDeadlineUrgent(val) {
    var d = new Date(val);
    if (isNaN(d.getTime())) return false;
    return (d - Date.now()) / (1000 * 60 * 60 * 24) <= 14;
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

  function preselectFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var param  = params.get("scholarship");
    if (!param) return;

    var decoded = decodeURIComponent(param).toLowerCase().trim();

    var matchedId = Object.keys(SCHOLARSHIP_CACHE).find(function (id) {
      var sc   = SCHOLARSHIP_CACHE[id];
      var name = (sc.title || sc.name || "").toLowerCase();
      return name === decoded || name.includes(decoded) || decoded.includes(name) || id === param;
    });

    if (matchedId) {
      selectScholarship(matchedId);
      showToast("Scholarship pre-selected from Browse Scholarships.");
    }
  }

  function selectScholarship(key) {
    selectedScholarship = key;

    document.querySelectorAll("[data-scholarship]").forEach(function (card) {
      card.classList.toggle("selected", card.dataset.scholarship === key);
    });

    const error = getEl("errorStep1");
    if (error) error.classList.remove("show");

    /* Clear any previous duplicate warning immediately while the async check runs */
    var dupWarn  = getEl("dupActiveWarning");
    var nextBtn  = document.querySelector('[data-next="1"]');
    if (dupWarn) dupWarn.classList.remove("show");
    if (nextBtn) { nextBtn.disabled = false; nextBtn.removeAttribute("title"); }

    applyScholarshipDocumentRules();
    renderDocuments();
    updateDocumentSummary();
    setDraftStatus("Selection saved");

    /* Async duplicate check — blocks Next if active application already exists */
    checkEarlyDuplicate(key);
  }

  async function checkEarlyDuplicate(scholarshipKey) {
    var user = auth.currentUser;
    if (!user || !scholarshipKey) return;

    var sc = SCHOLARSHIP_CACHE[scholarshipKey] || {};
    var scholarshipName = sc.title || sc.name || "";
    var academicYear    = getAcademicYear();

    var BLOCK = new Set(["submitted", "under_review", "approved", "active", "needs_reupload", "needs-reupload"]);

    try {
      var byId   = await getDocs(query(collection(db, "applications"), where("userId", "==", user.uid), where("scholarshipId", "==", scholarshipKey)));
      var byName = scholarshipName
        ? await getDocs(query(collection(db, "applications"), where("userId", "==", user.uid), where("scholarshipName", "==", scholarshipName)))
        : { docs: [] };

      var merged = [...byId.docs, ...byName.docs].filter(function (d, i, arr) {
        return arr.findIndex(function (x) { return x.id === d.id; }) === i;
      });

      var hasActive = merged.some(function (d) {
        var data = d.data() || {};
        if (data.academicYear && data.academicYear !== academicYear) return false;
        var s = String(data.status || "").toLowerCase().replace(/-/g, "_");
        return BLOCK.has(s);
      });

      /* Only update UI if the user hasn't changed the selection while we were fetching */
      if (selectedScholarship !== scholarshipKey) return;

      var dupWarn = getEl("dupActiveWarning");
      var nameEl  = getEl("dupActiveScholarshipName");
      var nextBtn = document.querySelector('[data-next="1"]');

      if (hasActive) {
        if (nameEl)  nameEl.textContent = scholarshipName || "this scholarship";
        if (dupWarn) dupWarn.classList.add("show");
        if (nextBtn) {
          nextBtn.disabled = true;
          nextBtn.setAttribute("title", "You already have an active application for this scholarship.");
        }
        setDraftStatus("Duplicate detected");
      } else {
        if (dupWarn) dupWarn.classList.remove("show");
        if (nextBtn) { nextBtn.disabled = false; nextBtn.removeAttribute("title"); }
      }
    } catch (_) {
      /* Silent fail — submit-time check is the safety net */
    }
  }

  function applyScholarshipDocumentRules() {
    var indigencyDoc = documents.find(function (doc) { return doc.id === 5; });
    if (!indigencyDoc) return;

    var sc   = SCHOLARSHIP_CACHE[selectedScholarship];
    var type = sc ? (sc.type || "").toLowerCase() : "";
    var needsIndigency = type === "need" || type === "need-based" || type === "need_based";

    indigencyDoc.required    = needsIndigency;
    indigencyDoc.conditional = !needsIndigency;
  }

  function initStepButtons() {
    document.querySelectorAll("[data-next]").forEach(function (button) {
      button.addEventListener("click", function () {
        goNext(Number(button.dataset.next));
      });
    });

    document.querySelectorAll("[data-back]").forEach(function (button) {
      button.addEventListener("click", function () {
        goBack(Number(button.dataset.back));
      });
    });

    const submitButton = getEl("submitBtn");

    if (submitButton) {
      submitButton.addEventListener("click", submitApplication);
    }
  }

  function goNext(fromStep) {
    if (fromStep === 1 && !selectedScholarship) {
      showError("errorStep1");
      return;
    }

    if (fromStep === 2 && !validateStepTwo()) {
      showError("errorStep2");
      return;
    }

    if (fromStep === 3 && !validateDocuments()) {
      showError("errorStep3");
      return;
    }

    setStep(fromStep + 1);
  }

  function goBack(fromStep) {
    if (fromStep <= 1) return;

    setStep(fromStep - 1);
  }

  function setStep(step) {
    currentStep = step;

    document.querySelectorAll(".step-panel").forEach(function (panel) {
      panel.classList.remove("active");
    });

    const nextPanel = getEl("panel-" + step);

    if (nextPanel) {
      nextPanel.classList.add("active");
    }

    updateStepBar(step);

    if (step === 4) {
      buildReview();
    }

    setDraftStatus("Draft saved");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function updateStepBar(step) {
    const indicators = document.querySelectorAll("[data-step-indicator]");
    const lines = document.querySelectorAll(".step-line");

    indicators.forEach(function (indicator) {
      const indicatorStep = Number(indicator.dataset.stepIndicator);
      const circle = indicator.querySelector(".step-circle");

      indicator.classList.remove("active", "done");

      if (!circle) return;

      if (indicatorStep < step) {
        indicator.classList.add("done");
        circle.innerHTML = '<i class="bi bi-check"></i>';
      } else if (indicatorStep === step) {
        indicator.classList.add("active");
        circle.textContent = indicatorStep;
      } else {
        circle.textContent = indicatorStep;
      }
    });

    lines.forEach(function (line, index) {
      line.classList.toggle("done", index + 1 < step);
    });
  }

  function validateStepTwo() {
    const requiredIds = [
      "fName",
      "fDob",
      "fEmail",
      "fMobile",
      "fAddress",
      "fStudentId",
      "fCourse",
      "fYear",
      "fGwa",
      "fIncome",
      "fDependents"
    ];

    let valid = true;

    requiredIds.forEach(function (id) {
      const field = getEl(id);

      if (!field) return;

      const isEmpty = field.value.trim() === "";

      field.classList.toggle("error", isEmpty);

      if (isEmpty) {
        valid = false;
      }
    });

    const emailField = getEl("fEmail");

    if (emailField && !emailField.value.includes("@")) {
      emailField.classList.add("error");
      valid = false;
    }

    const gwaField = getEl("fGwa");

    if (gwaField) {
      const gwa = Number(gwaField.value);

      if (gwa < 75 || gwa > 100 || Number.isNaN(gwa)) {
        gwaField.classList.add("error");
        valid = false;
      }
    }

    return valid;
  }

  function validateDocuments() {
    const missingRequired = documents.filter(function (doc) {
      return doc.required && !doc.ready;
    });

    return missingRequired.length === 0;
  }

  function showError(id) {
    const error = getEl(id);

    if (!error) return;

    error.classList.add("show");

    error.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function renderDocuments() {
    const list = getEl("docList");

    if (!list) return;

    list.innerHTML = documents.map(createDocumentItem).join("");

    document.querySelectorAll("[data-upload-doc]").forEach(function (button) {
      button.addEventListener("click", function () {
        uploadDocument(Number(button.dataset.uploadDoc));
      });
    });
  }

  function createDocumentItem(doc) {
    const statusClass = doc.ready ? "ready" : "missing";
    const tagClass = doc.required ? "required" : "conditional";
    const tagLabel = doc.required ? "Required" : "Conditional";
    const badgeLabel = doc.ready ? "Ready" : "Missing";
    const meta = doc.ready ? doc.metaReady : doc.metaMissing;
    const icon = doc.ready ? "bi-file-earmark-check-fill" : "bi-file-earmark-arrow-up";

    return `
      <div class="doc-item ${doc.ready ? "ready" : ""}" id="doc-${doc.id}">
        <div class="doc-icon">
          <i class="bi ${icon}"></i>
        </div>

        <div>
          <div class="doc-name">${escapeHtml(doc.name)}</div>
          <div class="doc-meta">${escapeHtml(meta)}</div>
        </div>

        <div class="doc-actions">
          <span class="doc-tag ${tagClass}">${tagLabel}</span>
          <span class="doc-badge ${statusClass}">${badgeLabel}</span>

          <button class="doc-upload-btn ${doc.ready ? "ready" : ""}" type="button" data-upload-doc="${doc.id}">
            <i class="bi ${doc.ready ? "bi-arrow-repeat" : "bi-upload"}"></i>
            ${doc.ready ? "Replace" : "Upload"}
          </button>
        </div>
      </div>
    `;
  }

  function uploadDocument(id) {
    const doc = documents.find(function (item) {
      return item.id === id;
    });

    if (!doc) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ALLOWED_FILE_TYPES.join(",");
    input.style.display = "none";

    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      input.remove();
      if (file) uploadSelectedDocument(doc, file);
    });

    document.body.appendChild(input);
    input.click();
    return;

    doc.ready = true;
    doc.metaReady = "document_" + id + ".pdf · Pending Review";

    renderDocuments();
    updateDocumentSummary();

    const error = getEl("errorStep3");

    if (error) {
      error.classList.remove("show");
    }

    showToast(doc.name + " uploaded. Pending review.");
    setDraftStatus("Document saved");

    setTimeout(function () {
      doc.metaReady = "document_" + id + ".pdf · Verified";
      renderDocuments();
      updateDocumentSummary();
    }, 900);
  }

  function uploadSelectedDocument(docItem, file) {
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) {
      showToast("Please log in before uploading documents.");
      return;
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      showToast("Invalid file type. Please upload PDF, JPG, JPEG, or PNG only.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showToast("File is too large. Maximum size is 5 MB.");
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = "documents/" + uid + "/" + Date.now() + "_" + safeName;

    if (file.size <= INLINE_PREVIEW_FILE_LIMIT) {
      uploadInlinePreviewApplicationDocument(docItem, file, uid);
      return;
    }

    const uploadRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(uploadRef, file);

    docItem.uploading = true;
    docItem.ready = false;
    docItem.metaMissing = file.name + " · Uploading 0%";
    renderDocuments();
    updateDocumentSummary();
    setDraftStatus("Uploading document");

    uploadTask.on(
      "state_changed",
      function (snapshot) {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        docItem.metaMissing = file.name + " · Uploading " + pct + "%";
        renderDocuments();
      },
      function (error) {
        console.error("Application document upload error:", error);
        docItem.uploading = false;
        docItem.ready = false;
        docItem.metaMissing = "Upload failed. Please try again.";
        renderDocuments();
        updateDocumentSummary();
        showToast("Upload failed. Please try again.");
        setDraftStatus("Upload failed");
      },
      function () {
        getDownloadURL(uploadTask.snapshot.ref)
          .then(function (downloadURL) {
            return saveOrReplaceApplicationDocument(uid, docItem, {
              filename: file.name,
              fileType: file.type === "application/pdf" ? "PDF" : "Image",
              size: formatFileSize(file.size),
              downloadURL: downloadURL,
              storagePath: storagePath,
              category: "Application Requirement",
              required: !!docItem.required,
              linkedTo: (SCHOLARSHIP_CACHE[selectedScholarship] || {}).title || (SCHOLARSHIP_CACHE[selectedScholarship] || {}).name || "Current application"
            });
          })
          .then(function (savedDoc) {
            docItem.uploading = false;
            docItem.ready = true;
            docItem.firestoreDocId = savedDoc.id;
            docItem.metaReady = file.name + " · " + formatFileSize(file.size) + " · Pending Review";
            renderDocuments();
            updateDocumentSummary();

            const error = getEl("errorStep3");
            if (error) error.classList.remove("show");

            showToast(docItem.name + (savedDoc.replaced ? " replaced. Pending admin review." : " uploaded. Pending admin review."));
            setDraftStatus("Document uploaded");
          })
          .catch(function (error) {
            console.error("Application document save error:", error);
            docItem.uploading = false;
            docItem.ready = false;
            docItem.metaMissing = "File uploaded but record could not be saved.";
            renderDocuments();
            updateDocumentSummary();
            showToast("File uploaded but record could not be saved.");
            setDraftStatus("Upload save failed");
          });
      }
    );
  }

  function uploadInlinePreviewApplicationDocument(docItem, file, uid) {
    docItem.uploading = true;
    docItem.ready = false;
    docItem.metaMissing = file.name + " · Saving preview preview...";
    renderDocuments();
    updateDocumentSummary();
    setDraftStatus("Saving document");

    const reader = new FileReader();

    reader.onload = function () {
      saveOrReplaceApplicationDocument(uid, docItem, {
        filename: file.name,
        fileType: file.type === "application/pdf" ? "PDF" : "Image",
        size: formatFileSize(file.size),
        downloadURL: reader.result,
        storagePath: "inline-preview://" + file.name,
        storageMode: "firestore-inline-preview",
        category: "Application Requirement",
        required: !!docItem.required,
        linkedTo: (SCHOLARSHIP_CACHE[selectedScholarship] || {}).title || (SCHOLARSHIP_CACHE[selectedScholarship] || {}).name || "Current application"
      })
        .then(function (savedDoc) {
          docItem.uploading = false;
          docItem.ready = true;
          docItem.firestoreDocId = savedDoc.id;
          docItem.metaReady = file.name + " · " + formatFileSize(file.size) + " · Pending Review";
          renderDocuments();
          updateDocumentSummary();

          const error = getEl("errorStep3");
          if (error) error.classList.remove("show");

          showToast(docItem.name + (savedDoc.replaced ? " replaced for preview review." : " saved for preview review."));
          setDraftStatus("Document saved");
        })
        .catch(function (error) {
          console.error("Inline preview application document save error:", error);
          docItem.uploading = false;
          docItem.ready = false;
          docItem.metaMissing = "Could not save preview file. Try a smaller file.";
          renderDocuments();
          updateDocumentSummary();
          showToast("Could not save preview file. Try a smaller file or deploy Firebase Storage.");
          setDraftStatus("Upload save failed");
        });
    };

    reader.onerror = function () {
      docItem.uploading = false;
      docItem.ready = false;
      docItem.metaMissing = "Could not read this file. Please choose another file.";
      renderDocuments();
      updateDocumentSummary();
      showToast("Could not read this file. Please choose another file.");
      setDraftStatus("Upload failed");
    };

    reader.readAsDataURL(file);
  }

  function updateDocumentSummary() {
    const readyCount = documents.filter(function (doc) {
      return doc.ready;
    }).length;

    const totalCount = documents.length;
    const percentage = Math.round((readyCount / totalCount) * 100);

    const summaryText = getEl("docSummaryText");
    const summaryNote = getEl("docSummaryNote");
    const summaryFill = getEl("docSummaryFill");

    if (summaryText) {
      summaryText.textContent = readyCount + " of " + totalCount + " documents ready";
    }

    if (summaryNote) {
      const requiredMissing = documents.filter(function (doc) {
        return doc.required && !doc.ready;
      }).length;

      summaryNote.textContent =
        requiredMissing === 0
          ? "All required documents are ready for review."
          : "Upload missing required documents to continue.";
    }

    if (summaryFill) {
      summaryFill.style.width = percentage + "%";
    }
  }

  function buildReview() {
    var selected = SCHOLARSHIP_CACHE[selectedScholarship] || {};
    var scName   = selected.title || selected.name || "No scholarship selected";
    var scType   = selected.type  ? capitalize(selected.type) : "";
    var scDL     = selected.deadline ? formatScholarshipDeadline(selected.deadline) : "";
    var scSlots  = selected.slots != null
      ? (selected.filledSlots || 0) + " / " + selected.slots + " slots filled"
      : "";

    setText("reviewScholarshipName", scName);
    setText("reviewScholarshipMeta",
      scType
        ? [scType, scDL ? "Deadline: " + scDL : "", scSlots].filter(Boolean).join(" · ")
        : "Scholarship details"
    );

    const yearMap = {
      "1": "1st Year",
      "2": "2nd Year",
      "3": "3rd Year",
      "4": "4th Year"
    };

    const incomeMap = {
      "below-10k": "Below \u20B110,000",
      "10k-20k": "\u20B110,000 – \u20B120,000",
      "20k-35k": "\u20B120,000 – \u20B135,000",
      "35k-50k": "\u20B135,000 – \u20B150,000",
      "above-50k": "Above \u20B150,000"
    };

    setText("reviewName", getValue("fName"));
    setText("reviewStudentId", getValue("fStudentId"));
    setText("reviewEmail", getValue("fEmail"));
    setText("reviewMobile", getValue("fMobile"));
    setText("reviewCourse", getValue("fCourse"));
    setText("reviewYear", yearMap[getValue("fYear")] || "—");
    setText("reviewGwa", getValue("fGwa"));
    setText("reviewIncome", incomeMap[getValue("fIncome")] || "—");

    const reviewDocs = getEl("reviewDocs");

    if (reviewDocs) {
      reviewDocs.innerHTML = documents
        .map(function (doc) {
          const statusClass = doc.ready ? "ready" : "missing";
          const statusText = doc.ready ? "Ready" : "Missing";

          return `
            <div class="review-row">
              <span>${escapeHtml(doc.name)}</span>
              <strong class="${statusClass}">${statusText}</strong>
            </div>
          `;
        })
        .join("");
    }
  }

  function initDeclaration() {
    const checkbox = getEl("declarationCheck");
    const submitButton = getEl("submitBtn");

    if (!checkbox || !submitButton) return;

    checkbox.addEventListener("change", function () {
      submitButton.disabled = !checkbox.checked;
    });
  }

  async function submitApplication() {
    const submitButton = getEl("submitBtn");
    if (!submitButton || submitButton.disabled) return;

    const user = auth.currentUser;
    const selected = SCHOLARSHIP_CACHE[selectedScholarship] || {};
    const scholarshipName = selected.title || selected.name || getValue("fScholarship") || "a scholarship";
    const scholarshipType = selected.type || "-";

    if (!user) {
      showToast("Please log in before submitting an application.");
      return;
    }

    if (!selectedScholarship || (!selected.title && !selected.name)) {
      showToast("Please select a valid scholarship from the current list.");
      return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = "<span class=\"spinner\"></span> Submitting...";
    setDraftStatus("Submitting application");

    const ref = generateReference();

    /* Write to Firestore */
    try {
      const academicYear = getAcademicYear();
      const duplicateKey = user.uid + "_" + selectedScholarship + "_" + academicYear;

      const BLOCK_STATUSES = new Set(["submitted", "under_review", "approved", "active", "needs_reupload", "needs-reupload"]);

      function isBlockedStatus(data) {
        if (data.academicYear && data.academicYear !== academicYear) return false;
        const s = String(data.status || "").toLowerCase().replace(/-/g, "_");
        return BLOCK_STATUSES.has(s);
      }

      /* Check by scholarshipId (new applications) */
      const dupById = selectedScholarship
        ? await getDocs(query(collection(db, "applications"), where("userId", "==", user.uid), where("scholarshipId", "==", selectedScholarship)))
        : { docs: [] };

      /* Fallback: check by scholarshipName to catch old applications that lack scholarshipId */
      const dupByName = scholarshipName
        ? await getDocs(query(collection(db, "applications"), where("userId", "==", user.uid), where("scholarshipName", "==", scholarshipName)))
        : { docs: [] };

      const allDupDocs = [...dupById.docs, ...dupByName.docs].filter(function (d, i, arr) {
        return arr.findIndex(function (x) { return x.id === d.id; }) === i; /* dedupe by doc id */
      });

      const hasActiveDuplicate = allDupDocs.some(function (docSnap) {
        return isBlockedStatus(docSnap.data() || {});
      });

      if (hasActiveDuplicate) {
        showDuplicateModal(scholarshipName, academicYear);
        try {
          await addDoc(collection(db, "auditLogs"), {
            action:         "duplicate_blocked",
            userId:         user.uid,
            scholarshipId:  selectedScholarship,
            scholarshipName: scholarshipName,
            academicYear:   academicYear,
            duplicateKey:   duplicateKey,
            createdAt:      serverTimestamp()
          });
        } catch (_) {}
        submitButton.disabled = false;
        submitButton.innerHTML = "Submit Application";
        setDraftStatus("Duplicate detected");
        return;
      }

      const applicationDoc = await addDoc(collection(db, "applications"), {
          userId:          user.uid,
          authEmail:       user.email || "",
          submittedByUid:  user.uid,
          createdFrom:     "student-portal",
          scholarshipId:   selectedScholarship || "",
          scholarshipName: scholarshipName,
          scholarshipType: scholarshipType,
          status:          "submitted",
          type:            "new",
          refNumber:       ref,
          submittedAt:     serverTimestamp(),
          applicantName:   (getValue("fName") || "").trim(),
          studentId:       getValue("fStudentId"),
          email:           getValue("fEmail"),
          mobile:          getValue("fMobile"),
          course:          getValue("fCourse"),
          yearLevel:       getValue("fYear"),
          gwa:             getValue("fGwa"),
          income:          getValue("fIncome"),
          academicYear:    academicYear,
          duplicateKey:    duplicateKey,
          isDuplicate:     false
        });

      const applicantName = (getValue("fName") || "").trim() || "A student";
      const uploadedDocIds = documents
          .map(function (item) { return item.firestoreDocId; })
          .filter(Boolean);

      await updateDoc(applicationDoc, {
          documentIds: uploadedDocIds
        });

      await Promise.all(uploadedDocIds.map(function (documentId) {
          return updateDoc(firestoreDoc(db, "documents", documentId), {
            applicationId: applicationDoc.id,
            applicationRef: ref,
            linkedTo: scholarshipName,
            updatedAt: serverTimestamp()
          });
        }));

      await addDoc(collection(db, "notifications"), {
          recipientRole: "admin",
          title: "New application submitted",
          message: applicantName + " submitted an application for " + scholarshipName + ".",
          type: "application",
          priority: "normal",
          link: "adminapplicationreview.html?id=" + applicationDoc.id,
          actionLabel: "Review application",
          applicationId: applicationDoc.id,
          createdAt: serverTimestamp(),
          readBy: {}
        });

      await addDoc(collection(db, "notifications"), {
          recipientUid: user.uid,
          userId: user.uid,
          title: "Application submitted",
          message: "Your application for " + scholarshipName + " was submitted successfully.",
          type: "application",
          priority: "normal",
          link: "myapplication.html",
          actionLabel: "Track status",
          applicationId: applicationDoc.id,
          read: false,
          createdAt: serverTimestamp(),
          readBy: {}
      });
      try {
        await addDoc(collection(db, "auditLogs"), {
          action:         "application_submitted",
          userId:         user.uid,
          applicationId:  applicationDoc.id,
          scholarshipId:  selectedScholarship,
          scholarshipName: scholarshipName,
          academicYear:   academicYear,
          createdAt:      serverTimestamp()
        });
      } catch (_) {}
    } catch (e) {
      console.warn("Firestore submit error:", e);
      submitButton.disabled = false;
      submitButton.innerHTML = "Submit Application";
      setDraftStatus("Submit failed");
      showToast("Application submit failed. Please try again.");
      return;
    }

    document.querySelectorAll(".step-panel").forEach(p => p.classList.remove("active"));
    const stepBar      = getEl("stepBar");
    const successScreen = getEl("successScreen");
    const successRef   = getEl("successRef");
    if (stepBar)       stepBar.style.display = "none";
    if (successRef)    successRef.textContent = ref;
    if (successScreen) successScreen.classList.add("show");
    setDraftStatus("Application submitted");
    showToast("Application submitted successfully.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function generateReference() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const randomNumber = Math.floor(Math.random() * 900 + 100);

    return "SC-" + year + "-" + month + day + "-" + randomNumber;
  }

  function initFormDraftStatus() {
    document.querySelectorAll("input, select, textarea").forEach(function (field) {
      field.addEventListener("input", function () {
        field.classList.remove("error");
        setDraftStatus("Saving draft...");

        clearTimeout(initFormDraftStatus.timer);

        initFormDraftStatus.timer = setTimeout(function () {
          setDraftStatus("Draft saved");
        }, 650);
      });

      field.addEventListener("change", function () {
        field.classList.remove("error");
        setDraftStatus("Draft saved");
      });
    });
  }

  function setDraftStatus(message) {
    const draftStatus = getEl("draftStatus");

    if (!draftStatus) return;

    draftStatus.textContent = message;
  }

  function setText(id, value) {
    const element = getEl(id);

    if (element) {
      element.textContent = value || "—";
    }
  }

  function getValue(id) {
    const element = getEl(id);

    return element ? element.value.trim() : "";
  }

  function initDuplicateModal() {
    const closeBtn = getEl("dupModalClose");
    const overlay  = getEl("dupModal");
    if (closeBtn) closeBtn.addEventListener("click", function () {
      if (overlay) { overlay.classList.remove("show"); overlay.setAttribute("aria-hidden", "true"); }
    });
    if (overlay) overlay.addEventListener("click", function (e) {
      if (e.target === overlay) { overlay.classList.remove("show"); overlay.setAttribute("aria-hidden", "true"); }
    });
  }

  function showDuplicateModal(scholarshipName, academicYear) {
    const msgEl  = getEl("dupModalMsg");
    const overlay = getEl("dupModal");
    if (msgEl) msgEl.textContent = "You already have an active application for " + scholarshipName + " (AY " + academicYear + "). Please check My Applications.";
    if (overlay) { overlay.classList.add("show"); overlay.setAttribute("aria-hidden", "false"); }
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

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
      return Math.round(bytes / 1024) + " KB";
    }

    return (bytes / 1024 / 1024).toFixed(1) + " MB";
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


