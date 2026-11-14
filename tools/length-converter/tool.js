// Length unit converter. Pure functions exported for Node testing;
// DOM code runs only in the browser.
var METERS_PER_UNIT = {
  millimeter: 0.001,
  centimeter: 0.01,
  meter: 1,
  kilometer: 1000,
  inch: 0.0254,
  foot: 0.3048,
  yard: 0.9144,
  mile: 1609.344
};
var UNITS = Object.keys(METERS_PER_UNIT);

function round6(n) { return Math.round(n * 1000000) / 1000000; }
function convertLength(value, fromUnit, toUnit) {
  if (!(fromUnit in METERS_PER_UNIT) || !(toUnit in METERS_PER_UNIT)) return null;
  if (typeof value !== "number" || isNaN(value)) return null;
  return round6(value * METERS_PER_UNIT[fromUnit] / METERS_PER_UNIT[toUnit]);
}
function convertAll(value, fromUnit) {
  var out = {};
  UNITS.forEach(function (u) { out[u] = convertLength(value, fromUnit, u); });
  return out;
}

if (typeof module !== "undefined") { module.exports = { METERS_PER_UNIT, UNITS, convertLength, convertAll }; }

if (typeof document !== "undefined") {
  var fmt = function (n) {
    return (typeof window !== "undefined" && window.POOF2 && window.POOF2.formatNumber)
      ? window.POOF2.formatNumber(n) : String(n);
  };
  var valueInput = document.getElementById("value");
  var fromSelect = document.getElementById("fromUnit");
  var toSelect = document.getElementById("toUnit");

  function render() {
    var value = Number(valueInput.value);
    if (isNaN(value)) return;
    var from = fromSelect.value;
    var to = toSelect.value;
    var result = convertLength(value, from, to);
    document.getElementById("resultOut").textContent = fmt(result);
    document.getElementById("resultUnit").textContent =
      toSelect.options[toSelect.selectedIndex].textContent;
    var all = convertAll(value, from);
    UNITS.forEach(function (u) {
      var cell = document.querySelector('[data-all-unit="' + u + '"]');
      if (cell) cell.textContent = fmt(all[u]);
    });
  }
  document.getElementById("convertBtn").onclick = render;
  document.getElementById("swapBtn").onclick = function () {
    var tmp = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = tmp;
    render();
  };
  [valueInput, fromSelect, toSelect].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  render();
}
