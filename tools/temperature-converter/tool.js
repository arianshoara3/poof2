// Temperature unit converter. Pure functions exported for Node testing;
// DOM code runs only in the browser.
var UNITS = ["celsius", "fahrenheit", "kelvin"];

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

function toCelsius(value, from) {
  if (from === "celsius") return value;
  if (from === "fahrenheit") return (value - 32) * 5 / 9;
  if (from === "kelvin") return value - 273.15;
  return null;
}
function fromCelsius(c, to) {
  if (to === "celsius") return c;
  if (to === "fahrenheit") return c * 9 / 5 + 32;
  if (to === "kelvin") return c + 273.15;
  return null;
}
function convertTemp(value, from, to) {
  if (typeof value !== "number" || isNaN(value)) return null;
  if (UNITS.indexOf(from) === -1 || UNITS.indexOf(to) === -1) return null;
  if (from === "kelvin" && value < 0) return null;
  var c = toCelsius(value, from);
  if (c < -273.15) return null;
  return round2(fromCelsius(c, to));
}
function convertAll(value, from) {
  var out = {};
  UNITS.forEach(function (u) { out[u] = convertTemp(value, from, u); });
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { UNITS, convertTemp, convertAll, toCelsius, fromCelsius };
}

/* ---------- challenge mode (long-term plan §5: converter -> challenge game) ----------
 * 10 questions, 15 seconds each. Pure question generation is Node-testable;
 * the DOM round awards XP through POOF2Game at the end of the round
 * (score * 15 XP + 30 bonus for a perfect round), never per answer. */
var CHALLENGE_ROUNDS = 10;
var CHALLENGE_SECONDS = 15;
var CHALLENGE_VALUES = {
  celsius: [-40, -20, -10, 0, 10, 20, 25, 30, 37, 40, 100],
  fahrenheit: [-40, 0, 14, 32, 50, 68, 77, 98.6, 104, 212],
  kelvin: [233.15, 253.15, 273.15, 283.15, 293.15, 298.15, 310.15, 373.15]
};

function makeQuestion(rand) {
  rand = rand || Math.random;
  var from = UNITS[Math.floor(rand() * UNITS.length)];
  var to = from;
  while (to === from) to = UNITS[Math.floor(rand() * UNITS.length)];
  var values = CHALLENGE_VALUES[from];
  var value = values[Math.floor(rand() * values.length)];
  var answer = round1(convertTemp(value, from, to));
  var opts = [answer];
  var offsets = [5, -5, 10, -10, 18, -18, 32, -32, 9, -9, 20, -20, 2, -2];
  var oi = 0;
  while (opts.length < 4 && oi < offsets.length) {
    var cand = round1(answer + offsets[oi++]);
    if (to === "kelvin" && cand <= 0) continue;
    if (opts.indexOf(cand) === -1) opts.push(cand);
  }
  var add = 1;
  while (opts.length < 4) {
    var c2 = round1(answer + add++);
    if (to === "kelvin" && c2 <= 0) continue;
    if (opts.indexOf(c2) === -1) opts.push(c2);
  }
  for (var i = opts.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var t = opts[i]; opts[i] = opts[j]; opts[j] = t;
  }
  return { value: value, from: from, to: to, answer: answer, options: opts };
}

function checkAnswer(q, chosen) {
  return Math.abs(chosen - q.answer) < 1e-9;
}

if (typeof module !== "undefined") {
  module.exports.makeQuestion = makeQuestion;
  module.exports.checkAnswer = checkAnswer;
  module.exports.CHALLENGE_ROUNDS = CHALLENGE_ROUNDS;
  module.exports.CHALLENGE_SECONDS = CHALLENGE_SECONDS;
}

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
    var result = convertTemp(value, from, to);
    document.getElementById("resultOut").textContent = result === null ? "—" : fmt(result);
    document.getElementById("resultUnit").textContent =
      toSelect.options[toSelect.selectedIndex].textContent;
    var all = convertAll(value, from);
    UNITS.forEach(function (u) {
      var cell = document.querySelector('[data-all-unit="' + u + '"]');
      if (cell) cell.textContent = all[u] === null ? "—" : fmt(all[u]);
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

  /* ---------- challenge round (DOM) ---------- */
  var chCard = document.getElementById("challengeCard");
  if (chCard) {
    var G = (typeof window !== "undefined") ? window.POOF2Game : null;
    var BEST_KEY = "poof2-best-temp-challenge";
    var best = 0;
    try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { best = 0; }
    var fmtNum = function (n) {
      return (window.POOF2I18N && window.POOF2I18N.ready) ? window.POOF2I18N.formatNumber(n) : String(n);
    };
    var unitLabel = function (u) {
      var sel = document.getElementById("fromUnit");
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === u) return sel.options[i].textContent;
      }
      return u;
    };
    var t = function (key, fallback) {
      return (window.POOF2I18N && window.POOF2I18N.ready && window.POOF2I18N.has(key))
        ? window.POOF2I18N.t(key) : fallback;
    };
    var bestEl = document.getElementById("bestScore");
    var startBtn = document.getElementById("challengeStart");
    var playBox = document.getElementById("challengePlay");
    var againBtn = document.getElementById("challengeAgain");
    var doneEl = document.getElementById("challengeDone");
    var qText = document.getElementById("qText");
    var qOpts = document.getElementById("qOpts");
    var qFeedback = document.getElementById("qFeedback");
    var qScoreEl = document.getElementById("qScore");
    var timeEl = document.getElementById("timeLeft");
    var round = 0, score = 0, current = null, timer = null, secondsLeft = CHALLENGE_SECONDS;

    function showBest() { if (bestEl) bestEl.textContent = fmtNum(best); }
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
      doneEl.textContent = t("tool_ui.temperature-converter.challenge_done", "تمام شد!")
        + " " + fmtNum(score) + " / " + fmtNum(CHALLENGE_ROUNDS)
        + (res ? " · +" + fmtNum(res.gained) + " " + t("game.xp", "امتیاز") : "")
        + (isBest ? " · " + t("game.best", "رکورد") + "!" : "");
    }

    function nextQuestion() {
      if (round >= CHALLENGE_ROUNDS) { finish(); return; }
      current = makeQuestion();
      round++;
      qFeedback.textContent = "";
      qFeedback.className = "feedback";
      qText.textContent = fmtNum(current.value) + " " + unitLabel(current.from) + " = ؟ " + unitLabel(current.to);
      qOpts.innerHTML = "";
      current.options.forEach(function (opt) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-value", String(opt));
        b.textContent = fmtNum(opt);
        b.onclick = function () { answer(opt, b); };
        qOpts.appendChild(b);
      });
      qScoreEl.textContent = fmtNum(score);
      secondsLeft = CHALLENGE_SECONDS;
      timeEl.textContent = fmtNum(secondsLeft);
      stopTimer();
      timer = setInterval(function () {
        secondsLeft--;
        timeEl.textContent = fmtNum(Math.max(secondsLeft, 0));
        if (secondsLeft <= 0) { stopTimer(); answer(null, null); }
      }, 1000);
    }

    function answer(chosen, btn) {
      stopTimer();
      var ok = chosen !== null && checkAnswer(current, chosen);
      var buttons = qOpts.querySelectorAll("button");
      buttons.forEach(function (b) {
        b.disabled = true;
        if (Number(b.getAttribute("data-value")) === current.answer) b.classList.add("correct");
      });
      if (btn && !ok) btn.classList.add("wrong");
      if (ok) {
        score++;
        qFeedback.textContent = "✅ " + t("tool_ui.temperature-converter.challenge_correct", "درست!");
        qFeedback.className = "feedback good";
      } else {
        qFeedback.textContent = "❌ " + t("tool_ui.temperature-converter.challenge_wrong", "اشتباه شد.") +
          " " + fmtNum(current.answer);
        qFeedback.className = "feedback bad";
      }
      qScoreEl.textContent = fmtNum(score);
      setTimeout(nextQuestion, 1100);
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
