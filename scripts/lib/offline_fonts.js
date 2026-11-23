/* offline_fonts.js — подмена запросов к Google Fonts пустыми ответами, чтобы браузерные проверки не падали
   на «Failed to load resource» без интернета (и не зависели от сети вообще). Шрифты в тестах не важны. */
async function stubFonts(ctxOrPage) {
  await ctxOrPage.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: /gstatic/.test(r.request().url()) ? "font/woff2" : "text/css", body: "" }));
}
module.exports = { stubFonts };
