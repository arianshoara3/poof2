// BMI calculator — body mass index (WHO categories), healthy weight range
// for the height, and how much to gain or lose to reach it. Metric and
// imperial units. Pure functions are exported for Node testing; DOM code
// runs only in the browser.

var KG_PER_LB = 0.45359237;
var CM_PER_IN = 2.54;

// WHO BMI bands.
function bmiCategory(bmi) {
  if (bmi < 16) return "severe";
  if (bmi < 18.5) return "under";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "over";
  if (bmi < 35) return "obese1";
  if (bmi < 40) return "obese2";
  return "obese3";
}

function toKg(weight, unit) {
  return unit === "imperial" ? weight * KG_PER_LB : weight;
}

function toCm(height, unit) {
  return unit === "imperial" ? height * CM_PER_IN : height;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Plausible human ranges; returns false for anything outside them.
function validInputs(weight, height, unit) {
  if (!isFinite(weight) || !isFinite(height) || weight <= 0 || height <= 0) return false;
  if (unit === "imperial") return weight <= 1100 && height >= 20 && height <= 120;
  return weight <= 500 && height >= 50 && height <= 300;
}

// weightKg, heightCm -> BMI rounded to 1 decimal, or null when invalid.
function calculateBMI(weightKg, heightCm) {
  if (!isFinite(weightKg) || !isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) return null;
  var h = heightCm / 100;
  return round1(weightKg / (h * h));
}

// Healthy weight range (BMI 18.5–24.9) for a height, in kg, 1 decimal.
function healthyRangeKg(heightCm) {
  var h = heightCm / 100;
  return { min: round1(18.5 * h * h), max: round1(24.9 * h * h) };
}

// { direction: "gain" | "lose" | "ok", amountKg } — how far the weight is
// from the nearest edge of the healthy range.
function weightDelta(weightKg, heightCm) {
  var range = healthyRangeKg(heightCm);
  if (weightKg < range.min) return { direction: "gain", amountKg: round1(range.min - weightKg) };
  if (weightKg > range.max) return { direction: "lose", amountKg: round1(weightKg - range.max) };
  return { direction: "ok", amountKg: 0 };
}

// Position (0–100%) of the BMI marker on a 14–40 scale bar.
function markerPosition(bmi) {
  var p = (bmi - 14) / (40 - 14) * 100;
  if (p < 0) p = 0;
  if (p > 100) p = 100;
  return Math.round(p * 10) / 10;
}

if (typeof module !== "undefined") {
  module.exports = {
    bmiCategory: bmiCategory,
    toKg: toKg,
    toCm: toCm,
    validInputs: validInputs,
    calculateBMI: calculateBMI,
    healthyRangeKg: healthyRangeKg,
    weightDelta: weightDelta,
    markerPosition: markerPosition,
    round1: round1
  };
}

// --- Browser UI ---
if (typeof document !== "undefined") {
  var I18N = function () { return (window.POOF2I18N && window.POOF2I18N.ready) ? window.POOF2I18N : null; };
  var fmtNum = function (n) {
    var i = I18N();
    return i ? i.formatNumber(n) : String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; });
  };
  var t = function (key, vars, fallback) {
    var i = I18N();
    return i ? i.t(key, vars) : (fallback !== undefined ? fallback : key);
  };

  var CAT_COLORS = {
    severe: "#2563eb", under: "#2563eb", normal: "#2f7d4f",
    over: "#b45309", obese1: "#b3261e", obese2: "#b3261e", obese3: "#b3261e"
  };

  var unitInputs = document.querySelectorAll('input[name="units"]');
  var weightInput = document.getElementById("weight");
  var heightInput = document.getElementById("height");
  var weightUnit = document.getElementById("weightUnit");
  var heightUnit = document.getElementById("heightUnit");
  var out = document.getElementById("result");
  var err = document.getElementById("error");

  function currentUnit() {
    for (var k = 0; k < unitInputs.length; k++) {
      if (unitInputs[k].checked) return unitInputs[k].value;
    }
    return "metric";
  }

  function refreshUnitLabels() {
    var unit = currentUnit();
    weightUnit.textContent = unit === "imperial"
      ? t("tool_ui.bmi-calculator.unit_lb", null, "پوند")
      : t("tool_ui.bmi-calculator.unit_kg", null, "کیلوگرم");
    heightUnit.textContent = unit === "imperial"
      ? t("tool_ui.bmi-calculator.unit_in", null, "اینچ")
      : t("tool_ui.bmi-calculator.unit_cm", null, "سانتی‌متر");
  }

  function calc() {
    err.textContent = "";
    out.hidden = true;
    var unit = currentUnit();
    var weight = parseFloat(weightInput.value);
    var height = parseFloat(heightInput.value);
    if (!validInputs(weight, height, unit)) {
      err.textContent = t("tool_ui.bmi-calculator.invalid", null, "وزن و قد معتبر وارد کن.");
      return;
    }
    var weightKg = toKg(weight, unit);
    var heightCm = toCm(height, unit);
    var bmi = calculateBMI(weightKg, heightCm);
    var cat = bmiCategory(bmi);
    var range = healthyRangeKg(heightCm);
    var delta = weightDelta(weightKg, heightCm);
    var unitLabel = unit === "imperial"
      ? t("tool_ui.bmi-calculator.unit_lb", null, "پوند")
      : t("tool_ui.bmi-calculator.unit_kg", null, "کیلوگرم");
    var amount = unit === "imperial" ? round1(delta.amountKg / KG_PER_LB) : delta.amountKg;

    var bmiEl = document.getElementById("bmiValue");
    bmiEl.textContent = fmtNum(bmi);
    var catEl = document.getElementById("bmiCategory");
    catEl.textContent = t("tool_ui.bmi-calculator.cat_" + cat, null, cat);
    catEl.style.color = CAT_COLORS[cat];
    catEl.style.borderColor = CAT_COLORS[cat];
    document.getElementById("marker").style.left = markerPosition(bmi) + "%";
    document.getElementById("healthyRange").textContent =
      fmtNum(unit === "imperial" ? round1(range.min / KG_PER_LB) : range.min) +
      " – " +
      fmtNum(unit === "imperial" ? round1(range.max / KG_PER_LB) : range.max) +
      " " + unitLabel;
    var adviceEl = document.getElementById("advice");
    if (delta.direction === "ok") {
      adviceEl.textContent = t("tool_ui.bmi-calculator.in_healthy_range", null, "وزن شما در محدوده‌ی سالم است.");
    } else if (delta.direction === "gain") {
      adviceEl.textContent = t("tool_ui.bmi-calculator.gain_to_healthy",
        { amount: fmtNum(amount), unit: unitLabel },
        "برای رسیدن به محدوده‌ی سالم، " + fmtNum(amount) + " " + unitLabel + " اضافه کن.");
    } else {
      adviceEl.textContent = t("tool_ui.bmi-calculator.lose_to_healthy",
        { amount: fmtNum(amount), unit: unitLabel },
        "برای رسیدن به محدوده‌ی سالم، " + fmtNum(amount) + " " + unitLabel + " کم کن.");
    }
    out.hidden = false;
  }

  document.getElementById("calcBtn").addEventListener("click", calc);
  for (var k = 0; k < unitInputs.length; k++) {
    unitInputs[k].addEventListener("change", function () { refreshUnitLabels(); if (!out.hidden) calc(); });
  }
  document.addEventListener("poof2:language-changed", function () {
    refreshUnitLabels();
    if (!out.hidden) calc();
  });
  refreshUnitLabels();
}
