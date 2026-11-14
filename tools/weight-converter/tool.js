// Weight unit converter. Factors are kilograms per unit. Pure functions
// exported for Node testing; DOM code runs only in the browser.
const TO_KG = {
  kg: 1,
  g: 0.001,
  mg: 0.000001,
  t: 1000,
  lb: 0.45359237,
  oz: 0.028349523125,
  st: 6.35029318,
};
const UNITS = Object.keys(TO_KG);

function convertWeight(value, from, to) {
  if (!(value >= 0) || !TO_KG[from] || !TO_KG[to]) return null;
  return value * TO_KG[from] / TO_KG[to];
}
function round(n) {
  if (n === 0) return 0;
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return Number(n.toFixed(digits));
}

if (typeof module !== "undefined") { module.exports = { convertWeight, round, UNITS }; }

if (typeof document !== "undefined") {
  const fmt = (n) => (typeof window !== "undefined" && window.POOF2 && window.POOF2.formatNumber)
    ? window.POOF2.formatNumber(n) : String(n);
  function update() {
    const value = Number(document.getElementById("value").value);
    const from = document.getElementById("fromUnit").value;
    const to = document.getElementById("toUnit").value;
    if (!(value >= 0)) { document.getElementById("out").textContent = "—"; return; }
    const r = convertWeight(value, from, to);
    document.getElementById("out").textContent = fmt(round(r));
    const table = document.getElementById("allTable");
    table.innerHTML = "";
    for (const u of UNITS) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      td1.textContent = document.querySelector(`#fromUnit option[value="${u}"]`).textContent;
      const td2 = document.createElement("td");
      td2.textContent = fmt(round(convertWeight(value, from, u)));
      tr.appendChild(td1);
      tr.appendChild(td2);
      table.appendChild(tr);
    }
  }
  ["value", "fromUnit", "toUnit"].forEach((id) =>
    document.getElementById(id).addEventListener("input", update));
  document.getElementById("swapBtn").onclick = () => {
    const f = document.getElementById("fromUnit");
    const t = document.getElementById("toUnit");
    const tmp = f.value; f.value = t.value; t.value = tmp;
    update();
  };
  update();
}
