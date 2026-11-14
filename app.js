const TOTAL_PLANNED = 900;
let allTools = [];
let activeCategory = "all";

/* Persian category name (as stored in tools.json) -> i18n category id. */
const CATEGORY_IDS = {
  "متن و نوشتن": "text",
  "PDF و فایل": "pdf",
  "عکس و تصویر": "image",
  "صدا و ویدیو": "audio",
  "محاسبه‌گر و مالی": "finance",
  "تبدیل‌کننده و واحدها": "converter",
  "توسعه‌دهنده و کد": "dev",
  "زبان": "language",
  "سلامت و بدن": "health",
  "کسب‌وکار و بهره‌وری": "business"
};

function i18n() {
  return (window.POOF2I18N && window.POOF2I18N.ready) ? window.POOF2I18N : null;
}

function game() {
  return window.POOF2Game || null;
}

function gt(key, fallback) {
  const i = i18n();
  if (i && i.has(key)) return i.t(key);
  return fallback;
}

function fmt(n) {
  const i = i18n();
  return i ? i.formatNumber(n) : String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function catId(persianName) {
  return CATEGORY_IDS[persianName] || "text";
}

function catLabel(persianName) {
  const i = i18n();
  const id = catId(persianName);
  return (i && i.has("categories." + id)) ? i.t("categories." + id) : persianName;
}

function toolText(tool, field) {
  const i = i18n();
  const key = "tools." + tool.slug + "." + field;
  return (i && i.has(key)) ? i.t(key) : tool[field];
}

/* ---------- theme (light / dark, persisted) ---------- */
const THEME_KEY = "poof2-theme";
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = theme === "dark" ? "☀️" : "🌙";
    btn.setAttribute("aria-label", theme === "dark" ? gt("game.theme_light", "حالت روشن") : gt("game.theme_dark", "حالت تیره"));
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
}
function initTheme() {
  let theme = "light";
  try { theme = localStorage.getItem(THEME_KEY) || "light"; } catch (e) { /* ignore */ }
  if (theme !== "dark" && theme !== "light") theme = "light";
  applyTheme(theme);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.onclick = () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

/* ---------- dashboard (gamification) ---------- */
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function renderDashboard() {
  const g = game();
  if (!g || !g.state) return;
  const st = g.state;
  const prog = g.xpProgressInLevel(st.xp);
  const levelNum = document.getElementById("levelNum");
  if (levelNum) levelNum.textContent = fmt(prog.level);
  const levelTitle = document.getElementById("levelTitle");
  if (levelTitle) levelTitle.textContent = gt("game.level_title_" + Math.min(prog.level, 6), "");
  const xpBar = document.getElementById("xpBar");
  if (xpBar) xpBar.style.width = Math.round(prog.inLevel / prog.needed * 100) + "%";
  const xpText = document.getElementById("xpText");
  if (xpText) {
    xpText.textContent = fmt(st.xp) + " " + gt("game.xp", "امتیاز") + " · " +
      fmt(prog.inLevel) + "/" + fmt(prog.needed) + " " + gt("game.xp_to_next", "تا سطح بعد");
  }
  const leagueChip = document.getElementById("leagueChip");
  if (leagueChip) {
    const wk = g.weeklyXp(st, new Date());
    const tier = g.leagueFor(wk);
    leagueChip.textContent = "🏅 " + gt("game.league_" + tier, tier) + " · " +
      gt("game.this_week", "این هفته") + ": " + fmt(wk) + " " + gt("game.xp", "امتیاز");
  }
  const streakNum = document.getElementById("streakNum");
  if (streakNum) streakNum.textContent = fmt(st.streak.count);
  const toolsUsedNum = document.getElementById("toolsUsedNum");
  if (toolsUsedNum) toolsUsedNum.textContent = fmt(Object.keys(st.toolsUsed).length);
  const mission = g.todayMission();
  const missionText = document.getElementById("missionText");
  if (missionText) {
    missionText.textContent = gt("game.mission_" + mission.id, mission.id);
    if (mission.done) missionText.classList.add("mission-done");
    else missionText.classList.remove("mission-done");
  }
  const missionBar = document.getElementById("missionBar");
  if (missionBar) missionBar.style.width = Math.round(mission.progress / mission.target * 100) + "%";
  const missionProgress = document.getElementById("missionProgress");
  if (missionProgress) {
    missionProgress.textContent = mission.done
      ? "✅ " + gt("game.mission_done", "مأموریت انجام شد!")
      : fmt(mission.progress) + " / " + fmt(mission.target);
  }
  const continueCard = document.getElementById("continueCard");
  const continueLink = document.getElementById("continueLink");
  if (continueCard && continueLink && st.lastTool) {
    const tool = allTools.find((t) => t.slug === st.lastTool.slug);
    if (tool) {
      continueCard.hidden = false;
      continueLink.href = "tools/" + tool.slug + "/";
      continueLink.textContent = "▶ " + toolText(tool, "name");
    } else {
      continueCard.hidden = true;
    }
  } else if (continueCard) {
    continueCard.hidden = true;
  }
  const badgesBox = document.getElementById("achievements");
  if (badgesBox) {
    badgesBox.innerHTML = "";
    g.ACHIEVEMENTS.forEach((a) => {
      const earned = st.achievements.indexOf(a.id) !== -1;
      const span = document.createElement("span");
      span.className = "badge" + (earned ? "" : " locked");
      span.title = earned ? gt("game.ach_" + a.id, a.id) : gt("game.locked", "قفل");
      span.innerHTML = "<span class='emoji'></span><span></span>";
      span.querySelector(".emoji").textContent = earned ? a.emoji : "🔒";
      span.querySelectorAll("span")[1].textContent = gt("game.ach_" + a.id, a.id);
      badgesBox.appendChild(span);
    });
  }
}

document.addEventListener("poof2:xp", function (ev) {
  renderDashboard();
  const d = ev.detail || {};
  if (d.leveledUp) {
    showToast("🎉 " + gt("game.new_level", "سطح جدید!") + " — " + gt("game.level", "سطح") + " " + fmt(d.level));
  } else if (d.newAchievements && d.newAchievements.length) {
    showToast("🏅 " + gt("game.achievement_unlocked", "دستاورد جدید!"));
  } else if (d.missionCompleted) {
    showToast("✅ " + gt("game.mission_done", "مأموریت انجام شد!"));
  }
});

async function loadTools() {
  try {
    const res = await fetch("tools.json");
    const data = await res.json();
    allTools = data.tools || [];
  } catch (e) {
    allTools = [];
  }
  renderCategories();
  render();
  renderDashboard();
}

function renderCategories() {
  const ids = [...new Set(allTools.map((t) => catId(t.category)))];
  const nav = document.getElementById("categories");
  nav.innerHTML = "";
  const i = i18n();
  const allLabel = i ? i.t("ui.all") : "همه";
  [{ id: "all", label: allLabel }].concat(
    ids.map((id) => ({ id, label: (i && i.has("categories." + id)) ? i.t("categories." + id) : id }))
  ).forEach((cat) => {
    const b = document.createElement("button");
    b.className = "chip" + (cat.id === activeCategory ? " active" : "");
    b.textContent = cat.label;
    b.onclick = () => { activeCategory = cat.id; renderCategories(); render(); };
    nav.appendChild(b);
  });
}

function render() {
  const q = (document.getElementById("search").value || "").trim();
  const grid = document.getElementById("toolsGrid");
  const empty = document.getElementById("emptyState");
  const list = allTools.filter((t) => {
    const okCat = activeCategory === "all" || catId(t.category) === activeCategory;
    const name = toolText(t, "name");
    const desc = toolText(t, "description") || "";
    const hay = (name + " " + desc + " " + t.name + " " + (t.description || "")).toLowerCase();
    const okQ = !q || hay.includes(q.toLowerCase());
    return okCat && okQ;
  });
  const i = i18n();
  const countLine = document.getElementById("countLine");
  if (countLine) {
    countLine.textContent = i
      ? i.t("ui.tools_ready", { count: fmt(allTools.length), total: fmt(TOTAL_PLANNED), version: allTools.length })
      : fmt(allTools.length) + " از " + fmt(TOTAL_PLANNED) + " ابزار آماده است — نسخه‌ی v" + allTools.length;
  }
  const footerLine = document.getElementById("footerLine");
  if (footerLine) {
    footerLine.textContent = i
      ? i.t("ui.footer_text", { version: allTools.length })
      : "POOF2 — ساخته‌شده توسط Muse · نسخه‌ی v" + allTools.length;
  }
  document.getElementById("progressBar").style.width = (allTools.length / TOTAL_PLANNED * 100) + "%";
  grid.innerHTML = "";
  empty.style.display = list.length ? "none" : "block";
  list.forEach((t) => {
    const a = document.createElement("a");
    a.className = "card";
    a.href = "tools/" + t.slug + "/";
    a.innerHTML = "<div class='tag'></div><h3></h3><p></p>";
    a.querySelector(".tag").textContent = catLabel(t.category);
    a.querySelector("h3").textContent = toolText(t, "name");
    a.querySelector("p").textContent = toolText(t, "description") || "";
    /* Starting a tool earns XP (long-term plan §3 return loop). */
    a.addEventListener("click", () => {
      const g = game();
      if (g) g.recordToolStart(t.slug, t.category);
    });
    grid.appendChild(a);
  });
}

initTheme();
document.getElementById("search").addEventListener("input", render);
document.addEventListener("poof2:language-changed", function () {
  renderCategories();
  render();
  renderDashboard();
});

if (window.POOF2I18N && window.POOF2I18N.promise) {
  window.POOF2I18N.promise.then(loadTools);
} else {
  loadTools();
}
