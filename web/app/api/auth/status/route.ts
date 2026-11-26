import { readAuthBlock } from "@/lib/server/secrets";
import { isUnlocked } from "@/lib/server/auth";

/** GET /api/auth/status — состояние защиты (открытый маршрут): задан ли PIN и разблокировано ли приложение. */
export async function GET(req: Request) {
  return Response.json({ setup: readAuthBlock() !== null, unlocked: isUnlocked(req) });
}
