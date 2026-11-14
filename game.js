/* POOF2 game core — XP, levels, streaks, daily missions, achievements, weekly league.
 *
 * Implements the POOF2 long-term plan (§3 "موتور گیمیفیکیشن" + §2 golden rules):
 * every interaction teaches and rewards, the return loop is visible (daily
 * mission + streak + continue), and all progress lives on the user's device
 * in versioned localStorage ("poof2-game-v1") — no server, no account.
 *
 * Pure functions are exported for Node testing; browser glue (localStorage +
 * window.POOF2Game + "poof2:xp" events) only runs when `document` exists.
 * Level curve: reaching level L needs 100*(L-1)^2 total XP.
 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "poof2-game-v1";
  var VERSION = 1;

  var XP_PER_TOOL_START = 10;    /* starting any tool */
  var XP_FIRST_TOOL_BONUS = 25;  /* first time a tool is ever started */
  var XP_CORRECT_ANSWER = 15;    /* one correct quiz/challenge answer */
  var XP_MISSION_COMPLETE = 50;  /* finishing the daily mission */
  var XP_CHALLENGE_WIN = 30;     /* perfect challenge round bonus */

  /* Daily missions rotate deterministically by day-of-year. */
  var MISSIONS = [
    { id: "m3tools", target: 3, kind: "distinct_tools" },
    { id: "m50xp", target: 50, kind: "xp_today" },
    { id: "mconverter", target: 1, kind: "category", category: "تبدیل‌کننده و واحدها" },
    { id: "mtext", target: 1, kind: "category", category: "متن و نوشتن" }
  ];

  /* Achievements: id, emoji, check(state). Names live in i18n (game.ach_*). */
  var ACHIEVEMENTS = [
    { id: "first_steps", emoji: "🎯", check: function (s) { return s.totalStarts >= 1; } },
    { id: "explorer_3", emoji: "🧭", check: function (s) { return Object.keys(s.toolsUsed).length >= 3; } },
    { id: "explorer_10", emoji: "🌍", check: function (s) { return Object.keys(s.toolsUsed).length >= 10; } },
    { id: "xp_100", emoji: "💯", check: function (s) { return s.xp >= 100; } },
    { id: "xp_500", emoji: "⚡", check: function (s) { return s.xp >= 500; } },
    { id: "xp_1000", emoji: "👑", check: function (s) { return s.xp >= 1000; } },
    { id: "streak_3", emoji: "📅", check: function (s) { return s.streak.count >= 3; } },
    { id: "streak_7", emoji: "🏆", check: function (s) { return s.streak.count >= 7; } },
    { id: "mission_first", emoji: "🎖️", check: function (s) { return s.missionsDone >= 1; } },
    { id: "night_owl", emoji: "🦉", check: function (s) { return !!s.flags.nightOwl; } },
    { id: "early_bird", emoji: "🌅", check: function (s) { return !!s.flags.earlyBird; } }
  ];

  /* Weekly league (local only): tiers by XP earned this ISO week. */
  var LEAGUE_TIERS = [
    { id: "bronze", min: 0 },
    { id: "silver", min: 100 },
    { id: "gold", min: 300 },
    { id: "diamond", min: 700 }
  ];

  function freshState() {
    return {
      v: VERSION, xp: 0,
      streak: { count: 0, lastDay: null },
      toolsUsed: {}, totalStarts: 0,
      xpToday: { date: null, amount: 0 },
      toolsToday: { date: null, slugs: [], categories: [] },
      achievements: [], missionsDone: 0,
      missions: {},           /* by date: { id, done } */
      weeks: {},              /* ISO week key -> xp */
      bestWeek: { key: null, xp: 0 },
      flags: {},              /* nightOwl / earlyBird */
      lastTool: null, lastVisit: null
    };
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function dayKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function dayOfYear(d) {
    var start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
  }

  /* ISO week key, e.g. "2026-W46". */
  function weekKey(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    var firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    var fDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
    var week = 1 + Math.round((date - firstThursday) / (7 * 86400000));
    return date.getUTCFullYear() + "-W" + pad(week);
  }

  function levelFor(xp) {
    if (!xp || xp < 0) return 1;
    return Math.floor(Math.sqrt(xp / 100)) + 1;
  }

  function xpForLevel(level) {
    return 100 * (level - 1) * (level - 1);
  }

  function xpToNextLevel(xp) {
    return xpForLevel(levelFor(xp) + 1) - xp;
  }

  function xpProgressInLevel(xp) {
    var level = levelFor(xp);
    var base = xpForLevel(level);
    var next = xpForLevel(level + 1);
    return { level: level, inLevel: xp - base, needed: next - base };
  }

  function missionFor(date) {
    return MISSIONS[dayOfYear(date) % MISSIONS.length];
  }

  /* Streak: same day -> unchanged; yesterday -> +1; any gap -> restart at 1. */
  function updateStreak(state, today) {
    var last = state.streak.lastDay;
    if (last === today) return state.streak.count;
    var d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - 1);
    var yesterday = dayKey(d);
    state.streak.count = (last === yesterday) ? state.streak.count + 1 : 1;
    state.streak.lastDay = today;
    return state.streak.count;
  }

  function missionProgress(state, dateStr) {
    var mission = missionFor(new Date(dateStr + "T12:00:00"));
    var entry = state.missions[dateStr] || { id: mission.id, done: false };
    var progress = 0;
    if (mission.kind === "distinct_tools") {
      progress = (state.toolsToday.date === dateStr) ? state.toolsToday.slugs.length : 0;
    } else if (mission.kind === "xp_today") {
      progress = (state.xpToday.date === dateStr) ? state.xpToday.amount : 0;
    } else if (mission.kind === "category") {
      progress = (state.toolsToday.date === dateStr &&
        state.toolsToday.categories.indexOf(mission.category) !== -1) ? 1 : 0;
    }
    return { id: mission.id, target: mission.target, progress: Math.min(progress, mission.target), done: !!entry.done };
  }

  function checkAchievements(state) {
    var awarded = [];
    ACHIEVEMENTS.forEach(function (a) {
      if (state.achievements.indexOf(a.id) === -1) {
        var ok = false;
        try { ok = !!a.check(state); } catch (e) { ok = false; }
        if (ok) { state.achievements.push(a.id); awarded.push(a.id); }
      }
    });
    return awarded;
  }

  /* Core XP grant. ctx = { today: "YYYY-MM-DD", hour: 0-23 }. */
  function addXP(state, amount, ctx) {
    ctx = ctx || {};
    var today = ctx.today || dayKey(new Date());
    var hour = (typeof ctx.hour === "number") ? ctx.hour : new Date().getHours();
    if (state.xpToday.date !== today) state.xpToday = { date: today, amount: 0 };
    var before = levelFor(state.xp);
    state.xp += amount;
    state.xpToday.amount += amount;
    var wk = weekKey(new Date(today + "T12:00:00"));
    state.weeks[wk] = (state.weeks[wk] || 0) + amount;
    if (state.weeks[wk] > state.bestWeek.xp) state.bestWeek = { key: wk, xp: state.weeks[wk] };
    if (hour >= 22) state.flags.nightOwl = true;
    if (hour < 7) state.flags.earlyBird = true;
    var leveledUp = levelFor(state.xp) > before;
    var awarded = checkAchievements(state);
    /* Daily mission completion pays a bonus (once per day). */
    var mission = missionProgress(state, today);
    var missionCompleted = false;
    if (!mission.done && mission.progress >= mission.target) {
      state.missions[today] = { id: mission.id, done: true };
      state.missionsDone += 1;
      state.xp += XP_MISSION_COMPLETE;
      state.xpToday.amount += XP_MISSION_COMPLETE;
      state.weeks[wk] += XP_MISSION_COMPLETE;
      if (state.weeks[wk] > state.bestWeek.xp) state.bestWeek = { key: wk, xp: state.weeks[wk] };
      missionCompleted = true;
      awarded = awarded.concat(checkAchievements(state));
    }
    return {
      gained: amount + (missionCompleted ? XP_MISSION_COMPLETE : 0),
      total: state.xp, level: levelFor(state.xp), leveledUp: leveledUp,
      newAchievements: awarded, missionCompleted: missionCompleted
    };
  }

  /* Record starting a tool (homepage card click). ctx = { now: Date }. */
  function recordToolStart(state, slug, category, ctx) {
    var now = (ctx && ctx.now) || new Date();
    var today = dayKey(now);
    updateStreak(state, today);
    if (state.toolsToday.date !== today) state.toolsToday = { date: today, slugs: [], categories: [] };
    var isNew = !state.toolsUsed[slug];
    state.toolsUsed[slug] = (state.toolsUsed[slug] || 0) + 1;
    state.totalStarts += 1;
    if (state.toolsToday.slugs.indexOf(slug) === -1) state.toolsToday.slugs.push(slug);
    if (category && state.toolsToday.categories.indexOf(category) === -1) state.toolsToday.categories.push(category);
    state.lastTool = { slug: slug, category: category || null };
    state.lastVisit = now.toISOString();
    return addXP(state, XP_PER_TOOL_START + (isNew ? XP_FIRST_TOOL_BONUS : 0),
      { today: today, hour: now.getHours() });
  }

  function recordCorrectAnswer(state, ctx) {
    var now = (ctx && ctx.now) || new Date();
    updateStreak(state, dayKey(now));
    return addXP(state, XP_CORRECT_ANSWER, { today: dayKey(now), hour: now.getHours() });
  }

  /* End of a challenge round: score correct out of total. */
  function recordChallengeComplete(state, score, total, ctx) {
    var now = (ctx && ctx.now) || new Date();
    updateStreak(state, dayKey(now));
    var amount = score * XP_CORRECT_ANSWER + (total > 0 && score === total ? XP_CHALLENGE_WIN : 0);
    return addXP(state, amount, { today: dayKey(now), hour: now.getHours() });
  }

  function leagueFor(weeklyXp) {
    var tier = LEAGUE_TIERS[0];
    LEAGUE_TIERS.forEach(function (t) { if (weeklyXp >= t.min) tier = t; });
    return tier.id;
  }

  function weeklyXp(state, date) {
    return state.weeks[weekKey(date || new Date())] || 0;
  }

  /* ---------------- browser glue ---------------- */
  var api = {
    STORAGE_KEY: STORAGE_KEY, VERSION: VERSION,
    XP_PER_TOOL_START: XP_PER_TOOL_START, XP_FIRST_TOOL_BONUS: XP_FIRST_TOOL_BONUS,
    XP_CORRECT_ANSWER: XP_CORRECT_ANSWER, XP_MISSION_COMPLETE: XP_MISSION_COMPLETE,
    MISSIONS: MISSIONS, ACHIEVEMENTS: ACHIEVEMENTS, LEAGUE_TIERS: LEAGUE_TIERS,
    freshState: freshState, dayKey: dayKey, weekKey: weekKey,
    levelFor: levelFor, xpForLevel: xpForLevel, xpToNextLevel: xpToNextLevel,
    xpProgressInLevel: xpProgressInLevel, missionFor: missionFor,
    missionProgress: missionProgress, updateStreak: updateStreak,
    checkAchievements: checkAchievements, addXP: addXP,
    recordToolStart: recordToolStart, recordCorrectAnswer: recordCorrectAnswer,
    recordChallengeComplete: recordChallengeComplete,
    leagueFor: leagueFor, weeklyXp: weeklyXp,
    state: null,
    load: function () { return freshState(); },
    save: function () {},
    todayMission: function () {
      var today = dayKey(new Date());
      return missionProgress(this.state, today);
    }
  };

  if (typeof document !== "undefined") {
    api.load = function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return freshState();
        var parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== VERSION) return freshState();
        var base = freshState();
        Object.keys(base).forEach(function (k) {
          if (parsed[k] !== undefined) base[k] = parsed[k];
        });
        return base;
      } catch (e) { return freshState(); }
    };
    api.save = function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(api.state)); } catch (e) { /* private mode */ }
    };
    api.state = api.load();
    api.dispatch = function (detail) {
      try { document.dispatchEvent(new CustomEvent("poof2:xp", { detail: detail })); } catch (e) { /* no listeners */ }
    };
    /* Wrap the pure recorders so they persist + notify the dashboard. */
    var _recordToolStart = recordToolStart;
    api.recordToolStart = function (slug, category) {
      var res = _recordToolStart(api.state, slug, category, { now: new Date() });
      api.save(); api.dispatch(res); return res;
    };
    var _recordCorrectAnswer = recordCorrectAnswer;
    api.recordCorrectAnswer = function () {
      var res = _recordCorrectAnswer(api.state, { now: new Date() });
      api.save(); api.dispatch(res); return res;
    };
    var _recordChallengeComplete = recordChallengeComplete;
    api.recordChallengeComplete = function (score, total) {
      var res = _recordChallengeComplete(api.state, score, total, { now: new Date() });
      api.save(); api.dispatch(res); return res;
    };
    root.POOF2Game = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
