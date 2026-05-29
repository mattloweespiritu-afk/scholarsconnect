/* =========================================================
   Landing page — dynamic scholarship grid
   Replaces hardcoded cards with Firestore-fetched active scholarships
========================================================= */
import { db, getDocs, query, collection, where } from "./firebase.js";

(async function initScholarshipGrid() {
  var grid    = document.getElementById("scholarshipGrid");
  var countEl = document.getElementById("scholarshipCount");
  var empty   = document.getElementById("emptyState");
  if (!grid) return;

  /* Loading skeleton */
  grid.innerHTML =
    '<div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:#999;">' +
    '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:22px;display:block;margin-bottom:10px;"></i>' +
    'Loading scholarships…</div>';
  if (countEl) countEl.textContent = "Loading…";

  try {
    var snap = await getDocs(query(
      collection(db, "scholarships"),
      where("status", "in", ["active", "published", "open"])
    ));

    grid.innerHTML = "";

    if (snap.empty) {
      if (countEl) countEl.textContent = "No active scholarship programs";
      if (empty) {
        var h3 = empty.querySelector("h3");
        var p  = empty.querySelector("p");
        if (h3) h3.textContent = "No active scholarships";
        if (p)  p.textContent  = "No scholarship programs are currently open. Please check back later.";
        empty.classList.remove("hidden");
      }
      return;
    }

    var now        = Date.now();
    var THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    snap.docs.forEach(function (d) {
      var s = d.data();
      var article = buildCard(s, now, THIRTY_DAYS);
      grid.appendChild(article);
    });

    var count = snap.docs.length;
    if (countEl) countEl.textContent =
      "Showing " + count + " scholarship program" + (count === 1 ? "" : "s");

    if (empty) empty.classList.add("hidden");

    /* Re-apply any active filters */
    if (typeof window.filterScholarships === "function") {
      window.filterScholarships();
    }
  } catch (e) {
    console.warn("Could not load scholarships:", e);
    grid.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:#999;">' +
      "Unable to load scholarships at this time.</div>";
    if (countEl) countEl.textContent = "—";
  }
})();

/* ── helpers ──────────────────────────────────────────── */

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCard(s, now, THIRTY_DAYS) {
  var title      = s.title || "Scholarship";
  var type       = (s.type || "government").toLowerCase();
  var typeLabel  = s.typeLabel || fmtLabel(type);
  var desc       = s.description || "Scholarship program. Contact the office for details.";
  var minGwa     = s.minGwa ? "Min GWA: " + s.minGwa : "No minimum GWA";
  var yearLevel  = s.yearLevel || "All Levels";
  var course     = s.course || "All Programs";
  var slotsTotal  = parseInt(s.slotsTotal || s.slots || 0) || 0;
  var slotsFilled = parseInt(s.slotsFilled || 0) || 0;
  var deadline   = s.deadlineValue || s.deadline || "";

  /* Deadline urgency */
  var deadlineTs  = deadline ? new Date(deadline).getTime() : NaN;
  var isUrgent    = !isNaN(deadlineTs) && (deadlineTs - now) > 0 && (deadlineTs - now) < THIRTY_DAYS;
  var isPast      = !isNaN(deadlineTs) && deadlineTs < now;
  var deadlineKey = isUrgent ? "urgent" : "open";

  /* Deadline display */
  var deadlineDisplay = "—";
  if (deadline && !isNaN(deadlineTs)) {
    deadlineDisplay = new Date(deadline).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric"
    });
  }

  /* Slot bar */
  var slotPct  = slotsTotal > 0 ? Math.min(Math.round((slotsFilled / slotsTotal) * 100), 100) : 0;
  var barClass = slotPct >= 75 ? "slot-fill danger"
               : slotPct >= 60 ? "slot-fill warning"
               : "slot-fill";
  var slotText = slotsTotal > 0
    ? slotsFilled + " of " + slotsTotal + " slots filled"
    : "Slots available";

  /* Strip / badge classes */
  var stripClass  = type === "government" ? "card-strip strip-maroon" : "card-strip strip-soft";
  var badgeClass  = isUrgent ? "card-status urgent" : "card-status open";
  var badgeText   = isPast ? "Closed" : (isUrgent ? "Closing Soon" : "Open");
  var dlClass     = isUrgent ? "deadline urgent" : "deadline";

  /* data-level normalization for filter */
  var dataLevel = normalizeLevel(yearLevel);

  /* data-title: wide search string */
  var dataTitle = [title, typeLabel, minGwa, yearLevel, course].join(" ").toLowerCase();

  var el = document.createElement("article");
  el.className = "scholarship-card";
  el.dataset.title    = dataTitle;
  el.dataset.category = type;
  el.dataset.level    = dataLevel;
  el.dataset.deadline = deadlineKey;

  el.innerHTML =
    '<div class="card-topline">' +
      '<div class="' + esc(stripClass) + '">' + esc(typeLabel) + '</div>' +
      '<span class="' + esc(badgeClass) + '">' + esc(badgeText) + '</span>' +
    '</div>' +
    '<h3>' + esc(title) + '</h3>' +
    '<p>' + esc(desc) + '</p>' +
    '<div class="sc-meta">' +
      '<span><i class="fa-regular fa-star"></i> ' + esc(minGwa) + '</span>' +
      '<span><i class="fa-solid fa-user-graduate"></i> ' + esc(yearLevel) + '</span>' +
      '<span><i class="fa-regular fa-bookmark"></i> ' + esc(course) + '</span>' +
    '</div>' +
    (slotsTotal > 0
      ? '<div class="slot-block">' +
          '<div class="slot-text">' + esc(slotText) + '</div>' +
          '<div class="slot-track">' +
            '<div class="' + esc(barClass) + '" style="width:' + slotPct + '%;"></div>' +
          '</div>' +
        '</div>'
      : '') +
    '<div class="' + esc(dlClass) + '">' +
      '<i class="fa-regular fa-clock"></i> Deadline: ' + esc(deadlineDisplay) +
    '</div>' +
    '<div class="card-actions">' +
      '<a href="#" class="btn-details">View Details</a>' +
      '<a href="html/register.html" class="btn-apply">Apply Now</a>' +
    '</div>';

  return el;
}

function normalizeLevel(yearLevel) {
  var v = (yearLevel || "").toLowerCase();
  if (v.includes("fresh") || v === "1st year" || v === "first year") return "freshmen";
  if (v.includes("1st") && v.includes("2nd"))                        return "1st-2nd";
  if (v.includes("2nd") && (v.includes("3rd") || v.includes("4th"))) return "2nd-4th";
  return "all-levels";
}

function fmtLabel(type) {
  return String(type || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}
