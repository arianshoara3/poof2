// Color lab studio. Pure functions exported for Node testing;
// DOM code runs only in the browser. No CDN, no external libraries.
var CHALLENGE_ROUNDS = 10;
var CHALLENGE_SECONDS = 15;
var BEST_KEY = "poof2-best-color-lab";

// ---- parsing & conversion ----

// Parse "#RRGGBB", "RRGGBB", "#RGB" or "RGB" (case-insensitive) -> {r,g,b} or null.
function parseHex(input) {
  if (typeof input !== "string") return null;
  var s = input.trim().replace(/^#/, "");
  if (s.length === 3) {
    if (!/^[0-9a-fA-F]{3}$/.test(s)) return null;
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  } else if (s.length === 6) {
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  } else {
    return null;
  }
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16)
  };
}

function hexToRgb(hex) {
  return parseHex(hex);
}

function clampByte(n) {
  n = Math.round(n);
  if (isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n;
}

function rgbToHex(r, g, b) {
  function two(n) {
    var h = clampByte(n).toString(16).toUpperCase();
    return h.length === 1 ? "0" + h : h;
  }
  return "#" + two(r) + two(g) + two(b);
}

// -> {h: 0-360, s: 0-100, l: 0-100} rounded to 1 decimal.
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return {
    h: Math.round(h * 10) / 10,
    s: Math.round(s * 1000) / 10,
    l: Math.round(l * 1000) / 10
  };
}

// h: 0-360, s/l: 0-100 -> {r,g,b} ints 0-255.
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  var r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    var hk = h / 360;
    var tc = [hk + 1 / 3, hk, hk - 1 / 3];
    var out = tc.map(function (t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    });
    r = out[0]; g = out[1]; b = out[2];
  }
  return { r: clampByte(r * 255), g: clampByte(g * 255), b: clampByte(b * 255) };
}

function rotateHue(hex, deg) {
  var rgb = parseHex(hex);
  if (!rgb) return null;
  var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  var c = hslToRgb(hsl.h + deg, hsl.s, hsl.l);
  return rgbToHex(c.r, c.g, c.b);
}

function complementary(hex) {
  return rotateHue(hex, 180);
}

function analogous(hex) {
  var a = rotateHue(hex, -30), b = rotateHue(hex, 30);
  if (!a || !b) return null;
  return [a, b];
}

function triadic(hex) {
  var a = rotateHue(hex, 120), b = rotateHue(hex, 240);
  if (!a || !b) return null;
  return [a, b];
}

// 5 monochromatic shades: lightness spread around the base, strictly increasing.
function shades(hex) {
  var rgb = parseHex(hex);
  if (!rgb) return null;
  var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  var l = hsl.l;
  var ls = [
    l * 0.25,
    l * 0.55,
    l,
    l + (100 - l) * 0.45,
    l + (100 - l) * 0.75
  ].map(function (v) { return Math.max(3, Math.min(97, Math.round(v * 10) / 10)); });
  for (var i = 1; i < ls.length; i++) {
    if (ls[i] <= ls[i - 1]) ls[i] = Math.min(97, ls[i - 1] + 2);
  }
  return ls.map(function (lv) {
    var c = hslToRgb(hsl.h, hsl.s, lv);
    return rgbToHex(c.r, c.g, c.b);
  });
}

// ---- WCAG contrast ----

function relativeLuminance(r, g, b) {
  function lin(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// rgb objects {r,g,b}; returns ratio rounded to 2 decimals, or null on bad input.
function contrastRatio(a, b) {
  if (!a || !b) return null;
  if ([a.r, a.g, a.b, b.r, b.g, b.b].some(function (v) {
    return typeof v !== "number" || isNaN(v);
  })) return null;
  var la = relativeLuminance(a.r, a.g, a.b);
  var lb = relativeLuminance(b.r, b.g, b.b);
  var hi = Math.max(la, lb), lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

function wcagLevel(ratio) {
  if (typeof ratio !== "number" || isNaN(ratio)) return null;
  return {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5
  };
}

// ---- random colors & challenge ----

function randomHex() {
  var h = Math.floor(Math.random() * 360);
  var s = 45 + Math.floor(Math.random() * 50); // 45-94
  var l = 30 + Math.floor(Math.random() * 40); // 30-69
  var c = hslToRgb(h, s, l);
  return rgbToHex(c.r, c.g, c.b);
}

function distinctHexes(count, exclude) {
  var out = [];
  var seen = {};
  (exclude || []).forEach(function (x) { seen[x.toUpperCase()] = true; });
  var guard = 0;
  while (out.length < count && guard < 500) {
    guard++;
    var h = randomHex();
    if (!seen[h]) { seen[h] = true; out.push(h); }
  }
  return out;
}

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// type: "hex" | "swatch" | "contrast" (random if omitted).
// hex: show a swatch, pick its HEX. swatch: show a HEX, pick its swatch.
// contrast: pick the color with the best contrast on white.
function makeChallengeQuestion(type) {
  var types = ["hex", "swatch", "contrast"];
  if (types.indexOf(type) === -1) type = types[Math.floor(Math.random() * types.length)];
  if (type === "contrast") {
    var tries = 0;
    while (tries < 200) {
      tries++;
      var opts = distinctHexes(4, []);
      if (opts.length < 4) continue;
      var white = { r: 255, g: 255, b: 255 };
      var ratios = opts.map(function (h) {
        return contrastRatio(parseHex(h), white);
      });
      var best = 0;
      for (var i = 1; i < 4; i++) if (ratios[i] > ratios[best]) best = i;
      var sorted = ratios.slice().sort(function (a, b) { return b - a; });
      if (sorted[0] - sorted[1] < 0.05) continue; // need a clear winner
      return {
        type: "contrast", options: shuffle(opts), answer: opts[best],
        ratios: ratios, whiteHex: "#FFFFFF"
      };
    }
    // Fallback: fixed set with a clear winner (black beats the rest on white).
    var fbOpts = shuffle(["#000000", "#E74C3C", "#2ECC71", "#F5D76E"]);
    var fbWhite = { r: 255, g: 255, b: 255 };
    return {
      type: "contrast", options: fbOpts, answer: "#000000",
      ratios: fbOpts.map(function (h) { return contrastRatio(parseHex(h), fbWhite); }),
      whiteHex: "#FFFFFF"
    };
  }
  var answer = randomHex();
  var options = shuffle([answer].concat(distinctHexes(3, [answer])));
  if (type === "hex") {
    return { type: "hex", swatch: answer, options: options, answer: answer };
  }
  return { type: "swatch", hex: answer, options: options, answer: answer };
}

function checkAnswer(q, chosen) {
  if (!q || chosen === null || chosen === undefined) return false;
  return String(chosen).toUpperCase() === String(q.answer).toUpperCase();
}

if (typeof module !== "undefined") {
  module.exports = {
    CHALLENGE_ROUNDS: CHALLENGE_ROUNDS, CHALLENGE_SECONDS: CHALLENGE_SECONDS,
    BEST_KEY: BEST_KEY,
    parseHex: parseHex, hexToRgb: hexToRgb, rgbToHex: rgbToHex,
    rgbToHsl: rgbToHsl, hslToRgb: hslToRgb, rotateHue: rotateHue,
    complementary: complementary, analogous: analogous, triadic: triadic,
    shades: shades, relativeLuminance: relativeLuminance,
    contrastRatio: contrastRatio, wcagLevel: wcagLevel,
    randomHex: randomHex, distinctHexes: distinctHexes, shuffle: shuffle,
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
  var UI = "tool_ui.color-lab.";

  function copyText(text, feedbackEl) {
    function done() {
      if (feedbackEl) {
        feedbackEl.textContent = "✅ " + t(UI + "copied", "کپی شد!");
        feedbackEl.className = "feedback good";
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  // ---- converter ----
  var baseColor = document.getElementById("baseColor");
  var hexInput = document.getElementById("hexInput");
  var hexError = document.getElementById("hexError");
  var rRange = document.getElementById("rRange");
  var gRange = document.getElementById("gRange");
  var bRange = document.getElementById("bRange");
  var rVal = document.getElementById("rVal");
  var gVal = document.getElementById("gVal");
  var bVal = document.getElementById("bVal");
  var hslOut = document.getElementById("hslOut");
  var rgbOut = document.getElementById("rgbOut");
  var previewSwatch = document.getElementById("previewSwatch");
  var copyHexBtn = document.getElementById("copyHexBtn");
  var copyRgbBtn = document.getElementById("copyRgbBtn");
  var copyFeedback = document.getElementById("copyFeedback");

  function setColor(rgb, source) {
    if (!rgb) return;
    var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    if (source !== "picker") baseColor.value = hex;
    if (source !== "hex") hexInput.value = hex;
    if (source !== "sliders") {
      rRange.value = rgb.r; gRange.value = rgb.g; bRange.value = rgb.b;
    }
    rVal.textContent = fmt(rgb.r);
    gVal.textContent = fmt(rgb.g);
    bVal.textContent = fmt(rgb.b);
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hslOut.textContent = "hsl(" + fmt(hsl.h) + "°, " + fmt(hsl.s) + "%, " + fmt(hsl.l) + "%)";
    rgbOut.textContent = "rgb(" + fmt(rgb.r) + ", " + fmt(rgb.g) + ", " + fmt(rgb.b) + ")";
    previewSwatch.style.backgroundColor = hex;
    previewSwatch.textContent = hex;
    hexError.textContent = "";
    renderPalettes(hex);
  }

  baseColor.addEventListener("input", function () {
    setColor(parseHex(baseColor.value), "picker");
  });
  hexInput.addEventListener("input", function () {
    var rgb = parseHex(hexInput.value);
    if (rgb) {
      hexError.textContent = "";
      setColor(rgb, "hex");
    } else {
      hexError.textContent = t(UI + "hex_invalid", "کد HEX معتبر نیست؛ مثلاً #FF5733 یا #F53 بنویس.");
      hexError.className = "feedback bad";
    }
  });
  [rRange, gRange, bRange].forEach(function (el) {
    el.addEventListener("input", function () {
      setColor({
        r: parseInt(rRange.value, 10),
        g: parseInt(gRange.value, 10),
        b: parseInt(bRange.value, 10)
      }, "sliders");
    });
  });
  copyHexBtn.onclick = function () { copyText(hexInput.value, copyFeedback); };
  copyRgbBtn.onclick = function () { copyText(rgbOut.textContent, copyFeedback); };

  // ---- palettes ----
  var paletteBoxes = {
    complementary: document.getElementById("paletteComplementary"),
    analogous: document.getElementById("paletteAnalogous"),
    triadic: document.getElementById("paletteTriadic"),
    shades: document.getElementById("paletteShades")
  };

  function swatchButton(hex) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.style.backgroundColor = hex;
    b.textContent = hex;
    b.setAttribute("aria-label", hex);
    b.onclick = function () { copyText(hex, copyFeedback); };
    return b;
  }

  function renderPalettes(hex) {
    var comp = complementary(hex);
    var ana = analogous(hex);
    var tri = triadic(hex);
    var sh = shades(hex);
    function fill(box, list) {
      box.innerHTML = "";
      (list || []).forEach(function (h) { box.appendChild(swatchButton(h)); });
    }
    fill(paletteBoxes.complementary, comp ? [hex, comp] : []);
    fill(paletteBoxes.analogous, ana ? [ana[0], hex, ana[1]] : []);
    fill(paletteBoxes.triadic, tri ? [hex, tri[0], tri[1]] : []);
    fill(paletteBoxes.shades, sh || []);
  }

  // ---- contrast ----
  var fgColor = document.getElementById("fgColor");
  var bgColor = document.getElementById("bgColor");
  var contrastRatioEl = document.getElementById("contrastRatioOut");
  var contrastSample = document.getElementById("contrastSample");
  var badges = {
    aaNormal: document.getElementById("badgeAaNormal"),
    aaLarge: document.getElementById("badgeAaLarge"),
    aaaNormal: document.getElementById("badgeAaaNormal"),
    aaaLarge: document.getElementById("badgeAaaLarge")
  };

  function updateContrast() {
    var fg = parseHex(fgColor.value);
    var bg = parseHex(bgColor.value);
    var ratio = contrastRatio(fg, bg);
    if (ratio === null) return;
    contrastRatioEl.textContent = String(ratio).replace(".", "٫") + " : 1";
    contrastSample.style.color = fgColor.value;
    contrastSample.style.backgroundColor = bgColor.value;
    var level = wcagLevel(ratio);
    var pass = t(UI + "pass", "قبول"), fail = t(UI + "fail", "رد");
    badges.aaNormal.textContent = (level.aaNormal ? "✅ " : "❌ ") + passOrFail(level.aaNormal);
    badges.aaLarge.textContent = (level.aaLarge ? "✅ " : "❌ ") + passOrFail(level.aaLarge);
    badges.aaaNormal.textContent = (level.aaaNormal ? "✅ " : "❌ ") + passOrFail(level.aaaNormal);
    badges.aaaLarge.textContent = (level.aaaLarge ? "✅ " : "❌ ") + passOrFail(level.aaaLarge);
    function passOrFail(ok) { return ok ? pass : fail; }
  }
  fgColor.addEventListener("input", updateContrast);
  bgColor.addEventListener("input", updateContrast);

  setColor(parseHex(baseColor.value) || { r: 231, g: 76, b: 60 }, "picker");
  updateContrast();

  // ---- challenge ----
  var bestScoreEl = document.getElementById("bestScore");
  var startBtn = document.getElementById("challengeStart");
  var againBtn = document.getElementById("challengeAgain");
  var playBox = document.getElementById("challengePlay");
  var timeEl = document.getElementById("timeLeft");
  var qText = document.getElementById("qText");
  var qSwatch = document.getElementById("qSwatch");
  var qDetail = document.getElementById("qDetail");
  var qOpts = document.getElementById("qOpts");
  var qFeedback = document.getElementById("qFeedback");
  var qHint = document.getElementById("qHint");
  var qScoreEl = document.getElementById("qScore");
  var doneEl = document.getElementById("challengeDone");

  var best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) {}
  bestScoreEl.textContent = fmt(best);

  var round = 0, score = 0, currentQ = null, timer = null, secondsLeft = CHALLENGE_SECONDS;

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function nextQuestion() {
    if (round >= CHALLENGE_ROUNDS) { finishChallenge(); return; }
    round++;
    currentQ = makeChallengeQuestion();
    qFeedback.textContent = "";
    qFeedback.className = "feedback";
    qHint.textContent = "";
    qOpts.innerHTML = "";
    qSwatch.hidden = true;
    qDetail.hidden = true;
    if (currentQ.type === "hex") {
      qText.textContent = t(UI + "challenge_q_hex", "کد HEX این رنگ چیست؟");
      qSwatch.hidden = false;
      qSwatch.style.backgroundColor = currentQ.swatch;
      qSwatch.textContent = "?";
      currentQ.options.forEach(function (hex) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "hex-opt";
        b.setAttribute("data-value", hex);
        b.textContent = hex;
        b.onclick = function () { answer(hex, b); };
        qOpts.appendChild(b);
      });
    } else if (currentQ.type === "swatch") {
      qText.textContent = t(UI + "challenge_q_swatch", "کدام رنگ، این کد HEX است؟");
      qDetail.hidden = false;
      qDetail.textContent = currentQ.hex;
      currentQ.options.forEach(function (hex) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "swatch-opt";
        b.style.backgroundColor = hex;
        b.setAttribute("data-value", hex);
        b.setAttribute("aria-label", hex);
        b.onclick = function () { answer(hex, b); };
        qOpts.appendChild(b);
      });
    } else {
      qText.textContent = t(UI + "challenge_q_contrast", "کدام رنگ روی پس‌زمینه‌ی سفید بهترین کنتراست را دارد؟");
      currentQ.options.forEach(function (hex) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "swatch-opt contrast-opt";
        b.style.backgroundColor = hex;
        b.setAttribute("data-value", hex);
        b.setAttribute("aria-label", hex);
        b.onclick = function () { answer(hex, b); };
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
      if (String(b.getAttribute("data-value")).toUpperCase() === String(currentQ.answer).toUpperCase()) b.classList.add("correct");
    });
    if (btn && !ok) btn.classList.add("wrong");
    if (ok) {
      score++;
      qFeedback.textContent = "✅ " + t(UI + "challenge_correct", "درست!");
      qFeedback.className = "feedback good";
    } else {
      qFeedback.textContent = "❌ " + t(UI + "challenge_wrong", "اشتباه شد.") + " " + currentQ.answer;
      qFeedback.className = "feedback bad";
    }
    if (currentQ.type === "contrast") {
      var white = { r: 255, g: 255, b: 255 };
      var ratio = contrastRatio(parseHex(currentQ.answer), white);
      qHint.textContent = t(UI + "challenge_hint_contrast", "بهترین گزینه") + ": " +
        currentQ.answer + " (" + String(ratio).replace(".", "٫") + " : 1)";
    }
    qScoreEl.textContent = fmt(score);
    setTimeout(nextQuestion, 2200);
  }

  function finishChallenge() {
    stopTimer();
    playBox.hidden = true;
    againBtn.hidden = false;
    var isBest = score > best;
    if (isBest) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
      bestScoreEl.textContent = fmt(best);
    }
    doneEl.hidden = false;
    doneEl.textContent = t(UI + "challenge_done", "تمام شد!") + " " +
      fmt(score) + " / " + fmt(CHALLENGE_ROUNDS);
    if (G && G.recordChallengeComplete) {
      var res = G.recordChallengeComplete(score, CHALLENGE_ROUNDS);
      if (res && res.xp) doneEl.textContent += " · +" + fmt(res.xp) + " XP";
    }
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
