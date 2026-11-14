const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const input = document.getElementById("input");

function update() {
  const text = input.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const sentences = (text.match(/[^.!?؟]+[.!?؟]+/g) || []).length;
  const paragraphs = text.trim() ? text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length : 0;
  const avg = sentences > 0 ? Math.round(words / sentences) : 0;
  document.getElementById("sentences").textContent = fa(sentences);
  document.getElementById("paragraphs").textContent = fa(paragraphs);
  document.getElementById("words").textContent = fa(words);
  document.getElementById("avg").textContent = fa(avg);
}
input.addEventListener("input", update);
document.getElementById("clearBtn").onclick = () => { input.value = ""; update(); input.focus(); };
document.getElementById("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(input.value);
    document.getElementById("copied").textContent = "کپی شد.";
  } catch (e) {
    input.select();
    document.execCommand("copy");
    document.getElementById("copied").textContent = "کپی شد.";
  }
};
update();
