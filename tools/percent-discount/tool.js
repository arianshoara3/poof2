// Percent and discount calculator. Pure functions exported for Node testing;
// DOM code runs only in the browser.
function round2(n) { return Math.round(n * 100) / 100; }
function discountAmount(price, pct) { return round2(price * pct / 100); }
function finalPrice(price, pct) { return round2(price - discountAmount(price, pct)); }
function percentOf(pct, num) { return round2(num * pct / 100); }
function originalPrice(final, pct) {
  if (pct >= 100) return null;
  return round2(final / (1 - pct / 100));
}

if (typeof module !== "undefined") { module.exports = { discountAmount, finalPrice, percentOf, originalPrice }; }

if (typeof document !== "undefined") {
  const fmt = (n) => (typeof window !== "undefined" && window.POOF2 && window.POOF2.formatNumber)
    ? window.POOF2.formatNumber(n) : String(n);
  document.getElementById("calcDiscount").onclick = () => {
    const price = Number(document.getElementById("price").value);
    const pct = Number(document.getElementById("pct").value);
    if (!(price >= 0) || !(pct >= 0 && pct <= 100)) return;
    document.getElementById("discountAmt").textContent = fmt(discountAmount(price, pct));
    document.getElementById("finalPrice").textContent = fmt(finalPrice(price, pct));
  };
  document.getElementById("calcPercent").onclick = () => {
    const pct = Number(document.getElementById("pct2").value);
    const num = Number(document.getElementById("num2").value);
    if (!(pct >= 0) || !(num >= 0)) return;
    document.getElementById("percentOut").textContent = fmt(percentOf(pct, num));
  };
  document.getElementById("calcReverse").onclick = () => {
    const fin = Number(document.getElementById("final2").value);
    const pct = Number(document.getElementById("pct3").value);
    if (!(fin >= 0) || !(pct >= 0 && pct < 100)) return;
    document.getElementById("originalOut").textContent = fmt(originalPrice(fin, pct));
  };
}
