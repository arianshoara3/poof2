const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
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
  document.getElementById("chars").textContent = fa(chars);
  document.getElementById("charsNoSpace").textContent = fa(charsNoSpace);
  document.getElementById("words").textContent = fa(words);
  document.getElementById("sentences").textContent = fa(sentences);
  document.getElementById("paragraphs").textContent = fa(paragraphs);
  document.getElementById("lines").textContent = fa(lines);
  document.getElementById("reading").textContent = fa(reading) + " دقیقه";
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
