const faDigits = "۰۱۲۳۴۵۶۷۸۹";
const arDigits = "٠١٢٣٤٥٦٧٨٩";
const input = document.getElementById("input");
const output = document.getElementById("output");

function toEn(text) {
  return text.replace(/[۰-۹]/g, (d) => faDigits.indexOf(d))
             .replace(/[٠-٩]/g, (d) => arDigits.indexOf(d));
}
function toFa(text) {
  return text.replace(/\d/g, (d) => faDigits[d]);
}
document.getElementById("toEnBtn").onclick = () => { output.value = toEn(input.value); };
document.getElementById("toFaBtn").onclick = () => { output.value = toFa(input.value); };
document.getElementById("clearBtn").onclick = () => { input.value = ""; output.value = ""; input.focus(); };
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
