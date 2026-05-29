import { cloudFunctions, httpsCallable } from "./firebase.js";

const USE_LOCAL_DEMO = true;
const DEMO_OTP = "123456";

const sendAdminOtp  = USE_LOCAL_DEMO ? sendAdminOtpDemo  : httpsCallable(cloudFunctions, "sendAdminOtp");
const verifyAdminOtp = USE_LOCAL_DEMO ? verifyAdminOtpDemo : httpsCallable(cloudFunctions, "verifyAdminOtp");

document.addEventListener("DOMContentLoaded", initSecurityVerification);

async function sendAdminOtpDemo() {
  sessionStorage.setItem("sc_demo_admin_otp", DEMO_OTP);
  return {
    data: {
      ok: true,
      email: sessionStorage.getItem("sc_email") || "",
      expiresInSeconds: 300,
      demoOtp: DEMO_OTP
    }
  };
}

async function verifyAdminOtpDemo(data) {
  const expected = sessionStorage.getItem("sc_demo_admin_otp") || DEMO_OTP;
  if (String(data?.otp || "").trim() !== expected) {
    throw new Error("Incorrect OTP. Please try again.");
  }
  sessionStorage.removeItem("sc_demo_admin_otp");
  return { data: { ok: true } };
}

function getEl(id) { return document.getElementById(id); }

function maskEmail(email) {
  if (!email || !email.includes("@")) return "your registered admin email";
  const [name, ...rest] = email.split("@");
  return name.slice(0, Math.min(3, name.length)) + "**@" + rest.join("@");
}

function friendlyError(err, fallback) {
  if (!err) return fallback;
  const code = (err.code || "").replace(/^functions\//, "");
  const map = {
    "internal":           "Security service unavailable. Please try again.",
    "unauthenticated":    "You must be signed in to proceed.",
    "permission-denied":  "Access denied.",
    "not-found":          "No active session. Please refresh and try again.",
    "resource-exhausted": "Too many attempts. Please wait and try again.",
    "deadline-exceeded":  "Verification timed out. Please refresh.",
    "invalid-argument":   "Invalid input. Please check your entry."
  };
  return map[code] || (err.message ? err.message.replace(/^Firebase:\s*/i, "") : fallback);
}

function showToast(msg, icon = "bi-check-circle-fill") {
  let toast = getEl("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="bi ${icon}"></i> ${msg}`;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}

function setLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle("loading", on);
  btn.disabled = on;
}

function showErr(el, msgEl, msg) {
  if (msgEl) msgEl.textContent = msg;
  if (el) el.classList.add("show");
}

function hideErr(el) {
  if (el) el.classList.remove("show");
}

async function initSecurityVerification() {
  if (!document.querySelector(".toh-card")) return;

  let otpSeconds  = 300;
  let otpInterval = null;
  let resendInt   = null;

  const l2Err    = getEl("toh-l2-error");
  const l2ErrMsg = getEl("toh-l2-error-msg");
  const timerEl  = getEl("toh-otp-timer");
  const btnL2    = getEl("toh-btn-l2");
  const resendBtn = getEl("toh-resend-btn");
  const resendCd  = getEl("toh-resend-cd");
  const otpEmailEl = getEl("toh-otp-email");
  const otpBoxes   = Array.from(document.querySelectorAll(".toh-otp-box"));

  if (otpEmailEl) otpEmailEl.textContent = maskEmail(sessionStorage.getItem("sc_email") || "");

  /* ── Timer ── */
  function startOtpTimer(seconds) {
    otpSeconds = Number(seconds || 300);
    clearInterval(otpInterval);
    if (btnL2) btnL2.disabled = false;

    function render() {
      const m = Math.floor(otpSeconds / 60);
      const s = otpSeconds % 60;
      if (timerEl) {
        timerEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
        timerEl.classList.toggle("urgent", otpSeconds <= 60);
      }
    }
    render();
    otpInterval = setInterval(() => {
      otpSeconds -= 1;
      render();
      if (otpSeconds <= 0) {
        clearInterval(otpInterval);
        if (timerEl) { timerEl.textContent = "Expired"; timerEl.classList.add("urgent"); }
        if (btnL2) btnL2.disabled = true;
        showErr(l2Err, l2ErrMsg, "OTP expired. Please request a new one.");
      }
    }, 1000);
  }

  /* ── Resend cooldown ── */
  function startResendCooldown(seconds = 60) {
    clearInterval(resendInt);
    let left = seconds;
    if (resendBtn) resendBtn.disabled = true;
    if (resendCd) resendCd.textContent = `(wait ${left}s)`;
    resendInt = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(resendInt);
        if (resendBtn) resendBtn.disabled = false;
        if (resendCd) resendCd.textContent = "";
      } else if (resendCd) {
        resendCd.textContent = `(wait ${left}s)`;
      }
    }, 1000);
  }

  /* ── Clear boxes ── */
  function resetBoxes() {
    otpBoxes.forEach(b => { b.value = ""; b.classList.remove("filled", "shake"); });
  }

  /* ── Shake animation ── */
  function shakeBoxes() {
    otpBoxes.forEach(b => {
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
      setTimeout(() => b.classList.remove("shake"), 400);
    });
  }

  /* ── Send OTP ── */
  async function requestOtp() {
    const result = await sendAdminOtp();
    const data = result.data || {};
    resetBoxes();
    startOtpTimer(data.expiresInSeconds || 300);
    startResendCooldown();
    if (otpEmailEl && data.email) otpEmailEl.textContent = maskEmail(data.email);
    if (data.demoOtp) showToast("Demo OTP: " + data.demoOtp, "bi-info-circle-fill");
    return data;
  }

  /* ── Auto-send OTP on load ── */
  try {
    await requestOtp();
    showToast("OTP sent to your admin email.");
  } catch (err) {
    showErr(l2Err, l2ErrMsg, friendlyError(err, "Could not send OTP. Please refresh."));
  }

  /* ── OTP box interactions ── */
  otpBoxes.forEach((box, i) => {
    box.addEventListener("input", e => {
      const v = e.target.value.replace(/\D/g, "");
      box.value = v ? v[v.length - 1] : "";
      box.classList.toggle("filled", box.value !== "");
      box.classList.remove("shake");
      hideErr(l2Err);
      if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
    });

    box.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !box.value && i > 0) {
        otpBoxes[i - 1].value = "";
        otpBoxes[i - 1].classList.remove("filled");
        otpBoxes[i - 1].focus();
      }
      if (e.key === "ArrowLeft"  && i > 0)                      otpBoxes[i - 1].focus();
      if (e.key === "ArrowRight" && i < otpBoxes.length - 1)    otpBoxes[i + 1].focus();
      if (e.key === "Enter" && btnL2) btnL2.click();
    });

    box.addEventListener("paste", e => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
      pasted.split("").forEach((char, idx) => {
        if (!otpBoxes[idx]) return;
        otpBoxes[idx].value = char;
        otpBoxes[idx].classList.add("filled");
      });
      const focusIdx = Math.min(pasted.length, otpBoxes.length) - 1;
      if (otpBoxes[focusIdx]) otpBoxes[focusIdx].focus();
      hideErr(l2Err);
    });
  });

  /* ── Verify button ── */
  if (btnL2) {
    btnL2.addEventListener("click", async () => {
      const otp = otpBoxes.map(b => b.value).join("");
      hideErr(l2Err);

      if (otp.length < 6) {
        showErr(l2Err, l2ErrMsg, "Please enter all 6 digits.");
        shakeBoxes();
        return;
      }

      setLoading(btnL2, true);
      try {
        await verifyAdminOtp({ otp });
        clearInterval(otpInterval);
        showToast("Access granted. Welcome, Administrator.");
        sessionStorage.setItem("sc_admin_verified", "true");
        setTimeout(() => { window.location.href = "admindashboard.html"; }, 900);
      } catch (err) {
        showErr(l2Err, l2ErrMsg, friendlyError(err, "Incorrect OTP. Please try again."));
        shakeBoxes();
      } finally {
        setLoading(btnL2, false);
      }
    });
  }

  /* ── Resend button ── */
  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      if (resendBtn.disabled) return;
      hideErr(l2Err);
      resendBtn.disabled = true;
      try {
        await requestOtp();
        showToast("New OTP sent to your admin email.");
      } catch (err) {
        showErr(l2Err, l2ErrMsg, friendlyError(err, "Could not resend OTP."));
        resendBtn.disabled = false;
      }
    });
  }
}
