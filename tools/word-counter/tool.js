/* Localized helpers: use POOF2I18N when its dictionary is loaded,
   otherwise fall back to the original Persian strings. */
const I18N = () => (window.POOF2I18N && window.POOF2I18N.ready) ? window.POOF2I18N : null;
const fmtNum = (n) => { const i = I18N(); return i ? i.formatNumber(n) : String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]); };
const copiedMsg = () => { const i = I18N(); return i ? i.t("ui.copied") : "کپی شد."; };

const input = document.getElementById("input");

function update() {
  const text = input.value;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, "").length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const sentences = text.trim() ? (text.match(/[^.!؟\n]+[.!؟]+["»)]?/g) || []).length : 0;
  const paragraphs = text.trim() ? text.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
  const lines = text ? text.split("\n").length : 0;
  const reading = Math.max(0, Math.ceil(words / 200));
  document.getElementById("chars").textContent = fmtNum(chars);
  document.getElementById("charsNoSpace").textContent = fmtNum(charsNoSpace);
  document.getElementById("words").textContent = fmtNum(words);
  document.getElementById("sentences").textContent = fmtNum(sentences);
  document.getElementById("paragraphs").textContent = fmtNum(paragraphs);
  document.getElementById("lines").textContent = fmtNum(lines);
  const i = I18N();
  document.getElementById("reading").textContent = i
    ? i.t("tool_ui.word-counter.reading_minutes", { minutes: fmtNum(reading) })
    : fmtNum(reading) + " دقیقه";
}

input.addEventListener("input", update);
document.getElementById("clearBtn").onclick = () => { input.value = ""; update(); input.focus(); };
document.getElementById("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(input.value);
    document.getElementById("copied").textContent = copiedMsg();
  } catch (e) {
    input.select();
    document.execCommand("copy");
    document.getElementById("copied").textContent = copiedMsg();
  }
};
document.addEventListener("poof2:language-changed", update);
update();
