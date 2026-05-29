/* ============================================================
   My Stipend \u25C6 ScholarsConnect
   File: Javascript/disbursement.js
   Firebase-backed stipend status with printable receipts.
============================================================ */
import { auth, db, collection, onSnapshot, query, where, getDocs } from "./firebase.js";
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";

(function () {
  'use strict';

  /* Approval state is determined dynamically by Firestore (approved application check). */

  /* -- DOM refs -- */
  function el(id) { return document.getElementById(id); }

  var unsubStipendApp  = null;
  var unsubStipendDisb = null;
  var receiptData      = {};  /* ref ? record data, for receipt modal */

  /* -- Init -- */
  document.addEventListener('DOMContentLoaded', function () {
    initStudentLogout();
    initSidebar();
    initSearch();
    initFilterTabs();
    initReceiptModal();
    loadStudentProfile().then(function(profile) {
      subscribeStipendData(profile);
    });
    window.addEventListener('beforeunload', function () {
      if (unsubStipendApp)  unsubStipendApp();
      if (unsubStipendDisb) unsubStipendDisb();
    });
  });

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function subscribeStipendData(profile) {
    var uid = (profile && profile.uid) ||
              (auth.currentUser && auth.currentUser.uid) ||
              sessionStorage.getItem('sc_uid');

    var lockedEl  = document.getElementById('lockedState');
    var contentEl = document.getElementById('stipendContent');

    if (!uid) return;

    if (unsubStipendApp) unsubStipendApp();

    /* Watch approved applications \u25C6 real-time */
    unsubStipendApp = onSnapshot(
      query(collection(db, 'applications'), where('userId', '==', uid), where('status', '==', 'approved')),
      async function (appSnap) {
        if (appSnap.empty) {
          /* No approved scholarship \u25C6 show locked state */
          if (lockedEl)  lockedEl.style.display = '';
          if (contentEl) contentEl.style.display = 'none';
          if (unsubStipendDisb) { unsubStipendDisb(); unsubStipendDisb = null; }
          return;
        }

        /* Approved: hide locked, show content */
        if (lockedEl)  lockedEl.style.display = 'none';
        if (contentEl) contentEl.style.display = '';

        var app = appSnap.docs[0].data();

        /* Fetch scholarship's monthly stipend from Firestore as authoritative fallback */
        var scholarshipStipend = parseFloat(app.monthlyStipend || app.stipendAmount) || 0;
        if (!scholarshipStipend && app.scholarshipName) {
          try {
            var scSnap = await getDocs(
              query(collection(db, 'scholarships'), where('title', '==', app.scholarshipName))
            );
            if (!scSnap.empty) {
              scholarshipStipend = parseFloat(scSnap.docs[0].data().monthlyStipend) || 0;
            }
          } catch (e) { console.warn('Could not fetch scholarship stipend:', e); }
        }

        setText('heroTitle',  app.scholarshipName || '—');
        setText('heroAmount', scholarshipStipend > 0
          ? '\u20B1' + scholarshipStipend.toLocaleString('en-US')
          : (app.award || '—'));

        var metaParts = [];
        if (app.refNumber)                metaParts.push('Ref: ' + app.refNumber);
        if (app.academicYear)             metaParts.push(app.academicYear);
        if (profile && profile.course)    metaParts.push(profile.course);
        if (profile && profile.yearLevel) metaParts.push(profile.yearLevel + ' Year');
        setText('heroMeta', metaParts.join(' \u25C6 ') || '—');

        /* Watch disbursements \u25C6 real-time */
        if (unsubStipendDisb) unsubStipendDisb();
        unsubStipendDisb = onSnapshot(
          query(collection(db, 'disbursements'), where('userId', '==', uid)),
          function (disbSnap) {
            var tbody = document.getElementById('disbTbody');
            if (tbody) tbody.innerHTML = '';

            if (disbSnap.empty) {
              updateDisbStats([], app, scholarshipStipend);
              var disbEmpty = document.getElementById('disbEmpty');
              if (disbEmpty) disbEmpty.style.display = 'block';
              return;
            }

            var rows = [];
            disbSnap.docs.forEach(function(d) {
              var r = d.data();
              var status = r.status || 'scheduled';
              var period = r.period || '—';
              var sem    = r.semester || '';
              var ref    = r.reference || r.referenceNo || d.id.slice(0, 12).toUpperCase();

              /* amount is stored as a number by the admin; fallback to scholarship stipend for old records */
              var rawAmt = typeof r.amount === 'number'
                ? r.amount
                : parseFloat(String(r.amount || '').replace(/[\u20B1,\s]/g, '')) || 0;
              if (!rawAmt) rawAmt = scholarshipStipend;
              var amount = rawAmt > 0
                ? '\u20B1' + rawAmt.toLocaleString('en-US', {minimumFractionDigits: 2})
                : '—';

              var date = r.releaseDate
                ? new Date(r.releaseDate.toDate ? r.releaseDate.toDate() : r.releaseDate)
                    .toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})
                : '—';

              rows.push({ status: status, period: period, amount: amount, date: date, ref: ref, sem: sem, rawAmount: rawAmt });

              /* Store for receipt modal */
              receiptData[ref] = {
                ref:         ref,
                period:      period,
                sem:         sem,
                amount:      rawAmt,
                date:        date,
                scholarship: app.scholarshipName || '—',
                studentName: app.applicantName || (profile && (profile.displayName || profile.name)) || '—'
              };

              var badgeClass = status === 'released' ? 'badge-released'
                : status === 'scheduled' ? 'badge-scheduled' : 'badge-pending';
              var receiptBtn = status === 'released'
                ? '<button class="btn-receipt" data-ref="' + ref + '" type="button"><i class="bi bi-download"></i> Receipt</button>'
                : '—';
              if (tbody) tbody.insertAdjacentHTML('beforeend',
                '<tr data-status="' + status + '" data-period="' + period + '" data-ref="' + ref + '">' +
                '<td>' + period + '<br><small>' + sem + '</small></td>' +
                '<td><span class="disb-ref">' + ref + '</span></td>' +
                '<td>' + date + '</td>' +
                '<td><strong>' + amount + '</strong></td>' +
                '<td><span class="status-badge ' + badgeClass + '">' + status.charAt(0).toUpperCase() + status.slice(1) + '</span></td>' +
                '<td>' + receiptBtn + '</td>' +
                '</tr>'
              );
            });
            updateDisbStats(rows, app, scholarshipStipend);
          },
          function (e) { console.warn('Disbursements subscription error:', e); }
        );
      },
      function (e) { console.warn('Stipend app subscription error:', e); }
    );
  }

  function updateDisbStats(rows, app, scholarshipStipend) {
    var released   = rows.filter(function(r) { return r.status === 'released'; });
    var scheduled  = rows.filter(function(r) { return r.status === 'scheduled'; });
    var totalAmt   = released.reduce(function(s, r) { return s + (parseFloat(r.rawAmount) || 0); }, 0);
    var stipend    = parseFloat((app && app.monthlyStipend) || scholarshipStipend || 0);

    setText('statTotalReleased', released.length > 0 ? '\u20B1' + totalAmt.toLocaleString('en-US') : '\u20B10');
    setText('statCompleted',     released.length);

    if (scheduled.length > 0) {
      var next = scheduled[scheduled.length - 1];
      setText('statNextRelease', next.date);
      setText('statNextAmt',     next.amount + ' scheduled');
      setText('nbDate',          next.period + (next.sem ? ' \u25C6 ' + next.sem : ''));
      setText('nbAmount',        next.amount);
    } else {
      setText('statNextRelease', 'No upcoming');
      setText('statNextAmt',     '—');
      var nb = document.getElementById('nextBanner');
      if (nb) nb.style.display = 'none';
    }

    if (stipend > 0) {
      var remaining = stipend * (rows.length > 0 ? Math.max(0, rows.length - released.length) : 0);
      setText('statRemaining',       remaining > 0 ? '\u20B1' + remaining.toLocaleString('en-US') : '—');
      setText('statRemainingDetail', rows.length > 0 ? (rows.length - released.length) + ' months \u25C6 \u20B1' + stipend.toLocaleString('en-US') : '—');
    }

    /* Update tab counts */
    setText('cnt-all',       rows.length);
    setText('cnt-released',  released.length);
    setText('cnt-scheduled', scheduled.length);
    setText('cnt-pending',   rows.filter(function(r) { return r.status === 'pending'; }).length);
    setText('visibleCount',  rows.length);
  }


  /* --------------------------------------------
     MOBILE SIDEBAR
  -------------------------------------------- */
  function initSidebar() {
    var toggle  = el('sidebarToggle');
    var overlay = el('sidebarOverlay');

    if (toggle) {
      toggle.addEventListener('click', function () {
        document.body.classList.toggle('sidebar-open');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', function () {
        document.body.classList.remove('sidebar-open');
      });
    }

    document.querySelectorAll('.sb-item').forEach(function (link) {
      link.addEventListener('click', function () {
        document.body.classList.remove('sidebar-open');
      });
    });
  }

  /* --------------------------------------------
     LOGOUT
  -------------------------------------------- */


  /* --------------------------------------------
     SEARCH
     Filters visible rows by period text, reference, or status.
  -------------------------------------------- */
  function initSearch() {
    var input = el('disbSearch');
    var clear = el('clearSearch');
    if (!input) return;

    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      if (clear) clear.classList.toggle('show', q.length > 0);
      filterRows(getActiveFilter(), q);
    });

    if (clear) {
      clear.addEventListener('click', function () {
        input.value = '';
        clear.classList.remove('show');
        input.focus();
        filterRows(getActiveFilter(), '');
      });
    }
  }

  /* --------------------------------------------
     FILTER TABS
  -------------------------------------------- */
  function initFilterTabs() {
    var tabs = document.querySelectorAll('.filter-tab[data-filter]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var q = (el('disbSearch') && el('disbSearch').value.trim().toLowerCase()) || '';
        filterRows(tab.dataset.filter, q);
      });
    });
  }

  function getActiveFilter() {
    var active = document.querySelector('.filter-tab.active[data-filter]');
    return active ? active.dataset.filter : 'all';
  }

  /* --------------------------------------------
     CORE FILTER FUNCTION
     Hides/shows rows based on status tab + search query.
  -------------------------------------------- */
  function filterRows(filter, query) {
    var rows = document.querySelectorAll('#disbTbody tr');
    var visible = 0;

    rows.forEach(function (row) {
      var matchesTab = (filter === 'all') || (row.dataset.status === filter);

      var matchesSearch = true;
      if (query) {
        var haystack = [
          row.dataset.period || '',
          row.dataset.ref    || '',
          row.dataset.status || ''
        ].join(' ').toLowerCase();
        matchesSearch = haystack.indexOf(query) !== -1;
      }

      var show = matchesTab && matchesSearch;
      row.dataset.hidden = show ? 'false' : 'true';
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    updateResultCount(visible);
  }

  function updateResultCount(visible) {
    var span = el('visibleCount');
    if (span) span.textContent = visible;
    var empty = el('disbEmpty');
    if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
  }

  /* --------------------------------------------
     RECEIPT MODAL
  -------------------------------------------- */
  function initReceiptModal() {
    var backdrop  = el('rcptBackdrop');
    var closeBtn  = el('rcptClose');
    var cancelBtn = el('rcptCancelBtn');
    var printBtn  = el('rcptPrint');
    var tbody     = el('disbTbody');

    function closeModal() {
      if (backdrop) backdrop.classList.remove('open');
    }

    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('.btn-receipt');
        if (btn) downloadReceipt(btn.dataset.ref);
      });
    }

    if (closeBtn)  closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (backdrop)  backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });
    if (printBtn)  printBtn.addEventListener('click', function () { window.print(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdrop && backdrop.classList.contains('open')) closeModal();
    });
  }

  function downloadReceipt(ref) {
    var d = receiptData[ref];
    if (!d) { showToast('Receipt data not available. Please reload.'); return; }

    setText('rcptRef',         d.ref);
    setText('rcptDate',        d.date);
    setText('rcptName',        d.studentName);
    setText('rcptScholarship', d.scholarship);
    setText('rcptPeriod',      d.period);
    setText('rcptSem',         d.sem || '—');
    setText('rcptAmount',      d.amount > 0
      ? '\u20B1' + parseFloat(d.amount).toLocaleString('en-US', {minimumFractionDigits: 2})
      : '—');
    setText('rcptGeneratedOn', new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'}));

    var backdrop = el('rcptBackdrop');
    if (backdrop) backdrop.classList.add('open');
  }

  /* --------------------------------------------
     PROFILE PHOTO (localStorage)
  -------------------------------------------- */
  function initStoredProfilePhoto() {
    var saved = localStorage.getItem('scholarsconnectProfilePhoto');
    if (!saved) return;

    var sidebarAv = el('sidebarAvatar');
    var topUser   = el('topUserAvatar');

    if (sidebarAv) {
      sidebarAv.classList.add('has-photo');
      sidebarAv.style.backgroundImage = 'url("' + saved + '")';
    }

    if (topUser) {
      topUser.classList.add('has-photo');
      topUser.style.backgroundImage = 'url("' + saved + '")';
    }
  }

  /* --------------------------------------------
     TOAST
  -------------------------------------------- */
  function showToast(message) {
    var toast = el('toast');
    var msg   = el('toastMsg');
    if (!toast || !msg) { return; }

    msg.textContent = message;
    toast.classList.add('show');

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.classList.remove('show');
    }, 3400);
  }


})();


