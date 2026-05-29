/* =========================================================
   ScholarsConnect Reset Password Script
   Handles Firebase oobCode from email reset link
========================================================= */
import { auth, verifyPasswordResetCode, confirmPasswordReset } from "./firebase.js";

var oobCode = null;

document.addEventListener("DOMContentLoaded", function () {
  var params = new URLSearchParams(window.location.search);
  var mode   = params.get("mode");
  oobCode    = params.get("oobCode");

  if (!oobCode || (mode && mode !== "resetPassword")) {
    showStep("invalid");
    return;
  }

  verifyLink();

  var submitBtn   = document.getElementById("rp-submit");
  var passwordInp = document.getElementById("rp-password");
  var confirmInp  = document.getElementById("rp-confirm");

  if (passwordInp) {
    passwordInp.addEventListener("input", updateStrength);
    passwordInp.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && confirmInp) confirmInp.focus();
    });
  }
  if (confirmInp) {
    confirmInp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleSubmit();
    });
  }
  if (submitBtn) submitBtn.addEventListener("click", handleSubmit);

  initToggle("rp-pw-toggle",      "rp-password", "rp-pw-icon");
  initToggle("rp-confirm-toggle", "rp-confirm",  "rp-confirm-icon");
});

/* ── Verify the oobCode with Firebase ── */
async function verifyLink() {
  try {
    var email   = await verifyPasswordResetCode(auth, oobCode);
    var emailEl = document.getElementById("rp-email");
    if (emailEl) emailEl.textContent = email;
    showStep("form");
  } catch (err) {
    var msgEl = document.getElementById("rp-invalid-msg");
    if (msgEl) {
      if (err.code === "auth/expired-action-code") {
        msgEl.textContent = "This reset link has expired. Please request a new one.";
      } else if (err.code === "auth/invalid-action-code") {
        msgEl.textContent = "This reset link is invalid or has already been used.";
      }
    }
    showStep("invalid");
  }
}

/* ── Submit new password ── */
async function handleSubmit() {
  var password = (document.getElementById("rp-password") || {}).value || "";
  var confirm  = (document.getElementById("rp-confirm")  || {}).value || "";
  var btn      = document.getElementById("rp-submit");
  var label    = document.getElementById("rp-submit-label");

  clearError();

  if (password.length < 8) {
    showError("Password must be at least 8 characters.");
    document.getElementById("rp-password").classList.add("has-error");
    return;
  }
  if (password !== confirm) {
    showError("Passwords do not match.");
    document.getElementById("rp-confirm").classList.add("has-error");
    return;
  }

  if (btn)   btn.disabled = true;
  if (label) label.textContent = "Updating…";

  try {
    await confirmPasswordReset(auth, oobCode, password);
    showStep("success");
  } catch (err) {
    if (btn)   btn.disabled = false;
    if (label) label.textContent = "Reset Password";

    if (err.code === "auth/expired-action-code") {
      showError("This reset link has expired. Please request a new one.");
    } else if (err.code === "auth/weak-password") {
      showError("Password is too weak. Use at least 8 characters with a mix of letters and numbers.");
    } else {
      showError("Failed to reset password. Please try again.");
    }
  }
}

/* ── Password strength indicator ── */
function updateStrength() {
  var pw    = (document.getElementById("rp-password") || {}).value || "";
  var bar   = document.getElementById("rp-strength-bar");
  var label = document.getElementById("rp-strength-label");
  if (!bar || !label) return;

  if (!pw) {
    bar.className   = "pw-strength-bar";
    label.textContent = "";
    label.className = "pw-strength-label";
    return;
  }

  var score = 0;
  if (pw.length >= 8)            score++;
  if (/[A-Z]/.test(pw))          score++;
  if (/[0-9]/.test(pw))          score++;
  if (/[^A-Za-z0-9]/.test(pw))   score++;

  if (score <= 1) {
    bar.className     = "pw-strength-bar weak";
    label.textContent = "Weak";
    label.className   = "pw-strength-label weak";
  } else if (score <= 2) {
    bar.className     = "pw-strength-bar fair";
    label.textContent = "Fair";
    label.className   = "pw-strength-label fair";
  } else {
    bar.className     = "pw-strength-bar strong";
    label.textContent = "Strong";
    label.className   = "pw-strength-label strong";
  }
}

/* ── Show / hide password toggle ── */
function initToggle(btnId, inputId, iconId) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener("click", function () {
    var input = document.getElementById(inputId);
    var icon  = document.getElementById(iconId);
    if (!input) return;
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    if (icon) icon.className = show ? "bi bi-eye-slash" : "bi bi-eye";
  });
}

/* ── UI helpers ── */
function showStep(name) {
  ["verifying", "form", "success", "invalid"].forEach(function (s) {
    var el = document.getElementById("step-" + s);
    if (el) el.classList.toggle("active", s === name);
  });
}

function showError(msg) {
  var box  = document.getElementById("rp-error");
  var span = document.getElementById("rp-error-msg");
  if (span) span.textContent = msg;
  if (box)  box.classList.add("show");
}

function clearError() {
  var box = document.getElementById("rp-error");
  if (box) box.classList.remove("show");
  ["rp-password", "rp-confirm"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove("has-error");
  });
}
