import { amocrmAuthorizeCallback } from "@/lib/server/oauth-amocrm";
import { guardApi } from "@/lib/server/auth";

/**
 * GET /api/integrations/amocrm/callback — колбэк входа через amoCRM (этап 11): обмен кода
 * на токены и сохранение в .data/secrets.json. Браузеру — короткая страница-ответ: только
 * итог, без секретов; при успехе окно закрывается само (оно открыто кнопкой «Войти»).
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

export async function GET(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const result = await amocrmAuthorizeCallback({ code: url.searchParams.get("code"), state: url.searchParams.get("state"), origin: url.origin });
  const page = [
    "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>Вход через amoCRM</title></head>",
    "<body style=\"font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;font-size:14px;\">",
    `<p data-ok="${result.ok ? "1" : "0"}">${escapeHtml(result.message)}</p>`,
    "<p><a href=\"/\">Вернуться в приложение</a></p>",
    `<script>${result.ok ? "setTimeout(function(){window.close()},2500)" : ""}</script>`,
    "</body></html>"
  ].join("");
  return new Response(page, { status: result.ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });
}
