/* =========================================================
   ScholarsConnect Scholarship Appeal Script
   File: ESTECH/Javascript/appeal.js
========================================================= */
import { auth, db, storage, collection, addDoc, serverTimestamp, ref, uploadBytesResumable, getDownloadURL, onAuthStateChanged, query, where, getDocs } from "./firebase.js";
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";

var appealFile = null;
var currentProfile = null;
var rejectedAppId = '';
var rejectedScholarshipName = '';

function updateCharCount(ta) {
  var n = ta.value.length;
  var el = document.getElementById('char-counter');
  el.textContent = n + ' character' + (n !== 1 ? 's' : '') + (n < 100 ? ' (minimum 100)' : ' ?');
  el.className = 'char-counter' + (n === 0 ? '' : n < 100 ? ' warn' : ' ok');
}

function triggerUpload() { document.getElementById('fi-appeal').click(); }
function handleUpload(inp) {
  var f = inp.files[0]; if (!f) return;
  if (f.size > 5*1024*1024) { showToast('File too large. Max 5 MB.'); inp.value=''; return; }
  appealFile = f;
  var sz = f.size < 1024*1024 ? Math.round(f.size/1024)+' KB' : (f.size/1024/1024).toFixed(1)+' MB';
  document.getElementById('fsn-appeal').textContent = f.name;
  document.getElementById('fss-appeal').textContent = sz;
  document.getElementById('fsi-appeal').className = (f.type==='application/pdf' ? 'bi bi-file-earmark-pdf' : 'bi bi-image') + ' fs-icon';
  document.getElementById('dz-appeal').style.display = 'none';
  document.getElementById('fs-appeal').classList.add('show');
}
function removeUpload() {
  appealFile = null;
  document.getElementById('fi-appeal').value = '';
  document.getElementById('fs-appeal').classList.remove('show');
  document.getElementById('dz-appeal').style.display = '';
}

function submitAppeal() {
  var grounds = document.getElementById('inp-grounds').value;
  var letter  = document.getElementById('inp-letter').value.trim();
  var ok = true;

  document.getElementById('err-grounds').classList.remove('show');
  document.getElementById('err-letter').classList.remove('show');
  document.getElementById('inp-grounds').classList.remove('error');
  document.getElementById('inp-letter').classList.remove('error');

  if (!grounds) {
    document.getElementById('err-grounds').classList.add('show');
    document.getElementById('inp-grounds').classList.add('error');
    ok = false;
  }
  if (letter.length < 100) {
    document.getElementById('err-letter').classList.add('show');
    document.getElementById('inp-letter').classList.add('error');
    ok = false;
  }
  if (!ok) return;

  var uid = (auth.currentUser && auth.currentUser.uid) ||
            (currentProfile && currentProfile.uid) ||
            sessionStorage.getItem('sc_uid');
  if (!uid) { showToast('Please log in to submit your appeal.'); return; }

  var btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block"></div> Submitting…';

  function doUpload() {
    if (!appealFile) return Promise.resolve(null);
    var safeName = appealFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = 'appeals/' + uid + '/' + Date.now() + '_' + safeName;
    var storageRef = ref(storage, path);
    return new Promise(function(resolve, reject) {
      var task = uploadBytesResumable(storageRef, appealFile);
      task.on('state_changed', null, reject, function() {
        getDownloadURL(task.snapshot.ref).then(function(url) {
          resolve({ url: url, name: appealFile.name });
        }).catch(reject);
      });
    });
  }

  doUpload().then(function(fileResult) {
    var appealData = {
      userId: uid,
      applicantName: (currentProfile && currentProfile.displayName) || '',
      scholarshipName: rejectedScholarshipName || '',
      applicationId: rejectedAppId || '',
      grounds: grounds,
      letter: letter,
      status: 'pending',
      submittedAt: serverTimestamp()
    };
    if (fileResult) { appealData.fileURL = fileResult.url; appealData.fileName = fileResult.name; }
    return addDoc(collection(db, 'appeals'), appealData);
  }).then(function() {
    document.getElementById('form-card').style.display = 'none';
    var banner = document.querySelector('.rejected-banner');
    if (banner) banner.style.display = 'none';
    var sr = document.getElementById('successAppealRef');
    if (sr) sr.textContent = rejectedScholarshipName || 'your application';
    var idEl = document.getElementById('successAppealId');
    if (idEl) idEl.textContent = 'APL-' + Date.now().toString().slice(-8);
    document.getElementById('success-screen').classList.add('show');
    window.scrollTo({top:0, behavior:'smooth'});
  }).catch(function(err) {
    console.error('Appeal submission error:', err);
    showToast('Submission failed. Please try again.');
    btn.disabled = false;
    btn.innerHTML = 'Submit Appeal';
  });
}

function loadRejectedApplication() {
  onAuthStateChanged(auth, function(user) {
    if (!user) return;
    getDocs(query(collection(db, 'applications'), where('userId', '==', user.uid), where('status', '==', 'rejected')))
      .then(function(snap) {
        if (snap.empty) return;
        var d = snap.docs[0];
        var data = d.data();
        rejectedAppId = d.id;
        rejectedScholarshipName = data.scholarshipName || '';

        var nameEl = document.getElementById('appealScholarshipName');
        var refEl  = document.getElementById('appealRefNo');
        var datesEl = document.getElementById('appealDates');
        var reasonEl = document.getElementById('appealReason');

        if (nameEl) nameEl.textContent = rejectedScholarshipName || '—';
        if (refEl) refEl.textContent = data.refNumber || d.id.slice(0, 10).toUpperCase();

        var appliedDate = data.submittedAt
          ? (data.submittedAt.toDate ? data.submittedAt.toDate().toLocaleDateString('en-PH', {year:'numeric',month:'long',day:'numeric'}) : new Date(data.submittedAt).toLocaleDateString())
          : '—';
        var rejectedDate = data.rejectedAt
          ? (data.rejectedAt.toDate ? data.rejectedAt.toDate().toLocaleDateString('en-PH', {year:'numeric',month:'long',day:'numeric'}) : new Date(data.rejectedAt).toLocaleDateString())
          : '—';
        if (datesEl) datesEl.textContent = 'Applied: ' + appliedDate + '  \u25C6  Rejected: ' + rejectedDate;
        if (reasonEl) reasonEl.textContent = data.rejectionReason || data.remarks || 'See application details.';
      })
      .catch(function(e) { console.warn('Could not load rejected application:', e); });
  });
}

function showToast(msg) {
  var t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3000);
}

(function() {
  document.addEventListener('DOMContentLoaded', function() {
    initStudentLogout();
    loadRejectedApplication();
    loadStudentProfile().then(function(p) { if (p) currentProfile = p; });
    var toggle = document.getElementById('sidebarToggle');
    var overlay = document.getElementById('sidebarOverlay');
    if (toggle) toggle.addEventListener('click', function() { document.body.classList.toggle('sidebar-open'); });
    if (overlay) overlay.addEventListener('click', function() { document.body.classList.remove('sidebar-open'); });
    document.querySelectorAll('.sb-item').forEach(function(el) { el.addEventListener('click', function() { document.body.classList.remove('sidebar-open'); }); });
  });
  var backMain = document.getElementById('btn-back-main');
  if (backMain) backMain.addEventListener('click', function() { window.location.href = 'myapplication.html'; });
  var btnCancel = document.getElementById('btn-cancel');
  if (btnCancel) btnCancel.addEventListener('click', function() { window.location.href = 'myapplication.html'; });
  var btnHome = document.getElementById('btn-home');
  if (btnHome) btnHome.addEventListener('click', function() { window.location.href = 'myapplication.html'; });
  var btnSubmit = document.getElementById('btn-submit');
  if (btnSubmit) btnSubmit.addEventListener('click', submitAppeal);

  var dz = document.getElementById('dz-appeal');
  if (dz) dz.addEventListener('click', triggerUpload);
  var fi = document.getElementById('fi-appeal');
  if (fi) fi.addEventListener('change', function() { handleUpload(this); });
  var fsrm = document.getElementById('fsrm-appeal');
  if (fsrm) fsrm.addEventListener('click', removeUpload);

  var letter = document.getElementById('inp-letter');
  if (letter) letter.addEventListener('input', function() { updateCharCount(this); });
})();

