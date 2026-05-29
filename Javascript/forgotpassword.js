/* =========================================================
   ScholarsConnect Forgot Password Script
   Firebase sendPasswordResetEmail
========================================================= */
import { auth, sendPasswordResetEmail } from "./firebase.js";

document.addEventListener("DOMContentLoaded", function () {
  const emailInp      = document.getElementById("inp-email");
  const sendBtn       = document.getElementById("btn-send");
  const resendBtn     = document.getElementById("btn-resend");
  const tryDiffBtn    = document.getElementById("btn-try-different");

  if (emailInp)   emailInp.addEventListener("keydown", function (e) { if (e.key === "Enter") sendReset(); });
  if (sendBtn)    sendBtn.addEventListener("click", sendReset);
  if (resendBtn)  resendBtn.addEventListener("click", resendLink);
  if (tryDiffBtn) tryDiffBtn.addEventListener("click", resetToForm);
});

/* Reset to email input form — also used to undo BFCache restoration */
function resetToForm() {
  clearInterval(resendTimer);
  resendTimer = null;

  var stepReq  = getEl("step-request");
  var stepSent = getEl("step-sent");
  var inp      = getEl("inp-email");
  var btn      = getEl("btn-send");
  var label    = getEl("btn-send-label");

  if (stepSent) stepSent.classList.remove("active");
  if (stepReq)  stepReq.classList.add("active");
  if (btn)      btn.disabled = false;
  if (label)    label.textContent = "Send Reset Link";
  clearFieldError();
  if (inp) { inp.value = ""; inp.focus(); }
}

/* If browser restores this page from BFCache (back button), always reset to the form */
window.addEventListener("pageshow", function (e) {
  if (e.persisted) resetToForm();
});

/* ── Helpers ── */
function getEl(id) { return document.getElementById(id); }

function showFieldError(message) {
  const errBox = getEl("req-error");
  const errMsg = getEl("req-error-msg");
  const inp    = getEl("inp-email");
  if (errMsg) errMsg.textContent = message;
  if (errBox) errBox.classList.add("show");
  if (inp)    inp.classList.add("has-error");
}

function clearFieldError() {
  const errBox = getEl("req-error");
  const inp    = getEl("inp-email");
  if (errBox) errBox.classList.remove("show");
  if (inp)    inp.classList.remove("has-error");
}

/* ── Send Reset ── */
async function sendReset() {
  const email  = (getEl("inp-email") || {}).value || "";
  const btn    = getEl("btn-send");
  const label  = getEl("btn-send-label");

  clearFieldError();

  if (!email.trim()) {
    showFieldError("Please enter your email address.");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    showFieldError("Please enter a valid email address.");
    return;
  }

  if (btn)   btn.disabled = true;
  if (label) label.textContent = "Sending…";

  try {
    await sendPasswordResetEmail(auth, email.trim());
    showSentScreen(email.trim());
  } catch (err) {
    if (btn)   btn.disabled = false;
    if (label) label.textContent = "Send Reset Link";

    if (err.code === "auth/user-not-found") {
      showSentScreen(email.trim());
    } else if (err.code === "auth/network-request-failed") {
      showFieldError("Network error. Please check your connection.");
    } else {
      showFieldError("Failed to send reset link. Please try again.");
    }
  }
}

function showSentScreen(email) {
  const display   = getEl("sent-email-display");
  const stepReq   = getEl("step-request");
  const stepSent  = getEl("step-sent");

  if (display)  display.textContent = email;
  if (stepReq)  stepReq.classList.remove("active");
  if (stepSent) stepSent.classList.add("active");

  startResendCountdown();
}

/* ── Resend countdown ── */
var resendTimer = null;

function startResendCountdown() {
  clearInterval(resendTimer);
  var secs      = 60;
  var countEl   = getEl("resend-countdown");
  var noteEl    = getEl("resend-note");
  var resendBtn = getEl("btn-resend");

  if (resendBtn) resendBtn.disabled = true;
  if (countEl)   countEl.textContent = secs;
  if (noteEl)    noteEl.style.display = "";

  resendTimer = setInterval(function () {
    secs--;
    if (countEl) countEl.textContent = secs;
    if (secs <= 0) {
      clearInterval(resendTimer);
      resendTimer = null;
      if (resendBtn) resendBtn.disabled = false;
      if (noteEl)    noteEl.style.display = "none";
    }
  }, 1000);
}

async function resendLink() {
  const btn   = getEl("btn-resend");
  const email = (getEl("sent-email-display") || {}).textContent || "";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Sending…';
  }

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (_) {
    /* silently ignore — UX already shows confirmation */
  }

  if (btn) btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Resend Reset Link';
  startResendCountdown();
}
