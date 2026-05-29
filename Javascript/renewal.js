/* =========================================================
   ScholarsConnect Scholarship Renewal Script
   File: ESTECH/Javascript/renewal.js
========================================================= */
import { auth, db, collection, addDoc, doc, setDoc, serverTimestamp, onAuthStateChanged, query, where, getDocs } from "./firebase.js";
import { loadStudentProfile, initStudentLogout } from "./user-profile.js";

var files = {cor:null, grades:null, extra:null};
var currentStep = 1;
var currentProfile = null;
var approvedScholarshipName = '';
var FIRESTORE_SUBMIT_TIMEOUT_MS = 12000;

function makeRenewalRef() {
  return 'RNL-' + Date.now().toString().slice(-8);
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise(function(_resolve, reject) {
      setTimeout(function() { reject(new Error(message)); }, ms);
    })
  ]);
}

/* Compress an image file using canvas, then return a base64 data URL.
   PDFs and other non-images are read as-is. */
function compressToBase64(file) {
  return new Promise(function(resolve, reject) {
    if (!file.type.startsWith('image/')) {
      var reader = new FileReader();
      reader.onload  = function() { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }
    var img = new Image();
    var objectUrl = URL.createObjectURL(file);
    img.onload = function() {
      URL.revokeObjectURL(objectUrl);
      var canvas = document.createElement('canvas');
      var maxDim = 1280;
      var w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else        { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      var quality = 0.80;
      var dataUrl;
      do {
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        quality -= 0.10;
      } while (dataUrl.length > 700000 && quality > 0.20);
      resolve(dataUrl);
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

/* Store the file as base64 in the renewalFiles Firestore collection.
   Returns a result object compatible with applyFileResult. */
function uploadRenewalFile(file, key, uid) {
  if (!file) return Promise.resolve(null);
  var safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  var previewId = 'renewal-' + uid + '-' + key + '-' + Date.now() + '-' + safeName;

  return compressToBase64(file).then(function(base64Data) {
    if (base64Data.length > 950000) {
      throw new Error('"' + file.name + '" is too large even after compression. Please use a smaller file (under 700 KB).');
    }
    return setDoc(doc(db, 'renewalFiles', previewId), {
      previewId:  previewId,
      name:       file.name,
      type:       file.type || 'image/jpeg',
      data:       base64Data,
      uid:        uid,
      key:        key,
      createdAt:  serverTimestamp()
    });
  }).then(function() {
    return {
      url:       'firestore-file://' + previewId,
      previewId: previewId,
      path:      'renewalFiles/' + previewId,
      name:      file.name,
      size:      file.size,
      type:      file.type || '',
      preview:      true   /* keeps hasPreviewPreview=true so admin sees Review button */
    };
  });
}

function applyFileResult(data, key, result) {
  if (!result) return;
  var prefix = key === 'cor' ? 'cor' : key === 'grades' ? 'grades' : 'extra';
  data[prefix + 'URL'] = result.url;
  data[prefix + 'Name'] = result.name;
  data[prefix + 'Size'] = result.size || 0;
  data[prefix + 'Type'] = result.type || '';
  data[prefix + 'Path'] = result.path || '';
  data[prefix + 'PreviewId'] = result.previewId || '';
  data[prefix + 'PreviewFile'] = !!result.preview;
}

function goStep(n) {
  document.getElementById('step-' + currentStep).classList.remove('active');
  document.getElementById('step-' + n).classList.add('active');
  [1,2,3].forEach(function(i) {
    var si = document.getElementById('si-' + i);
    var sc = document.getElementById('sc-' + i);
    si.className = 'step-item';
    sc.innerHTML = i;
    if (i < n) { si.classList.add('done'); sc.innerHTML = '<i class="bi bi-check" style="font-size:13px"></i>'; }
    else if (i === n) { si.classList.add('active'); }
  });
  currentStep = n;
  window.scrollTo({top:0, behavior:'smooth'});
}

function goStep2() {
  var year = document.getElementById('inp-year').value;
  var units = document.getElementById('inp-units').value;
  var gwa = parseFloat(document.getElementById('inp-gwa').value);
  var standing = document.getElementById('inp-standing').value;
  var ok = true;
  ['err-year','err-units','err-gwa','err-standing'].forEach(function(id){ document.getElementById(id).classList.remove('show'); });
  document.querySelectorAll('.form-input.error,.form-select.error').forEach(function(el){ el.classList.remove('error'); });
  if (!year) { document.getElementById('err-year').classList.add('show'); document.getElementById('inp-year').classList.add('error'); ok=false; }
  if (!units||units<1) { document.getElementById('err-units').classList.add('show'); document.getElementById('inp-units').classList.add('error'); ok=false; }
  if (isNaN(gwa)||gwa<70||gwa>100) { document.getElementById('err-gwa').classList.add('show'); document.getElementById('inp-gwa').classList.add('error'); ok=false; }
  if (!standing) { document.getElementById('err-standing').classList.add('show'); document.getElementById('inp-standing').classList.add('error'); ok=false; }
  if (ok) goStep(2);
}

function goStep3() {
  var ok = true;
  ['err-cor','err-grades'].forEach(function(id){ document.getElementById(id).classList.remove('show'); });
  if (!files.cor) { document.getElementById('err-cor').classList.add('show'); ok=false; }
  if (!files.grades) { document.getElementById('err-grades').classList.add('show'); ok=false; }
  if (!ok) return;

  var yMap={'1':'1st Year','2':'2nd Year','3':'3rd Year','4':'4th Year','5':'5th Year'};
  var sMap={'dean':"Dean's List",'good':'Good Standing','warning':'Academic Warning'};
  var y=document.getElementById('inp-year').value, g=document.getElementById('inp-gwa').value;
  var s=document.getElementById('inp-standing').value, u=document.getElementById('inp-units').value;
  var docRows='';
  if(files.cor)    docRows+='<div class="sum-row"><span class="sum-label">COR</span><span class="sum-value"><i class="bi bi-check-circle-fill"></i>'+files.cor.name+'</span></div>';
  if(files.grades) docRows+='<div class="sum-row"><span class="sum-label">Grade Report</span><span class="sum-value"><i class="bi bi-check-circle-fill"></i>'+files.grades.name+'</span></div>';
  if(files.extra)  docRows+='<div class="sum-row"><span class="sum-label">Additional</span><span class="sum-value"><i class="bi bi-check-circle-fill"></i>'+files.extra.name+'</span></div>';
  document.getElementById('summary-card').innerHTML=
    '<div class="sum-row"><span class="sum-label">Scholarship</span><span class="sum-value">'+(approvedScholarshipName||'—')+'</span></div>'+
    '<div class="sum-row"><span class="sum-label">Renewal Period</span><span class="sum-value">AY 2026\u25C62027, 1st Semester</span></div>'+
    '<div class="sum-row"><span class="sum-label">Year Level</span><span class="sum-value">'+(yMap[y]||y)+'</span></div>'+
    '<div class="sum-row"><span class="sum-label">Units Enrolled</span><span class="sum-value">'+u+' units</span></div>'+
    '<div class="sum-row"><span class="sum-label">Current GWA</span><span class="sum-value">'+parseFloat(g).toFixed(2)+'</span></div>'+
    '<div class="sum-row"><span class="sum-label">Academic Standing</span><span class="sum-value">'+(sMap[s]||s)+'</span></div>'+docRows;
  goStep(3);
}

function submitRenewal() {
  var btn = document.getElementById('btn-submit');
  if (!btn || btn.dataset.submitting === 'true') return;

  var c1 = document.getElementById('chk-1').checked, c2 = document.getElementById('chk-2').checked;
  if (!c1 || !c2) { document.getElementById('err-pledge').classList.add('show'); return; }
  document.getElementById('err-pledge').classList.remove('show');

  var uid = (auth.currentUser && auth.currentUser.uid) ||
            (currentProfile && currentProfile.uid) ||
            sessionStorage.getItem('sc_uid');
  if (!uid) { showToast('Please log in to submit your renewal.'); return; }

  var renewalRef = makeRenewalRef();
  btn.disabled = true;
  btn.dataset.submitting = 'true';
  btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block"></div> Submitting…';

  var y = document.getElementById('inp-year').value;
  var g = document.getElementById('inp-gwa').value;
  var s = document.getElementById('inp-standing').value;
  var u = document.getElementById('inp-units').value;
  var yMap = {'1':'1st Year','2':'2nd Year','3':'3rd Year','4':'4th Year','5':'5th Year'};
  var sMap = {'dean':"Dean's List",'good':'Good Standing','warning':'Academic Warning'};

  Promise.all([
    uploadRenewalFile(files.cor, 'cor', uid),
    uploadRenewalFile(files.grades, 'grades', uid),
    uploadRenewalFile(files.extra, 'extra', uid)
  ]).then(function(results) {
    var renewalData = {
      userId: uid,
      applicantName: (currentProfile && currentProfile.displayName) || '',
      studentId: (currentProfile && (currentProfile.studentId || currentProfile.schoolId)) || '',
      scholarshipName: approvedScholarshipName || '',
      refNumber: renewalRef,
      academicYear: 'AY 2026-2027',
      semester: '1st Semester',
      yearLevel: yMap[y] || y,
      unitsEnrolled: parseInt(u, 10),
      gwa: parseFloat(parseFloat(g).toFixed(2)),
      academicStanding: sMap[s] || s,
      status: 'pending',
      storageMode: 'firestore',
      submittedAt: serverTimestamp()
    };
    applyFileResult(renewalData, 'cor', results[0]);
    applyFileResult(renewalData, 'grades', results[1]);
    applyFileResult(renewalData, 'extra', results[2]);
    return withTimeout(
      addDoc(collection(db, 'renewals'), renewalData),
      FIRESTORE_SUBMIT_TIMEOUT_MS,
      'Renewal save timed out'
    );
  }).then(function() {
    [1,2,3].forEach(function(i) { document.getElementById('step-'+i).classList.remove('active'); });
    document.getElementById('stepper').style.display = 'none';
    var sr = document.getElementById('successScholarshipRef');
    if (sr) sr.textContent = approvedScholarshipName || 'your scholarship';
    var refEl = document.getElementById('successRenewalRef');
    if (refEl) refEl.textContent = renewalRef;
    document.getElementById('success-screen').classList.add('show');
    window.scrollTo({top:0, behavior:'smooth'});
  }).catch(function(err) {
    console.error('Renewal submission error:', err);
    showToast(err && err.message ? err.message : 'Submission failed. Please try again.');
    btn.disabled = false;
    delete btn.dataset.submitting;
    btn.innerHTML = 'Submit Renewal';
  });
}

function triggerUpload(key){ document.getElementById('fi-'+key).click(); }
function handleUpload(key,inp) {
  var f=inp.files[0]; if(!f) return;
  if(f.size>5*1024*1024){showToast('File too large. Max 5 MB.');inp.value='';return;}
  files[key]=f;
  var sz=f.size<1024*1024?Math.round(f.size/1024)+' KB':(f.size/1024/1024).toFixed(1)+' MB';
  document.getElementById('fsn-'+key).textContent=f.name;
  document.getElementById('fss-'+key).textContent=sz;
  document.getElementById('fsi-'+key).className=(f.type==='application/pdf'?'bi bi-file-earmark-pdf':'bi bi-image')+' fs-icon';
  document.getElementById('dz-'+key).style.display='none';
  document.getElementById('fs-'+key).classList.add('show');
  var e=document.getElementById('err-'+key); if(e) e.classList.remove('show');
}
function removeUpload(key) {
  files[key]=null; document.getElementById('fi-'+key).value='';
  document.getElementById('fs-'+key).classList.remove('show');
  document.getElementById('dz-'+key).style.display='';
}
function loadApprovedScholarship() {
  onAuthStateChanged(auth, function(user) {
    if (!user) return;
    getDocs(query(collection(db, 'applications'), where('userId', '==', user.uid), where('status', '==', 'approved')))
      .then(function(snap) {
        if (snap.empty) return;
        var data = snap.docs[0].data();
        approvedScholarshipName = data.scholarshipName || '';
        var nameEl = document.getElementById('renewScholarshipName');
        var infoEl = document.getElementById('infoScholarshipValue');
        var pledgeEl = document.getElementById('pledgeScholarshipRef');
        if (nameEl) nameEl.textContent = approvedScholarshipName || 'Your Scholarship';
        if (infoEl) infoEl.textContent = approvedScholarshipName || '—';
        if (pledgeEl) pledgeEl.textContent = (approvedScholarshipName || 'scholarship') + ' scholar';
      })
      .catch(function(e) { console.warn('Could not load approved scholarship:', e); });
  });
}

function showToast(msg){ var t=document.getElementById('toast'); document.getElementById('toast-msg').textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show');},3000); }

(function() {
  document.addEventListener('DOMContentLoaded', function() {
    initStudentLogout();
    loadApprovedScholarship();
    loadStudentProfile().then(function(profile) {
      if (!profile) return;
      currentProfile = profile;
      var pn = document.getElementById('pledgeName');
      if (pn && profile.displayName) pn.textContent = profile.displayName;
      var gwaEl = document.getElementById('inp-gwa');
      if (gwaEl && !gwaEl.value && profile.gwa) gwaEl.value = profile.gwa;
      var yearEl = document.getElementById('inp-year');
      if (yearEl && !yearEl.value && profile.yearLevel) yearEl.value = profile.yearLevel;
    });
    var toggle = document.getElementById('sidebarToggle');
    var overlay = document.getElementById('sidebarOverlay');
    if (toggle) toggle.addEventListener('click', function() { document.body.classList.toggle('sidebar-open'); });
    if (overlay) overlay.addEventListener('click', function() { document.body.classList.remove('sidebar-open'); });
    document.querySelectorAll('.sb-item').forEach(function(el) { el.addEventListener('click', function() { document.body.classList.remove('sidebar-open'); }); });
  });
  var backMain = document.getElementById('btn-back-main');
  if (backMain) backMain.addEventListener('click', function() { window.location.href = 'myapplication.html'; });
  var btnHome = document.getElementById('btn-home');
  if (btnHome) btnHome.addEventListener('click', function() { window.location.href = 'myapplication.html'; });

  var s1n = document.getElementById('btn-step1-next');
  if (s1n) s1n.addEventListener('click', goStep2);
  var s2b = document.getElementById('btn-step2-back');
  if (s2b) s2b.addEventListener('click', function() { goStep(1); });
  var s2n = document.getElementById('btn-step2-next');
  if (s2n) s2n.addEventListener('click', goStep3);
  var s3b = document.getElementById('btn-step3-back');
  if (s3b) s3b.addEventListener('click', function() { goStep(2); });
  var btnSubmit = document.getElementById('btn-submit');
  if (btnSubmit) btnSubmit.addEventListener('click', submitRenewal);

  ['cor', 'grades', 'extra'].forEach(function(key) {
    var dz = document.getElementById('dz-' + key);
    if (dz) dz.addEventListener('click', function() { triggerUpload(key); });
    var fi = document.getElementById('fi-' + key);
    if (fi) fi.addEventListener('change', function() { handleUpload(key, this); });
    var fsrm = document.getElementById('fsrm-' + key);
    if (fsrm) fsrm.addEventListener('click', function(e) { e.stopPropagation(); removeUpload(key); });
  });
})();


