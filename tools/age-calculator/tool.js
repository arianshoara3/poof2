// Precise age calculator — exact age in years/months/days, totals,
// weekday of birth, days until next birthday, and the birth date in Jalali.
// Pure functions are exported for Node testing; DOM code runs only in browser.

function daysInMonth(y, m) { // m: 0-11
  return new Date(y, m + 1, 0).getDate();
}

function parseISO(s) {
  if (!s || typeof s !== "string") return null;
  var parts = s.split("-");
  if (parts.length !== 3) return null;
  var y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  var date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

// Exact age: borrow months/days the calendar way (not 365.25 approximation).
function calculateAge(birth, asOf) {
  var years = asOf.getFullYear() - birth.getFullYear();
  var months = asOf.getMonth() - birth.getMonth();
  var days = asOf.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    var prev = new Date(asOf.getFullYear(), asOf.getMonth(), 0); // last day of previous month
    days += prev.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years: years, months: months, days: days };
}

function totalDays(birth, asOf) {
  var msPerDay = 24 * 60 * 60 * 1000;
  var b = Date.UTC(birth.getFullYear(), birth.getMonth(), birth.getDate());
  var a = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  return Math.round((a - b) / msPerDay);
}

// Next birthday after `asOf` (same day counts as today = 0 days away).
// Feb 29 birthdays fall on Feb 28 in non-leap years.
function nextBirthday(birth, asOf) {
  var y = asOf.getFullYear();
  var m = birth.getMonth(), d = birth.getDate();
  var cand = new Date(y, m, d);
  if (m === 1 && d === 29 && cand.getMonth() !== 1) cand = new Date(y, 1, 28);
  var start = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (cand < start) {
    cand = new Date(y + 1, m, d);
    if (m === 1 && d === 29 && cand.getMonth() !== 1) cand = new Date(y + 1, 1, 28);
  }
  return cand;
}

function daysUntil(from, to) {
  var msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
    Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / msPerDay);
}

// --- Jalali conversion (jalaali algorithm, public domain math; same as tool 007) ---
function div(a, b) { return Math.trunc(a / b); }
function mod(a, b) { return a - div(a, b) * b; }
var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
function jalCal(jy) {
  var gy = jy + 621, leapJ = -14, jp = breaks[0], jump = 0, i;
  for (i = 1; i < breaks.length; i++) {
    var jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  var n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  var leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  var march = 20 + leapJ - leapG;
  var leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  return { leap: leap, gy: gy, march: march };
}
function g2d(gy, gm, gd) {
  var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2j(jdn) {
  var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy), jdn1f = g2d(gy, 3, r.march), k = jdn - jdn1f, jm, jd;
  if (k >= 0) {
    if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy: jy, jm: jm, jd: jd }; }
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
  return { jy: jy, jm: jm, jd: jd };
}
function d2g(jdn) {
  var j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  var i = div(mod(j, 1461), 4) * 5 + 308;
  var gd = div(mod(i, 153), 5) + 1;
  var gm = mod(div(i, 153), 12) + 1;
  var gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy: gy, gm: gm, gd: gd };
}
function toJalali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }

if (typeof module !== "undefined") {
  module.exports = { parseISO: parseISO, calculateAge: calculateAge, totalDays: totalDays, nextBirthday: nextBirthday, daysUntil: daysUntil, toJalali: toJalali, daysInMonth: daysInMonth };
}

// --- Browser UI ---
if (typeof document !== "undefined") {
  var I18N = function () { return (window.POOF2I18N && window.POOF2I18N.ready) ? window.POOF2I18N : null; };
  var fmtNum = function (n) {
    var i = I18N();
    return i ? i.formatNumber(n) : String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; });
  };
  var t = function (key, fallback) {
    var i = I18N();
    return i ? i.t(key) : fallback;
  };

  var birthInput = document.getElementById("birth");
  var asofInput = document.getElementById("asof");
  var out = document.getElementById("result");
  var err = document.getElementById("error");

  function todayISO() {
    var n = new Date();
    var m = String(n.getMonth() + 1).padStart(2, "0");
    var d = String(n.getDate()).padStart(2, "0");
    return n.getFullYear() + "-" + m + "-" + d;
  }
  asofInput.value = todayISO();

  function calc() {
    err.textContent = "";
    out.hidden = true;
    var birth = parseISO(birthInput.value);
    var asOf = parseISO(asofInput.value);
    if (!birth || !asOf) {
      err.textContent = t("tool_ui.age-calculator.invalid", "تاریخ تولد معتبر نیست.");
      return;
    }
    if (birth > asOf) {
      err.textContent = t("tool_ui.age-calculator.future", "تاریخ تولد نمی‌تواند در آینده باشد.");
      return;
    }
    var age = calculateAge(birth, asOf);
    var days = totalDays(birth, asOf);
    var nb = nextBirthday(birth, asOf);
    var until = daysUntil(asOf, nb);
    var j = toJalali(birth.getFullYear(), birth.getMonth() + 1, birth.getDate());
    var i = I18N();

    document.getElementById("ageYears").textContent = fmtNum(age.years);
    document.getElementById("ageMonths").textContent = fmtNum(age.months);
    document.getElementById("ageDays").textContent = fmtNum(age.days);
    document.getElementById("totalDays").textContent = fmtNum(days);
    document.getElementById("totalWeeks").textContent = fmtNum(Math.floor(days / 7));
    document.getElementById("totalMonths").textContent = fmtNum(age.years * 12 + age.months);
    document.getElementById("totalHours").textContent = fmtNum(days * 24);
    document.getElementById("nextBirthday").textContent = i
      ? i.formatDate(nb) + " (" + fmtNum(until) + " " + t("tool_ui.age-calculator.days", "روز") + ")"
      : nb.toISOString().slice(0, 10) + " (" + until + " روز)";
    document.getElementById("bornWeekday").textContent = i
      ? i.formatDate(birth, { weekday: "long" })
      : birth.toLocaleDateString("fa-IR", { weekday: "long" });
    document.getElementById("birthJalali").textContent = fmtNum(j.jy) + "/" + fmtNum(j.jm) + "/" + fmtNum(j.jd);
    out.hidden = false;
  }

  document.getElementById("calcBtn").addEventListener("click", calc);
  document.addEventListener("poof2:language-changed", function () { if (!out.hidden) calc(); });
}
