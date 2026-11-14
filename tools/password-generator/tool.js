// Strong password generator. Pure functions exported for Node testing;
// DOM code runs only in the browser.
var CHALLENGE_ROUNDS = 10;
var CHALLENGE_SECONDS = 15;
var LOWER = "abcdefghijklmnopqrstuvwxyz";
var UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
var DIGITS = "0123456789";
var SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?";
var AMBIGUOUS = "l1IO0";
var LEVEL_KEYS = [
  "level_very_weak", "level_weak", "level_medium", "level_strong", "level_very_strong"
];
var LEVEL_COLORS = ["#c0392b", "#e67e22", "#d9a400", "#5aa469", "#2e7d32"];
var GUESSES_PER_SECOND = 1e10; // fast offline attack, used for the crack-time estimate
var WORDS = [
  "apple", "river", "sunny", "brave", "cloud", "dance", "eagle", "forest",
  "green", "happy", "island", "jungle", "kite", "lemon", "magic", "night",
  "ocean", "peace", "queen", "rain", "stone", "tiger", "ultra", "violet",
  "water", "yellow", "zebra", "amber", "breeze", "candle", "delta", "ember",
  "flame", "garden", "harbor", "ivory", "jasper", "karma", "lantern", "marble",
  "noble", "onyx", "pearl", "quartz", "rocket", "silver", "tulip", "umber",
  "velvet", "willow", "yonder", "zephyr", "anchor", "bridge", "canyon", "desert",
  "echo", "falcon", "glacier", "horizon", "ink", "journey", "key", "lagoon",
  "meadow", "nebula", "orbit", "pilot", "quilt", "ridge", "summit", "thunder",
  "unity", "valley", "whisper", "xenon", "youth", "zenith", "atlas", "bison",
  "comet", "dune", "elm", "fern", "grove", "hawk", "iris", "jade",
  "koala", "linden", "moon", "nova", "oak", "pine", "raven", "sage",
  "timber", "urban", "vine", "wolf", "yarn", "cedar"
];

function ri(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}
function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}
function shuffle(arr, rand) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
function removeChars(s, chars) {
  var out = "";
  for (var i = 0; i < s.length; i++) {
    if (chars.indexOf(s[i]) === -1) out += s[i];
  }
  return out;
}

// Uniform random in [0,1): crypto in the browser, Math.random fallback.
function defaultRand() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    var a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}

// Character sets actually used, after the exclude-ambiguous option.
function activeSets(opts) {
  var sets = [];
  var ex = opts.excludeAmbiguous ? AMBIGUOUS : "";
  if (opts.lower) sets.push(removeChars(LOWER, ex));
  if (opts.upper) sets.push(removeChars(UPPER, ex));
  if (opts.digits) sets.push(removeChars(DIGITS, ex));
  if (opts.symbols) sets.push(removeChars(SYMBOLS, ex));
  return sets.filter(function (s) { return s.length > 0; });
}

function poolSize(opts) {
  var total = 0;
  activeSets(opts).forEach(function (s) { total += s.length; });
  return total;
}

function entropyBits(length, pool) {
  if (!pool || pool <= 1 || !length) return 0;
  return length * (Math.log(pool) / Math.log(2));
}

// 5 strength levels: 0 very weak, 1 weak, 2 medium, 3 strong, 4 very strong.
function strengthLevel(bits) {
  if (bits < 28) return 0;
  if (bits < 36) return 1;
  if (bits < 60) return 2;
  if (bits < 80) return 3;
  return 4;
}

// Estimated crack time, as { value, unit } where unit is one of:
// instant, seconds, minutes, hours, days, months, years, centuries.
// The value is a plain number; the unit word comes from i18n.
function crackTimeParts(bits) {
  var seconds = Math.pow(2, bits) / GUESSES_PER_SECOND;
  if (seconds < 1) return { value: 0, unit: "instant" };
  if (seconds < 60) return { value: Math.round(seconds), unit: "seconds" };
  if (seconds < 3600) return { value: Math.round(seconds / 60), unit: "minutes" };
  if (seconds < 86400) return { value: Math.round(seconds / 3600), unit: "hours" };
  if (seconds < 30 * 86400) return { value: Math.round(seconds / 86400), unit: "days" };
  if (seconds < 365.25 * 86400) return { value: Math.round(seconds / (30 * 86400)), unit: "months" };
  if (seconds < 100 * 365.25 * 86400) return { value: Math.round(seconds / (365.25 * 86400)), unit: "years" };
  return { value: Math.round(seconds / (100 * 365.25 * 86400)), unit: "centuries" };
}

// Generate a password. Returns null when no character class is selected
// (never an empty password). Every selected class appears at least once.
function generatePassword(opts, rand) {
  rand = rand || defaultRand;
  var sets = activeSets(opts);
  if (sets.length === 0) return null;
  var length = opts.length || 16;
  if (length < sets.length) length = sets.length;
  var pool = sets.join("");
  var chars = [];
  sets.forEach(function (s) { chars.push(pick(rand, s)); });
  while (chars.length < length) chars.push(pick(rand, pool));
  return shuffle(chars, rand).join("");
}

function generatePassphrase(count, separator, rand) {
  rand = rand || defaultRand;
  count = count || 4;
  separator = (separator === undefined) ? "-" : separator;
  var words = [];
  var used = {};
  while (words.length < count) {
    var w = pick(rand, WORDS);
    if (used[w]) continue;
    used[w] = true;
    words.push(w);
  }
  return words.join(separator);
}

function passphraseEntropy(count) {
  return entropyBits(count || 4, WORDS.length);
}

// One challenge question. Two types, picked at random:
// "rate": show one password, pick its strength level (0-4).
// "strongest": show 4 passwords, pick the strongest one (index 0-3).
function makeChallengeQuestion(rand) {
  rand = rand || defaultRand;
  if (rand() < 0.5) {
    var sets = [];
    var classes = ["lower", "upper", "digits", "symbols"];
    classes.forEach(function (c) { if (rand() < 0.5) sets.push(c); });
    if (sets.length === 0) sets.push(pick(rand, classes));
    var opts = { length: ri(rand, 6, 20), excludeAmbiguous: rand() < 0.5 };
    sets.forEach(function (c) { opts[c] = true; });
    var pw = generatePassword(opts, rand);
    var bits = entropyBits(opts.length, poolSize(opts));
    var level = strengthLevel(bits);
    var others = shuffle([0, 1, 2, 3, 4].filter(function (l) { return l !== level; }), rand).slice(0, 3);
    var options = shuffle(others.concat([level]), rand);
    return { type: "rate", password: pw, bits: bits, answer: level, options: options };
  }
  var passwords = [];
  var bitsArr = [];
  for (var attempt = 0; attempt < 12; attempt++) {
    passwords = [];
    bitsArr = [];
    for (var i = 0; i < 4; i++) {
      var o = { length: ri(rand, 6, 18), excludeAmbiguous: rand() < 0.5 };
      var n = 0;
      ["lower", "upper", "digits", "symbols"].forEach(function (c) {
        if (rand() < 0.6) { o[c] = true; n++; }
      });
      if (n === 0) o.lower = true;
      passwords.push(generatePassword(o, rand));
      bitsArr.push(entropyBits(o.length, poolSize(o)));
    }
    var max = Math.max.apply(null, bitsArr);
    var winners = bitsArr.filter(function (b) { return b === max; }).length;
    if (winners === 1) break;
  }
  var maxBits = Math.max.apply(null, bitsArr);
  return {
    type: "strongest", passwords: passwords, bits: bitsArr,
    answer: bitsArr.indexOf(maxBits), options: [0, 1, 2, 3], maxBits: maxBits
  };
}

function checkAnswer(q, chosen) {
  return chosen === q.answer;
}

if (typeof module !== "undefined") {
  module.exports = {
    CHALLENGE_ROUNDS: CHALLENGE_ROUNDS, CHALLENGE_SECONDS: CHALLENGE_SECONDS,
    LOWER: LOWER, UPPER: UPPER, DIGITS: DIGITS, SYMBOLS: SYMBOLS,
    AMBIGUOUS: AMBIGUOUS, WORDS: WORDS, LEVEL_KEYS: LEVEL_KEYS,
    activeSets: activeSets, poolSize: poolSize, entropyBits: entropyBits,
    strengthLevel: strengthLevel, crackTimeParts: crackTimeParts,
    generatePassword: generatePassword, generatePassphrase: generatePassphrase,
    passphraseEntropy: passphraseEntropy,
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
  var UI = "tool_ui.password-generator.";

  var lengthRange = document.getElementById("lengthRange");
  var lengthValue = document.getElementById("lengthValue");
  var optLower = document.getElementById("optLower");
  var optUpper = document.getElementById("optUpper");
  var optDigits = document.getElementById("optDigits");
  var optSymbols = document.getElementById("optSymbols");
  var optExclude = document.getElementById("optExclude");
  var passwordOut = document.getElementById("passwordOut");
  var strengthFill = document.getElementById("strengthFill");
  var strengthLabel = document.getElementById("strengthLabel");
  var entropyOut = document.getElementById("entropyOut");
  var crackTimeOut = document.getElementById("crackTimeOut");
  var genFeedback = document.getElementById("genFeedback");
  var passphraseOut = document.getElementById("passphraseOut");

  function currentOpts() {
    return {
      length: Number(lengthRange.value),
      lower: optLower.checked, upper: optUpper.checked,
      digits: optDigits.checked, symbols: optSymbols.checked,
      excludeAmbiguous: optExclude.checked
    };
  }

  function renderStrength(opts, pw) {
    var pool = poolSize(opts);
    var bits = entropyBits(pw.length, pool);
    var level = strengthLevel(bits);
    var parts = crackTimeParts(bits);
    strengthFill.style.width = ((level + 1) * 20) + "%";
    strengthFill.style.background = LEVEL_COLORS[level];
    strengthLabel.textContent = t(UI + LEVEL_KEYS[level], LEVEL_KEYS[level]);
    entropyOut.textContent = fmt(Math.round(bits * 10) / 10) + " bits";
    crackTimeOut.textContent = parts.unit === "instant"
      ? t(UI + "time_instant", "فوری")
      : "≈ " + fmt(parts.value) + " " + t(UI + "time_" + parts.unit, parts.unit);
  }

  function generate() {
    var opts = currentOpts();
    var pw = generatePassword(opts);
    if (pw === null) {
      genFeedback.textContent = t(UI + "no_class_selected", "حداقل یک گروه کاراکتر را انتخاب کن.");
      genFeedback.className = "feedback bad";
      return;
    }
    genFeedback.textContent = "";
    genFeedback.className = "feedback";
    passwordOut.value = pw;
    renderStrength(opts, pw);
  }

  function copyText(input, feedbackEl) {
    if (!input.value) return;
    var done = function () {
      feedbackEl.textContent = t(UI + "copied", "کپی شد!");
      feedbackEl.className = "feedback good";
      setTimeout(function () { feedbackEl.textContent = ""; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done, function () { fallbackCopy(input, done); });
    } else {
      fallbackCopy(input, done);
    }
  }
  function fallbackCopy(input, done) {
    input.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    done();
  }

  lengthRange.addEventListener("input", function () {
    lengthValue.textContent = fmt(Number(lengthRange.value));
  });
  document.getElementById("generateBtn").onclick = generate;
  document.getElementById("regenerateBtn").onclick = generate;
  document.getElementById("copyBtn").onclick = function () {
    copyText(passwordOut, document.getElementById("copyFeedback"));
  };
  [optLower, optUpper, optDigits, optSymbols, optExclude].forEach(function (el) {
    el.addEventListener("change", generate);
  });
  lengthValue.textContent = fmt(Number(lengthRange.value));

  document.getElementById("passphraseBtn").onclick = function () {
    var pp = generatePassphrase(4, "-");
    passphraseOut.value = pp;
    var bits = passphraseEntropy(4);
    var level = strengthLevel(bits);
    document.getElementById("passphraseStrength").textContent =
      t(UI + LEVEL_KEYS[level], LEVEL_KEYS[level]) + " · " +
      fmt(Math.round(bits * 10) / 10) + " bits";
  };
  document.getElementById("passphraseCopyBtn").onclick = function () {
    copyText(passphraseOut, document.getElementById("passphraseFeedback"));
  };

  generate();

  /* ---------- challenge round (DOM) ---------- */
  var chCard = document.getElementById("challengeCard");
  if (chCard) {
    var BEST_KEY = "poof2-best-password-generator";
    var best = 0;
    try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { best = 0; }
    var bestEl = document.getElementById("bestScore");
    var startBtn = document.getElementById("challengeStart");
    var playBox = document.getElementById("challengePlay");
    var againBtn = document.getElementById("challengeAgain");
    var doneEl = document.getElementById("challengeDone");
    var qText = document.getElementById("qText");
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
      qOpts.innerHTML = "";
      if (currentQ.type === "rate") {
        qText.textContent = t(UI + "challenge_question_rate", "قدرت این رمز چقدر است؟");
        var pwEl = document.createElement("p");
        pwEl.className = "challenge-pw";
        pwEl.textContent = currentQ.password;
        qText.appendChild(pwEl);
        currentQ.options.forEach(function (lvl) {
          var b = document.createElement("button");
          b.type = "button";
          b.setAttribute("data-value", String(lvl));
          b.textContent = t(UI + LEVEL_KEYS[lvl], LEVEL_KEYS[lvl]);
          b.onclick = function () { answer(lvl, b); };
          qOpts.appendChild(b);
        });
      } else {
        qText.textContent = t(UI + "challenge_question_strongest", "کدام رمز قوی‌تر است؟");
        currentQ.passwords.forEach(function (pw, idx) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "pw-opt";
          b.setAttribute("data-value", String(idx));
          b.textContent = pw;
          b.onclick = function () { answer(idx, b); };
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
        if (Number(b.getAttribute("data-value")) === currentQ.answer) b.classList.add("correct");
      });
      if (btn && !ok) btn.classList.add("wrong");
      if (ok) {
        score++;
        qFeedback.textContent = "✅ " + t(UI + "challenge_correct", "درست!");
        qFeedback.className = "feedback good";
      } else {
        var correctText = currentQ.type === "rate"
          ? t(UI + LEVEL_KEYS[currentQ.answer], LEVEL_KEYS[currentQ.answer])
          : currentQ.passwords[currentQ.answer];
        qFeedback.textContent = "❌ " + t(UI + "challenge_wrong", "اشتباه شد.") + " " + correctText;
        qFeedback.className = "feedback bad";
      }
      var bits = currentQ.type === "rate" ? currentQ.bits : currentQ.maxBits;
      qHint.textContent = t(UI + "entropy_label", "آنتروپی") + ": " +
        fmt(Math.round(bits * 10) / 10) + " bits";
      qScoreEl.textContent = fmt(score);
      setTimeout(nextQuestion, 2000);
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
