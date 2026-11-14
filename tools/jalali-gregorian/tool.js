// Jalali <-> Gregorian conversion (jalaali algorithm, public domain math).
function div(a, b) { return Math.trunc(a / b); }
function mod(a, b) { return a - div(a, b) * b; }

const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;
  for (let i = 1; i < breaks.length; i++) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
    + div(153 * mod(gm + 9, 12) + 2, 5)
    + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm, jd;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

function toJalali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }

if (typeof module !== "undefined") { module.exports = { toJalali, toGregorian }; }

if (typeof document !== "undefined") {
const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const pad = (n) => String(n).padStart(2, "0");

document.getElementById("toJalaliBtn").onclick = () => {
  const v = document.getElementById("gdate").value;
  if (!v) return;
  const [gy, gm, gd] = v.split("-").map(Number);
  const j = toJalali(gy, gm, gd);
  document.getElementById("jalaliOut").textContent = fa(j.jy) + "/" + fa(pad(j.jm)) + "/" + fa(pad(j.jd));
};
document.getElementById("toGregBtn").onclick = () => {
  const jy = Number(document.getElementById("jy").value);
  const jm = Number(document.getElementById("jm").value);
  const jd = Number(document.getElementById("jd").value);
  if (!jy || !jm || !jd) return;
  const g = toGregorian(jy, jm, jd);
  document.getElementById("gregOut").textContent = g.gy + "-" + pad(g.gm) + "-" + pad(g.gd);
};
// Today
(function () {
  const now = new Date();
  const j = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  document.getElementById("today").textContent = "امروز: " + fa(j.jy) + "/" + fa(pad(j.jm)) + "/" + fa(pad(j.jd)) + " — " + now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
})();
}
