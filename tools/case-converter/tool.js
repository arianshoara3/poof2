/* Localized "copied" message: POOF2I18N when loaded, else Persian. */
const copiedMsg = () => (window.POOF2I18N && window.POOF2I18N.ready) ? window.POOF2I18N.t("ui.copied") : "کپی شد.";

const input = document.getElementById("input");
const output = document.getElementById("output");

function titleCase(s) {
  return s.toLowerCase().replace(/(^|\s|[("'\-])\S/g, (m) => m.toUpperCase());
}
function sentenceCase(s) {
  return s.toLowerCase().replace(/(^\s*[a-z]|[.!?]\s+[a-z])/g, (m) => m.toUpperCase());
}
function invert(s) {
  return [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join("");
}
function convert(mode) {
  const t = input.value;
  if (mode === "upper") output.value = t.toUpperCase();
  else if (mode === "lower") output.value = t.toLowerCase();
  else if (mode === "title") output.value = titleCase(t);
  else if (mode === "sentence") output.value = sentenceCase(t);
  else if (mode === "invert") output.value = invert(t);
}
document.querySelectorAll("[data-mode]").forEach((b) => {
  b.onclick = () => convert(b.dataset.mode);
});
document.getElementById("clearBtn").onclick = () => { input.value = ""; output.value = ""; input.focus(); };
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
