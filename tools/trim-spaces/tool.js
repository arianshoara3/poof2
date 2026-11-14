const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const input = document.getElementById("input");
const output = document.getElementById("output");

function clean() {
  let text = input.value.replace(/[ \t\u00A0]+/g, " ");
  let lines = text.split("\n");
  if (document.getElementById("trimLines").checked) lines = lines.map((l) => l.trim());
  if (document.getElementById("removeEmpty").checked) lines = lines.filter((l) => l.length > 0);
  const result = lines.join("\n");
  output.value = result;
  document.getElementById("stats").textContent =
    "قبل: " + fa(input.value.length) + " کاراکتر — بعد: " + fa(result.length) + " کاراکتر";
}
document.getElementById("cleanBtn").onclick = clean;
document.getElementById("clearBtn").onclick = () => { input.value = ""; output.value = ""; document.getElementById("stats").textContent = ""; input.focus(); };
document.getElementById("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    document.getElementById("copied").textContent = "کپی شد.";
  } catch (e) {
    output.select();
    document.execCommand("copy");
    document.getElementById("copied").textContent = "کپی شد.";
  }
};
