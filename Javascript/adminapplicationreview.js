/* =========================================================
   ScholarsConnect Admin Application Review
   File: ESTECH/Javascript/adminapplicationreview.js
========================================================= */
import { auth, db, doc, getDoc, getDocs, onSnapshot, updateDoc, addDoc, collection, query, where, serverTimestamp, onAuthStateChanged } from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

(function () {
  "use strict";

  let pendingDecision = null;
  let currentAppId    = null;
  let reviewerUid     = null;
  let unsubApp        = null;
  let unsubDocs       = null;
  let currentApplicantUid = null;
  let currentApplicationDocumentIds = new Set();
  let currentScholarshipName = "";
  let uploadedDocuments = [];
  let currentIsDuplicate = false;

  document.addEventListener("DOMContentLoaded", async function () {
    initAdminLogout();
    initAdminMobileSidebar();
    loadAdminProfile();
    initAdminNotificationPopover();
    initDocumentActions();
    initDecisionActions();
    initModal();
    initPlaceholderLinks();
    updateDocumentProgress();

    const params = new URLSearchParams(window.location.search);
    currentAppId = params.get("id");

    onAuthStateChanged(auth, user => { if (user) reviewerUid = user.uid; });

    if (currentAppId) loadApplicationData(currentAppId);

    window.addEventListener("beforeunload", function () {
      if (unsubApp) unsubApp();
      if (unsubDocs) unsubDocs();
    });
  });

  /* ─────────────────────────────────────────────────────
     LOAD APPLICATION DATA FROM FIRESTORE (real-time)
  ───────────────────────────────────────────────────── */
  function loadApplicationData(appId) {
    if (unsubApp) unsubApp();

    unsubApp = onSnapshot(doc(db, "applications", appId), async function (snap) {
      if (!snap.exists()) { showToast("Application not found."); return; }
      const app = snap.data();
      currentScholarshipName = app.scholarshipName || "";
      currentApplicationDocumentIds = new Set(Array.isArray(app.documentIds) ? app.documentIds.filter(Boolean) : []);

      const refNo = app.refNumber || appId.slice(0, 12).toUpperCase();
      setText("#sideRefNum",       refNo);
      setText("#reviewStatusText", fmtStatus(app.status));

      currentIsDuplicate = app.isDuplicate === true;
      const dupBanner = qs("#duplicateWarningBanner");
      const dupMsg    = qs("#duplicateWarningMsg");
      if (dupBanner) dupBanner.style.display = currentIsDuplicate ? "" : "none";
      if (dupMsg && currentIsDuplicate && app.academicYear) {
        dupMsg.textContent = "This student already has another active application for " + (app.scholarshipName || "this scholarship") + " (AY " + app.academicYear + "). Review before approving.";
      }
      updateDocumentProgress();

      const title = document.querySelector(".admin-page-title");
      if (title && app.applicantName) title.textContent = "Review: " + app.applicantName;
      const sub = document.querySelector(".admin-page-sub");
      if (sub && app.scholarshipName) sub.textContent = app.scholarshipName + " · " + refNo;

      // Applicant profile card
      const fullName = app.applicantName || "—";
      const initials = fullName.split(" ").filter(Boolean).map(function(w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
      setText("#reviewApplicantAvatar",    initials);
      setText("#reviewApplicantName",      fullName);
      setText("#reviewApplicantCourseLine", (app.course || "—") + (app.yearLevel ? " · " + app.yearLevel : ""));
      setText("#reviewStudentIdTag",       "Student ID: " + (app.studentId || "—"));
      setText("#reviewGwaTag",             "GWA: " + (app.gwa || "—"));
      setText("#reviewGwa",                app.gwa || "—");
      setText("#reviewYearLevel",          app.yearLevel || "—");

      // Scholarship Applied card
      setText("#reviewScholarshipName", app.scholarshipName || "—");
      setText("#reviewScholarshipSub",  app.scholarshipType ? app.scholarshipType + " Scholarship" : "—");

      if (app.userId) {
        const isNewUser = app.userId !== currentApplicantUid;
        currentApplicantUid = app.userId;

        if (isNewUser) {
          subscribeApplicantDocuments(app.userId);
        } else {
          renderUploadedDocuments();
        }

        // Always fetch user profile so contact/enrollment details are never stale
        try {
          const userSnap = await getDoc(doc(db, "users", app.userId));
          if (userSnap.exists()) {
            const u = userSnap.data();
            setText("#reviewEmail",            u.email || "—");
            setText("#reviewMobile",           u.mobile || u.phone || u.mobileNumber || "—");
            setText("#reviewCollege",          u.college || u.department || "—");
            setText("#reviewCityTag",          u.city || u.address || "—");
            setText("#reviewEnrollmentStatus", u.enrollmentStatus || "Currently Enrolled");
            const avatarEl = qs("#reviewApplicantAvatar");
            if (avatarEl && u.photoBase64) {
              avatarEl.innerHTML = '<img src="' + u.photoBase64 + '" alt="' + fullName.replace(/"/g, "&quot;") + '" class="applicant-avatar-img"/>';
            }
          }
        } catch (e) {
          console.warn("Could not fetch user profile:", e);
        }
      } else {
        renderUploadedDocuments();
      }

    }, function (e) {
      console.error("Load application error:", e);
      showToast("Error loading application data.");
    });
  }

  function fmtStatus(s) {
    return { submitted: "Submitted", under_review: "Under Review", approved: "Approved", rejected: "Rejected" }[s] || (s || "Submitted");
  }

  function fmtDate(d) {
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  }

  /* ─────────────────────────────────────────────────────
     DOCUMENT REVIEW
  ───────────────────────────────────────────────────── */
  function qs(s, p)  { return (p || document).querySelector(s); }
  function qsa(s, p) { return Array.from((p || document).querySelectorAll(s)); }

  function normalizeDocumentKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, "/");
  }

  function chooseReviewDocuments(items) {
    const sorted = items.slice().sort(function (a, b) {
      return (b.uploadedMillis || 0) - (a.uploadedMillis || 0);
    });

    const applicationDocs = currentApplicationDocumentIds.size
      ? sorted.filter(function (item) { return currentApplicationDocumentIds.has(item.id); })
      : [];
    const source = applicationDocs.length ? applicationDocs : sorted;
    const latestByType = new Map();

    source.forEach(function (item) {
      const key = item.documentKey || normalizeDocumentKey(item.name);
      if (!latestByType.has(key)) latestByType.set(key, item);
    });

    return Array.from(latestByType.values()).sort(function (a, b) {
      return (b.uploadedMillis || 0) - (a.uploadedMillis || 0);
    });
  }

  function initDocumentActions() {
    qsa("[data-view-doc]").forEach(btn => {
      btn.addEventListener("click", () => openDocumentPreview(btn.dataset.viewDoc));
    });
    qsa("[data-verify-doc]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const item = btn.closest("[data-document]");
        if (item) await saveDocumentStatus(item, "verified");
      });
    });
    qsa("[data-reject-doc]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const item = btn.closest("[data-document]");
        if (item) await saveDocumentStatus(item, "rejected");
      });
    });
  }

  function subscribeApplicantDocuments(uid) {
    if (unsubDocs) unsubDocs();

    const list = qs(".document-list");
    if (list) list.innerHTML = '<div class="document-empty">Loading uploaded documents...</div>';

    unsubDocs = onSnapshot(
      query(collection(db, "documents"), where("userId", "==", uid)),
      function (snap) {
        if (!snap.empty) {
          const docs = snap.docs
            .map(function (d) { return normalizeUploadedDocument(d.id, d.data(), false); })
            .sort(function (a, b) { return b.uploadedMillis - a.uploadedMillis; });
          uploadedDocuments = chooseReviewDocuments(docs);
          renderUploadedDocuments();
          return;
        }

        /* Top-level empty — fall back to legacy users/{uid}/documents subcollection */
        getDocs(collection(db, "users", uid, "documents")).then(function (legacySnap) {
          const docs = legacySnap.docs
            .map(function (d) { return normalizeUploadedDocument(d.id, d.data(), true); })
            .sort(function (a, b) { return b.uploadedMillis - a.uploadedMillis; });
          uploadedDocuments = chooseReviewDocuments(docs);
          renderUploadedDocuments();
        }).catch(function (err) {
          console.warn("Legacy document fetch failed:", err);
          uploadedDocuments = [];
          renderUploadedDocuments();
        });
      },
      function (error) {
        console.error("Document listener error:", error);
        showToast("Could not load uploaded documents. Check Firestore rules.");
      }
    );
  }

  function normalizeUploadedDocument(id, data, isLegacy) {
    const uploadedDate = data.uploadedAt
      ? (data.uploadedAt.toDate ? data.uploadedAt.toDate() : new Date(data.uploadedAt))
      : null;

    if (isLegacy) {
      /* Legacy: users/{uid}/documents subcollection format */
      const legacyIsImage = (data.fileType || "").startsWith("image/");
      const legacyName = data.docName || ("Document " + id);
      return {
        id: id,
        name: legacyName,
        documentKey: normalizeDocumentKey(legacyName),
        filename: data.fileName || legacyName,
        size: data.fileSize ? (data.fileSize < 1048576 ? Math.round(data.fileSize / 1024) + " KB" : (data.fileSize / 1048576).toFixed(1) + " MB") : "",
        status: "pending",
        uploadedAt: uploadedDate ? fmtDate(uploadedDate) : "Upload date unavailable",
        uploadedMillis: uploadedDate ? uploadedDate.getTime() : 0,
        downloadURL: data.base64 || "",
        fileType: legacyIsImage ? "image" : "pdf",
        applicationId: "",
        scholarshipId: "",
        linkedTo: "Registration",
        category: "Registration Document"
      };
    }

    const type = String(data.fileType || "").toLowerCase();
    const isImage = type === "image" || /\.(png|jpe?g|webp)$/i.test(data.filename || "");

    return {
      id: id,
      name: data.name || "Uploaded Document",
      documentKey: data.documentKey || normalizeDocumentKey(data.name || "Uploaded Document"),
      filename: data.filename || data.name || "file",
      size: data.size || "",
      status: normalizeDocStatus(data.status),
      uploadedAt: uploadedDate ? fmtDate(uploadedDate) : "Upload date unavailable",
      uploadedMillis: uploadedDate ? uploadedDate.getTime() : 0,
      downloadURL: data.downloadURL || "",
      fileType: isImage ? "image" : "pdf",
      applicationId: data.applicationId || "",
      scholarshipId: data.scholarshipId || "",
      linkedTo: data.linkedTo || "",
      category: data.category || ""
    };
  }

  function normalizeDocStatus(status) {
    const clean = String(status || "pending").trim().toLowerCase();
    return clean === "verified" || clean === "rejected" ? clean : "pending";
  }

  function renderUploadedDocuments() {
    const list = qs(".document-list");
    if (!list) return;

    if (!uploadedDocuments.length) {
      list.innerHTML = '<div class="document-empty">No uploaded documents found for this applicant yet.</div>';
      updateDocumentProgress();
      return;
    }

    list.innerHTML = uploadedDocuments.map(buildDocumentRow).join("");
    initDocumentActions();
    updateDocumentProgress();
  }

  function buildDocumentRow(item) {
    const statusLabel = { verified: "Verified", pending: "Pending", rejected: "Rejected" }[item.status] || "Pending";
    const iconClass = item.fileType === "image"
      ? "bi-image-fill"
      : item.status === "verified"
        ? "bi-file-earmark-check-fill"
        : item.status === "rejected"
          ? "bi-file-earmark-x-fill"
          : "bi-file-earmark-text-fill";
    const meta = [item.filename, item.size, "Uploaded " + item.uploadedAt].filter(Boolean).join(" · ");

    return `
      <div class="document-item ${escAttr(item.status)}" data-document data-document-id="${escAttr(item.id)}">
        <div class="document-icon">
          <i class="bi ${escAttr(iconClass)}"></i>
        </div>

        <div class="document-info">
          <strong>${escHtml(item.name)}</strong>
          <span>${escHtml(meta)}</span>
        </div>

        <div class="document-status">
          <span class="doc-badge ${escAttr(item.status)}">${escHtml(statusLabel)}</span>
        </div>

        <div class="document-actions">
          <button type="button" class="doc-btn view" data-view-doc="${escAttr(item.id)}">View</button>
          <button type="button" class="doc-btn verify ${item.status === "verified" ? "active" : ""}" data-verify-doc>Verify</button>
          <button type="button" class="doc-btn reject ${item.status === "rejected" ? "active" : ""}" data-reject-doc>Reject</button>
        </div>
      </div>
    `;
  }

  async function saveDocumentStatus(item, status) {
    const documentId = item.dataset.documentId;
    if (!documentId) {
      setDocumentStatus(item, status);
      showToast(status === "verified" ? "Document marked as verified." : "Document rejected.");
      return;
    }

    try {
      await updateDoc(doc(db, "documents", documentId), {
        status: status,
        reviewedAt: serverTimestamp(),
        reviewedBy: reviewerUid || (auth.currentUser ? auth.currentUser.uid : null)
      });
      showToast(status === "verified" ? "Document verified and saved." : "Document rejected and saved.");
    } catch (error) {
      console.error("Document status save error:", error);
      showToast("Could not save document status. Check your connection.");
    }
  }

  function openDocumentPreview(documentId) {
    const file = uploadedDocuments.find(function (item) { return item.id === documentId; });
    if (!file || !file.downloadURL) {
      showToast("This uploaded document has no preview URL yet.");
      return;
    }

    const overlay = ensureDocumentPreviewModal();
    const title = qs("#documentPreviewTitle", overlay);
    const meta = qs("#documentPreviewMeta", overlay);
    const body = qs("#documentPreviewBody", overlay);
    const openLink = qs("#documentPreviewOpen", overlay);

    if (title) title.textContent = file.name;
    if (meta) meta.textContent = [file.filename, file.size, file.uploadedAt].filter(Boolean).join(" · ");
    if (openLink) openLink.href = file.downloadURL;

    if (body) {
      if (file.fileType === "image") {
        body.innerHTML = `<img src="${escAttr(file.downloadURL)}" alt="${escAttr(file.filename)}">`;
      } else {
        body.innerHTML = `<iframe src="${escAttr(file.downloadURL)}" title="${escAttr(file.filename)}"></iframe>`;
      }
    }

    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
  }

  function ensureDocumentPreviewModal() {
    let overlay = qs("#documentPreviewModal");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "modal-overlay document-preview-overlay";
    overlay.id = "documentPreviewModal";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="document-preview-card">
        <div class="document-preview-head">
          <div>
            <span>Uploaded Document</span>
            <h2 id="documentPreviewTitle">Document Preview</h2>
            <p id="documentPreviewMeta"></p>
          </div>
          <button class="modal-close" id="documentPreviewClose" type="button" aria-label="Close document preview">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="document-preview-body" id="documentPreviewBody"></div>
        <div class="document-preview-actions">
          <button class="modal-btn cancel" id="documentPreviewCancel" type="button">
            <i class="bi bi-x-lg"></i>
            <span>Close</span>
          </button>
          <a class="modal-btn confirm" id="documentPreviewOpen" href="#" target="_blank" rel="noopener noreferrer">
            <i class="bi bi-box-arrow-up-right"></i>
            <span>Open in new tab</span>
          </a>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closePreview = function () {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
    };
    qs("#documentPreviewClose", overlay).addEventListener("click", closePreview);
    qs("#documentPreviewCancel", overlay).addEventListener("click", closePreview);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closePreview();
    });

    return overlay;
  }

  function setDocumentStatus(item, status) {
    item.classList.remove("verified", "pending", "rejected");
    item.classList.add(status);
    const icon   = qs(".document-icon i", item);
    const badge  = qs(".doc-badge", item);
    const verBtn = qs("[data-verify-doc]", item);
    const rejBtn = qs("[data-reject-doc]", item);
    if (badge)  badge.className = "doc-badge " + status;
    if (verBtn) verBtn.classList.toggle("active", status === "verified");
    if (rejBtn) rejBtn.classList.toggle("active", status === "rejected");
    const icons  = { verified: "bi-file-earmark-check-fill", pending: "bi-file-earmark-text-fill", rejected: "bi-file-earmark-x-fill" };
    const labels = { verified: "Verified", pending: "Pending", rejected: "Rejected" };
    if (icon)  icon.className  = "bi " + (icons[status]  || icons.pending);
    if (badge) badge.textContent = labels[status] || "Pending";
    updateDocumentProgress();
  }

  function updateDocumentProgress() {
    const docs     = qsa("[data-document]");
    const verified = docs.filter(i => i.classList.contains("verified")).length;
    const total    = docs.length;
    const msg      = verified + " of " + total + " verified";
    setText("#docProgressText", msg);
    setText("#sideDocCount", verified + " / " + total + " Verified");
    const approveBtn = qs("#approveApplication");
    if (approveBtn) {
      const dupBlocked = currentIsDuplicate;
      approveBtn.disabled = total === 0 || verified !== total || dupBlocked;
      approveBtn.title    = dupBlocked          ? "Cannot approve — marked as duplicate"
                          : verified !== total  ? "Verify all documents before approval"
                          :                       "Approve application";
    }
  }

  /* ─────────────────────────────────────────────────────
     DECISION ACTIONS
  ───────────────────────────────────────────────────── */
  function initDecisionActions() {
    const approve   = qs("#approveApplication");
    const request   = qs("#requestReupload");
    const reject    = qs("#rejectApplication");
    const markDup   = qs("#markDuplicate");

    if (approve) approve.addEventListener("click", () => {
      if (approve.disabled) {
        showToast(currentIsDuplicate ? "Cannot approve — application is marked as duplicate." : "Verify all documents first.");
        return;
      }
      openDecisionModal("approve", "Approve Application", "This will approve the application and notify the student.");
    });
    if (request) request.addEventListener("click", () => openDecisionModal("request", "Request Re-upload", "This will notify the student to re-upload documents."));
    if (reject)  reject.addEventListener("click",  () => openDecisionModal("reject",  "Reject Application", "This will reject the application. Add a note before confirming."));
    if (markDup) markDup.addEventListener("click", () => openDecisionModal("duplicate", "Mark as Duplicate", "This will flag the application as a duplicate and cancel it. The student will be notified."));
  }

  function initModal() {
    const overlay = qs("#decisionModal");
    if (!overlay) return;
    if (qs("#modalClose"))   qs("#modalClose").addEventListener("click",   closeDecisionModal);
    if (qs("#modalCancel"))  qs("#modalCancel").addEventListener("click",  closeDecisionModal);
    if (qs("#modalConfirm")) qs("#modalConfirm").addEventListener("click", processDecision);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeDecisionModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeDecisionModal(); });
  }

  function openDecisionModal(type, title, message) {
    const overlay = qs("#decisionModal");
    if (!overlay) return;
    pendingDecision = type;
    setText("#modalTitle",   title);
    setText("#modalMessage", message);
    const icon = qs("#modalIcon");
    if (icon) {
      icon.className = "modal-icon" + (type === "approve" ? " approve" : type === "reject" ? " reject" : "");
      icon.innerHTML = type === "approve"   ? '<i class="bi bi-check-circle-fill"></i>'
                     : type === "reject"    ? '<i class="bi bi-x-circle-fill"></i>'
                     : type === "duplicate" ? '<i class="bi bi-copy"></i>'
                     :                       '<i class="bi bi-upload"></i>';
    }
    const confirm = qs("#modalConfirm");
    if (confirm) confirm.textContent = type === "approve" ? "Approve" : type === "reject" ? "Reject" : type === "duplicate" ? "Mark Duplicate" : "Request";
    const noteGroup = qs("#modalNoteGroup");
    const noteInput = qs("#modalRejectNote");
    if (noteGroup) noteGroup.style.display = (type === "reject" || type === "duplicate") ? "block" : "none";
    if (noteInput) noteInput.value = "";
    if (type === "duplicate" && noteInput) noteInput.placeholder = "Explain why this is a duplicate (optional)…";
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeDecisionModal() {
    const overlay = qs("#decisionModal");
    if (!overlay) return;
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    pendingDecision = null;
  }

  async function processDecision() {
    const modalNote    = qs("#modalRejectNote");
    const modalNoteVal = pendingDecision === "reject" && modalNote ? modalNote.value.trim() : "";
    const notes        = qs("#reviewNotes");

    if (pendingDecision === "reject" && modalNoteVal.length < 5) {
      showToast("Enter a rejection reason (at least 5 characters).");
      return;
    }

    if ((pendingDecision === "reject" || pendingDecision === "duplicate") && notes) notes.value = modalNoteVal;

    const statusMap    = { approve: "approved", request: "needs_reupload", reject: "rejected", duplicate: "cancelled" };
    const statusLabels = { approve: "Approved", request: "Needs Re-upload", reject: "Rejected", duplicate: "Cancelled (Duplicate)" };
    const newStatus    = statusMap[pendingDecision] || "submitted";

    setText("#reviewStatusText", statusLabels[pendingDecision] || "Updated");
    closeDecisionModal();

    if (!currentAppId) {
      showToast(pendingDecision === "approve" ? "Application approved." : pendingDecision === "reject" ? "Application rejected." : "Re-upload requested.");
      return;
    }

    const finalRemarks = pendingDecision === "reject" ? modalNoteVal : (notes ? notes.value.trim() : "");

    const updatePayload = {
      status:     newStatus,
      reviewedAt: serverTimestamp(),
      reviewedBy: reviewerUid,
      remarks:    finalRemarks
    };
    if (pendingDecision === "duplicate") {
      updatePayload.isDuplicate      = true;
      updatePayload.cancelledReason  = "duplicate";
    }

    try {
      await updateDoc(doc(db, "applications", currentAppId), updatePayload);
    } catch (e) {
      console.error("Application status update error:", e);
      showToast("Failed to save decision — check connection.");
      return;
    }

    if (pendingDecision === "duplicate") {
      try {
        await addDoc(collection(db, "auditLogs"), {
          action:         "admin_marked_duplicate",
          applicationId:  currentAppId,
          reviewerUid:    reviewerUid,
          remarks:        finalRemarks,
          createdAt:      serverTimestamp()
        });
      } catch (_) {}
    }

    const toasts = {
      approve:   "Application approved. Student notified.",
      reject:    "Application rejected. Student notified.",
      request:   "Re-upload request sent to student.",
      duplicate: "Application marked as duplicate and cancelled."
    };
    showToast(toasts[pendingDecision] || "Decision saved.");

    try {
      const appSnap = await getDoc(doc(db, "applications", currentAppId));
      if (!appSnap.exists()) return;
      const d = appSnap.data();

      const recipientUid = d.userId || d.submittedByUid || d.authUid || currentApplicantUid;
      if (!recipientUid) {
        console.warn("No recipient UID on application — cannot send notification.", currentAppId);
        showToast("Status saved, but student notification could not be sent (missing user link).");
        return;
      }

      const msgs = {
        approve:   "Your application for " + d.scholarshipName + " has been approved!",
        reject:    "Your application for " + d.scholarshipName + " was not approved. " + finalRemarks,
        request:   "Please re-upload documents for your " + d.scholarshipName + " application.",
        duplicate: "Your application for " + d.scholarshipName + " was cancelled as a duplicate. Contact the scholarship office if you believe this is an error."
      };

      await addDoc(collection(db, "notifications"), {
        recipientUid:  recipientUid,
        userId:        recipientUid,
        title: pendingDecision === "approve"    ? "Application Approved"
             : pendingDecision === "reject"     ? "Application Rejected"
             : pendingDecision === "duplicate"  ? "Application Cancelled"
             :                                    "Documents Needed",
        message: msgs[pendingDecision] || "",
        type:    pendingDecision === "request" ? "document" : "application",
        subtype: pendingDecision === "reject"     ? "rejected"
               : pendingDecision === "approve"    ? "approved"
               : pendingDecision === "request"    ? "reupload"
               : pendingDecision === "duplicate"  ? "cancelled" : "",
        icon: pendingDecision === "approve"    ? "bi-patch-check-fill"
            : pendingDecision === "reject"     ? "bi-x-circle-fill"
            : pendingDecision === "duplicate"  ? "bi-copy"
            :                                    "bi-file-earmark-arrow-up-fill",
        priority: pendingDecision === "reject" || pendingDecision === "request" || pendingDecision === "duplicate" ? "high" : "normal",
        read:          false,
        link:          pendingDecision === "request" ? "mydocuments.html" : "myapplication.html",
        actionLabel:   pendingDecision === "request" ? "Upload documents" : "View application",
        applicationId: currentAppId,
        createdAt:     serverTimestamp(),
        readBy:        {}
      });
    } catch (e) {
      console.error("Notification write error:", e);
      showToast("Status saved, but student notification failed — check your connection.");
    }
  }

  /* ─────────────────────────────────────────────────────
     ADMIN NOTIFICATION POPOVER
  ───────────────────────────────────────────────────── */
  function initAdminNotificationPopover() {
    const bell    = qs("#adminNotifBell");
    const popover = qs("#adminNotificationPopover");
    const markAll = qs("#adminNotifMarkAll");
    if (!bell || !popover) return;
    bell.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); const open = popover.classList.toggle("show"); bell.setAttribute("aria-expanded", String(open)); });
    bell.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bell.click(); } });
    popover.addEventListener("click", e => e.stopPropagation());
    document.addEventListener("click", () => { popover.classList.remove("show"); bell.setAttribute("aria-expanded", "false"); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") popover.classList.remove("show"); });
    qsa("[data-admin-notif]", popover).forEach(item => {
      item.addEventListener("click", () => { item.classList.remove("unread"); const dot = item.querySelector(".admin-notif-dot"); if (dot) dot.remove(); updateUnreadCount(); });
    });
    if (markAll) markAll.addEventListener("click", () => {
      qsa(".admin-notif-item.unread", popover).forEach(i => i.classList.remove("unread"));
      updateUnreadCount(); showToast("All alerts marked as read.");
    });
    updateUnreadCount();
  }

  function updateUnreadCount() {
    const n     = qsa(".admin-notif-item.unread").length;
    const badge = qs("#adminNotifCount");
    const sub   = qs("#adminNotifSubtitle");
    if (badge) { badge.textContent = n; badge.classList.toggle("hidden", n === 0); }
    if (sub)   sub.textContent = n === 0 ? "No unread alerts" : n + " unread alert" + (n > 1 ? "s" : "");
  }

  function initPlaceholderLinks() {
    qsa("[data-placeholder-link]").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        if (!link.classList.contains("active")) showToast(link.textContent.trim() + " is available from the admin sidebar.");
      });
    });
  }

  function showToast(message) {
    let t = document.getElementById("adminReviewToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "adminReviewToast";
      t.className = "admin-review-toast";
      t.innerHTML = "<i class='bi bi-info-circle-fill'></i><span></span>";
      document.body.appendChild(t);
    }
    const span = t.querySelector("span");
    if (span) span.textContent = message;
    t.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function escHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escAttr(value) {
    return escHtml(value).replace(/`/g, "&#096;");
  }
})();


