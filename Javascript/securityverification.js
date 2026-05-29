/*
 * Student Security Verification
 * Sends a 6-digit code to the student's registered email and verifies it
 * before granting access to the student dashboard.
 *
 * NOTE: This demo OTP is for capstone mockup only.
 * Replace with a real OTP service before production.
 */
import { auth, db, signOut, collection, addDoc, serverTimestamp } from "./firebase.js";
import { onAuthStateChanged } from "./firebase.js";

/* ── Demo mode ─────────────────────────────────────────────────
   This demo OTP is for capstone mockup only.
   Replace with a real OTP service before production.
────────────────────────────────────────────────────────────── */
const DEMO_OTP = "123456";

document.addEventListener("DOMContentLoaded", initStudentVerification);

function getEl(id) { return document.getElementById(id); }

function maskEmail(email) {
  if (!email || !email.includes("@")) return "your registered email";
  const [name, ...rest] = email.split("@");
  return name.slice(0, Math.min(3, name.length)) + "**@" + rest.join("@");
}

function showToast(msg, icon) {
  icon = icon || "bi-check-circle-fill";
  let toast = getEl("sv-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "sv-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = '<i class="bi ' + icon + '"></i> ' + msg;
  toast.classList.add("show");
  setTimeout(function () { toast.classList.remove("show"); }, 3200);
}

function setLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle("loading", on);
  btn.disabled = on;
}

function showErr(msg) {
  var el    = getEl("sv-error");
  var msgEl = getEl("sv-error-msg");
  if (msgEl) msgEl.textContent = msg;
  if (el) el.classList.add("show");
}

function hideErr() {
  var el = getEl("sv-error");
  if (el) el.classList.remove("show");
}

function initStudentVerification() {
  /* Confirm a student session exists */
  const email = sessionStorage.getItem("sc_email") || "";
  const role  = sessionStorage.getItem("sc_role")  || "";

  if (!email || role !== "student") {
    window.location.replace("login.html");
    return;
  }

  const emailEl = getEl("sv-otp-email");
  if (emailEl) emailEl.textContent = maskEmail(email);

  let otpSeconds  = 300;
  let otpInterval = null;
  let resendInt   = null;

  const timerEl   = getEl("sv-otp-timer");
  const verifyBtn = getEl("sv-verify-btn");
  const resendBtn = getEl("sv-resend-btn");
  const resendCd  = getEl("sv-resend-cd");
  const otpBoxes  = Array.from(document.querySelectorAll(".toh-otp-box"));

  /* ── Timer ── */
  function startTimer(seconds) {
    otpSeconds = Number(seconds || 300);
    clearInterval(otpInterval);
    if (verifyBtn) verifyBtn.disabled = false;

    function render() {
      var m = Math.floor(otpSeconds / 60);
      var s = otpSeconds % 60;
      if (timerEl) {
        timerEl.textContent = m + ":" + String(s).padStart(2, "0");
        timerEl.classList.toggle("urgent", otpSeconds <= 60);
      }
    }
    render();
    otpInterval = setInterval(function () {
      otpSeconds -= 1;
      render();
      if (otpSeconds <= 0) {
        clearInterval(otpInterval);
        if (timerEl) { timerEl.textContent = "Expired"; timerEl.classList.add("urgent"); }
        if (verifyBtn) verifyBtn.disabled = true;
        showErr("Code expired. Please request a new one.");
      }
    }, 1000);
  }

  /* ── Resend cooldown ── */
  function startResendCooldown(secs) {
    secs = secs || 60;
    clearInterval(resendInt);
    var left = secs;
    if (resendBtn) resendBtn.disabled = true;
    if (resendCd) resendCd.textContent = "(wait " + left + "s)";
    resendInt = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(resendInt);
        if (resendBtn) resendBtn.disabled = false;
        if (resendCd) resendCd.textContent = "";
      } else if (resendCd) {
        resendCd.textContent = "(wait " + left + "s)";
      }
    }, 1000);
  }

  /* ── Clear boxes ── */
  function resetBoxes() {
    otpBoxes.forEach(function (b) { b.value = ""; b.classList.remove("filled", "shake"); });
  }

  /* ── Shake animation ── */
  function shakeBoxes() {
    otpBoxes.forEach(function (b) {
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
      setTimeout(function () { b.classList.remove("shake"); }, 400);
    });
  }

  /* ── Send demo OTP ── */
  function sendDemoOtp() {
    sessionStorage.setItem("sc_demo_student_otp", DEMO_OTP);
    resetBoxes();
    startTimer(300);
    startResendCooldown(60);
    /* Show demo code in toast so capstone testing is easy */
    showToast("Demo code: " + DEMO_OTP, "bi-info-circle-fill");
  }

  /* ── Initial send on page load ── */
  sendDemoOtp();
  showToast("Verification code sent to your email.");

  /* ── OTP box interactions ── */
  otpBoxes.forEach(function (box, i) {
    box.addEventListener("input", function (e) {
      var v = e.target.value.replace(/\D/g, "");
      box.value = v ? v[v.length - 1] : "";
      box.classList.toggle("filled", box.value !== "");
      box.classList.remove("shake");
      hideErr();
      if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
    });

    box.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !box.value && i > 0) {
        otpBoxes[i - 1].value = "";
        otpBoxes[i - 1].classList.remove("filled");
        otpBoxes[i - 1].focus();
      }
      if (e.key === "ArrowLeft"  && i > 0)                   otpBoxes[i - 1].focus();
      if (e.key === "ArrowRight" && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
      if (e.key === "Enter" && verifyBtn) verifyBtn.click();
    });

    box.addEventListener("paste", function (e) {
      e.preventDefault();
      var pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
      pasted.split("").forEach(function (char, idx) {
        if (!otpBoxes[idx]) return;
        otpBoxes[idx].value = char;
        otpBoxes[idx].classList.add("filled");
      });
      var fi = Math.min(pasted.length, otpBoxes.length) - 1;
      if (otpBoxes[fi]) otpBoxes[fi].focus();
      hideErr();
    });
  });

  /* ── Verify button ── */
  if (verifyBtn) {
    verifyBtn.addEventListener("click", function () {
      var otp = otpBoxes.map(function (b) { return b.value; }).join("");
      hideErr();

      if (otp.length < 6) {
        showErr("Please enter all 6 digits.");
        shakeBoxes();
        return;
      }

      setLoading(verifyBtn, true);

      var expected = sessionStorage.getItem("sc_demo_student_otp") || DEMO_OTP;

      setTimeout(function () {
        if (otp === expected) {
          clearInterval(otpInterval);
          sessionStorage.removeItem("sc_demo_student_otp");
          sessionStorage.setItem("sc_student_verified", "true");
          showToast("Identity verified. Welcome!");
          var uid = sessionStorage.getItem("sc_uid") || (auth.currentUser && auth.currentUser.uid) || "";
          if (uid) {
            addDoc(collection(db, "auditLogs"), {
              action:    "otp_verified",
              userId:    uid,
              email:     sessionStorage.getItem("sc_email") || "",
              createdAt: serverTimestamp()
            }).catch(function () {});
          }
          setTimeout(function () {
            window.location.href = "dashboard.html";
          }, 800);
        } else {
          showErr("Incorrect code. Please try again.");
          shakeBoxes();
          setLoading(verifyBtn, false);
        }
      }, 600);
    });
  }

  /* ── Resend button ── */
  if (resendBtn) {
    resendBtn.addEventListener("click", function () {
      if (resendBtn.disabled) return;
      hideErr();
      sendDemoOtp();
      showToast("New verification code sent.");
    });
  }
}
