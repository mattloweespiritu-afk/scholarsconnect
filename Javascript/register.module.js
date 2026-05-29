import { auth, db, createUserWithEmailAndPassword, doc, setDoc, serverTimestamp } from '../Javascript/firebase.js';

window.doFirebaseRegister = async () => {
  const email   = document.getElementById('s1-email').value.trim();
  const pass    = document.getElementById('s1-pass').value;
  const fname   = document.getElementById('s1-fname').value.trim();
  const lname   = document.getElementById('s1-lname').value.trim();
  const name    = `${fname} ${lname}`.trim();
  const btn     = document.getElementById('submit-reg');
  const errWrap = document.getElementById('submit-error');
  const errMsg  = document.getElementById('submit-error-msg');

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, email, role: 'student', createdAt: serverTimestamp()
    });
    if (typeof showToast === 'function') showToast('Registration successful! Welcome to ScholarsConnect.');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = 'Submit Application';
    errWrap.style.display = 'flex';
    errMsg.textContent = err.code === 'auth/email-already-in-use'
      ? 'An account with this email already exists. Please log in instead.'
      : err.code === 'auth/weak-password'
      ? 'Password must be at least 6 characters.'
      : 'Registration failed: ' + err.message;
    errWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

