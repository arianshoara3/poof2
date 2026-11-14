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
    grid.appendChild(a);
  });
}

document.getElementById("search").addEventListener("input", render);
document.addEventListener("poof2:language-changed", function () {
  renderCategories();
  render();
});

if (window.POOF2I18N && window.POOF2I18N.promise) {
  window.POOF2I18N.promise.then(loadTools);
} else {
  loadTools();
}
