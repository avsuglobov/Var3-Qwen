/**
 * Минимальный MIME-разбор входящих писем (этап 21). Вход — сырой RFC 822 (тело FETCH BODY[]),
 * выход — заголовки, текст text/plain и вложения. Объём сознательно ограничен честными рамками:
 * unfold заголовков, RFC 2047 encoded-words (B и Q), simple Content-Type (с параметрами),
 * разбор multipart по границе, декодирование transfer-encoding base64 и quoted-printable.
 * Неподдерживаемые случаи (например, nested multipart внутри multipart) обрабатываются без
 * падения: часть остаётся нераспознанной — текст или вложение просто не заполняются.
 */

export interface ParsedMail {
  headers: Record<string, string>;
  /** Первый текстовый блок text/plain (декодированный); null — текстовой части нет. */
  text: string | null;
  attachments: Array<{ filename: string; contentType: string | null; bytes: Buffer }>;
}

/** Разворачивает folded-заголовки: продолжения строки начинаются с пробела/таба. */
function rawHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  let current: string | null = null;
  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      out[current] += ` ${line.trim()}`;
      continue;
    }
    const idx = line.indexOf(":");
    if (idx <= 0) {
      current = null;
      continue;
    }
    const name = line.slice(0, idx).trim().toLowerCase();
    out[name] = line.slice(idx + 1).trim();
    current = name;
  }
  return out;
}

/** Декодирует RFC 2047 encoded-words: =?charset?B|Q?...?= (charset поддерживается utf-8/iso-8859-1 как latin1). */
export function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset: string, enc: string, payload: string) => {
    try {
      let bytes: Buffer;
      if (enc.toUpperCase() === "B") bytes = Buffer.from(payload, "base64");
      else {
        // Q-encoding — quoted-printable: «_» пробел, «=XX» байт (RFC 2047, не base64).
        const clean = payload.replace(/_/g, " ");
        const out: number[] = [];
        for (let i = 0; i < clean.length; i++) {
          if (clean[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(clean.slice(i + 1, i + 3))) {
            out.push(parseInt(clean.slice(i + 1, i + 3), 16));
            i += 2;
          } else out.push(clean.charCodeAt(i) & 0xff);
        }
        bytes = Buffer.from(out);
      }
      const cs = charset.toLowerCase();
      return cs === "utf-8" || cs === "utf8" ? bytes.toString("utf8") : bytes.toString("latin1");
    } catch {
      return _m; // нераспознанный encoded-word остаётся как есть — честнее, чем потеря
    }
  });
}

/** Адреса из заголовка From/To: «Имя <a@b>» → {name, address}; список через запятую (без групп). */
export function parseAddresses(value: string | undefined): Array<{ name: string; address: string }> {
  if (!value) return [];
  const out: Array<{ name: string; address: string }> = [];
  // Разделение по запятым вне угловых скобок.
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of value) {
    if (ch === "<") depth += 1;
    if (ch === ">") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  for (const part of parts) {
    const m = /^\s*(.*?)\s*<([^>]*)>\s*$/.exec(part);
    if (m) out.push({ name: decodeWords(m[1]).replace(/^"|"$/g, "").trim(), address: m[2].trim() });
    else if (part.trim()) out.push({ name: "", address: decodeWords(part).trim() });
  }
  return out;
}

/** Декодирование Content-Transfer-Encoding; неизвестное — как есть. */
function decodeTransfer(data: string, encoding: string | undefined): Buffer {
  const enc = (encoding ?? "").trim().toLowerCase();
  if (enc === "base64") return Buffer.from(data.replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  if (enc === "quoted-printable") {
    const bytes: number[] = [];
    const clean = data.replace(/=\r?\n/g, ""); // soft line break
    for (let i = 0; i < clean.length; i++) {
      if (clean[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(clean.slice(i + 1, i + 3))) {
        bytes.push(parseInt(clean.slice(i + 1, i + 3), 16));
        i += 2;
      } else bytes.push(clean.charCodeAt(i) & 0xff);
    }
    return Buffer.from(bytes);
  }
  return Buffer.from(data, "latin1"); // сырой письма читается как latin1 (этап 21): 8bit-байты не искажаются
}

/** ContentType: тип/подтип + параметры (boundary, charset, name). */
function parseContentType(value: string | undefined): { type: string; params: Record<string, string> } | null {
  if (!value) return null;
  const [head, ...rest] = value.split(";");
  const type = head.trim().toLowerCase();
  const params: Record<string, string> = {};
  for (const p of rest) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    const val = p.slice(eq + 1).trim().replace(/^"|"$/g, "");
    params[key] = val;
  }
  return { type, params };
}

/** Имя файла части: filename из Content-Disposition, затем name из Content-Type. */
function partFilename(headers: Record<string, string>, ctParams: Record<string, string>): string | null {
  const cd = parseContentType(headers["content-disposition"]);
  if (cd?.params["filename"]) return decodeWords(cd.params["filename"]);
  if (ctParams["name"]) return decodeWords(ctParams["name"]);
  return null;
}

/** Разбор MIME-части (без внешней границы). */
function parsePart(raw: string, out: { text: string | null; attachments: ParsedMail["attachments"] }): void {
  const sep = raw.match(/\r?\n\r?\n/);
  const headerRaw = sep ? raw.slice(0, sep.index) : "";
  let body = sep ? raw.slice((sep.index ?? 0) + sep[0].length) : raw;
  if (body.endsWith("\r\n")) body = body.slice(0, -2);
  const headers = rawHeaders(headerRaw);
  const ct = parseContentType(headers["content-type"]);

  if (ct?.type.startsWith("multipart/") && ct.params["boundary"]) {
    const boundary = `--${ct.params["boundary"]}`;
    // Части: между границами; закрывающая граница (--boundary--) отбрасывается.
    const chunks = body.split(boundary).slice(1);
    for (const chunk of chunks) {
      if (chunk.startsWith("--")) break; // закрывающая граница
      parsePart(chunk.replace(/^\r?\n/, ""), out);
    }
    return;
  }

  const bytes = decodeTransfer(body, headers["content-transfer-encoding"]);
  const filename = partFilename(headers, ct?.params ?? {});
  const isAttachment = Boolean(filename) || (headers["content-disposition"] ?? "").trim().toLowerCase().startsWith("attachment");
  if (isAttachment) {
    if (out.attachments.length < 50) out.attachments.push({ filename: filename ?? "без-имени", contentType: ct?.type ?? null, bytes });
    return;
  }
  if (ct?.type === "text/plain" && out.text === null) {
    const cs = ct.params["charset"]?.toLowerCase();
    out.text = cs === "utf-8" || cs === "utf8" || !cs ? bytes.toString("utf8") : bytes.toString("latin1");
  }
}

/** Разбор сырого письма (RFC 822): заголовки + текст + вложения. */
export function parseMime(raw: string): ParsedMail {
  const sep = raw.match(/\r?\n\r?\n/);
  const headers = rawHeaders(sep ? raw.slice(0, sep.index) : raw);
  const body = sep ? raw.slice((sep.index ?? 0) + sep[0].length) : "";
  const out: { text: string | null; attachments: ParsedMail["attachments"] } = { text: null, attachments: [] };
  parsePart(`Content-Type: ${headers["content-type"] ?? "text/plain"}\r\nContent-Transfer-Encoding: ${headers["content-transfer-encoding"] ?? ""}\r\n\r\n${body}`, out);
  return { headers, text: out.text, attachments: out.attachments };
}
