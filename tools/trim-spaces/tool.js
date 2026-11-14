/* Localized helpers: use POOF2I18N when its dictionary is loaded,
   otherwise fall back to the original Persian strings. */
const I18N = () => (window.POOF2I18N && window.POOF2I18N.ready) ? window.POOF2I18N : null;
const fmtNum = (n) => { const i = I18N(); return i ? i.formatNumber(n) : String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]); };
const copiedMsg = () => { const i = I18N(); return i ? i.t("ui.copied") : "کپی شد."; };

const input = document.getElementById("input");
const output = document.getElementById("output");

function clean() {
  let text = input.value.replace(/[ \t\u00A0]+/g, " ");
  let lines = text.split("\n");
  if (document.getElementById("trimLines").checked) lines = lines.map((l) => l.trim());
  if (document.getElementById("removeEmpty").checked) lines = lines.filter((l) => l.length > 0);
  const result = lines.join("\n");
  output.value = result;
  const i = I18N();
  document.getElementById("stats").textContent = i
    ? i.t("tool_ui.trim-spaces.stats", { before: fmtNum(input.value.length), after: fmtNum(result.length) })
    : "قبل: " + fmtNum(input.value.length) + " کاراکتر — بعد: " + fmtNum(result.length) + " کاراکتر";
}
document.getElementById("cleanBtn").onclick = clean;
document.getElementById("clearBtn").onclick = () => { input.value = ""; output.value = ""; document.getElementById("stats").textContent = ""; input.focus(); };
document.getElementById("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    document.getElementById("copied").textContent = copiedMsg();
  } catch (e) {
    output.select();
    document.execCommand("copy");
    document.getElementById("copied").textContent = copiedMsg();
  }
};

document.addEventListener("poof2:language-changed", () => { if (document.getElementById("stats").textContent) clean(); });
