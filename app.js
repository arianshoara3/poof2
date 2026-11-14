const TOTAL_PLANNED = 900;
let allTools = [];
let activeCategory = "همه";

const faDigits = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

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
  const cats = ["همه", ...new Set(allTools.map((t) => t.category))];
  const nav = document.getElementById("categories");
  nav.innerHTML = "";
  cats.forEach((cat) => {
    const b = document.createElement("button");
    b.className = "chip" + (cat === activeCategory ? " active" : "");
    b.textContent = cat;
    b.onclick = () => { activeCategory = cat; renderCategories(); render(); };
    nav.appendChild(b);
  });
}

function render() {
  const q = (document.getElementById("search").value || "").trim();
  const grid = document.getElementById("toolsGrid");
  const empty = document.getElementById("emptyState");
  const list = allTools.filter((t) => {
    const okCat = activeCategory === "همه" || t.category === activeCategory;
    const okQ = !q || (t.name + " " + (t.description || "")).includes(q);
    return okCat && okQ;
  });
  document.getElementById("toolCount").textContent = faDigits(allTools.length);
  document.getElementById("version").textContent = "v" + allTools.length;
  document.getElementById("versionFooter").textContent = "v" + allTools.length;
  document.getElementById("progressBar").style.width = (allTools.length / TOTAL_PLANNED * 100) + "%";
  grid.innerHTML = "";
  empty.style.display = list.length ? "none" : "block";
  list.forEach((t) => {
    const a = document.createElement("a");
    a.className = "card";
    a.href = "tools/" + t.slug + "/";
    a.innerHTML = "<div class='tag'>" + t.category + "</div><h3></h3><p></p>";
    a.querySelector("h3").textContent = t.name;
    a.querySelector("p").textContent = t.description || "";
    grid.appendChild(a);
  });
}

document.getElementById("search").addEventListener("input", render);
loadTools();
