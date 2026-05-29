/* ═══════════════════════════════════════════════════════
   ScholarsConnect — app.js
   Path: ESTECH/Javascript/app.js
═══════════════════════════════════════════════════════ */

/* ── STATE ──────────────────────────────────────────── */
let currentRole   = '';
let currentStep   = 1;
let otpTimer      = null;
let otpSeconds    = 300;
let otpAttempts   = 3;

function normalizeRoleValue(rawRole) {
  return String(rawRole || '').trim().toLowerCase();
}

/* ── TOAST ──────────────────────────────────────────── */
function showToast(msg, icon = 'bi-check-circle-fill') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.innerHTML = `<i class="bi ${icon}"></i> ${msg}`;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

/* ── FAQ ACCORDION ──────────────────────────────────── */
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

/* ── SCHOLARSHIP CARD DETAILS ───────────────────────── */
function toggleDetails(btn) {
  const card   = btn.closest('.sc-card');
  const detail = card.querySelector('.sc-details');
  if (!detail) return;
  const hidden = detail.classList.contains('hidden');
  detail.classList.toggle('hidden', !hidden);
  btn.textContent = hidden ? 'Hide Details' : 'View Details';
}

/* ══════════════════════════════════════════════════════
   LOGIN PAGE (html/login.html)
══════════════════════════════════════════════════════ */
function initLogin() {
  const tabs      = document.querySelectorAll('.role-tab');
  const emailInp  = document.getElementById('login-email');
  const passInp   = document.getElementById('login-password');
  const form      = document.getElementById('login-form');
  const eyeBtn    = document.getElementById('toggle-pass');
  if (!form) return;

  function setRole(role) {
    role = normalizeRoleValue(role);
    currentRole = role;
    tabs.forEach(t => t.classList.toggle('active', normalizeRoleValue(t.dataset.role) === role));
  }

  tabs.forEach(t => t.addEventListener('click', () => setRole(t.dataset.role)));
  setRole('student');

  if (eyeBtn) {
    eyeBtn.addEventListener('click', () => {
      const show = passInp.type === 'password';
      passInp.type = show ? 'text' : 'password';
      eyeBtn.className = show ? 'bi bi-eye input-icon' : 'bi bi-eye-slash input-icon';
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Logging in…';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Log In';
      if (normalizeRoleValue(currentRole) === 'admin') {
        window.location.href = 'securityverificationadmin.html';
      } else {
        showToast('Welcome back.');
        setTimeout(() => window.location.href = 'dashboard.html', 800);
      }
    }, 900);
  });
}

/* ══════════════════════════════════════════════════════
   OTP PAGE (html/otp.html)
══════════════════════════════════════════════════════ */
function initOtp() {
  return;
}
function initRegister() {
  const steps     = document.querySelectorAll('.step-card');
  const stepItems = document.querySelectorAll('.step-item-reg');
  const stepLines = document.querySelectorAll('.step-line');
  if (!steps.length) return;
  currentStep = 1;

  function showStep(n) {
    // Show/hide cards
    steps.forEach((s, i) => s.classList.toggle('active', i + 1 === n));

    // Update step circles
    stepItems.forEach((it, i) => {
      it.classList.remove('s-active', 's-done', 's-inactive');
      const circle = it.querySelector('.step-circle-reg');
      const label  = it.querySelector('.step-lbl');
      if (i + 1 < n) {
        it.classList.add('s-done');
        circle.innerHTML = '<i class="bi bi-check" style="font-size:13px;"></i>';
        label.classList.add('active');
      } else if (i + 1 === n) {
        it.classList.add('s-active');
        circle.textContent = i + 1;
        label.classList.add('active');
      } else {
        it.classList.add('s-inactive');
        circle.textContent = i + 1;
        label.classList.remove('active');
      }
    });

    // Update connector lines
    stepLines.forEach((line, i) => {
      line.classList.toggle('done', i + 1 < n);
    });

    currentStep = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.btn-next').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep < 4) showStep(currentStep + 1);
    });
  });

  document.querySelectorAll('.btn-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep > 1) showStep(currentStep - 1);
    });
  });

  const submitBtn = document.getElementById('submit-reg');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Submitting…';
      setTimeout(() => {
        showToast('Registration submitted! Welcome to ScholarsConnect.');
        setTimeout(() => window.location.href = 'dashboard.html', 1200);
      }, 1500);
    });
  }

  showStep(1);
}

/* ══════════════════════════════════════════════════════
   STUDENT PORTAL (html/student.html)
══════════════════════════════════════════════════════ */
function initStudent() {
  const views  = document.querySelectorAll('.view');
  const sitems = document.querySelectorAll('.sitem[data-view]');
  if (!views.length) return;

  function showView(id) {
    views.forEach(v  => v.classList.toggle('active', v.id === 'view-' + id));
    sitems.forEach(s => s.classList.toggle('active', s.dataset.view === id));
  }

  sitems.forEach(s => s.addEventListener('click', () => showView(s.dataset.view)));
  showView('dashboard');

  // Profile tabs
  const ptabs = document.querySelectorAll('.ptab');
  const pvs   = document.querySelectorAll('.profile-view');
  ptabs.forEach(t => t.addEventListener('click', () => {
    ptabs.forEach(x => x.classList.remove('active'));
    pvs.forEach(v   => v.classList.remove('active'));
    t.classList.add('active');
    const target = document.getElementById('pv-' + t.dataset.tab);
    if (target) target.classList.add('active');
  }));
}

/* ══════════════════════════════════════════════════════
   ADMIN PORTAL (html/admin.html)
══════════════════════════════════════════════════════ */
function initAdmin() {
  const views  = document.querySelectorAll('.view');
  const sitems = document.querySelectorAll('.sitem[data-view]');
  if (!views.length) return;

  function showView(id) {
    views.forEach(v  => v.classList.toggle('active', v.id === 'view-' + id));
    sitems.forEach(s => s.classList.toggle('active', s.dataset.view === id));
  }

  sitems.forEach(s => s.addEventListener('click', () => showView(s.dataset.view)));
  showView('dashboard');

  // Assign reviewer inline
  document.querySelectorAll('.btn-assign').forEach(btn => {
    btn.addEventListener('click', function() {
      const row = this.closest('tr');
      const cell = row.querySelector('.assign-cell');
      if (!cell) return;
      if (cell.querySelector('select')) { cell.innerHTML = '<span class="badge badge-gold">Assigned</span>'; return; }
      cell.innerHTML = `
        <select class="form-control" style="width:130px;display:inline-block;padding:4px 8px;font-size:12px;">
          <option>Prof. Cruz</option><option>Dr. Reyes</option><option>Prof. Lim</option>
        </select>
        <button class="btn-primary btn-sm" style="margin-left:6px;" onclick="confirmAssign(this)">OK</button>`;
    });
  });
}

function confirmAssign(btn) {
  const sel  = btn.previousElementSibling;
  const name = sel ? sel.value : 'Prof. Cruz';
  const cell = btn.closest('.assign-cell');
  cell.innerHTML = `<span class="badge badge-gold">${name}</span>`;
  showToast(`Application assigned to ${name}`);
}

/* ══════════════════════════════════════════════════════
   TOPBAR SCROLL EFFECT (landing page)
══════════════════════════════════════════════════════ */
function initTopbarScroll() {
  const topbar  = document.querySelector('.topbar');
  const navLinks = document.querySelectorAll('.tnav-link[href^="#"]');
  if (!topbar) return;

  window.addEventListener('scroll', () => {
    topbar.style.boxShadow = window.scrollY > 20
      ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 12px rgba(0,0,0,0.25)';
  });

  // Highlight active nav section on scroll
  const sections = ['home','scholarships','how-it-works','about','faq'];
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && window.scrollY >= el.offsetTop - 80) current = id;
    });
    navLinks.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  });
}

/* ══════════════════════════════════════════════════════
   COUNTER ANIMATION (stats section)
══════════════════════════════════════════════════════ */
function animateCounters() {
  const counters = document.querySelectorAll('.stat-big[data-target]');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el     = e.target;
      const target = parseInt(el.dataset.target);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      let count = 0;
      const step = Math.ceil(target / 50);
      const timer = setInterval(() => {
        count = Math.min(count + step, target);
        el.textContent = prefix + count.toLocaleString() + suffix;
        if (count >= target) clearInterval(timer);
      }, 30);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => observer.observe(c));
}

/* ══════════════════════════════════════════════════════
   SECURITY VERIFICATION (html/securityverificationadmin.html)
══════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════
   APPLICATION REVIEW  (html/applicationreview.html)
══════════════════════════════════════════════════════ */
function initApplicationReview() {
  if (!document.querySelector('.ar-grid')) return;

  /* ── Tabs ── */
  const tabs   = document.querySelectorAll('.ar-tab');
  const panels = document.querySelectorAll('.ar-tab-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t   => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  /* ── Action buttons → modal ── */
  const modal   = document.getElementById('ar-modal');
  const mIcon   = document.getElementById('modal-icon');
  const mTitle  = document.getElementById('modal-title');
  const mBody   = document.getElementById('modal-body');
  const mCancel = document.getElementById('modal-cancel');
  const mConfirm= document.getElementById('modal-confirm');

  function openModal(type) {
    const cfg = {
      approve: { icon: '✅', title: 'Approve Application?', body: 'This will mark the application as <strong>Approved</strong> and notify the student. This action cannot be undone.', cls: 'approve-confirm' },
      reject:  { icon: '❌', title: 'Reject Application?',  body: 'This will mark the application as <strong>Rejected</strong> and notify the student. This action cannot be undone.', cls: 'reject-confirm' },
      revise:  { icon: '🔄', title: 'Request Revision?',    body: 'The student will be asked to resubmit or correct specific documents. They will be notified by email.', cls: 'revise-confirm' },
    }[type];
    mIcon.textContent = cfg.icon;
    mTitle.textContent = cfg.title;
    mBody.innerHTML = cfg.body;
    mConfirm.className = 'ar-modal-confirm ' + cfg.cls;
    mConfirm.dataset.action = type;
    modal.style.display = 'flex';
  }

  const btnApprove = document.getElementById('btn-approve');
  const btnReject  = document.getElementById('btn-reject');
  const btnRevise  = document.getElementById('btn-revise');
  if (btnApprove) btnApprove.addEventListener('click', () => openModal('approve'));
  if (btnReject)  btnReject.addEventListener('click',  () => openModal('reject'));
  if (btnRevise)  btnRevise.addEventListener('click',  () => openModal('revise'));

  if (mCancel)  mCancel.addEventListener('click',  () => { modal.style.display = 'none'; });
  if (mConfirm) mConfirm.addEventListener('click', () => {
    const action = mConfirm.dataset.action;
    modal.style.display = 'none';
    const msgs = { approve: 'Application approved! Student has been notified.', reject: 'Application rejected. Student has been notified.', revise: 'Revision request sent to student.' };
    const icons = { approve: 'bi-check-circle-fill', reject: 'bi-x-circle-fill', revise: 'bi-arrow-counterclockwise' };
    showToast(msgs[action], icons[action]);
    setTimeout(() => window.location.href = 'admindashboard.html', 1400);
  });

  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
}

function initSecurityVerification() {
  return;
}
function initAdminScholarships() {
  const modal    = document.getElementById('as-modal');
  if (!modal) return;

  const delModal = document.getElementById('as-del-modal');
  const btnNew   = document.getElementById('btn-new-scholarship');

  let editingRow = null;

  ensureScholarshipDetailFields();

  function ensureScholarshipDetailFields() {
    if (document.getElementById('as-inp-award')) return;

    const descGroup = document.getElementById('as-inp-desc')?.closest('.as-form-group');
    if (!descGroup) return;

    descGroup.insertAdjacentHTML('afterend', `
      <div class="as-form-group">
        <label class="as-form-label" for="as-inp-sponsor">Sponsor / Office</label>
        <input class="as-form-input" type="text" id="as-inp-sponsor" placeholder="e.g. CHED, DOST-SEI, University Scholarship Office"/>
      </div>
      <div class="as-form-group">
        <label class="as-form-label" for="as-inp-award">Scholarship Benefit</label>
        <textarea class="as-form-textarea" id="as-inp-award" placeholder="e.g. Financial assistance, tuition support, or monthly stipend" rows="2"></textarea>
      </div>
      <div class="as-form-row">
        <div class="as-form-group">
          <label class="as-form-label" for="as-inp-min-gwa">Minimum GWA</label>
          <input class="as-form-input" type="text" id="as-inp-min-gwa" placeholder="e.g. 90%, 1.75, or No requirement"/>
        </div>
        <div class="as-form-group">
          <label class="as-form-label" for="as-inp-year-level">Year Level</label>
          <input class="as-form-input" type="text" id="as-inp-year-level" placeholder="e.g. All year levels"/>
        </div>
      </div>
      <div class="as-form-group">
        <label class="as-form-label" for="as-inp-course">Course / Program</label>
        <input class="as-form-input" type="text" id="as-inp-course" placeholder="e.g. All programs or Priority STEM programs"/>
      </div>
      <div class="as-form-group">
        <label class="as-form-label" for="as-inp-requirements">Required Documents</label>
        <textarea class="as-form-textarea" id="as-inp-requirements" placeholder="Enter one document per line, e.g. PSA Birth Certificate" rows="5"></textarea>
        <p class="as-form-help">One document per line. These appear in the student scholarship details.</p>
      </div>
      <div class="as-form-group">
        <label class="as-form-label" for="as-inp-renewal">Renewal Requirement</label>
        <textarea class="as-form-textarea" id="as-inp-renewal" placeholder="e.g. Maintain required GWA and active enrollment" rows="3"></textarea>
      </div>
      <div class="as-form-group">
        <label class="as-form-label" for="as-inp-contact">Contact</label>
        <input class="as-form-input" type="text" id="as-inp-contact" placeholder="e.g. scholarship@school.edu.ph"/>
      </div>
    `);
  }

  /* ── helpers ── */
  function openModal(mode, row) {
    const titleEl  = document.getElementById('as-modal-title');
    const errorEl  = document.getElementById('as-form-error');
    const nameInp  = document.getElementById('as-inp-name');
    const typeInp  = document.getElementById('as-inp-type');
    const statusInp= document.getElementById('as-inp-status');
    const slotsInp = document.getElementById('as-inp-slots');
    const deadInp  = document.getElementById('as-inp-deadline');
    const descInp  = document.getElementById('as-inp-desc');
    const sponsorInp = document.getElementById('as-inp-sponsor');
    const awardInp = document.getElementById('as-inp-award');
    const minGwaInp = document.getElementById('as-inp-min-gwa');
    const yearLevelInp = document.getElementById('as-inp-year-level');
    const courseInp = document.getElementById('as-inp-course');
    const requirementsInp = document.getElementById('as-inp-requirements');
    const renewalInp = document.getElementById('as-inp-renewal');
    const contactInp = document.getElementById('as-inp-contact');
    const stipendInp = document.getElementById('as-inp-stipend');

    if (errorEl) errorEl.style.display = 'none';

    if (mode === 'edit' && row) {
      editingRow = row;
      titleEl.textContent  = 'Edit Scholarship Program';
      nameInp.value        = row.dataset.name   || '';
      typeInp.value        = row.dataset.type   || '';
      statusInp.value      = row.dataset.status || 'draft';
      slotsInp.value       = row.dataset.slots  || '';
      deadInp.value        = row.dataset.deadline || '';
      descInp.value        = row.dataset.desc   || '';
      if (sponsorInp) sponsorInp.value = row.dataset.sponsor || '';
      if (awardInp) awardInp.value = row.dataset.award || '';
      if (minGwaInp) minGwaInp.value = row.dataset.minGwa || '';
      if (yearLevelInp) yearLevelInp.value = row.dataset.yearLevel || '';
      if (courseInp) courseInp.value = row.dataset.course || '';
      if (requirementsInp) requirementsInp.value = row.dataset.requirements || '';
      if (renewalInp) renewalInp.value = row.dataset.renewal || '';
      if (contactInp) contactInp.value = row.dataset.contact || '';
      if (stipendInp) stipendInp.value = row.dataset.monthlyStipend || '';
    } else {
      editingRow = null;
      titleEl.textContent = 'New Scholarship Program';
      nameInp.value = typeInp.value = statusInp.value = slotsInp.value = deadInp.value = descInp.value = '';
      [sponsorInp, awardInp, minGwaInp, yearLevelInp, courseInp, requirementsInp, renewalInp, contactInp, stipendInp].forEach(input => {
        if (input) input.value = '';
      });
    }

    modal.style.display = 'flex';
    nameInp.focus();
  }

  function closeModal() {
    modal.style.display = 'none';
    editingRow = null;
  }

  /* ── Open / close ── */
  if (btnNew) btnNew.addEventListener('click', () => openModal('new'));
  document.getElementById('as-modal-close').addEventListener('click', closeModal);
  document.getElementById('as-modal-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  /* ── Save ── */
  document.getElementById('as-modal-save').addEventListener('click', () => {
    const name   = document.getElementById('as-inp-name').value.trim();
    const type   = document.getElementById('as-inp-type').value;
    const status = document.getElementById('as-inp-status').value;
    const errorEl  = document.getElementById('as-form-error');
    const errorMsg = document.getElementById('as-form-error-msg');

    if (!name || !type) {
      errorMsg.textContent = 'Program Name and Scholarship Type are required.';
      errorEl.style.display = 'flex';
      return;
    }
    errorEl.style.display = 'none';

    if (editingRow) {
      editingRow.dataset.name   = name;
      editingRow.dataset.type   = type;
      editingRow.dataset.status = status;
      editingRow.dataset.sponsor = document.getElementById('as-inp-sponsor')?.value.trim() || '';
      editingRow.dataset.award = document.getElementById('as-inp-award')?.value.trim() || '';
      editingRow.dataset.minGwa = document.getElementById('as-inp-min-gwa')?.value.trim() || '';
      editingRow.dataset.yearLevel = document.getElementById('as-inp-year-level')?.value.trim() || '';
      editingRow.dataset.course = document.getElementById('as-inp-course')?.value.trim() || '';
      editingRow.dataset.requirements = document.getElementById('as-inp-requirements')?.value.trim() || '';
      editingRow.dataset.renewal = document.getElementById('as-inp-renewal')?.value.trim() || '';
      editingRow.dataset.contact = document.getElementById('as-inp-contact')?.value.trim() || '';
      editingRow.dataset.monthlyStipend = document.getElementById('as-inp-stipend')?.value.trim() || '';
      editingRow.querySelector('.as-sc-name').textContent = name;
      const badge = editingRow.querySelector('.as-badge');
      badge.className = 'as-badge ' + status;
      badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      showToast('Scholarship updated successfully.', 'bi-check-circle-fill');
    } else {
      showToast('Scholarship program saved!', 'bi-check-circle-fill');
    }

    closeModal();
  });

  /* ── Row buttons (event delegation for dynamic content) ── */
  const asTbody = document.getElementById('as-tbody') || document.querySelector('.as-table tbody');
  if (asTbody) {
    asTbody.addEventListener('click', function(e) {
      var btn = e.target.closest('.as-action-btn');
      if (!btn) return;
      var row = btn.closest('tr');
      if (btn.classList.contains('edit'))    { openModal('edit', row); }
      else if (btn.classList.contains('del')) {
        deletingRow = row;
        const delNameEl = document.getElementById('as-del-name');
        if (delNameEl) delNameEl.textContent = row ? (row.querySelector('.as-sc-name') || {}).textContent || 'this scholarship' : 'this scholarship';
        if (delModal) delModal.style.display = 'flex';
      }
    });
  }

  /* ── Delete state (opened via event delegation above) ── */
  let deletingRow = null;

  document.getElementById('as-del-cancel').addEventListener('click', () => {
    delModal.style.display = 'none';
    deletingRow = null;
  });

  document.getElementById('as-del-confirm').addEventListener('click', () => {
    if (deletingRow) { deletingRow.remove(); deletingRow = null; }
    delModal.style.display = 'none';
    showToast('Scholarship deleted.', 'bi-trash-fill');
  });

  delModal.addEventListener('click', e => {
    if (e.target === delModal) { delModal.style.display = 'none'; deletingRow = null; }
  });
}

/* ══════════════════════════════════════════════════════
   ADMIN REPORTS  (html/adminreport.html)
══════════════════════════════════════════════════════ */
function initAdminReports() {
  const chartWrap = document.getElementById('rpt-forecast-chart');
  if (!chartWrap) return;

  const FORECAST_DATA = {
    '2025-2026': [
      { month: 'Jan', value: 2.4 },
      { month: 'Feb', value: 3.8 },
      { month: 'Mar', value: 5.1 },
      { month: 'Apr', value: 4.2 },
      { month: 'May', value: 5.8 },
      { month: 'Jun', value: 4.9 },
    ],
    '2024-2025': [
      { month: 'Jan', value: 1.9 },
      { month: 'Feb', value: 3.2 },
      { month: 'Mar', value: 4.6 },
      { month: 'Apr', value: 3.5 },
      { month: 'May', value: 4.8 },
      { month: 'Jun', value: 4.1 },
    ],
    '2023-2024': [
      { month: 'Jan', value: 1.5 },
      { month: 'Feb', value: 2.7 },
      { month: 'Mar', value: 3.9 },
      { month: 'Apr', value: 3.1 },
      { month: 'May', value: 4.0 },
      { month: 'Jun', value: 3.5 },
    ],
  };

  function drawChart(ayKey) {
    const data = FORECAST_DATA[ayKey] || FORECAST_DATA['2025-2026'];
    const W    = chartWrap.clientWidth || 380;
    const H    = 165;
    const padL = 42, padR = 18, padT = 14, padB = 34;
    const cW   = W - padL - padR;
    const cH   = H - padT - padB;

    const maxV  = Math.ceil(Math.max(...data.map(d => d.value)));
    const ticks = [0, Math.round(maxV * 0.25 * 2) / 2, Math.round(maxV * 0.5 * 2) / 2, Math.round(maxV * 0.75 * 2) / 2, maxV];

    const px = i => (i / (data.length - 1)) * cW;
    const py = v => cH - (v / maxV) * cH;
    const pts = data.map((d, i) => [px(i), py(d.value)]);

    /* smooth cubic bezier path */
    const line = pts.map(([x, y], i) => {
      if (i === 0) return `M ${x},${y}`;
      const [px0, py0] = pts[i - 1];
      const cpx = (px0 + x) / 2;
      return `C ${cpx},${py0} ${cpx},${y} ${x},${y}`;
    }).join(' ');

    const area = line + ` L ${pts[pts.length - 1][0]},${cH} L 0,${cH} Z`;

    const gridLines = ticks.map(v => {
      const y = py(v);
      return `<line x1="0" y1="${y.toFixed(1)}" x2="${cW}" y2="${y.toFixed(1)}" stroke="#EBEBEB" stroke-width="1"/>
              <text x="-7" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#B8B8B8" font-size="9.5" font-family="Roboto,sans-serif">${v}M</text>`;
    }).join('');

    const xLabels = data.map((d, i) =>
      `<text x="${px(i).toFixed(1)}" y="${cH + 22}" text-anchor="middle" fill="#999" font-size="11" font-family="Roboto,sans-serif">${d.month}</text>`
    ).join('');

    const dots = pts.map(([x, y], i) => `
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#00ACC1" stroke="#fff" stroke-width="2.5"/>
      <title>\u20B1${data[i].value}M</title>`
    ).join('');

    chartWrap.innerHTML = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#00ACC1" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#00ACC1" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <g transform="translate(${padL},${padT})">
        ${gridLines}
        <path d="${area}" fill="url(#fGrad)"/>
        <path d="${line}" fill="none" stroke="#00ACC1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
        ${xLabels}
      </g>
    </svg>`;
  }

  /* initial render + re-render on AY change */
  const aySelect = document.getElementById('rpt-ay');
  const titleEl  = document.getElementById('rpt-forecast-title');

  function update() {
    const ay = aySelect ? aySelect.value : '2025-2026';
    const yr  = ay.split('-')[0];
    if (titleEl) titleEl.textContent = `Disbursement Forecast (AY ${yr})`;
    drawChart(ay);
  }

  if (aySelect) aySelect.addEventListener('change', update);
  update();

  /* re-render on resize */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(update, 120);
  });

  /* Generate Full Report button */
  const genBtn = document.getElementById('rpt-gen-btn');
  if (genBtn) genBtn.addEventListener('click', () => {
    genBtn.disabled = true;
    genBtn.innerHTML = '<div class="toh-spinner" style="width:14px;height:14px;border-width:2px;"></div> Generating…';
    setTimeout(() => {
      genBtn.disabled = false;
      genBtn.innerHTML = '<i class="bi bi-file-earmark-arrow-down-fill"></i> Generate Full Report';
      showToast('Report generated! Download started.', 'bi-file-earmark-arrow-down-fill');
    }, 1600);
  });
}

/* ══════════════════════════════════════════════════════
   ADMIN STUDENTS  (html/adminstudents.html)
══════════════════════════════════════════════════════ */
function initAdminStudents() {
  /* All Firestore logic, row rendering, search/filter, and modal population
     are handled by the adminstudents.js ES module. This function only wires
     up static modal close elements that are safe to double-bind. */
  if (!document.getElementById('stu-tbody')) return;

  const modal      = document.getElementById('stu-modal');
  const resetModal = document.getElementById('stu-reset-modal');

  if (modal) {
    document.getElementById('stu-modal-x')?.addEventListener('click', () => { modal.style.display = 'none'; });
    document.getElementById('stu-modal-close')?.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
  }

  if (resetModal) {
    document.getElementById('stu-reset-cancel')?.addEventListener('click', () => { resetModal.style.display = 'none'; });
    resetModal.addEventListener('click', e => { if (e.target === resetModal) resetModal.style.display = 'none'; });
  }
}

/* ══════════════════════════════════════════════════════
   ADMIN APPLICATIONS  (html/adminapplications.html)
══════════════════════════════════════════════════════ */
function initAdminApplications() {
  const tbody = document.getElementById('apl-tbody');
  if (!tbody) return;

  const searchInput = document.getElementById('apl-search');
  const scFilter    = document.getElementById('apl-filter-sc');
  const tabs        = document.querySelectorAll('.apl-tab');
  const emptyState  = document.getElementById('apl-empty');
  let activeFilter  = 'all';

  function applyFilters() {
    const q   = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const sc  = scFilter    ? scFilter.value : '';
    const rows = tbody.querySelectorAll('tr');
    let visible = 0;

    rows.forEach(row => {
      const status = row.dataset.status || '';
      const rowSc  = row.dataset.sc     || '';
      const name   = (row.dataset.name  || '').toLowerCase();
      const refEl  = row.querySelector('.apl-ref');
      const ref    = refEl ? refEl.textContent.toLowerCase() : '';

      const matchTab = activeFilter === 'all' || status === activeFilter;
      const matchSc  = !sc   || rowSc.toLowerCase().includes(sc.toLowerCase());
      const matchQ   = !q    || name.includes(q) || ref.includes(q);

      if (matchTab && matchSc && matchQ) { row.style.display = ''; visible++; }
      else                              { row.style.display = 'none'; }
    });

    if (emptyState) emptyState.style.display = visible === 0 ? 'block' : 'none';
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      applyFilters();
    });
  });

  if (searchInput) searchInput.addEventListener('input',  applyFilters);
  if (scFilter)    scFilter.addEventListener('change', applyFilters);
}

/* ══════════════════════════════════════════════════════
   ADMIN RENEWALS  (html/adminrenewal.html)
══════════════════════════════════════════════════════ */
function initAdminRenewals() {
  const tbody = document.getElementById('rnl-tbody');
  if (!tbody) return;

  let activeRow = null;

  /* ── Table filter + search ── */
  const tabs    = document.querySelectorAll('.rnl-tab');
  const search  = document.getElementById('rnl-search');
  const scFilt  = document.getElementById('rnl-filter-sc');
  const empty   = document.getElementById('rnl-empty');
  let activeFilter = 'all';

  function applyFilters() {
    const q  = search.value.toLowerCase().trim();
    const sc = scFilt.value.toLowerCase();
    const rows = tbody.querySelectorAll('tr');
    let vis = 0;
    rows.forEach(row => {
      const status  = row.dataset.status || '';
      const rowSc   = (row.dataset.sc   || '').toLowerCase();
      const name    = (row.dataset.name || '').toLowerCase();
      const matchTab = activeFilter === 'all' || status === activeFilter;
      const matchSc  = !sc || rowSc.includes(sc);
      const matchQ   = !q  || name.includes(q);
      const show = matchTab && matchSc && matchQ;
      row.style.display = show ? '' : 'none';
      if (show) vis++;
    });
    empty.style.display = vis === 0 ? 'flex' : 'none';
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      applyFilters();
    });
  });
  search.addEventListener('input', applyFilters);
  scFilt.addEventListener('change', applyFilters);

  /* ── Modal ── */
  const modal = document.getElementById('rnl-modal');

  function escHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  const PREVIEW_FILE_DB = 'scholarsconnect-preview-files';
  const PREVIEW_FILE_STORE = 'files';

  function openPreviewFileDbRead() {
    return new Promise(function(resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const request = indexedDB.open(PREVIEW_FILE_DB, 1);
      request.onupgradeneeded = function(event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(PREVIEW_FILE_STORE)) {
          db.createObjectStore(PREVIEW_FILE_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = function(event) { resolve(event.target.result); };
      request.onerror = function() { reject(request.error || new Error('Could not open preview file database')); };
    });
  }

  function getPreviewFileRecord(previewId) {
    return openPreviewFileDbRead().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(PREVIEW_FILE_STORE, 'readonly');
        const request = tx.objectStore(PREVIEW_FILE_STORE).get(previewId);
        request.onsuccess = function() {
          const record = request.result || null;
          db.close();
          resolve(record);
        };
        request.onerror = function() {
          const error = request.error || new Error('Could not read preview preview file');
          db.close();
          reject(error);
        };
      });
    });
  }

  let renewalPreviewObjectUrl = '';

  function ensureRenewalPreviewModal() {
    let overlay = document.getElementById('rnl-preview-modal');
    if (overlay) return overlay;

    document.body.insertAdjacentHTML('beforeend',
      '<div class="rnl-preview-overlay" id="rnl-preview-modal" aria-hidden="true">' +
        '<div class="rnl-preview-dialog" role="dialog" aria-modal="true" aria-label="Renewal document preview">' +
          '<div class="rnl-preview-head">' +
            '<div><span>Renewal Document</span><strong id="rnl-preview-title">Document Preview</strong><small id="rnl-preview-meta"></small></div>' +
            '<button type="button" id="rnl-preview-close" aria-label="Close preview"><i class="bi bi-x-lg"></i></button>' +
          '</div>' +
          '<div class="rnl-preview-body" id="rnl-preview-body"></div>' +
          '<div class="rnl-preview-footer">' +
            '<a class="rnl-preview-open" id="rnl-preview-open" href="#" target="_blank" rel="noopener noreferrer"><i class="bi bi-box-arrow-up-right"></i> Open in new tab</a>' +
            '<button type="button" class="rnl-cancel-btn" id="rnl-preview-close-foot">Close</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    overlay = document.getElementById('rnl-preview-modal');
    document.getElementById('rnl-preview-close').addEventListener('click', closeRenewalPreviewModal);
    document.getElementById('rnl-preview-close-foot').addEventListener('click', closeRenewalPreviewModal);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeRenewalPreviewModal();
    });
    return overlay;
  }

  function closeRenewalPreviewModal() {
    const overlay = document.getElementById('rnl-preview-modal');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    const body = document.getElementById('rnl-preview-body');
    const openLink = document.getElementById('rnl-preview-open');
    if (body) body.innerHTML = '';
    if (openLink) openLink.removeAttribute('href');
    if (renewalPreviewObjectUrl) {
      URL.revokeObjectURL(renewalPreviewObjectUrl);
      renewalPreviewObjectUrl = '';
    }
  }

  function setRenewalPreviewLoading(title, meta) {
    const overlay = ensureRenewalPreviewModal();
    document.getElementById('rnl-preview-title').textContent = title || 'Document Preview';
    document.getElementById('rnl-preview-meta').textContent = meta || '';
    document.getElementById('rnl-preview-body').innerHTML =
      '<div class="rnl-preview-empty"><i class="bi bi-hourglass-split"></i><span>Loading preview...</span></div>';
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function renderRenewalPreview(title, meta, url, type, filename) {
    const overlay = ensureRenewalPreviewModal();
    const body = document.getElementById('rnl-preview-body');
    const openLink = document.getElementById('rnl-preview-open');
    const lowerName = String(filename || '').toLowerCase();
    const fileType = String(type || '').toLowerCase();
    const isImage = fileType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(lowerName);

    /* For base64 PDF data-URLs, browsers block data: in iframes — convert to blob URL */
    let displayUrl = url;
    if (!isImage && url.startsWith('data:')) {
      try {
        const parts  = url.split(',');
        const mime   = parts[0].match(/:(.*?);/)[1];
        const binary = atob(parts[1]);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        if (renewalPreviewObjectUrl) URL.revokeObjectURL(renewalPreviewObjectUrl);
        renewalPreviewObjectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        displayUrl = renewalPreviewObjectUrl;
      } catch (e) { /* fall through — try original url */ }
    }

    document.getElementById('rnl-preview-title').textContent = title || 'Document Preview';
    document.getElementById('rnl-preview-meta').textContent = meta || '';
    if (openLink) openLink.href = displayUrl;
    if (body) {
      body.innerHTML = isImage
        ? '<img src="' + escHtml(url) + '" alt="' + escHtml(filename || title || 'Document') + '" style="max-width:100%;border-radius:6px">'
        : '<iframe src="' + escHtml(displayUrl) + '" title="' + escHtml(filename || title || 'Document') + '"></iframe>';
    }
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function openPreviewRenewalPreview(previewId, title, filename) {
    setRenewalPreviewLoading(title, filename);

    /* Try Firestore first (new submissions), fall back to IndexedDB (old preview submissions) */
    var fetchPromise = window.getFirestoreFile
      ? window.getFirestoreFile(previewId)
      : getPreviewFileRecord(previewId).then(function(r) {
          if (!r) return null;
          return { data: null, blob: r.blob, type: r.type, name: r.name };
        });

    fetchPromise.then(function(record) {
      if (!record) {
        /* Nothing found — fall back to IndexedDB for old submissions */
        return getPreviewFileRecord(previewId).then(function(old) {
          if (!old || !old.blob) {
            document.getElementById('rnl-preview-body').innerHTML =
              '<div class="rnl-preview-empty" style="gap:12px">' +
              '<i class="bi bi-file-earmark" style="font-size:40px;color:#ccc"></i>' +
              '<strong style="font-size:14px;color:#333">' + escHtml(filename || title || 'File') + '</strong>' +
              '<span style="font-size:13px;color:#888;max-width:340px;text-align:center">Preview not available for this older submission.<br>You can still approve or reject based on the submitted information.</span>' +
              '</div>';
            return;
          }
          if (renewalPreviewObjectUrl) URL.revokeObjectURL(renewalPreviewObjectUrl);
          renewalPreviewObjectUrl = URL.createObjectURL(old.blob);
          renderRenewalPreview(title || old.name, old.name || filename, renewalPreviewObjectUrl, old.type || '', old.name || filename);
        });
      }

      /* Firestore record found — display base64 data directly */
      renderRenewalPreview(
        title || record.name,
        record.name || filename || '',
        record.data,
        record.type || '',
        record.name || filename || ''
      );
    }).catch(function(err) {
      console.warn('Could not open renewal preview:', err);
      document.getElementById('rnl-preview-body').innerHTML =
        '<div class="rnl-preview-empty"><i class="bi bi-exclamation-circle"></i><span>Could not load preview.</span></div>';
    });
  }

  function canOpenRenewalDoc(url, isPreview) {
    return !!url && isPreview !== 'true' && !url.startsWith('preview-renewal://');
  }

  function renewalDocRow(label, icon, url, fileName, isPreview, previewId, required, fileType) {
    const canOpen = canOpenRenewalDoc(url || '', isPreview);
    const hasPreviewPreview = isPreview === 'true' && !!previewId;
    const hasRecordedFile = !!url || !!fileName || !!previewId;
    const badgeText = canOpen || hasPreviewPreview ? 'Uploaded' : hasRecordedFile ? 'Recorded' : required ? 'Missing' : 'Optional';
    const badgeStyle = canOpen || hasPreviewPreview
      ? 'background:#D1E7DD;color:#0F5132'
      : hasRecordedFile
        ? 'background:#FFF3CD;color:#856404'
        : required
          ? 'background:#F8D7DA;color:#842029'
          : 'background:#F0F0F0;color:#666';
    const action = canOpen
      ? '<button type="button" class="rnl-doc-action" data-renewal-url="' + escHtml(url) + '" data-renewal-title="' + escHtml(label) + '" data-renewal-filename="' + escHtml(fileName || label) + '" data-renewal-type="' + escHtml(fileType || '') + '"><i class="bi bi-eye-fill"></i> Review</button>'
      : hasPreviewPreview
        ? '<button type="button" class="rnl-doc-action" data-renewal-preview-id="' + escHtml(previewId) + '" data-renewal-title="' + escHtml(label) + '" data-renewal-filename="' + escHtml(fileName || label) + '"><i class="bi bi-eye-fill"></i> Review</button>'
        : hasRecordedFile
          ? '<span class="rnl-doc-action disabled" title="This file was submitted before document previews were supported. The student must re-submit to enable preview.">No preview</span>'
          : '<span class="rnl-doc-action disabled">No file</span>';

    return '<div class="rnl-doc-item">' +
      '<span class="rnl-doc-name"><i class="bi ' + icon + '" style="color:var(--red)"></i><span><strong>' + escHtml(label) + '</strong><small>' + escHtml(fileName || (hasRecordedFile ? label : 'No file submitted')) + '</small></span></span>' +
      '<span class="badge" style="' + badgeStyle + ';font-size:10px;padding:3px 8px;border-radius:12px">' + badgeText + '</span>' +
      action +
    '</div>';
  }

  function openModal(row, isPending) {
    activeRow = row;
    const d = row.dataset;
    document.getElementById('rm-title').textContent  = d.student + ' — Renewal Review';
    document.getElementById('rm-meta').innerHTML     =
      '<strong>' + d.ref + '</strong> &nbsp;|&nbsp; Submitted: ' + row.querySelector('.rnl-date').textContent +
      ' &nbsp;|&nbsp; <span class="rnl-badge ' + (isPending ? 'pending' : 'approved') + '">' + (isPending ? 'Pending' : 'Approved') + '</span>';
    document.getElementById('rm-sc').textContent       = d.sc;
    document.getElementById('rm-period').textContent   = d.period;
    document.getElementById('rm-gwa').textContent      = d.gwa;
    document.getElementById('rm-standing').textContent = d.standing;
    document.getElementById('rm-ref').textContent      = d.ref;
    const studentName = d.student || row.querySelector('.rnl-name')?.textContent || 'Student';
    const renewalRef = d.ref || '—';
    const renewalStatus = d.status || (isPending ? 'pending' : 'approved');
    document.getElementById('rm-title').textContent  = studentName + ' — Renewal Review';
    document.getElementById('rm-meta').innerHTML     =
      '<strong>' + escHtml(renewalRef) + '</strong> &nbsp;|&nbsp; Submitted: ' + escHtml(row.querySelector('.rnl-date')?.textContent || '—') +
      ' &nbsp;|&nbsp; <span class="rnl-badge ' + escHtml(renewalStatus) + '">' + escHtml(renewalStatus.charAt(0).toUpperCase() + renewalStatus.slice(1)) + '</span>';
    document.getElementById('rm-sc').textContent       = d.sc || '—';
    document.getElementById('rm-period').textContent   = d.period || '—';
    document.getElementById('rm-gwa').textContent      = d.gwa || '—';
    document.getElementById('rm-standing').textContent = d.standing || '—';
    document.getElementById('rm-ref').textContent      = renewalRef;
    document.getElementById('rm-notes').value          = '';

    const docsEl = document.getElementById('rm-docs');
    docsEl.innerHTML =
      renewalDocRow('Certificate of Registration (COR)', 'bi-file-earmark-pdf', d.corUrl, d.corName, d.corPreview, d.corPreviewId, true, d.corType) +
      renewalDocRow('Official Grade Report', 'bi-card-list', d.gradesUrl, d.gradesName, d.gradesPreview, d.gradesPreviewId, true, d.gradesType) +
      renewalDocRow('Additional Supporting Document', 'bi-paperclip', d.extraUrl, d.extraName, d.extraPreview, d.extraPreviewId, false, d.extraType);

    docsEl.querySelectorAll('[data-renewal-preview-id]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openPreviewRenewalPreview(btn.dataset.renewalPreviewId, btn.dataset.renewalTitle, btn.dataset.renewalFilename);
      });
    });

    docsEl.querySelectorAll('[data-renewal-url]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        renderRenewalPreview(btn.dataset.renewalTitle, btn.dataset.renewalFilename, btn.dataset.renewalUrl, btn.dataset.renewalType || '', btn.dataset.renewalFilename);
      });
    });

    const corReady = canOpenRenewalDoc(d.corUrl || '', d.corPreview) || (d.corPreview === 'true' && !!d.corPreviewId);
    const gradesReady = canOpenRenewalDoc(d.gradesUrl || '', d.gradesPreview) || (d.gradesPreview === 'true' && !!d.gradesPreviewId);
    const requiredDocsReady = corReady && gradesReady;

    const footer = document.getElementById('rnl-modal-footer');
    if (isPending) {
      const approveClass = requiredDocsReady ? 'rnl-approve-btn' : 'rnl-approve-btn is-disabled';
      footer.innerHTML =
        '<button class="rnl-cancel-btn" id="rnl-cancel-btn">Cancel</button>' +
        '<button class="rnl-reject-btn" id="rnl-reject-btn"><i class="bi bi-x-circle-fill"></i> Reject Renewal</button>' +
        '<button class="' + approveClass + '" id="rnl-approve-btn" type="button"><i class="bi bi-check-circle-fill"></i> Approve Renewal</button>';
      document.getElementById('rnl-cancel-btn').addEventListener('click', closeModal);
      document.getElementById('rnl-reject-btn').addEventListener('click', () => openConfirm('reject'));
      document.getElementById('rnl-approve-btn').addEventListener('click', () => {
        if (!requiredDocsReady) {
          showToast('COR and Official Grade Report must be reviewable before approval.', 'bi-exclamation-circle-fill');
          return;
        }
        openConfirm('approve');
      });
    } else {
      footer.innerHTML = '<button class="rnl-cancel-btn" id="rnl-cancel-btn">Close</button>';
      document.getElementById('rnl-cancel-btn').addEventListener('click', closeModal);
    }

    modal.style.display = 'flex';
  }

  function closeModal() { modal.style.display = 'none'; activeRow = null; }
  document.getElementById('rnl-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  tbody.addEventListener('click', function (e) {
    var btn = e.target.closest('.rnl-review-btn, .rnl-view-btn');
    if (!btn) return;
    openModal(btn.closest('tr'), btn.classList.contains('rnl-review-btn'));
  });

  /* ── Confirm modal ── */
  const confirmModal = document.getElementById('rnl-confirm-modal');

  function openConfirm(action) {
    const name = activeRow ? activeRow.dataset.student : 'this student';
    const cfg = action === 'approve'
      ? { icon: '✅', title: 'Approve Renewal?',
          body: 'This will approve the renewal for <strong>' + name + '</strong> and extend their scholarship for the selected period. The student will be notified.',
          btnTxt: '<i class="bi bi-check-circle-fill"></i> Approve', btnStyle: 'background:#198754;color:#fff;' }
      : { icon: '❌', title: 'Reject Renewal?',
          body: 'This will reject the renewal for <strong>' + name + '</strong>. The student will be notified and may submit an appeal.',
          btnTxt: '<i class="bi bi-x-circle-fill"></i> Reject', btnStyle: 'background:var(--red);color:#fff;' };

    document.getElementById('rc-icon').textContent    = cfg.icon;
    document.getElementById('rc-title').textContent   = cfg.title;
    document.getElementById('rc-body').innerHTML      = cfg.body;
    document.getElementById('rc-confirm').innerHTML   = cfg.btnTxt;
    document.getElementById('rc-confirm').style.cssText =
      cfg.btnStyle + 'border-radius:8px;padding:9px 22px;border:none;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;';
    confirmModal.style.display = 'flex';

    document.getElementById('rc-confirm').onclick = () => confirmAction(action);
  }

  document.getElementById('rc-cancel').addEventListener('click', () => { confirmModal.style.display = 'none'; });
  confirmModal.addEventListener('click', e => { if (e.target === confirmModal) confirmModal.style.display = 'none'; });

  function confirmAction(action) {
    confirmModal.style.display = 'none';
    const name = activeRow ? activeRow.dataset.student : 'Student';
    closeModal();
    if (action === 'approve') {
      showToast('Renewal approved for ' + name + '. Student notified.', 'bi-check-circle-fill');
    } else {
      showToast('Renewal rejected for ' + name + '. Student notified.', 'bi-x-circle-fill');
    }
  }
}

/* ══════════════════════════════════════════════════════
   ADMIN DISBURSEMENTS  (html/admindisbursement.html)
══════════════════════════════════════════════════════ */
function initAdminDisbursements() {
  const tbody = document.getElementById('dsb-tbody');
  if (!tbody) return;

  /* ── Filter + search ── */
  const tabs        = document.querySelectorAll('.dsb-tab');
  const searchInp   = document.getElementById('dsb-search');
  const scFilter    = document.getElementById('dsb-filter-sc');
  const monthFilter = document.getElementById('dsb-filter-month');
  const empty       = document.getElementById('dsb-empty');
  let activeFilter  = 'all';

  function applyFilters() {
    const q     = searchInp.value.toLowerCase().trim();
    const sc    = scFilter.value.toLowerCase();
    const month = monthFilter.value;
    const rows  = tbody.querySelectorAll('tr');
    let vis = 0;
    rows.forEach(row => {
      const status  = row.dataset.status || '';
      const rowSc   = (row.dataset.sc    || '').toLowerCase();
      const name    = (row.dataset.name  || '').toLowerCase();
      const rowMonth = row.dataset.month || '';
      const ref     = (row.querySelector('.dsb-ref')?.textContent || '').toLowerCase();
      const matchTab   = activeFilter === 'all' || status === activeFilter;
      const matchSc    = !sc    || rowSc.includes(sc);
      const matchMonth = !month || rowMonth === month;
      const matchQ     = !q    || name.includes(q) || ref.includes(q);
      const show = matchTab && matchSc && matchMonth && matchQ;
      row.style.display = show ? '' : 'none';
      if (show) vis++;
    });
    empty.style.display = vis === 0 ? 'flex' : 'none';
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      applyFilters();
    });
  });
  searchInp.addEventListener('input', applyFilters);
  scFilter.addEventListener('change', applyFilters);
  monthFilter.addEventListener('change', applyFilters);

  /* ── Select-all checkbox ── */
  const checkAll  = document.getElementById('dsb-check-all');
  const bulkBar   = document.getElementById('dsb-bulk-bar');
  const bulkCount = document.getElementById('dsb-bulk-count');

  function updateBulkBar() {
    const checked = Array.from(tbody.querySelectorAll('.dsb-row-chk:not([disabled]):checked'));
    if (checked.length > 0) {
      bulkCount.textContent = checked.length + ' scholar' + (checked.length > 1 ? 's' : '') + ' selected';
      bulkBar.style.display = 'flex';
    } else {
      bulkBar.style.display = 'none';
    }
  }

  checkAll.addEventListener('change', () => {
    tbody.querySelectorAll('.dsb-row-chk:not([disabled])').forEach(chk => {
      chk.checked = checkAll.checked;
    });
    updateBulkBar();
  });
  tbody.addEventListener('change', e => {
    if (e.target.classList.contains('dsb-row-chk')) updateBulkBar();
  });

  document.getElementById('dsb-bulk-cancel-btn').addEventListener('click', () => {
    tbody.querySelectorAll('.dsb-row-chk').forEach(chk => { chk.checked = false; });
    checkAll.checked = false;
    bulkBar.style.display = 'none';
  });

  document.getElementById('dsb-bulk-release-btn').addEventListener('click', () => {
    const checked = Array.from(tbody.querySelectorAll('.dsb-row-chk:not([disabled]):checked'));
    const count   = checked.length;
    tbody.querySelectorAll('.dsb-row-chk').forEach(chk => { chk.checked = false; });
    checkAll.checked = false;
    bulkBar.style.display = 'none';
    showToast(count + ' stipend release' + (count > 1 ? 's' : '') + ' processed successfully.', 'bi-send-fill');
  });

  /* ── Single release modal ── */
  const modal = document.getElementById('dsb-modal');

  function openReleaseModal(btn) {
    const d = btn.dataset;
    document.getElementById('dm-title').textContent = d.student + ' — Stipend Release';
    document.getElementById('dm-grid').innerHTML =
      '<div class="dsb-modal-item"><div class="dsb-modal-item-label">Scholar</div><div class="dsb-modal-item-value">' + d.student + '</div></div>' +
      '<div class="dsb-modal-item"><div class="dsb-modal-item-label">Scholarship</div><div class="dsb-modal-item-value">' + d.sc + '</div></div>' +
      '<div class="dsb-modal-item"><div class="dsb-modal-item-label">Period</div><div class="dsb-modal-item-value">' + d.period + '</div></div>' +
      '<div class="dsb-modal-item"><div class="dsb-modal-item-label">Amount</div><div class="dsb-modal-item-value dsb-val-amount">' + d.amount + '</div></div>' +
      '<div class="dsb-modal-item" style="grid-column:1/-1"><div class="dsb-modal-item-label">Reference No.</div><div class="dsb-modal-item-value" style="font-family:monospace;font-size:13px">' + d.ref + '</div></div>';
    document.getElementById('dm-notes').value = '';
    modal.style.display = 'flex';

    document.getElementById('dm-confirm').onclick = () => {
      modal.style.display = 'none';
      showToast('Stipend of ' + d.amount + ' released to ' + d.student + '.', 'bi-send-fill');
    };
  }

  function closeReleaseModal() { modal.style.display = 'none'; }
  document.getElementById('dsb-modal-close').addEventListener('click', closeReleaseModal);
  document.getElementById('dm-cancel').addEventListener('click', closeReleaseModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeReleaseModal(); });

  tbody.querySelectorAll('.dsb-release-btn').forEach(btn => {
    btn.addEventListener('click', () => openReleaseModal(btn));
  });

  /* ── Receipt buttons ── */
  tbody.querySelectorAll('.dsb-receipt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast('Receipt for ' + btn.dataset.ref + ' opened.', 'bi-receipt');
    });
  });

  /* ── Batch release modal ── */
  const batchModal = document.getElementById('dsb-batch-modal');

  document.getElementById('dsb-release-all-btn').addEventListener('click', () => {
    batchModal.style.display = 'flex';
  });

  function closeBatchModal() { batchModal.style.display = 'none'; }
  document.getElementById('dsb-batch-close').addEventListener('click', closeBatchModal);
  document.getElementById('bm-cancel').addEventListener('click', closeBatchModal);
  batchModal.addEventListener('click', e => { if (e.target === batchModal) closeBatchModal(); });

  document.getElementById('bm-confirm').addEventListener('click', () => {
    closeBatchModal();
    showToast('Batch release of \u20B148,000 processed for 8 scholars.', 'bi-cash-stack');
  });
}

/* ══════════════════════════════════════════════════════
   INIT ON DOM READY
══════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════
   ADMIN NOTIFICATION POPOVER
   Shared across all admin pages.
══════════════════════════════════════════════════════ */
function initAdminNotifPopover() {
  const bell    = document.getElementById('adminNotifBell');
  const popover = document.getElementById('adminNotificationPopover');
  const markAll = document.getElementById('adminNotifMarkAll');
  const count   = document.getElementById('adminNotifCount');
  const subtitle = document.getElementById('adminNotifSubtitle');
  if (!bell || !popover) return;

  let unread = document.querySelectorAll('.admin-notif-item.unread').length;

  function updateCount(n) {
    unread = n;
    if (count) count.textContent = n > 0 ? n : '';
    if (n === 0 && count) count.style.display = 'none';
    if (subtitle) subtitle.textContent = n > 0 ? n + ' unread alert' + (n > 1 ? 's' : '') : 'All caught up';
  }

  function openPopover() {
    popover.classList.add('open');
    bell.setAttribute('aria-expanded', 'true');
  }

  function closePopover() {
    popover.classList.remove('open');
    bell.setAttribute('aria-expanded', 'false');
  }

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popover.classList.contains('open')) closePopover();
    else openPopover();
  });

  document.addEventListener('click', (e) => {
    if (!popover.contains(e.target) && e.target !== bell) closePopover();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopover();
  });

  if (markAll) {
    markAll.addEventListener('click', () => {
      document.querySelectorAll('.admin-notif-item.unread').forEach(el => el.classList.remove('unread'));
      updateCount(0);
    });
  }

  document.querySelectorAll('[data-admin-notif]').forEach(item => {
    item.addEventListener('click', () => {
      if (item.classList.contains('unread')) {
        item.classList.remove('unread');
        updateCount(Math.max(0, unread - 1));
      }
    });
  });

  updateCount(unread);
}

/* ══════════════════════════════════════════════════════
   ADMIN TOAST HELPER
   For admin pages that show action feedback.
══════════════════════════════════════════════════════ */
function showAdminToast(msg, type) {
  let t = document.getElementById('admin-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'admin-toast';
    t.className = 'admin-toast';
    t.setAttribute('role', 'alert');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.className = 'admin-toast' + (type ? ' ' + type : '');
  t.innerHTML = '<i class="bi bi-check-circle-fill"></i> ' + msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3400);
}

document.addEventListener('DOMContentLoaded', () => {
  initTopbarScroll();
  animateCounters();
  initLogin();
  initOtp();
  initRegister();
  initStudent();
  initAdmin();
  initApplicationReview();
  initSecurityVerification();
  initAdminScholarships();
  initAdminReports();
  initAdminStudents();

  initAdminApplications();
  initAdminRenewals();
  initAdminDisbursements();

  // Global FAQ init (landing page)
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => toggleFaq(btn));
  });

  // Smooth scroll all anchor links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
    });
  });
});



