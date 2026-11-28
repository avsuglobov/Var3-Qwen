import { ApiError } from "@/lib/api/types";
import { mailAccountSchema } from "@/lib/integrations/types";
import { guardApi } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { maskSecret, readMailBlock, writeMailBlock } from "@/lib/server/secrets";

/**
 * Одна учётная запись почты (этап 21). PUT — правка (админ; пустое поле pass — «оставить
 * сохранённый пароль», форма не требует перепечатывать секрет); DELETE — удаление вместе
 * с курсорами папок. Пароль в ответах — только маска.
 */

type Ctx = { params: Promise<{ id: string }> };

/** Аккаунт для клиента: пароль заменён маской. */
function maskedAccount(account: { id: string; name: string; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; user: string; pass: string; from: string; folders: string[] }) {
  const { pass, ...rest } = account;
  return { ...rest, passMask: maskSecret(pass) };
}

function findAccount(id: string) {
  const block = readMailBlock();
  const account = block?.accounts.find((a) => a.id === id);
  if (!block || !account) throw new ApiError("not_found", `Учётная запись ${id} не найдена`);
  return { block, account };
}

/** PUT /api/mail/accounts/[id] — правка аккаунта (админ). */
export async function PUT(req: Request, ctx: Ctx) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const { block, account } = findAccount(id);
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const str = (key: string, fallback: string, max = 200): string => {
      const raw = body[key];
      if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim().length === 0)) return fallback;
      if (typeof raw !== "string") throw new ApiError("validation", `Поле «${key}» должно быть строкой`);
      if (raw.trim().length > max) throw new ApiError("validation", `Поле «${key}» длиннее ${max} знаков`);
      return raw.trim();
    };
    const port = (key: string, fallback: number): number => {
      const raw = body[key];
      if (raw === undefined || raw === "") return fallback;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 65535) throw new ApiError("validation", `Поле «${key}» должно быть целым числом от 1 до 65535`);
      return n;
    };
    // Пустой pass = оставить сохранённый (как у SMTP-ключей этапа 20).
    const passRaw = body["pass"];
    const pass = typeof passRaw === "string" && passRaw.trim().length > 0 ? passRaw.trim() : account.pass;
    const foldersRaw = body["folders"];
    const foldersParsed = Array.isArray(foldersRaw)
      ? foldersRaw.map((f) => String(f).trim()).filter((f) => f.length > 0 && f.length <= 200)
      : account.folders;
    const folders = Array.from(new Set(["INBOX", ...foldersParsed])).slice(0, 10);
    const parsed = mailAccountSchema.safeParse({
      ...account,
      name: str("name", account.name, 120),
      imapHost: str("imapHost", account.imapHost),
      imapPort: port("imapPort", account.imapPort),
      imapSecure: body["imapSecure"] === true,
      smtpHost: str("smtpHost", account.smtpHost),
      smtpPort: port("smtpPort", account.smtpPort),
      smtpSecure: body["smtpSecure"] === true,
      user: str("user", account.user),
      pass,
      from: str("from", account.from),
      folders
    });
    if (!parsed.success) throw new ApiError("validation", `Некорректные данные аккаунта: ${parsed.error.issues[0]?.message ?? "проверьте поля"}`);
    writeMailBlock({ ...block, accounts: block.accounts.map((a) => (a.id === id ? parsed.data : a)) });
    return Response.json({ ok: true, account: maskedAccount(parsed.data) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/mail/accounts/[id] — удаление аккаунта (админ), курсоры папок уходят вместе с ним. */
export async function DELETE(req: Request, ctx: Ctx) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const { block } = findAccount(id);
    const cursors = Object.fromEntries(Object.entries(block.cursors ?? {}).filter(([key]) => !key.startsWith(`${id}:`)));
    const lastError = Object.fromEntries(Object.entries(block.lastError ?? {}).filter(([key]) => key !== id));
    writeMailBlock({ ...block, accounts: block.accounts.filter((a) => a.id !== id), cursors, lastError });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
