/* =========================================================
   ScholarsConnect My Documents Script
   File: ESTECH/Javascript/mydocuments.js
========================================================= */
import { auth, db, storage, collection, onSnapshot, query, where, addDoc, getDocs, updateDoc, doc as firestoreDoc, serverTimestamp, ref, uploadBytesResumable, getDownloadURL, onAuthStateChanged } from "./firebase.js";
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";

(function () {
  "use strict";

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const INLINE_PREVIEW_FILE_LIMIT = 640 * 1024;

  let selectedFile = null;
  let activeFilter = "all";
  let searchQuery = "";
  let activePreviewDocument = null;

  let DOCUMENTS = [];

  let unsubDocs = null;
  let snapGeneration = 0;

  document.addEventListener("DOMContentLoaded", async function () {
    initStudentLogout();
    initMobileSidebar();
    initTopButtons();
    initSearch();
    initFilters();
    initUploadModal();
    initPreviewModal();
    loadStudentProfile();
    subscribeDocuments();
    window.addEventListener("beforeunload", function () {
      if (unsubDocs) unsubDocs();
    });
  });

  function subscribeDocuments() {
    onAuthStateChanged(auth, function (user) {
      if (!user) { renderDocuments(DOCUMENTS); renderSummary(); updateCounts(DOCUMENTS.length); return; }
      const uid = user.uid;
    if (unsubDocs) unsubDocs();

    unsubDocs = onSnapshot(
      query(collection(db, "documents"), where("userId", "==", uid)),
      function (snap) {
        const myGen = ++snapGeneration;
        const loaded = [];
        snap.docs.forEach(function (d) {
          const doc = d.data();
          const uploadedDate = doc.uploadedAt
            ? (doc.uploadedAt.toDate ? doc.uploadedAt.toDate() : new Date(doc.uploadedAt))
            : null;
          loaded.push({
            id: d.id,
            name: doc.name || "Document",
            type: doc.fileType || "PDF",
            category: doc.category || "Document",
            filename: doc.filename || doc.name || "file",
            size: doc.size || "—",
            uploaded: uploadedDate ? uploadedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—",
            uploadedMillis: uploadedDate ? uploadedDate.getTime() : 0,
            status: doc.status || "pending",
            statusLabel: { verified: "Verified", pending: "Pending Review", rejected: "Needs Re-upload" }[doc.status] || "Pending Review",
            statusIcon: { verified: "bi-check-circle-fill", pending: "bi-hourglass-split", rejected: "bi-exclamation-circle-fill" }[doc.status] || "bi-hourglass-split",
            icon: doc.fileType === "Image" ? "bi-person-square" : "bi-file-earmark-pdf",
            linkedTo: doc.linkedTo || "—",
            note: doc.note || "",
            required: doc.required || false,
            downloadURL: doc.downloadURL || null,
            storagePath: doc.storagePath || null
          });
        });

        if (loaded.length === 0) {
          /* Top-level collection empty — check legacy subcollection */
          getDocs(collection(db, "users", uid, "documents")).then(function (legacySnap) {
            /* If a newer snapshot already populated data, don't overwrite it */
            if (myGen !== snapGeneration) return;
            const legacyLoaded = [];
            legacySnap.docs.forEach(function (d) {
              const data = d.data();
              const uploadedDate = data.uploadedAt
                ? (data.uploadedAt.toDate ? data.uploadedAt.toDate() : new Date(data.uploadedAt))
                : null;
              const isImg = (data.fileType || "").startsWith("image/");
              legacyLoaded.push({
                id: d.id,
                name: data.docName || ("Document " + d.id),
                type: isImg ? "Image" : "PDF",
                category: "Registration Document",
                filename: data.fileName || data.docName || "file",
                size: data.fileSize ? (data.fileSize < 1048576 ? Math.round(data.fileSize / 1024) + " KB" : (data.fileSize / 1048576).toFixed(1) + " MB") : "—",
                uploaded: uploadedDate ? uploadedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—",
                uploadedMillis: uploadedDate ? uploadedDate.getTime() : 0,
                status: "pending",
                statusLabel: "Pending Review",
                statusIcon: "bi-hourglass-split",
                icon: isImg ? "bi-person-square" : "bi-file-earmark-pdf",
                linkedTo: "Registration",
                note: "",
                required: false,
                downloadURL: data.base64 || null,
                storagePath: null
              });
            });
            DOCUMENTS = dedupeLatestDocuments(legacyLoaded);
            renderDocuments(DOCUMENTS);
            renderSummary();
            updateCounts(DOCUMENTS.length);
          }).catch(function () {
            if (myGen !== snapGeneration) return;
            DOCUMENTS = [];
            renderDocuments(DOCUMENTS);
            renderSummary();
            updateCounts(0);
          });
          return;
        }

        DOCUMENTS = dedupeLatestDocuments(loaded);
        renderDocuments(DOCUMENTS);
        renderSummary();
        updateCounts(DOCUMENTS.length);
      },
      function (e) {
        console.warn("Documents subscription error:", e);
        renderDocuments(DOCUMENTS);
        renderSummary();
        updateCounts(DOCUMENTS.length);
      }
    );
  });
  }

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

  function dedupeLatestDocuments(items) {
    const latestByName = new Map();
    items
      .slice()
      .sort(function (a, b) { return (b.uploadedMillis || 0) - (a.uploadedMillis || 0); })
      .forEach(function (item) {
        const key = normalizeDocumentKey(item.name);
        if (!latestByName.has(key)) latestByName.set(key, item);
      });

    return Array.from(latestByName.values())
      .sort(function (a, b) { return (b.uploadedMillis || 0) - (a.uploadedMillis || 0); });
  }

  async function saveOrReplaceDocumentRecord(uid, typeValue, payload) {
    /* Single-field query only — compound queries need a composite Firestore index.
       Filter by name in-memory instead. */
    const snap = await getDocs(query(
      collection(db, "documents"),
      where("userId", "==", uid)
    ));

    let target = null;
    snap.docs.forEach(function (d) {
      const data = d.data();
      if ((data.name || "") !== typeValue) return;
      const uploadedAt = data.uploadedAt
        ? (data.uploadedAt.toDate ? data.uploadedAt.toDate() : new Date(data.uploadedAt))
        : null;
      const uploadedMillis = uploadedAt ? uploadedAt.getTime() : 0;
      if (!target || uploadedMillis > target.uploadedMillis) {
        target = { id: d.id, uploadedMillis: uploadedMillis };
      }
    });

    const record = Object.assign({}, payload, {
      replacedAt: serverTimestamp(),
      uploadedAt: serverTimestamp(),
      status: "pending"
    });

    if (target) {
      await updateDoc(firestoreDoc(db, "documents", target.id), record);
      return { id: target.id, replaced: true };
    }

    const created = await addDoc(collection(db, "documents"), Object.assign({}, payload, {
      uploadedAt: serverTimestamp()
    }));
    return { id: created.id, replaced: false };
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
    const searchInput = getEl("documentSearch");
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
        const searchInput = getEl("documentSearch");
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
    const filtered = DOCUMENTS.filter(function (doc) {
      const matchesFilter = activeFilter === "all" || doc.status === activeFilter;

      const searchableText = [
        doc.name,
        doc.category,
        doc.filename,
        doc.statusLabel,
        doc.linkedTo
      ].join(" ").toLowerCase();

      const matchesSearch = !searchQuery || searchableText.includes(searchQuery);

      return matchesFilter && matchesSearch;
    });

    renderDocuments(filtered);
    updateCounts(filtered.length);
  }

  function renderDocuments(items) {
    const grid = getEl("documentGrid");

    if (!grid) return;

    grid.innerHTML = items.map(createDocumentCard).join("");

    document.querySelectorAll("[data-preview]").forEach(function (button) {
      button.addEventListener("click", function () {
        openPreviewModal(button.dataset.preview);
      });
    });

    document.querySelectorAll("[data-download]").forEach(function (button) {
      button.addEventListener("click", function () {
        const doc = findDocument(button.dataset.download);
        if (!doc) return;
        if (doc.downloadURL) {
          const a = document.createElement("a");
          a.href = doc.downloadURL;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          showToast("Download not yet available for this document.");
        }
      });
    });

    document.querySelectorAll("[data-reupload]").forEach(function (button) {
      button.addEventListener("click", function () {
        const doc = findDocument(button.dataset.reupload);

        if (doc) {
          openUploadModal(doc.name);
        }
      });
    });
  }

  function createDocumentCard(doc) {
    const iconClass = doc.type === "Image" ? "image" : "";
    const verifiedIconClass = doc.status === "verified" ? "verified" : "";
    const noteClass = doc.status === "rejected" ? "rejected" : "";
    const primaryAction = doc.status === "rejected"
      ? `
        <button class="card-btn primary" type="button" data-reupload="${doc.id}">
          <i class="bi bi-arrow-repeat"></i>
          Re-upload
        </button>
      `
      : `
        <button class="card-btn" type="button" data-download="${doc.id}">
          <i class="bi bi-download"></i>
          Download
        </button>
      `;

    return `
      <article class="document-card">
        <div class="document-card-top">
          <div class="document-icon ${iconClass} ${verifiedIconClass}">
            <i class="bi ${doc.icon}"></i>
          </div>

          <span class="document-status ${doc.status}">
            <i class="bi ${doc.statusIcon}"></i>
            ${escapeHtml(doc.statusLabel)}
          </span>
        </div>

        <h2 class="document-name">${escapeHtml(doc.name)}</h2>

        <p class="document-meta">
          ${escapeHtml(doc.filename)}<br>
          ${escapeHtml(doc.size)} \u25C6 Uploaded ${escapeHtml(doc.uploaded)}
        </p>

        <div class="document-linked">
          <span>Linked To</span>
          <strong>${escapeHtml(doc.linkedTo)}</strong>
        </div>

        <div class="document-note ${noteClass}">
          ${escapeHtml(doc.note)}
        </div>

        <div class="document-actions">
          <button class="card-btn" type="button" data-preview="${doc.id}">
            <i class="bi bi-eye"></i>
            Preview
          </button>

          ${primaryAction}

          <button class="card-btn" type="button" data-reupload="${doc.id}">
            <i class="bi bi-arrow-repeat"></i>
            Replace
          </button>
        </div>
      </article>
    `;
  }

  function renderSummary() {
    const total = DOCUMENTS.length;
    const verified = DOCUMENTS.filter(doc => doc.status === "verified").length;
    const pending = DOCUMENTS.filter(doc => doc.status === "pending").length;
    const rejected = DOCUMENTS.filter(doc => doc.status === "rejected").length;
    const required = DOCUMENTS.filter(doc => doc.required);
    const requiredReady = required.filter(doc => doc.status === "verified").length;
    const readyPercentage = Math.round((verified / total) * 100);

    setText("totalDocuments", total);
    setText("verifiedDocuments", verified);
    setText("pendingDocuments", pending);
    setText("rejectedDocuments", rejected);

    setText("countAll", total);
    setText("countVerified", verified);
    setText("countPending", pending);
    setText("countRejected", rejected);

    setText("requiredReadyCount", requiredReady + " of " + required.length + " ready");
    setText(
      "requiredReadyNote",
      requiredReady === required.length
        ? "All core requirements are verified."
        : "Some requirements still need attention."
    );

    setText("vaultHeadline", verified + " documents verified");

    const fill = getEl("vaultProgressFill");

    if (fill) {
      fill.style.width = readyPercentage + "%";
    }
  }

  function updateCounts(visible) {
    const visibleCount = getEl("visibleCount");
    const totalCount = getEl("totalCount");
    const emptyState = getEl("emptyState");

    if (visibleCount) visibleCount.textContent = visible;
    if (totalCount) totalCount.textContent = DOCUMENTS.length;

    if (emptyState) {
      emptyState.style.display = visible === 0 ? "block" : "none";
    }
  }

  function initUploadModal() {
    const openUploadBtn = getEl("openUploadBtn");
    const overlay = getEl("uploadModalOverlay");
    const closeBtn = getEl("uploadModalClose");
    const cancelBtn = getEl("cancelUploadBtn");
    const dropZone = getEl("dropZone");
    const fileInput = getEl("fileInput");
    const removeFileBtn = getEl("removeFileBtn");
    const documentType = getEl("documentType");
    const submitBtn = getEl("submitUploadBtn");

    if (openUploadBtn) {
      openUploadBtn.addEventListener("click", function () {
        openUploadModal();
      });
    }

    if (overlay) {
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeUploadModal();
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener("click", closeUploadModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeUploadModal);

    if (dropZone && fileInput) {
      dropZone.addEventListener("click", function () {
        fileInput.click();
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
          handleSelectedFile(file);
        }
      });

      fileInput.addEventListener("change", function () {
        const file = fileInput.files[0];

        if (file) {
          handleSelectedFile(file);
        }
      });
    }

    if (removeFileBtn) {
      removeFileBtn.addEventListener("click", removeSelectedFile);
    }

    if (documentType) {
      documentType.addEventListener("change", updateUploadButtonState);
    }

    if (submitBtn) {
      submitBtn.addEventListener("click", submitUpload);
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeUploadModal();
        closePreviewModal();
      }
    });
  }

  function openUploadModal(prefilledType) {
    resetUploadModal();

    const documentType = getEl("documentType");
    const overlay = getEl("uploadModalOverlay");

    if (prefilledType && documentType) {
      const matchingOption = Array.from(documentType.options).find(function (option) {
        return option.value === prefilledType;
      });

      if (matchingOption) {
        documentType.value = prefilledType;
      }
    }

    updateUploadButtonState();

    if (overlay) {
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
    }
  }

  function closeUploadModal() {
    const overlay = getEl("uploadModalOverlay");

    if (!overlay) return;

    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    resetUploadModal();
  }

  function resetUploadModal() {
    selectedFile = null;

    const documentType = getEl("documentType");
    const fileInput = getEl("fileInput");
    const filePreview = getEl("filePreview");
    const uploadProgress = getEl("uploadProgress");
    const progressFill = getEl("uploadProgressFill");
    const uploadPercent = getEl("uploadPercent");
    const submitBtn = getEl("submitUploadBtn");

    if (documentType) documentType.value = "";
    if (fileInput) fileInput.value = "";
    if (filePreview) filePreview.classList.remove("show");
    if (uploadProgress) uploadProgress.classList.remove("show");
    if (progressFill) progressFill.style.width = "0%";
    if (uploadPercent) uploadPercent.textContent = "0%";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <i class="bi bi-upload"></i>
        <span>Upload Document</span>
      `;
    }
  }

  function handleSelectedFile(file) {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.type)) {
      showToast("Invalid file type. Please upload PDF, JPG, JPEG, or PNG only.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showToast("File is too large. Maximum size is 5 MB.");
      return;
    }

    selectedFile = file;

    const preview = getEl("filePreview");
    const previewIcon = getEl("filePreviewIcon");
    const previewName = getEl("filePreviewName");
    const previewSize = getEl("filePreviewSize");
    const previewIconBox = document.querySelector(".file-preview-icon");

    if (previewName) previewName.textContent = file.name;
    if (previewSize) previewSize.textContent = formatFileSize(file.size);

    if (previewIcon) {
      previewIcon.className =
        file.type === "application/pdf"
          ? "bi bi-file-earmark-pdf"
          : "bi bi-image";
    }

    if (previewIconBox) {
      previewIconBox.classList.toggle("image", file.type !== "application/pdf");
    }

    if (preview) {
      preview.classList.add("show");
    }

    updateUploadButtonState();
  }

  function removeSelectedFile() {
    selectedFile = null;

    const fileInput = getEl("fileInput");
    const preview = getEl("filePreview");

    if (fileInput) fileInput.value = "";
    if (preview) preview.classList.remove("show");

    updateUploadButtonState();
  }

  function updateUploadButtonState() {
    const documentType = getEl("documentType");
    const submitBtn = getEl("submitUploadBtn");

    if (!documentType || !submitBtn) return;

    submitBtn.disabled = !(documentType.value && selectedFile);
  }

  async function submitUpload() {
    const documentType = getEl("documentType");
    const submitBtn = getEl("submitUploadBtn");
    const uploadProgress = getEl("uploadProgress");
    const progressFill = getEl("uploadProgressFill");
    const uploadPercent = getEl("uploadPercent");

    if (!documentType || !submitBtn || !selectedFile) return;

    const user = await waitForAuthUser();
    if (!user) {
      showToast("Firebase login is still loading. Please refresh and sign in again.");
      return;
    }

    const uid = user.uid;

    const typeValue = documentType.value;
    const isImage = selectedFile.type !== "application/pdf";

    if (selectedFile.size <= INLINE_PREVIEW_FILE_LIMIT) {
      submitInlinePreviewUpload({
        file: selectedFile,
        uid: uid,
        typeValue: typeValue,
        isImage: isImage,
        submitBtn: submitBtn,
        uploadProgress: uploadProgress,
        progressFill: progressFill,
        uploadPercent: uploadPercent
      });
      return;
    }

    const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = "documents/" + uid + "/" + Date.now() + "_" + safeName;

    submitBtn.disabled = true;
    submitBtn.innerHTML = "<span class=\"mini-spinner\"></span><span>Uploading...</span>";
    if (uploadProgress) uploadProgress.classList.add("show");

    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, selectedFile);
    const uploadTimeout = setTimeout(function () {
      try { uploadTask.cancel(); } catch (e) {}
      resetUploadButtonAfterError(submitBtn, uploadProgress);
      showToast("Upload is taking too long. Check Firebase Storage rules or your connection.");
    }, 30000);

    uploadTask.on(
      "state_changed",
      function (snapshot) {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (progressFill) progressFill.style.width = pct + "%";
        if (uploadPercent) uploadPercent.textContent = pct + "%";
      },
      function (error) {
        clearTimeout(uploadTimeout);
        console.error("Upload error:", error);
        showToast(getUploadErrorMessage(error));
        resetUploadButtonAfterError(submitBtn, uploadProgress);
      },
      function () {
        clearTimeout(uploadTimeout);
        getDownloadURL(uploadTask.snapshot.ref)
          .then(function (downloadURL) {
            return saveOrReplaceDocumentRecord(uid, typeValue, {
              userId: uid,
              name: typeValue,
              filename: selectedFile.name,
              fileType: isImage ? "Image" : "PDF",
              size: formatFileSize(selectedFile.size),
              downloadURL: downloadURL,
              storagePath: storagePath,
              status: "pending",
              category: "Uploaded Document",
              required: false
            });
          })
          .then(function (result) {
            closeUploadModal();
            showToast(typeValue + (result.replaced ? " replaced successfully. Pending review." : " uploaded successfully. Pending review."));
          })
          .catch(function (error) {
            console.error("Firestore save error:", error);
            showToast("File uploaded but record could not be saved. Contact support.");
            closeUploadModal();
          });
      }
    );
  }

  function waitForAuthUser() {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);

    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        unsubscribe();
        resolve(null);
      }, 6000);

      var unsubscribe = onAuthStateChanged(auth, function (user) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(user || null);
      });
    });
  }

  function submitInlinePreviewUpload(options) {
    const file = options.file;
    const submitBtn = options.submitBtn;
    const uploadProgress = options.uploadProgress;
    const progressFill = options.progressFill;
    const uploadPercent = options.uploadPercent;

    submitBtn.disabled = true;
    submitBtn.innerHTML = "<span class=\"mini-spinner\"></span><span>Saving...</span>";
    if (uploadProgress) uploadProgress.classList.add("show");
    if (progressFill) progressFill.style.width = "35%";
    if (uploadPercent) uploadPercent.textContent = "35%";

    const reader = new FileReader();

    reader.onload = function () {
      if (progressFill) progressFill.style.width = "80%";
      if (uploadPercent) uploadPercent.textContent = "80%";

      saveOrReplaceDocumentRecord(options.uid, options.typeValue, {
        userId: options.uid,
        name: options.typeValue,
        filename: file.name,
        fileType: options.isImage ? "Image" : "PDF",
        size: formatFileSize(file.size),
        downloadURL: reader.result,
        storagePath: "inline-preview://" + file.name,
        storageMode: "firestore-inline-preview",
        status: "pending",
        category: "Uploaded Document",
        required: false
      })
        .then(function (result) {
          if (progressFill) progressFill.style.width = "100%";
          if (uploadPercent) uploadPercent.textContent = "100%";
          setTimeout(function () {
            closeUploadModal();
            showToast(options.typeValue + (result.replaced ? " replaced for preview review." : " saved for preview review."));
          }, 250);
        })
        .catch(function (error) {
          console.error("Inline preview document save error:", error);
          showToast("Could not save preview file. Try a smaller file or deploy Firebase Storage.");
          resetUploadButtonAfterError(submitBtn, uploadProgress);
        });
    };

    reader.onerror = function () {
      showToast("Could not read this file. Please choose another file.");
      resetUploadButtonAfterError(submitBtn, uploadProgress);
    };

    reader.readAsDataURL(file);
  }

  function resetUploadButtonAfterError(submitBtn, uploadProgress) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "<i class=\"bi bi-upload\"></i><span>Upload Document</span>";
    }
    if (uploadProgress) uploadProgress.classList.remove("show");
  }

  function getUploadErrorMessage(error) {
    const code = error && error.code ? error.code : "";
    if (code === "storage/unauthorized") {
      return "Upload blocked by Firebase Storage rules. Deploy storage.rules and make sure you are logged in.";
    }
    if (code === "storage/canceled") {
      return "Upload canceled because it took too long.";
    }
    if (code === "storage/retry-limit-exceeded") {
      return "Upload timed out. Please check your connection and Firebase Storage setup.";
    }
    if (code === "storage/quota-exceeded") {
      return "Firebase Storage quota was exceeded.";
    }
    return "Upload failed. Please try again.";
  }

  function initPreviewModal() {
    const overlay = getEl("previewModalOverlay");
    const close = getEl("previewModalClose");
    const closeBtn = getEl("previewCloseBtn");
    const downloadBtn = getEl("previewDownloadBtn");

    if (overlay) {
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closePreviewModal();
        }
      });
    }

    if (close) close.addEventListener("click", closePreviewModal);
    if (closeBtn) closeBtn.addEventListener("click", closePreviewModal);

    if (downloadBtn) {
      downloadBtn.addEventListener("click", function () {
        if (!activePreviewDocument) return;
        if (activePreviewDocument.downloadURL) {
          const a = document.createElement("a");
          a.href = activePreviewDocument.downloadURL;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          showToast("Download not yet available for this document.");
        }
      });
    }
  }

  function openPreviewModal(id) {
    const doc = findDocument(id);

    if (!doc) return;

    activePreviewDocument = doc;

    setText("previewType", doc.type);
    setText("previewModalTitle", doc.name);
    setText("previewMeta", doc.filename + " \u25C6 " + doc.size + " \u25C6 Uploaded " + doc.uploaded);

    const status = getEl("previewStatus");

    if (status) {
      status.className = "modal-status " + doc.status;
      status.innerHTML = `
        <i class="bi ${doc.statusIcon}"></i>
        <span>${escapeHtml(doc.statusLabel)}</span>
      `;
    }

    const previewBox = getEl("previewBox");

    if (previewBox) {
      if (doc.downloadURL && doc.type === "Image") {
        previewBox.innerHTML = `<img src="${escapeHtml(doc.downloadURL)}" alt="${escapeHtml(doc.filename)}" style="max-width:100%;max-height:420px;border-radius:8px;object-fit:contain;">`;
      } else if (doc.downloadURL) {
        previewBox.innerHTML = `
          <i class="bi ${doc.icon}"></i>
          <strong>${escapeHtml(doc.filename)}</strong>
          <a href="${escapeHtml(doc.downloadURL)}" target="_blank" rel="noopener noreferrer" style="margin-top:8px;font-size:.85rem;">Open in new tab</a>
        `;
      } else {
        previewBox.innerHTML = `
          <i class="bi ${doc.icon}"></i>
          <strong>${escapeHtml(doc.filename)}</strong>
          <span>Preview not available.</span>
        `;
      }
    }

    const overlay = getEl("previewModalOverlay");

    if (overlay) {
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
    }
  }

  function closePreviewModal() {
    const overlay = getEl("previewModalOverlay");

    if (!overlay) return;

    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    activePreviewDocument = null;
  }

  function findDocument(id) {
    return DOCUMENTS.find(function (doc) {
      return doc.id === id;
    });
  }

  function setText(id, value) {
    const element = getEl(id);

    if (element) {
      element.textContent = value;
    }
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
      return Math.round(bytes / 1024) + " KB";
    }

    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function formatDate(date) {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    return months[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
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


