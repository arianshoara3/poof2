/* Localized "copied" message: POOF2I18N when loaded, else Persian. */
const copiedMsg = () => (window.POOF2I18N && window.POOF2I18N.ready) ? window.POOF2I18N.t("ui.copied") : "کپی شد.";

const input = document.getElementById("input");
const output = document.getElementById("output");

function slugify(text) {
  const sep = document.getElementById("sep").value;
  let s = text.trim();
  if (document.getElementById("lower").checked) s = s.toLowerCase();
  s = s.replace(/[\u200c\u200d]/g, "");
  s = s.replace(/[^\p{L}\p{N}\s\-_]+/gu, "");
  s = s.trim().replace(/[\s\-_]+/g, sep);
  s = s.replace(new RegExp("^" + sep + "+|" + sep + "+$", "g"), "");
  return s;
}
document.getElementById("convertBtn").onclick = () => { output.value = slugify(input.value); };
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
