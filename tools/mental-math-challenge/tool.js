// Mental math speed challenge. Pure functions exported for Node testing;
// DOM code runs only in the browser.
var OPS = ["add", "sub", "mul", "div"];
var LEVELS = ["easy", "medium", "hard"];
var CHALLENGE_ROUNDS = 10;
var CHALLENGE_SECONDS = 15;

function ri(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}
function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}
function opSymbol(op) {
  if (op === "add") return "+";
  if (op === "sub") return "−";
  if (op === "mul") return "×";
  return "÷";
}
function compute(op, a, b) {
  if (op === "add") return a + b;
  if (op === "sub") return a - b;
  if (op === "mul") return a * b;
  return a / b;
}

// Short mental-math shortcut, shown after each answer. Pure arithmetic
// notation, so it needs no translation.
function hintFor(op, a, b, answer) {
  var b10, diff, b1;
  if (op === "add") {
    b10 = Math.ceil(b / 10) * 10;
    diff = b10 - b;
    if (diff === 0) return a + " + " + b + " = " + answer;
    return a + " + " + b + " = " + a + " + " + b10 + " − " + diff + " = " + answer;
  }
  if (op === "sub") {
    b10 = Math.ceil(b / 10) * 10;
    diff = b10 - b;
    if (diff === 0) return a + " − " + b + " = " + answer;
    return a + " − " + b + " = " + a + " − " + b10 + " + " + diff + " = " + answer;
  }
  if (op === "mul") {
    b10 = Math.floor(b / 10) * 10;
    b1 = b - b10;
    if (b1 === 0) return a + " × " + b + " = " + answer;
    return a + " × " + b + " = " + a + "×" + b10 + " + " + a + "×" + b1 +
      " = " + (a * b10) + " + " + (a * b1) + " = " + answer;
  }
  return a + " ÷ " + b + " = " + answer + "  (" + b + " × " + answer + " = " + a + ")";
}

function generateProblem(op, level, rand) {
  rand = rand || Math.random;
  var a, b;
  if (op === "add") {
    if (level === "easy") { a = ri(rand, 11, 99); b = ri(rand, 2, 99); }
    else if (level === "medium") { a = ri(rand, 101, 999); b = ri(rand, 11, 999); }
    else { a = ri(rand, 101, 999); b = ri(rand, 101, 999); }
  } else if (op === "sub") {
    if (level === "easy") { a = ri(rand, 21, 99); b = ri(rand, 2, a - 1); }
    else if (level === "medium") { a = ri(rand, 101, 999); b = ri(rand, 11, a - 1); }
    else { a = ri(rand, 201, 999); b = ri(rand, 101, a - 1); }
  } else if (op === "mul") {
    if (level === "easy") { a = ri(rand, 2, 9); b = ri(rand, 2, 9); }
    else if (level === "medium") { a = ri(rand, 11, 99); b = ri(rand, 2, 9); }
    else { a = ri(rand, 12, 99); b = ri(rand, 12, 29); }
  } else { // div: always exact, a = b * q
    var q;
    if (level === "easy") { b = ri(rand, 2, 9); q = ri(rand, 2, 9); }
    else if (level === "medium") { b = ri(rand, 2, 9); q = ri(rand, 11, 99); }
    else { b = ri(rand, 3, 12); q = ri(rand, 12, 99); }
    a = b * q;
  }
  var answer = compute(op, a, b);
  return { a: a, b: b, op: op, level: level, answer: answer, hint: hintFor(op, a, b, answer) };
}

function makeOptions(answer, rand) {
  rand = rand || Math.random;
  var opts = [answer];
  var offsets = [1, -1, 2, -2, 10, -10, 5, -5, 20, -20, 100, -100, 3, -3, 50, -50, 11, -11];
  var i = 0;
  while (opts.length < 4 && i < offsets.length) {
    var cand = answer + offsets[i++];
    if (cand <= 0) continue;
    if (opts.indexOf(cand) === -1) opts.push(cand);
  }
  var add = 7;
  while (opts.length < 4) {
    var c2 = answer + add++;
    if (opts.indexOf(c2) === -1) opts.push(c2);
  }
  for (var j = opts.length - 1; j > 0; j--) {
    var k = Math.floor(rand() * (j + 1));
    var t = opts[j]; opts[j] = opts[k]; opts[k] = t;
  }
  return opts;
}

// One challenge question: random op, problem at the given level, 4 options.
function makeQuestion(level, rand) {
  rand = rand || Math.random;
  var op = pick(rand, OPS);
  var p = generateProblem(op, level, rand);
  return {
    a: p.a, b: p.b, op: p.op, level: level,
    answer: p.answer, hint: p.hint,
    options: makeOptions(p.answer, rand)
  };
}

function checkAnswer(q, chosen) {
  return chosen === q.answer;
}

if (typeof module !== "undefined") {
  module.exports = {
    OPS: OPS, LEVELS: LEVELS,
    CHALLENGE_ROUNDS: CHALLENGE_ROUNDS, CHALLENGE_SECONDS: CHALLENGE_SECONDS,
    opSymbol: opSymbol, compute: compute, hintFor: hintFor,
    generateProblem: generateProblem, makeOptions: makeOptions,
    makeQuestion: makeQuestion, checkAnswer: checkAnswer
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

  var opSelect = document.getElementById("opSelect");
  var levelSelect = document.getElementById("levelSelect");
  var practiceQ = document.getElementById("practiceQ");
  var answerInput = document.getElementById("answerInput");
  var checkBtn = document.getElementById("checkBtn");
  var newBtn = document.getElementById("newBtn");
  var practiceFeedback = document.getElementById("practiceFeedback");
  var practiceHint = document.getElementById("practiceHint");
  var streakEl = document.getElementById("practiceStreak");
  var current = null;
  var streak = 0;

  function newPractice() {
    var op = opSelect.value;
    if (op === "mixed") op = OPS[Math.floor(Math.random() * OPS.length)];
    current = generateProblem(op, levelSelect.value);
    practiceQ.textContent = fmt(current.a) + " " + opSymbol(current.op) + " " + fmt(current.b) + " = ؟";
    practiceFeedback.textContent = "";
    practiceFeedback.className = "feedback";
    practiceHint.textContent = "";
    answerInput.value = "";
    answerInput.focus();
  }

  function checkPractice() {
    if (!current) return;
    var v = Number(answerInput.value);
    if (isNaN(v) || answerInput.value.trim() === "") return;
    if (v === current.answer) {
      streak++;
      practiceFeedback.textContent = "✅ " + t("tool_ui.mental-math-challenge.correct", "درست!");
      practiceFeedback.className = "feedback good";
    } else {
      streak = 0;
      practiceFeedback.textContent = "❌ " + t("tool_ui.mental-math-challenge.wrong", "اشتباه شد.") +
        " " + fmt(current.answer);
      practiceFeedback.className = "feedback bad";
    }
    streakEl.textContent = fmt(streak);
    practiceHint.textContent = t("tool_ui.mental-math-challenge.shortcut_label", "راه‌حل سریع:") +
      " " + current.hint;
  }

  checkBtn.onclick = checkPractice;
  newBtn.onclick = newPractice;
  answerInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") checkPractice();
  });
  opSelect.onchange = newPractice;
  levelSelect.onchange = newPractice;
  newPractice();

  /* ---------- challenge round (DOM) ---------- */
  var chCard = document.getElementById("challengeCard");
  if (chCard) {
    var BEST_KEY = "poof2-best-mental-math";
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
      doneEl.textContent = t("tool_ui.mental-math-challenge.challenge_done", "تمام شد!")
        + " " + fmt(score) + " / " + fmt(CHALLENGE_ROUNDS)
        + (res ? " · +" + fmt(res.gained) + " " + t("game.xp", "امتیاز") : "")
        + (isBest ? " · " + t("game.best", "رکورد") + "!" : "");
    }

    function nextQuestion() {
      if (round >= CHALLENGE_ROUNDS) { finish(); return; }
      currentQ = makeQuestion(levelSelect.value);
      round++;
      qFeedback.textContent = "";
      qFeedback.className = "feedback";
      qHint.textContent = "";
      qText.textContent = fmt(currentQ.a) + " " + opSymbol(currentQ.op) + " " + fmt(currentQ.b) + " = ؟";
      qOpts.innerHTML = "";
      currentQ.options.forEach(function (opt) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-value", String(opt));
        b.textContent = fmt(opt);
        b.onclick = function () { answer(opt, b); };
        qOpts.appendChild(b);
      });
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
        qFeedback.textContent = "✅ " + t("tool_ui.mental-math-challenge.challenge_correct", "درست!");
        qFeedback.className = "feedback good";
      } else {
        qFeedback.textContent = "❌ " + t("tool_ui.mental-math-challenge.challenge_wrong", "اشتباه شد.") +
          " " + fmt(currentQ.answer);
        qFeedback.className = "feedback bad";
      }
      qHint.textContent = t("tool_ui.mental-math-challenge.shortcut_label", "راه‌حل سریع:") +
        " " + currentQ.hint;
      qScoreEl.textContent = fmt(score);
      setTimeout(nextQuestion, 1600);
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
