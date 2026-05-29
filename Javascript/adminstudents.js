/* =========================================================
   ScholarsConnect — Student Records
   File: ESTECH/Javascript/adminstudents.js
   Real-time Firestore student feed + record modal.
========================================================= */
import {
  auth, db, doc,
  collection, addDoc, getDocs, onSnapshot,
  query, where, orderBy, updateDoc, serverTimestamp
} from "./firebase.js";
import { loadAdminProfile, initAdminLogout, initAdminMobileSidebar } from "./user-profile.js";

(function () {
  "use strict";

  var STUDENT_CACHE  = {};   /* uid -> user data */
  var unsubStudents  = null;
  var activeUid      = null;
  var showRemoved    = false; /* toggle to reveal soft-deleted students */

  document.addEventListener("DOMContentLoaded", async function () {
    initAdminLogout();
    initAdminMobileSidebar();
    loadAdminProfile();
    initAdminNotificationPopover();
    subscribeStudents();
    initSearch();
    initStudentModal();
    initResetModal();
    initRemoveStudent();
    window.addEventListener("beforeunload", function () {
      if (unsubStudents) unsubStudents();
    });
  });

  /* ── Helpers ── */
  function qs(selector, parent)  { return (parent || document).querySelector(selector); }
  function qsa(selector, parent) { return Array.from((parent || document).querySelectorAll(selector)); }
  function showStuToast(msg) {
    var t = document.getElementById("stuRecordToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "stuRecordToast";
      t.style.cssText = "position:fixed;bottom:24px;right:24px;background:#2b1515;color:#fff;padding:10px 18px;border-radius:8px;font-size:0.875rem;z-index:9999;display:flex;align-items:center;gap:8px;opacity:0;transition:opacity 0.2s;pointer-events:none;";
      t.innerHTML = "<i class='bi bi-check-circle-fill' style='color:#4ade80'></i><span></span>";
      document.body.appendChild(t);
    }
    t.querySelector("span").textContent = msg;
    t.style.opacity = "1";
    clearTimeout(showStuToast._t);
    showStuToast._t = setTimeout(function () { t.style.opacity = "0"; }, 2800);
  }

  function openDocumentPreview(dataUrl) {
    if (!dataUrl) return;
    /* Firebase Storage URL — open directly */
    if (!dataUrl.startsWith("data:")) {
      window.open(dataUrl, "_blank", "noopener,noreferrer");
      return;
    }
    /* Base64 data URL — convert to blob so browser allows new-tab open */
    try {
      var parts = dataUrl.split(";base64,");
      var mime  = parts[0].replace("data:", "");
      var raw   = atob(parts[1]);
      var arr   = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      var blob  = new Blob([arr], { type: mime });
      var url   = URL.createObjectURL(blob);
      var win   = window.open(url, "_blank", "noopener,noreferrer");
      /* Revoke after a short delay so the tab has time to load */
      if (win) setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    } catch (_) {
      window.open(dataUrl, "_blank");
    }
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function setEl(id, val) { var el = document.getElementById(id); if (el) el.textContent = String(val == null ? "" : val); }
  function capitalize(s)  { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function stringToColor(str) {
    var hash = 0;
    for (var i = 0; i < (str || "").length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    var colors = ["#7A2323","#4A1212","#2C5F2E","#1A3A5C","#6B2D8B","#8B4513","#2C4770"];
    return colors[Math.abs(hash) % colors.length];
  }

  /* ── Firestore subscription ── */
  function subscribeStudents() {
    var tbody = qs("#stu-tbody");
    if (!tbody) return;
    if (unsubStudents) unsubStudents();
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Loading…</td></tr>';

    unsubStudents = onSnapshot(
      query(collection(db, "users"), where("role", "==", "student")),
      function (snap) {
        STUDENT_CACHE = {};
        var active   = [];
        var removed  = [];

        snap.docs.forEach(function (d) {
          STUDENT_CACHE[d.id] = Object.assign({ uid: d.id }, d.data());
          if (d.data().removed) removed.push(d);
          else                  active.push(d);
        });

        tbody.innerHTML = "";

        if (active.length === 0 && !showRemoved) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">No student records found.</td></tr>';
        } else {
          active.forEach(function (d) {
            tbody.insertAdjacentHTML("beforeend", buildRow(d.id, d.data(), false));
          });
          if (showRemoved) {
            removed.forEach(function (d) {
              tbody.insertAdjacentHTML("beforeend", buildRow(d.id, d.data(), true));
            });
          }
        }

        updateStudentCount(active.length);
        updateRemovedToggle(removed.length);
        applyFilters();
      },
      function (e) {
        console.warn("Students subscription error:", e);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Could not load student records.</td></tr>';
      }
    );
  }

  function updateStudentCount(n) {
    var badge = qs(".stu-total-badge");
    if (badge) badge.innerHTML = '<i class="bi bi-people-fill"></i> ' + n + ' Total Student' + (n !== 1 ? "s" : "");
  }

  function updateRemovedToggle(count) {
    var btn = qs("#stu-show-removed-btn");
    if (!btn) return;
    if (count === 0) {
      btn.style.display = "none";
    } else {
      btn.style.display = "";
      btn.innerHTML = showRemoved
        ? '<i class="bi bi-eye-slash"></i> Hide Removed (' + count + ')'
        : '<i class="bi bi-trash3"></i> Show Removed (' + count + ')';
      btn.classList.toggle("active", showRemoved);
    }
  }

  function buildRow(uid, u, isRemoved) {
    var name      = u.displayName || u.name || "—";
    var studentId = u.studentId   || "—";
    var course    = u.course      || "—";
    var year      = u.yearLevel   || u.year || "";
    var gwa       = u.gwa != null ? String(u.gwa) : "—";
    var status    = isRemoved ? "removed" : (u.status || "active");
    var initials  = name.split(" ").map(function (w) { return w[0] || ""; }).join("").toUpperCase().slice(0, 2) || "??";
    var avatarBg  = stringToColor(name);
    var appCount  = u.applicationCount != null ? u.applicationCount + " active" : "—";
    var avatarHtml = u.photoBase64
      ? '<img src="' + esc(u.photoBase64) + '" alt="' + esc(name) + '" class="stu-av-img"/>'
      : esc(initials);
    var avatarStyle = u.photoBase64 ? '' : ' style="background:' + esc(avatarBg) + '"';

    var actionButtons = isRemoved
      ? '<button class="stu-restore-btn" type="button" data-uid="' + esc(uid) + '"><i class="bi bi-arrow-counterclockwise"></i> Restore</button>'
      : '<button class="stu-view-btn" type="button" data-uid="' + esc(uid) + '">View Record</button>' +
        '<button class="stu-remove-btn" type="button" data-uid="' + esc(uid) + '"><i class="bi bi-trash-fill"></i> Remove</button>';

    return (
      '<tr data-uid="' + esc(uid) + '" data-course="' + esc(course) + '" data-year="' + esc(year) + '" data-name="' + esc(name.toLowerCase()) + '"' +
          (isRemoved ? ' class="stu-row-removed"' : '') + '>' +
        '<td><div class="stu-name-cell">' +
          '<div class="stu-av"' + avatarStyle + '>' + avatarHtml + '</div>' +
          '<span class="stu-name">' + esc(name) + '</span>' +
        '</div></td>' +
        '<td><span class="stu-id">' + esc(studentId) + '</span></td>' +
        '<td>' + esc(course) + '</td>' +
        '<td><strong>' + esc(gwa) + '</strong></td>' +
        '<td>' + esc(appCount) + '</td>' +
        '<td><span class="stu-badge ' + esc(status) + '">' + esc(capitalize(status)) + '</span></td>' +
        '<td><div class="stu-row-actions">' + actionButtons + '</div></td>' +
      '</tr>'
    );
  }

  /* ── Search / Filter ── */
  function initSearch() {
    var searchInp    = qs("#stu-search");
    var courseFilter = qs("#stu-filter-course");
    var yearFilter   = qs("#stu-filter-year");
    if (searchInp)    searchInp.addEventListener("input",   applyFilters);
    if (courseFilter) courseFilter.addEventListener("change", applyFilters);
    if (yearFilter)   yearFilter.addEventListener("change",   applyFilters);
  }

  function applyFilters() {
    var searchInp    = qs("#stu-search");
    var courseFilter = qs("#stu-filter-course");
    var yearFilter   = qs("#stu-filter-year");
    var emptyState   = qs("#stu-empty");

    var q      = searchInp    ? searchInp.value.trim().toLowerCase()  : "";
    var course = courseFilter ? courseFilter.value : "";
    var year   = yearFilter   ? yearFilter.value   : "";

    var rows    = qsa("#stu-tbody tr[data-uid]");
    var visible = 0;

    rows.forEach(function (row) {
      var name    = row.dataset.name || "";
      var idEl    = qs(".stu-id", row);
      var rowId   = idEl ? idEl.textContent.toLowerCase() : "";
      var rCourse = row.dataset.course || "";
      var rYear   = row.dataset.year   || "";

      var matchQ      = !q      || name.includes(q) || rowId.includes(q);
      var matchCourse = !course || rCourse === course;
      var matchYear   = !year   || rYear   === year;

      var show = matchQ && matchCourse && matchYear;
      row.style.display = show ? "" : "none";
      if (show) visible++;
    });

    if (emptyState) emptyState.style.display = visible === 0 ? "flex" : "none";
  }

  /* ── Student Record Modal ── */
  function initStudentModal() {
    var modal = qs("#stu-modal");
    var tbody = qs("#stu-tbody");
    if (!modal) return;

    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var btn = e.target.closest(".stu-view-btn");
        if (!btn) return;
        var uid = btn.dataset.uid;
        if (uid) openRecord(uid);
      });
    }

    var xBtn    = qs("#stu-modal-x");
    var closeBtn= qs("#stu-modal-close");
    if (xBtn)     xBtn.addEventListener("click", closeRecord);
    if (closeBtn) closeBtn.addEventListener("click", closeRecord);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeRecord(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.style.display !== "none") closeRecord();
    });
  }

  function openRecord(uid) {
    var u = STUDENT_CACHE[uid];
    if (!u) return;
    activeUid = uid;

    var modal     = qs("#stu-modal");
    var name      = u.displayName || u.name || "—";
    var studentId = u.studentId   || "—";
    var course    = u.course      || "—";
    var year      = u.yearLevel   || u.year || "";
    var initials  = name.split(" ").map(function (w) { return w[0] || ""; }).join("").toUpperCase().slice(0, 2) || "??";

    var avatarEl = qs("#sm-avatar");
    if (avatarEl) {
      if (u.photoBase64) {
        avatarEl.innerHTML = '<img src="' + esc(u.photoBase64) + '" alt="' + esc(name) + '" class="stu-av-img"/>';
        avatarEl.style.background = "transparent";
      } else {
        avatarEl.textContent = initials;
        avatarEl.style.background = stringToColor(name);
      }
    }
    setEl("sm-name",    name);
    setEl("sm-id",      studentId);
    var courseEl = document.getElementById("sm-course");
    if (courseEl) courseEl.innerHTML = esc(course) + (year ? " &bull; " + esc(year) : "");
    setEl("sm-email",    u.email   || "—");
    setEl("sm-mobile",   u.mobile  || u.phone || "—");
    setEl("sm-address",  u.address || "—");
    setEl("sm-gwa",      u.gwa != null ? String(u.gwa) : "—");

    setEl("sm-birthdate",    u.birthDate   || "—");
    setEl("sm-sex",          u.sex         || "—");
    setEl("sm-civil-status", u.civilStatus || "—");

    var provinceCityParts = [u.province, u.city].filter(Boolean);
    setEl("sm-province-city", provinceCityParts.length ? provinceCityParts.join(", ") : "—");

    setEl("sm-guardian-name",    u.guardianName         || "—");
    setEl("sm-guardian-rel",     u.guardianRelationship || "—");
    setEl("sm-guardian-contact", u.guardianContact      || "—");

    setEl("sm-family-income", (u.familyIncome != null && u.familyIncome !== "") ? String(u.familyIncome) : "—");
    setEl("sm-4ps", u.is4PsBeneficiary === true || u.is4PsBeneficiary === "yes" ? "Yes"
                  : u.is4PsBeneficiary === false || u.is4PsBeneficiary === "no" ? "No" : "—");

    setEl("sm-school",   u.school   || "—");
    setEl("sm-campus",   u.campus   || "—");
    setEl("sm-semester", u.semester || "—");

    /* Wire the modal Remove button to the current uid and reset any previous confirm state */
    var modalRmBtn = document.getElementById("stu-modal-remove-btn");
    if (modalRmBtn) {
      modalRmBtn.dataset.uid = uid;
      delete modalRmBtn.dataset.confirming;
      modalRmBtn.classList.remove("confirming");
      modalRmBtn.disabled = false;
      modalRmBtn.innerHTML = '<i class="bi bi-trash-fill"></i> Remove Student';
    }

    var appList  = document.getElementById("sm-app-list");
    var disbBody = document.getElementById("sm-disb-body");
    var docsList = document.getElementById("sm-docs-list");
    if (appList)  appList.innerHTML  = '<div style="color:var(--muted);padding:8px 0;font-size:13px">Loading…</div>';
    if (disbBody) disbBody.innerHTML = '<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:12px">Loading…</td></tr>';
    if (docsList) docsList.innerHTML = '<div style="color:var(--muted);padding:8px 0;font-size:13px">Loading…</div>';

    modal.style.display = "flex";

    var dQuery = (studentId && studentId !== "—")
      ? query(collection(db, "disbursements"), where("studentId", "==", studentId))
      : null;

    Promise.all([
      getDocs(query(collection(db, "applications"), where("userId", "==", uid))),
      dQuery ? getDocs(dQuery) : Promise.resolve({ empty: true, docs: [] }),
      getDocs(query(collection(db, "documents"), where("userId", "==", uid))),
      getDocs(collection(db, "users", uid, "documents"))
    ]).then(function (results) {
      renderApplications(results[0], appList);
      renderDisbursements(results[1], disbBody);
      renderStudentDocuments(results[2], results[3], docsList);
    }).catch(function (e) {
      console.warn("Could not load student detail:", e);
      if (appList)  appList.innerHTML  = '<div style="color:var(--muted);padding:8px 0;font-size:13px">Could not load applications.</div>';
      if (docsList) docsList.innerHTML = '<div style="color:var(--muted);padding:8px 0;font-size:13px">Could not load documents.</div>';
    });
  }

  function renderApplications(snap, container) {
    if (!container) return;
    if (!snap || snap.empty) {
      container.innerHTML = '<div style="color:var(--muted);padding:8px 0;font-size:13px">No applications on record.</div>';
      return;
    }
    var statusLabel = { approved: "Approved", under_review: "Under Review", rejected: "Rejected", submitted: "Submitted", pending: "Pending" };
    container.innerHTML = snap.docs.map(function (d) {
      var a       = d.data();
      var appName = a.scholarshipName || "—";
      var appDate = a.submittedAt
        ? (a.submittedAt.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt))
            .toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : "—";
      var appStatus = a.status || "pending";
      var statusClass = appStatus.replace(/_/g, "-");
      return (
        '<div class="stu-app-item">' +
          '<div class="stu-app-icon"><i class="bi bi-award-fill"></i></div>' +
          '<div class="stu-app-info">' +
            '<div class="stu-app-name">' + esc(appName) + '</div>' +
            '<div class="stu-app-date">'  + esc(appDate) + '</div>' +
          '</div>' +
          '<span class="stu-app-status ' + esc(statusClass) + '">' + esc(statusLabel[appStatus] || capitalize(appStatus)) + '</span>' +
        '</div>'
      );
    }).join("");
  }

  function renderDisbursements(snap, container) {
    if (!container) return;
    if (!snap || snap.empty) {
      container.innerHTML = '<tr><td colspan="3" class="stu-disb-empty">No disbursements on record.</td></tr>';
      return;
    }
    container.innerHTML = snap.docs.map(function (d) {
      var disp = d.data();
      return (
        '<tr>' +
          '<td>' + esc(disp.period || "—") + '</td>' +
          '<td><span class="stu-disb-ref">' + esc(disp.referenceNo || "—") + '</span></td>' +
          '<td class="stu-disb-amount">' + esc(disp.amount > 0 ? "\u20B1" + parseFloat(disp.amount).toLocaleString("en-US") : (disp.amount || "—")) + '</td>' +
        '</tr>'
      );
    }).join("");
  }

  function renderStudentDocuments(newSnap, legacySnap, container) {
    if (!container) return;

    var items = [];

    /* ── New format: top-level documents collection ── */
    if (newSnap && !newSnap.empty) {
      newSnap.docs.forEach(function (d) {
        var data = d.data();
        var ms = data.uploadedAt
          ? (data.uploadedAt.toDate ? data.uploadedAt.toDate() : new Date(data.uploadedAt)).getTime()
          : 0;
        items.push({
          id:          d.id,
          name:        data.name     || "Document",
          filename:    data.filename || data.name || "—",
          status:      data.status   || "pending",
          isImage:     (data.fileType || "").toLowerCase() === "image",
          downloadURL: data.downloadURL || null,
          source:      "documents",
          ms:          ms
        });
      });
    }

    /* ── Legacy format: users/{uid}/documents subcollection ── */
    if (items.length === 0 && legacySnap && !legacySnap.empty) {
      legacySnap.docs.forEach(function (d) {
        var data = d.data();
        var ms = data.uploadedAt
          ? (data.uploadedAt.toDate ? data.uploadedAt.toDate() : new Date(data.uploadedAt)).getTime()
          : 0;
        var isImg = (data.fileType || "").startsWith("image/");
        items.push({
          id:          d.id,
          name:        data.docName  || ("Document " + d.id),
          filename:    data.fileName || data.docName || "—",
          status:      "pending",
          isImage:     isImg,
          downloadURL: data.base64   || null,
          source:      "legacy",
          ms:          ms
        });
      });
    }

    if (items.length === 0) {
      container.innerHTML = '<div class="stu-doc-empty">No documents submitted yet.</div>';
      return;
    }

    /* Deduplicate by name — keep latest per type */
    var byName = new Map();
    items.forEach(function (item) {
      if (!byName.has(item.name) || item.ms > byName.get(item.name).ms) {
        byName.set(item.name, item);
      }
    });

    var sorted = Array.from(byName.values()).sort(function (a, b) { return b.ms - a.ms; });

    container.innerHTML = sorted.map(function (item, idx) {
      var statusLabel = { verified: "Verified", pending: "Pending Review", rejected: "Needs Re-upload" }[item.status] || "Pending Review";
      var iconCls = item.isImage
        ? "bi-image-fill"
        : (item.status === "verified" ? "bi-file-earmark-check-fill"
         : item.status === "rejected" ? "bi-file-earmark-x-fill"
         : "bi-file-earmark-text-fill");
      var viewHtml = item.downloadURL
        ? '<button class="stu-doc-view-btn" type="button" data-view-idx="' + idx + '">View</button>'
        : '<span class="stu-doc-view-btn disabled">No Preview</span>';
      var verifyActive  = item.status === "verified"  ? " active" : "";
      var rejectActive  = item.status === "rejected"  ? " active" : "";
      return (
        '<div class="stu-doc-item" data-doc-idx="' + idx + '">' +
          '<div class="stu-app-icon"><i class="bi ' + esc(iconCls) + '"></i></div>' +
          '<div class="stu-app-info">' +
            '<div class="stu-app-name">' + esc(item.name) + '</div>' +
            '<div class="stu-app-date">' + esc(item.filename) + '</div>' +
          '</div>' +
          '<span class="stu-doc-badge ' + esc(item.status) + '">' + esc(statusLabel) + '</span>' +
          viewHtml +
          '<button class="stu-doc-action-btn verify' + verifyActive + '" type="button" data-verify-idx="' + idx + '"><i class="bi bi-check-lg"></i> Verify</button>' +
          '<button class="stu-doc-action-btn reject' + rejectActive + '" type="button" data-reject-idx="' + idx + '"><i class="bi bi-x-lg"></i> Reject</button>' +
        '</div>'
      );
    }).join("");

    container.querySelectorAll("[data-view-idx]").forEach(function (btn) {
      var item = sorted[Number(btn.dataset.viewIdx)];
      if (!item || !item.downloadURL) return;
      btn.addEventListener("click", function () {
        openDocumentPreview(item.downloadURL);
      });
    });

    container.querySelectorAll("[data-verify-idx]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = sorted[Number(btn.dataset.verifyIdx)];
        if (item) updateDocStatus(item, "verified", container, sorted);
      });
    });

    container.querySelectorAll("[data-reject-idx]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = sorted[Number(btn.dataset.rejectIdx)];
        if (item) updateDocStatus(item, "rejected", container, sorted);
      });
    });
  }

  async function updateDocStatus(item, newStatus, container, sorted) {
    var uid = activeUid;
    if (!uid || !item.id) return;

    /* Optimistic UI update */
    var row    = container.querySelector('[data-doc-idx="' + sorted.indexOf(item) + '"]');
    var badge  = row && row.querySelector(".stu-doc-badge");
    var icon   = row && row.querySelector(".stu-app-icon i");
    var vBtn   = row && row.querySelector("[data-verify-idx]");
    var rBtn   = row && row.querySelector("[data-reject-idx]");
    var labels = { verified: "Verified", rejected: "Needs Re-upload", pending: "Pending Review" };
    var icons  = { verified: "bi-file-earmark-check-fill", rejected: "bi-file-earmark-x-fill", pending: "bi-file-earmark-text-fill" };

    if (badge) { badge.className = "stu-doc-badge " + newStatus; badge.textContent = labels[newStatus]; }
    if (icon)  { icon.className = "bi " + (icons[newStatus] || icons.pending); }
    if (vBtn)  vBtn.classList.toggle("active", newStatus === "verified");
    if (rBtn)  rBtn.classList.toggle("active", newStatus === "rejected");
    item.status = newStatus;

    /* Save to Firestore */
    try {
      var docRef = item.source === "legacy"
        ? doc(db, "users", uid, "documents", item.id)
        : doc(db, "documents", item.id);
      await updateDoc(docRef, { status: newStatus, reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser ? auth.currentUser.uid : null });
      showStuToast(newStatus === "verified" ? "Document verified." : "Document marked for re-upload.");
    } catch (_) {
      showStuToast("Could not save status. Check your connection.");
    }
  }

  function closeRecord() {
    var modal = qs("#stu-modal");
    if (modal) modal.style.display = "none";
    activeUid = null;
  }

  /* ── Reset Portal Access Modal ── */
  function initResetModal() {
    var resetBtn     = qs("#stu-reset-btn");
    var resetModal   = qs("#stu-reset-modal");
    var resetCancel  = qs("#stu-reset-cancel");
    var resetConfirm = qs("#stu-reset-confirm");
    var resetNameEl  = qs("#stu-reset-name");

    if (!resetModal) return;

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!activeUid) return;
        var u    = STUDENT_CACHE[activeUid];
        var name = (u && (u.displayName || u.name)) || "this student";
        if (resetNameEl) resetNameEl.textContent = name + "'s";
        resetModal.style.display = "flex";
      });
    }

    if (resetCancel) resetCancel.addEventListener("click", function () { resetModal.style.display = "none"; });
    resetModal.addEventListener("click", function (e) { if (e.target === resetModal) resetModal.style.display = "none"; });

    if (resetConfirm) {
      resetConfirm.addEventListener("click", async function () {
        resetModal.style.display = "none";
        try {
          await recordPortalAccessReset();
          closeRecord();
          showToast("Portal access reset recorded. Student must reset password on next login.");
        } catch (e) {
          console.error("Portal access reset error:", e);
          showToast("Could not record portal access reset. Please try again.");
        }
      });
    }
  }

  async function recordPortalAccessReset() {
    var u         = activeUid ? STUDENT_CACHE[activeUid] : null;
    var name      = (u && (u.displayName || u.name)) || "Student";
    var email     = (u && u.email)     || "";
    var studentId = (u && u.studentId) || "";

    if (activeUid) {
      try {
        await updateDoc(doc(db, "users", activeUid), {
          forcePasswordReset:   true,
          accessResetAt:        serverTimestamp(),
          accessResetBy:        auth.currentUser ? auth.currentUser.uid   : null,
          accessResetByEmail:   auth.currentUser ? auth.currentUser.email : ""
        });
      } catch (e) { console.warn("Could not update user doc:", e); }
    }

    await addDoc(collection(db, "auditLogs"), {
      title:        "Student Access Reset",
      type:         "Student",
      severity:     "Warning",
      description:  "Admin recorded a portal access reset for " + name + ".",
      studentName:  name,
      studentEmail: email,
      studentId:    studentId,
      matchedUid:   activeUid,
      adminUid:     auth.currentUser ? auth.currentUser.uid   : null,
      adminEmail:   auth.currentUser ? auth.currentUser.email : "",
      createdAt:    serverTimestamp()
    });
  }

  /* ── Remove / Restore Student ── */
  function initRemoveStudent() {
    var tbody = qs("#stu-tbody");
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var rmBtn = e.target.closest(".stu-remove-btn");
        if (rmBtn) { handleRemoveClick(rmBtn); return; }
        var rtBtn = e.target.closest(".stu-restore-btn");
        if (rtBtn) { handleRestoreClick(rtBtn); }
      });
    }

    var modalRemoveBtn = qs("#stu-modal-remove-btn");
    if (modalRemoveBtn) {
      modalRemoveBtn.addEventListener("click", function () {
        handleRemoveClick(modalRemoveBtn);
      });
    }

    var toggleBtn = qs("#stu-show-removed-btn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        showRemoved = !showRemoved;
        subscribeStudents();
      });
    }
  }

  function handleRemoveClick(btn) {
    var uid = btn.dataset.uid || activeUid;
    if (!uid) return;

    if (!btn.dataset.confirming) {
      btn.dataset.confirming = "true";
      btn.classList.add("confirming");
      btn.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Confirm Remove?';
      btn._resetTimer = setTimeout(function () {
        if (btn.dataset.confirming) {
          delete btn.dataset.confirming;
          btn.classList.remove("confirming");
          btn.innerHTML = '<i class="bi bi-trash-fill"></i> Remove';
        }
      }, 4000);
      return;
    }

    clearTimeout(btn._resetTimer);
    btn.disabled = true;
    btn.classList.remove("confirming");
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Removing…';
    removeStudentRecord(uid).then(function () {
      closeRecord();
    }).catch(function (err) {
      console.error("Remove student error:", err);
      btn.disabled = false;
      delete btn.dataset.confirming;
      btn.innerHTML = '<i class="bi bi-trash-fill"></i> Remove';
      showToast("Could not remove student. Please try again.");
    });
  }

  async function removeStudentRecord(uid) {
    var u         = STUDENT_CACHE[uid] || {};
    var name      = u.displayName || u.name || "Student";
    var email     = u.email     || "";
    var studentId = u.studentId || "";

    /* Suspend active applications — save _previousStatus so restore can undo exactly */
    var appSnap = await getDocs(query(
      collection(db, "applications"),
      where("userId", "==", uid),
      where("status", "in", ["submitted", "under_review", "approved", "active", "needs_reupload", "needs-reupload"])
    ));
    await Promise.all(appSnap.docs.map(function (d) {
      return updateDoc(doc(db, "applications", d.id), {
        _previousStatus: d.data().status,
        status:          "cancelled",
        cancelledReason: "student_removed",
        cancelledAt:     serverTimestamp()
      });
    }));

    /* Soft-delete: mark removed — data stays in Firestore, nothing is deleted */
    await updateDoc(doc(db, "users", uid), {
      removed:        true,
      removedAt:      serverTimestamp(),
      removedBy:      auth.currentUser ? auth.currentUser.uid   : null,
      removedByEmail: auth.currentUser ? auth.currentUser.email : ""
    });

    await addDoc(collection(db, "auditLogs"), {
      title:        "Student Record Removed",
      type:         "Student",
      severity:     "Warning",
      description:  "Admin soft-removed student record for " + name + (appSnap.size > 0 ? ". " + appSnap.size + " application(s) suspended." : "") + " (restorable).",
      studentName:  name,
      studentEmail: email,
      studentId:    studentId,
      removedUid:   uid,
      adminUid:     auth.currentUser ? auth.currentUser.uid   : null,
      adminEmail:   auth.currentUser ? auth.currentUser.email : "",
      createdAt:    serverTimestamp()
    });

    var note = appSnap.size > 0 ? " " + appSnap.size + " application(s) suspended." : "";
    showToast(name + " removed." + note + " Use ‘Show Removed’ to restore.");
  }

  function handleRestoreClick(btn) {
    var uid = btn.dataset.uid;
    if (!uid) return;

    if (!btn.dataset.confirming) {
      btn.dataset.confirming = "true";
      btn.classList.add("confirming");
      btn.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Confirm Restore?';
      btn._resetTimer = setTimeout(function () {
        if (btn.dataset.confirming) {
          delete btn.dataset.confirming;
          btn.classList.remove("confirming");
          btn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Restore';
        }
      }, 4000);
      return;
    }

    clearTimeout(btn._resetTimer);
    btn.disabled = true;
    btn.classList.remove("confirming");
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Restoring…';
    restoreStudentRecord(uid).catch(function (err) {
      console.error("Restore student error:", err);
      btn.disabled = false;
      delete btn.dataset.confirming;
      btn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Restore';
      showToast("Could not restore student. Please try again.");
    });
  }

  async function restoreStudentRecord(uid) {
    var u         = STUDENT_CACHE[uid] || {};
    var name      = u.displayName || u.name || "Student";
    var email     = u.email     || "";
    var studentId = u.studentId || "";

    /* Un-remove the user document */
    await updateDoc(doc(db, "users", uid), {
      removed:         false,
      restoredAt:      serverTimestamp(),
      restoredBy:      auth.currentUser ? auth.currentUser.uid   : null,
      restoredByEmail: auth.currentUser ? auth.currentUser.email : ""
    });

    /* Restore applications that were suspended by this removal */
    var appSnap = await getDocs(query(
      collection(db, "applications"),
      where("userId",          "==", uid),
      where("cancelledReason", "==", "student_removed")
    ));
    await Promise.all(appSnap.docs.map(function (d) {
      var prev = d.data()._previousStatus || "submitted";
      return updateDoc(doc(db, "applications", d.id), {
        status:          prev,
        cancelledReason: null,
        cancelledAt:     null,
        _previousStatus: null,
        restoredAt:      serverTimestamp()
      });
    }));

    await addDoc(collection(db, "auditLogs"), {
      title:        "Student Record Restored",
      type:         "Student",
      severity:     "Info",
      description:  "Admin restored student record for " + name + (appSnap.size > 0 ? ". " + appSnap.size + " application(s) reinstated." : "."),
      studentName:  name,
      studentEmail: email,
      studentId:    studentId,
      restoredUid:  uid,
      adminUid:     auth.currentUser ? auth.currentUser.uid   : null,
      adminEmail:   auth.currentUser ? auth.currentUser.email : "",
      createdAt:    serverTimestamp()
    });

    var note = appSnap.size > 0 ? " " + appSnap.size + " application(s) reinstated." : "";
    showToast(name + " restored." + note);
  }

  /* ── Notification Popover ── */
  function initAdminNotificationPopover() {
    var bell    = qs("#adminNotifBell");
    var popover = qs("#adminNotificationPopover");
    var markAll = qs("#adminNotifMarkAll");
    if (!bell || !popover) return;
    bell.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var isOpen = popover.classList.toggle("show");
      bell.setAttribute("aria-expanded", String(isOpen));
    });
    bell.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bell.click(); }
    });
    popover.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () { popover.classList.remove("show"); bell.setAttribute("aria-expanded", "false"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { popover.classList.remove("show"); bell.setAttribute("aria-expanded", "false"); }
    });
    qsa("[data-admin-notif]", popover).forEach(function (item) {
      item.addEventListener("click", function () {
        item.classList.remove("unread");
        var dot = qs(".admin-notif-dot", item); if (dot) dot.remove();
        updateUnreadCount();
      });
    });
    if (markAll) {
      markAll.addEventListener("click", function () {
        qsa(".admin-notif-item.unread", popover).forEach(function (item) {
          item.classList.remove("unread");
          var dot = qs(".admin-notif-dot", item); if (dot) dot.remove();
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

  /* ── Toast ── */
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
    toast.innerHTML = '<i class="bi bi-check-circle-fill"></i> ' + esc(message);
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove("show"); }, 3000);
  }

})();


