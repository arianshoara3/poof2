// QR code generator studio. Pure functions exported for Node testing;
// DOM code runs only in the browser. QR encoder written from scratch:
// byte mode, UTF-8, EC levels L/M, versions 1-10, Reed-Solomon ECC,
// all 8 masks with spec penalty evaluation, format + version info.
var CHALLENGE_ROUNDS = 10;
var CHALLENGE_SECONDS = 15;
var HISTORY_KEY = "poof2-qr-history-v1";
var STATS_KEY = "poof2-qr-stats-v1";
var BEST_KEY = "poof2-best-qr-generator";
var MAX_HISTORY = 10;
var PAYLOAD_TYPES = ["text", "url", "wifi", "vcard"];

// ---- spec tables (ISO/IEC 18004), versions 1-10, levels L/M ----
var TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
var ECC_PER_BLOCK = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
};
var NUM_EC_BLOCKS = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4], // v10-L: 4 blocks (2x68 + 2x69 data)
  M: [1, 1, 1, 2, 2, 4, 4, 2, 3, 2]
};
var ALIGNMENT_POS = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
];
var REMAINDER_BITS = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];
var EC_LEVEL_BITS = { L: 1, M: 0 };

function dataCodewordCount(version, ecLevel) {
  return TOTAL_CODEWORDS[version - 1]
    - ECC_PER_BLOCK[ecLevel][version - 1] * NUM_EC_BLOCKS[ecLevel][version - 1];
}

// Max payload bytes in byte mode for a version/level.
function maxBytes(version, ecLevel) {
  var ccBits = version <= 9 ? 8 : 16;
  return Math.floor((dataCodewordCount(version, ecLevel) * 8 - 4 - ccBits) / 8);
}

// Smallest version (1-10) that fits byteLen bytes, or null.
function chooseVersion(byteLen, ecLevel) {
  for (var v = 1; v <= 10; v++) {
    if (byteLen <= maxBytes(v, ecLevel)) return v;
  }
  return null;
}

// ---- UTF-8 ----
function utf8Bytes(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    else if (c >= 0xD800 && c < 0xDC00 && i + 1 < str.length) {
      var c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xDC00 && c2 < 0xE000) {
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
          0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
        i++;
      } else out.push(0xEF, 0xBF, 0xBD);
    } else if (c >= 0xD800 && c < 0xE000) out.push(0xEF, 0xBF, 0xBD);
    else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
  }
  return out;
}

// ---- GF(256), primitive polynomial 0x11D, generator 2 ----
var GF_EXP = [], GF_LOG = [];
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) {
    GF_EXP[i] = x; GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
})();
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

// Generator polynomial of degree ecLen: product of (x - a^i), i = 0..ecLen-1.
// Returns divisor coefficients [c_{d-1} ... c_0] (leading 1 omitted).
function reedSolomonComputeDivisor(ecLen) {
  var result = new Array(ecLen).fill(0);
  result[result.length - 1] = 1; // start with monomial x^0
  var root = 1;
  for (var i = 0; i < ecLen; i++) {
    for (var j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
}

// Remainder of data(x) * x^ecLen divided by the generator polynomial.
function reedSolomonComputeRemainder(data, divisor) {
  var result = new Array(divisor.length).fill(0);
  data.forEach(function (b) {
    var factor = b ^ result.shift();
    result.push(0);
    divisor.forEach(function (coef, i) { result[i] ^= gfMul(coef, factor); });
  });
  return result;
}

// ---- format + version information ----
function getFormatBits(ecLevel, mask) {
  var data = (EC_LEVEL_BITS[ecLevel] << 3) | mask; // 5 bits
  var rem = data;
  for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412; // 15 bits
}

function getVersionBits(version) {
  var rem = version;
  for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
  return (version << 12) | rem; // 18 bits
}

// ---- masking ----
function getMaskBit(mask, x, y) { // x = column, y = row
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2 + (x * y) % 3) === 0;
    case 6: return (((x * y) % 2 + (x * y) % 3) % 2) === 0;
    case 7: return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
    default: return false;
  }
}

// Spec penalty score (N1=3, N2=3, N3=40, N4=10). Lower is better.
function penaltyScore(modules) {
  var size = modules.length, result = 0;
  var i, j, runColor, runLen, k;
  // Rule 1: runs of 5+ in rows and columns.
  for (i = 0; i < size; i++) {
    runColor = -1; runLen = 0;
    for (j = 0; j < size; j++) {
      if (modules[i][j] === runColor) runLen++;
      else { if (runLen >= 5) result += 3 + (runLen - 5); runColor = modules[i][j]; runLen = 1; }
    }
    if (runLen >= 5) result += 3 + (runLen - 5);
  }
  for (j = 0; j < size; j++) {
    runColor = -1; runLen = 0;
    for (i = 0; i < size; i++) {
      if (modules[i][j] === runColor) runLen++;
      else { if (runLen >= 5) result += 3 + (runLen - 5); runColor = modules[i][j]; runLen = 1; }
    }
    if (runLen >= 5) result += 3 + (runLen - 5);
  }
  // Rule 2: 2x2 blocks of one color.
  for (i = 0; i < size - 1; i++) {
    for (j = 0; j < size - 1; j++) {
      var c = modules[i][j];
      if (c === modules[i][j + 1] && c === modules[i + 1][j] && c === modules[i + 1][j + 1]) result += 3;
    }
  }
  // Rule 3: finder-like patterns 1011101 with 4 light modules before/after.
  function hasFinderPattern(line) {
    for (k = 0; k + 11 <= line.length; k++) {
      var a = line.slice(k, k + 11).join("");
      if (a === "00001011101" || a === "10111010000") return true;
    }
    return false;
  }
  for (i = 0; i < size; i++) {
    var row = [], col = [];
    for (j = 0; j < size; j++) { row.push(modules[i][j]); col.push(modules[j][i]); }
    if (hasFinderPattern(row)) result += 40;
    if (hasFinderPattern(col)) result += 40;
  }
  // Rule 4: dark-module proportion vs 50%, in 5% steps.
  var dark = 0;
  for (i = 0; i < size; i++) for (j = 0; j < size; j++) if (modules[i][j]) dark++;
  var total = size * size;
  var percent = dark * 100 / total;
  var prev = Math.floor(percent / 5) * 5, next = Math.ceil(percent / 5) * 5;
  var low = Math.abs(prev - 50) / 5, high = Math.abs(next - 50) / 5;
  result += Math.min(low, high) * 10;
  return result;
}

// ---- bit stream (byte mode) ----
function encodeDataCodewords(bytes, version, ecLevel) {
  var dataLen = dataCodewordCount(version, ecLevel);
  var bb = [];
  function appendBits(val, len) {
    for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  }
  appendBits(4, 4); // byte mode 0100
  appendBits(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach(function (b) { appendBits(b, 8); });
  var capacityBits = dataLen * 8;
  appendBits(0, Math.min(4, capacityBits - bb.length)); // terminator
  while (bb.length % 8 !== 0) bb.push(0);
  var pad = 0xEC;
  while (bb.length < capacityBits) { appendBits(pad, 8); pad = (pad === 0xEC) ? 0x11 : 0xEC; }
  var out = [];
  for (var i = 0; i < bb.length; i += 8) {
    var v = 0;
    for (var j = 0; j < 8; j++) v = (v << 1) | bb[i + j];
    out.push(v);
  }
  return out;
}

// Interleave data + EC codewords across blocks.
function interleaveCodewords(dataCodewords, version, ecLevel) {
  var numBlocks = NUM_EC_BLOCKS[ecLevel][version - 1];
  var ecLen = ECC_PER_BLOCK[ecLevel][version - 1];
  var total = TOTAL_CODEWORDS[version - 1];
  var shortBlockLen = Math.floor(total / numBlocks);
  var numShortBlocks = numBlocks - (total % numBlocks);
  var divisor = reedSolomonComputeDivisor(ecLen);
  var blocks = [], k = 0;
  for (var i = 0; i < numBlocks; i++) {
    var datLen = shortBlockLen - ecLen + (i < numShortBlocks ? 0 : 1);
    var dat = dataCodewords.slice(k, k + datLen);
    k += datLen;
    blocks.push({ data: dat, ecc: reedSolomonComputeRemainder(dat, divisor) });
  }
  var result = [];
  var maxDataLen = Math.max.apply(null, blocks.map(function (b) { return b.data.length; }));
  for (i = 0; i < maxDataLen; i++) {
    for (var j = 0; j < blocks.length; j++) {
      if (i < blocks[j].data.length) result.push(blocks[j].data[i]);
    }
  }
  for (i = 0; i < ecLen; i++) {
    for (var j2 = 0; j2 < blocks.length; j2++) result.push(blocks[j2].ecc[i]);
  }
  return result;
}

// ---- matrix building ----
function emptyMatrix(size) {
  var modules = [], isFunction = [];
  for (var y = 0; y < size; y++) {
    modules.push(new Array(size).fill(null));
    isFunction.push(new Array(size).fill(false));
  }
  return { modules: modules, isFunction: isFunction };
}

function buildQR(bytes, version, ecLevel) {
  var size = 21 + 4 * (version - 1);
  var m = emptyMatrix(size);
  var modules = m.modules, isFunction = m.isFunction;

  function setFn(x, y, dark) { // x = column, y = row
    modules[y][x] = dark ? 1 : 0;
    isFunction[y][x] = true;
  }
  function drawFinder(cx, cy) { // cx, cy = top-left corner
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var xx = cx + dx, yy = cy + dy;
        if (0 <= xx && xx < size && 0 <= yy && yy < size) {
          var d = Math.max(Math.abs(dx), Math.abs(dy));
          setFn(xx, yy, d !== 2 && d !== 4);
        }
      }
    }
  }
  function drawAlignment(cx, cy) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, d !== 1);
      }
    }
  }

  // Timing patterns first (finders/alignment overwrite them where they overlap).
  for (var i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  // Finder patterns + separators.
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);
  // Alignment patterns (skip overlaps with finders).
  var pos = ALIGNMENT_POS[version - 1];
  for (var a = 0; a < pos.length; a++) {
    for (var b = 0; b < pos.length; b++) {
      var x = pos[b], y = pos[a];
      var overlapsFinder = (x <= 8 && y <= 8) || (x >= size - 9 && y <= 8) || (x <= 8 && y >= size - 9);
      if (!overlapsFinder) drawAlignment(x, y);
    }
  }
  // Dark module.
  setFn(8, size - 8, true);
  // Reserve format-info areas (skip 6: (6,8) and (8,6) are timing modules).
  for (var k = 0; k < 9; k++) {
    if (k === 6) continue;
    setFn(8, k, false); setFn(k, 8, false);
  }
  for (k = 0; k < 8; k++) { setFn(8, size - 1 - k, false); setFn(size - 1 - k, 8, false); }
  setFn(8, size - 8, true);
  // Reserve version-info areas (v >= 7).
  if (version >= 7) {
    for (k = 0; k < 18; k++) {
      var a2 = size - 11 + (k % 3), b2 = Math.floor(k / 3);
      setFn(a2, b2, false);
      setFn(b2, a2, false);
    }
  }

  // Data bits.
  var dataCw = encodeDataCodewords(bytes, version, ecLevel);
  var allCw = interleaveCodewords(dataCw, version, ecLevel);
  var bits = [];
  allCw.forEach(function (cw) {
    for (var i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  });
  for (var r = 0; r < REMAINDER_BITS[version - 1]; r++) bits.push(0);

  // Try all 8 masks, keep the lowest penalty.
  var best = null;
  for (var mask = 0; mask < 8; mask++) {
    var trial = modules.map(function (row) { return row.slice(); });
    placeData(trial, isFunction, bits, mask);
    drawFormat(trial, isFunction, version, ecLevel, mask);
    if (version >= 7) drawVersion(trial, isFunction, version);
    var score = penaltyScore(trial);
    if (best === null || score < best.score) best = { mask: mask, score: score, modules: trial };
  }
  return {
    version: version, ecLevel: ecLevel, size: size, mask: best.mask,
    penalty: best.score, modules: best.modules,
    byteLength: bytes.length, capacityBytes: maxBytes(version, ecLevel),
    dataCodewords: dataCw.length
  };

  function placeData(mods, fn, bitList, mk) {
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!fn[y][x]) {
            var bit = i < bitList.length ? bitList[i] : 0;
            i++;
            if (getMaskBit(mk, x, y)) bit ^= 1;
            mods[y][x] = bit;
          }
        }
      }
    }
  }
  function drawFormat(mods, fn, ver, ec, mk) {
    var fbits = getFormatBits(ec, mk);
    function bit(n) { return ((fbits >>> n) & 1) === 1; }
    function set(x, y, dark) { mods[y][x] = dark ? 1 : 0; fn[y][x] = true; }
    for (var i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(size - 8, 8, true); // always dark
  }
  function drawVersion(mods, fn, ver) {
    var vbits = getVersionBits(ver);
    function bit(n) { return ((vbits >>> n) & 1) === 1; }
    function set(x, y, dark) { mods[y][x] = dark ? 1 : 0; fn[y][x] = true; }
    for (var i = 0; i < 18; i++) {
      var a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit(i));
      set(b, a, bit(i));
    }
  }
}

// Encode a text payload. Returns null when it exceeds version-10 capacity.
function encodeQR(text, ecLevel) {
  var bytes = utf8Bytes(text == null ? "" : String(text));
  var version = chooseVersion(bytes.length, ecLevel || "M");
  if (version === null) return null;
  return buildQR(bytes, version, ecLevel || "M");
}

// ---- payload builders ----
function buildTextPayload(text) { return text == null ? "" : String(text); }

function buildUrlPayload(url) {
  url = (url || "").trim();
  if (!url) return "";
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) url = "https://" + url;
  return url;
}

function escapeWifi(s) {
  return String(s == null ? "" : s).replace(/([\\;,:"])/g, "\\$1");
}

function buildWifiPayload(ssid, password, enc) {
  enc = enc || "WPA";
  var out = "WIFI:T:" + enc + ";S:" + escapeWifi(ssid) + ";";
  if (enc !== "nopass") out += "P:" + escapeWifi(password) + ";";
  return out + ";";
}

function buildVCardPayload(name, phone) {
  return "BEGIN:VCARD\nVERSION:3.0\nFN:" + (name || "") +
    "\nTEL:" + (phone || "") + "\nEND:VCARD";
}

function detectPayloadType(payload) {
  if (/^WIFI:/i.test(payload)) return "wifi";
  if (/^BEGIN:VCARD/i.test(payload)) return "vcard";
  if (/^https?:\/\//i.test(payload) || /^www\./i.test(payload)) return "url";
  return "text";
}

// ---- random helpers (injectable rand for tests) ----
function defaultRand() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    var a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}
function ri(rand, min, max) { return min + Math.floor(rand() * (max - min + 1)); }
function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
function shuffle(arr, rand) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// ---- challenge ----
// Types: "biggest" (which text needs the biggest QR version),
// "capacity" (how many bytes fit in version N at level M),
// "identify" (what payload type is this string?).
function makeChallengeQuestion(rand) {
  rand = rand || defaultRand;
  var kind = Math.floor(rand() * 3);
  var i;
  if (kind === 0) {
    // 4 texts in 4 distinct version bands -> unique biggest version.
    var versions = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].slice(), rand).slice(0, 4);
    var texts = [], vers = [];
    var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";
    versions.forEach(function (v) {
      var cap = maxBytes(v, "M");
      var prev = v === 1 ? 0 : maxBytes(v - 1, "M");
      var len = prev + Math.max(1, Math.floor((cap - prev) / 2));
      var s = "";
      for (var k = 0; k < len; k++) s += chars[Math.floor(rand() * chars.length)];
      texts.push(s);
      vers.push(chooseVersion(utf8Bytes(s).length, "M"));
    });
    var maxV = Math.max.apply(null, vers);
    return { type: "biggest", texts: texts, versions: vers, answer: vers.indexOf(maxV), options: [0, 1, 2, 3] };
  }
  if (kind === 1) {
    var v = 1 + Math.floor(rand() * 10);
    var cap = maxBytes(v, "M");
    var others = [];
    for (i = 1; i <= 10; i++) {
      if (i !== v) others.push(maxBytes(i, "M"));
    }
    var opts = shuffle([cap].concat(shuffle(others, rand).slice(0, 3)), rand);
    return { type: "capacity", version: v, answer: cap, options: opts };
  }
  var types = PAYLOAD_TYPES.slice();
  var t = pick(rand, types);
  var payload;
  if (t === "url") payload = buildUrlPayload("example.com/page-" + ri(rand, 1, 99));
  else if (t === "wifi") payload = buildWifiPayload("HomeNet-" + ri(rand, 1, 99), "secret" + ri(rand, 10, 99), "WPA");
  else if (t === "vcard") payload = buildVCardPayload("Sara Ahmadi", "0912" + ri(rand, 1000000, 9999999));
  else payload = "Hello QR " + ri(rand, 100, 999);
  return { type: "identify", payload: payload, answer: t, options: shuffle(types, rand) };
}

function checkAnswer(q, chosen) { return chosen === q.answer; }

if (typeof module !== "undefined") {
  module.exports = {
    CHALLENGE_ROUNDS: CHALLENGE_ROUNDS, CHALLENGE_SECONDS: CHALLENGE_SECONDS,
    HISTORY_KEY: HISTORY_KEY, STATS_KEY: STATS_KEY, BEST_KEY: BEST_KEY,
    MAX_HISTORY: MAX_HISTORY, PAYLOAD_TYPES: PAYLOAD_TYPES,
    TOTAL_CODEWORDS: TOTAL_CODEWORDS, ECC_PER_BLOCK: ECC_PER_BLOCK,
    NUM_EC_BLOCKS: NUM_EC_BLOCKS, ALIGNMENT_POS: ALIGNMENT_POS,
    REMAINDER_BITS: REMAINDER_BITS,
    dataCodewordCount: dataCodewordCount, maxBytes: maxBytes,
    chooseVersion: chooseVersion, utf8Bytes: utf8Bytes,
    gfMul: gfMul, reedSolomonComputeDivisor: reedSolomonComputeDivisor,
    reedSolomonComputeRemainder: reedSolomonComputeRemainder,
    getFormatBits: getFormatBits, getVersionBits: getVersionBits,
    getMaskBit: getMaskBit, penaltyScore: penaltyScore,
    encodeDataCodewords: encodeDataCodewords,
    interleaveCodewords: interleaveCodewords,
    encodeQR: encodeQR, buildQR: buildQR,
    buildTextPayload: buildTextPayload, buildUrlPayload: buildUrlPayload,
    buildWifiPayload: buildWifiPayload, buildVCardPayload: buildVCardPayload,
    detectPayloadType: detectPayloadType,
    makeChallengeQuestion: makeChallengeQuestion, checkAnswer: checkAnswer
  };
}

if (typeof document !== "undefined") {
  var fmt = function (n) {
    return (window.POOF2I18N && window.POOF2I18N.ready)
      ? window.POOF2I18N.formatNumber(n) : String(n);
  };
  var t = function (key, fallback) {
    return (window.POOF2I18N && window.POOF2I18N.ready && window.POOF2I18N.has(key))
      ? window.POOF2I18N.t(key) : fallback;
  };
  var G = (typeof window !== "undefined") ? window.POOF2Game : null;
  var UI = "tool_ui.qr-generator.";

  var typeSelect = document.getElementById("typeSelect");
  var panels = {
    text: document.getElementById("textPanel"),
    url: document.getElementById("urlPanel"),
    wifi: document.getElementById("wifiPanel"),
    vcard: document.getElementById("vcardPanel")
  };
  var textInput = document.getElementById("textInput");
  var urlInput = document.getElementById("urlInput");
  var wifiSsid = document.getElementById("wifiSsid");
  var wifiPassword = document.getElementById("wifiPassword");
  var wifiEncryption = document.getElementById("wifiEncryption");
  var vcardName = document.getElementById("vcardName");
  var vcardPhone = document.getElementById("vcardPhone");
  var payloadPreview = document.getElementById("payloadPreview");
  var ecL = document.getElementById("ecL");
  var ecM = document.getElementById("ecM");
  var qrCanvas = document.getElementById("qrCanvas");
  var genFeedback = document.getElementById("genFeedback");
  var versionOut = document.getElementById("versionOut");
  var ecOut = document.getElementById("ecOut");
  var capacityOut = document.getElementById("capacityOut");
  var historyList = document.getElementById("historyList");
  var historyEmpty = document.getElementById("historyEmpty");
  var statsLine = document.getElementById("statsLine");
  var currentQR = null, currentPayload = "", currentType = "text";

  function currentPayloadAndType() {
    var type = typeSelect.value;
    var payload = "";
    if (type === "text") payload = buildTextPayload(textInput.value);
    else if (type === "url") payload = buildUrlPayload(urlInput.value);
    else if (type === "wifi") payload = buildWifiPayload(wifiSsid.value, wifiPassword.value, wifiEncryption.value);
    else payload = buildVCardPayload(vcardName.value, vcardPhone.value);
    return { type: type, payload: payload };
  }

  function showPanel() {
    var type = typeSelect.value;
    Object.keys(panels).forEach(function (k) { panels[k].hidden = (k !== type); });
    updatePreview();
  }

  function updatePreview() {
    var p = currentPayloadAndType();
    payloadPreview.textContent = p.payload || "—";
  }

  function drawQR(canvas, qr) {
    var quiet = 4;
    var scale = Math.max(3, Math.round(360 / (qr.size + quiet * 2)));
    var px = (qr.size + quiet * 2) * scale;
    canvas.width = px; canvas.height = px;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = "#10231f";
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
      }
    }
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
  }
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { total: 0, byType: {} }; } catch (e) { return { total: 0, byType: {} }; }
  }
  function saveHistory(h) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) { /* ignore */ } }
  function saveStats(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

  function renderHistory() {
    var h = loadHistory();
    historyList.innerHTML = "";
    historyEmpty.hidden = h.length > 0;
    h.forEach(function (item, idx) {
      var li = document.createElement("li");
      li.className = "history-item";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-load";
      var preview = item.payload.length > 42 ? item.payload.slice(0, 42) + "…" : item.payload;
      btn.textContent = preview + " · " + t(UI + "type_" + item.type, item.type) +
        " · v" + fmt(item.version);
      btn.onclick = function () { loadHistoryItem(item); };
      var del = document.createElement("button");
      del.type = "button";
      del.className = "history-del";
      del.setAttribute("aria-label", t(UI + "history_delete", "حذف"));
      del.textContent = "✕";
      del.onclick = function () {
        var hh = loadHistory();
        hh.splice(idx, 1);
        saveHistory(hh);
        renderHistory();
      };
      li.appendChild(btn);
      li.appendChild(del);
      historyList.appendChild(li);
    });
    var s = loadStats();
    var most = "—", mostCount = 0;
    Object.keys(s.byType).forEach(function (k) {
      if (s.byType[k] > mostCount) { mostCount = s.byType[k]; most = k; }
    });
    var counts = PAYLOAD_TYPES.map(function (k) {
      return t(UI + "type_" + k, k) + ": " + fmt(s.byType[k] || 0);
    }).join(" · ");
    statsLine.textContent = t(UI + "stats_total", "کل ساخته‌شده") + ": " + fmt(s.total) +
      " · " + counts + " · " + t(UI + "stats_most_used", "پرمصرف‌ترین نوع") + ": " +
      (mostCount ? t(UI + "type_" + most, most) : t(UI + "stats_none", "—"));
  }

  function loadHistoryItem(item) {
    typeSelect.value = item.type;
    showPanel();
    if (item.type === "text") textInput.value = item.payload;
    else if (item.type === "url") urlInput.value = item.payload;
    else if (item.type === "wifi") {
      var m = /^WIFI:T:([^;]*);S:((?:\\.|[^;])*);(?:P:((?:\\.|[^;])*);)?;?$/.exec(item.payload);
      if (m) {
        wifiEncryption.value = m[1] || "WPA";
        wifiSsid.value = (m[2] || "").replace(/\\(.)/g, "$1");
        wifiPassword.value = (m[3] || "").replace(/\\(.)/g, "$1");
      }
    } else if (item.type === "vcard") {
      var nm = /^FN:(.*)$/m.exec(item.payload);
      var ph = /^TEL:(.*)$/m.exec(item.payload);
      if (nm) vcardName.value = nm[1];
      if (ph) vcardPhone.value = ph[1];
    }
    updatePreview();
    generate();
  }

  function generate() {
    var p = currentPayloadAndType();
    currentPayload = p.payload; currentType = p.type;
    if (!p.payload) {
      genFeedback.textContent = t(UI + "empty_input", "اول چیزی بنویس تا کد QR ساخته شود.");
      genFeedback.className = "feedback bad";
      return;
    }
    var ec = ecL.checked ? "L" : "M";
    var qr = encodeQR(p.payload, ec);
    if (!qr) {
      genFeedback.textContent = t(UI + "too_long", "متن خیلی بزرگ است؛ حتی نسخه‌ی ۱۰ هم جا نمی‌شود. کوتاه‌ترش کن.");
      genFeedback.className = "feedback bad";
      return;
    }
    genFeedback.textContent = "";
    genFeedback.className = "feedback";
    currentQR = qr;
    drawQR(qrCanvas, qr);
    versionOut.textContent = fmt(qr.version) + " (" + fmt(qr.size) + "×" + fmt(qr.size) + ")";
    ecOut.textContent = ec + (ec === "M" ? " · 15%" : " · 7%");
    capacityOut.textContent = fmt(qr.byteLength) + " / " + fmt(qr.capacityBytes) + " " + t(UI + "meta_bytes", "بایت");
    var h = loadHistory();
    h.unshift({ payload: p.payload, type: p.type, version: qr.version, ec: ec, time: Date.now() });
    saveHistory(h.slice(0, MAX_HISTORY));
    var s = loadStats();
    s.total++;
    s.byType[p.type] = (s.byType[p.type] || 0) + 1;
    saveStats(s);
    renderHistory();
  }

  function copyText(text, feedbackEl) {
    if (!text) return;
    var done = function () {
      feedbackEl.textContent = t(UI + "copied", "کپی شد!");
      feedbackEl.className = "feedback good";
      setTimeout(function () { feedbackEl.textContent = ""; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    done();
  }

  typeSelect.addEventListener("change", showPanel);
  [textInput, urlInput, wifiSsid, wifiPassword, wifiEncryption, vcardName, vcardPhone].forEach(function (el) {
    el.addEventListener("input", updatePreview);
    el.addEventListener("change", updatePreview);
  });
  document.getElementById("generateBtn").onclick = generate;
  document.getElementById("copyBtn").onclick = function () {
    copyText(currentPayload, document.getElementById("copyFeedback"));
  };
  document.getElementById("downloadBtn").onclick = function () {
    if (!currentQR) return;
    var done = function () {
      var f = document.getElementById("downloadFeedback");
      f.textContent = t(UI + "downloaded", "دانلود شد!");
      f.className = "feedback good";
      setTimeout(function () { f.textContent = ""; }, 2000);
    };
    if (qrCanvas.toBlob) {
      qrCanvas.toBlob(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "poof2-qr.png";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        done();
      });
    } else {
      var a2 = document.createElement("a");
      a2.href = qrCanvas.toDataURL("image/png");
      a2.download = "poof2-qr.png";
      a2.click();
      done();
    }
  };
  document.getElementById("clearHistoryBtn").onclick = function () {
    saveHistory([]);
    renderHistory();
  };
  showPanel();
  renderHistory();

  /* ---------- challenge round (DOM) ---------- */
  var chCard = document.getElementById("challengeCard");
  if (chCard) {
    var best = 0;
    try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { best = 0; }
    var bestEl = document.getElementById("bestScore");
    var startBtn = document.getElementById("challengeStart");
    var playBox = document.getElementById("challengePlay");
    var againBtn = document.getElementById("challengeAgain");
    var doneEl = document.getElementById("challengeDone");
    var qText = document.getElementById("qText");
    var qDetail = document.getElementById("qDetail");
    var qOpts = document.getElementById("qOpts");
    var qFeedback = document.getElementById("qFeedback");
    var qHint = document.getElementById("qHint");
    var qScoreEl = document.getElementById("qScore");
    var timeEl = document.getElementById("timeLeft");
    var round = 0, score = 0, currentQ = null, timer = null, secondsLeft = CHALLENGE_SECONDS;

    function showBest() { if (bestEl) bestEl.textContent = fmt(best); }
    showBest();
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

    function finish() {
      stopTimer();
      playBox.hidden = true;
      againBtn.hidden = false;
      var isBest = score > best;
      if (isBest) {
        best = score;
        try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
        showBest();
      }
      var res = null;
      if (G && G.recordChallengeComplete) res = G.recordChallengeComplete(score, CHALLENGE_ROUNDS);
      doneEl.hidden = false;
      doneEl.textContent = t(UI + "challenge_done", "تمام شد!")
        + " " + fmt(score) + " / " + fmt(CHALLENGE_ROUNDS)
        + (res ? " · +" + fmt(res.gained) + " " + t("game.xp", "امتیاز") : "")
        + (isBest ? " · " + t("game.best", "رکورد") + "!" : "");
    }

    function nextQuestion() {
      if (round >= CHALLENGE_ROUNDS) { finish(); return; }
      currentQ = makeChallengeQuestion();
      round++;
      qFeedback.textContent = "";
      qFeedback.className = "feedback";
      qHint.textContent = "";
      qDetail.textContent = "";
      qDetail.hidden = true;
      qOpts.innerHTML = "";
      if (currentQ.type === "biggest") {
        qText.textContent = t(UI + "challenge_q_biggest", "کدام متن به بزرگ‌ترین نسخه‌ی QR نیاز دارد؟");
        currentQ.texts.forEach(function (tx, idx) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "qr-opt";
          b.setAttribute("data-value", String(idx));
          b.textContent = tx.length > 60 ? tx.slice(0, 60) + "…" : tx;
          b.onclick = function () { answer(idx, b); };
          qOpts.appendChild(b);
        });
        qHint.textContent = t(UI + "challenge_hint_biggest", "راهنما: متن بلندتر، نسخه‌ی بزرگ‌تر می‌خواهد.");
      } else if (currentQ.type === "capacity") {
        qText.textContent = t(UI + "challenge_q_capacity", "چند بایت در این نسخه با سطح M جا می‌شود؟");
        qDetail.hidden = false;
        qDetail.textContent = t(UI + "meta_version", "نسخه") + " " + fmt(currentQ.version);
        currentQ.options.forEach(function (cap) {
          var b = document.createElement("button");
          b.type = "button";
          b.setAttribute("data-value", String(cap));
          b.textContent = fmt(cap) + " " + t(UI + "meta_bytes", "بایت");
          b.onclick = function () { answer(cap, b); };
          qOpts.appendChild(b);
        });
      } else {
        qText.textContent = t(UI + "challenge_q_type", "این رشته چه نوع محتوایی است؟");
        qDetail.hidden = false;
        qDetail.textContent = currentQ.payload;
        currentQ.options.forEach(function (tp) {
          var b = document.createElement("button");
          b.type = "button";
          b.setAttribute("data-value", tp);
          b.textContent = t(UI + "type_" + tp, tp);
          b.onclick = function () { answer(tp, b); };
          qOpts.appendChild(b);
        });
      }
      qScoreEl.textContent = fmt(score);
      secondsLeft = CHALLENGE_SECONDS;
      timeEl.textContent = fmt(secondsLeft);
      stopTimer();
      timer = setInterval(function () {
        secondsLeft--;
        timeEl.textContent = fmt(Math.max(secondsLeft, 0));
        if (secondsLeft <= 0) { stopTimer(); answer(null, null); }
      }, 1000);
    }

    function answer(chosen, btn) {
      stopTimer();
      var ok = chosen !== null && checkAnswer(currentQ, chosen);
      var buttons = qOpts.querySelectorAll("button");
      buttons.forEach(function (b) {
        b.disabled = true;
        if (String(b.getAttribute("data-value")) === String(currentQ.answer)) b.classList.add("correct");
      });
      if (btn && !ok) btn.classList.add("wrong");
      if (ok) {
        score++;
        qFeedback.textContent = "✅ " + t(UI + "challenge_correct", "درست!");
        qFeedback.className = "feedback good";
      } else {
        var correctText = currentQ.type === "biggest"
          ? currentQ.texts[currentQ.answer].slice(0, 40) + "…"
          : currentQ.type === "capacity"
            ? fmt(currentQ.answer) + " " + t(UI + "meta_bytes", "بایت")
            : t(UI + "type_" + currentQ.answer, currentQ.answer);
        qFeedback.textContent = "❌ " + t(UI + "challenge_wrong", "اشتباه شد.") + " " + correctText;
        qFeedback.className = "feedback bad";
      }
      if (currentQ.type === "biggest") {
        qHint.textContent = t(UI + "meta_version", "نسخه") + ": " +
          currentQ.versions.map(function (v) { return fmt(v); }).join(" · ");
      } else if (currentQ.type === "capacity") {
        qHint.textContent = t(UI + "meta_version", "نسخه") + " " + fmt(currentQ.version) +
          " · " + t(UI + "meta_capacity", "ظرفیت استفاده‌شده") + ": " + fmt(currentQ.answer) + " " + t(UI + "meta_bytes", "بایت");
      }
      qScoreEl.textContent = fmt(score);
      setTimeout(nextQuestion, 2200);
    }

    startBtn.onclick = function () {
      round = 0; score = 0;
      startBtn.hidden = true;
      againBtn.hidden = true;
      doneEl.hidden = true;
      playBox.hidden = false;
      nextQuestion();
    };
    againBtn.onclick = function () {
      round = 0; score = 0;
      againBtn.hidden = true;
      doneEl.hidden = true;
      playBox.hidden = false;
      nextQuestion();
    };
  }
}
