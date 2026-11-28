import { ApiError } from "@/lib/api/types";
import { mailCategory, type Email } from "@/lib/schemas";
import { mailAi, type MailAiAction, type MailAiTone } from "@/lib/server/mail/ai";
import { guardApi } from "@/lib/server/auth";
import { errorResponse, getServerStore, readJsonBody } from "@/lib/server/store";

/**
 * AI-функции письма (этап 21): POST /api/mail/[id]/ai { action: "summary" | "classify" | "draft",
 * tone? } — саммари, классификация, черновик ответа. manager и выше. Классификация после
 * успешного вызова сохраняется в записи письма (category + честный categorySource).
 */

type Ctx = { params: Promise<{ id: string }> };

const ACTIONS: MailAiAction[] = ["summary", "classify", "draft"];
const TONES: MailAiTone[] = ["деловой", "дружелюбный", "короткий"];

export async function POST(req: Request, ctx: Ctx) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = (await readJsonBody(req)) as { action?: unknown; tone?: unknown };
    const action = body.action;
    if (typeof action !== "string" || !ACTIONS.includes(action as MailAiAction)) {
      throw new ApiError("validation", `Поле action должно быть одним из: ${ACTIONS.join(", ")}`);
    }
    const tone = body.tone;
    if (tone !== undefined && tone !== null && (typeof tone !== "string" || !TONES.includes(tone as MailAiTone))) {
      throw new ApiError("validation", `Поле tone должно быть одним из: ${TONES.join(", ")}`);
    }
    const email = await getServerStore().api.emails.get(id);
    if (!email) throw new ApiError("not_found", `Письмо ${id} не найдено`);
    const result = await mailAi(action as MailAiAction, email, (tone as MailAiTone | null) ?? null);
    if (action === "classify") {
      const category = (mailCategory.options as readonly string[]).includes(result.text) ? (result.text as Email["category"]) : "другое";
      await getServerStore().api.emails.update(id, { category, categorySource: result.source });
    }
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
