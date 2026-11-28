import { APP_NAME } from "@/lib/config";
import { ApiError } from "@/lib/api/types";
import { emailSendReply } from "@/lib/server/mail/channel";
import { guardApi } from "@/lib/server/auth";
import { errorResponse, getServerStore, readJsonBody } from "@/lib/server/store";
import { readMailBlock } from "@/lib/server/secrets";

/**
 * Ответ на письмо из карточки (этап 21): POST /api/mail/[id]/reply { text } — отправка через
 * SMTP учётной записи, на которую пришло письмо (Reply-To — адрес отправителя письма, тема с
 * «Re:»). manager и выше. Письмо-источник переводится в статус «В работе», если было «Новое».
 */

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = (await readJsonBody(req)) as { text?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0 || body.text.length > 20000) {
      throw new ApiError("validation", "Текст ответа обязателен — до 20 000 знаков");
    }
    const store = getServerStore().api;
    const email = await store.emails.get(id);
    if (!email) throw new ApiError("not_found", `Письмо ${id} не найдено`);
    const block = readMailBlock();
    const account = block?.accounts.find((a) => a.id === email.accountId);
    if (!account) throw new ApiError("unavailable", `Учётная запись почты для письма ${id} не найдена — проверьте блок mail в secrets.json`);
    const address = email.from.includes("<") ? email.from.slice(email.from.indexOf("<") + 1, email.from.indexOf(">")) : email.from;
    await emailSendReply(account, address, email.subject ? (email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`) : `Ответ ${APP_NAME}`, body.text.trim());
    if (email.status === "Новое") await store.emails.update(id, { status: "В работе" });
    return Response.json({ ok: true, to: address });
  } catch (e) {
    return errorResponse(e);
  }
}
