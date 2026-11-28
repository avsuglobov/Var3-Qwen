import { errorResponse, getServerStore, readJsonBody } from "@/lib/server/store";
import { guardApi } from "@/lib/server/auth";

/**
 * Панель сбоев для e2e и демонстрации настоящих сетевых состояний (этап 4).
 * GET — текущие сбои; POST — переключить: fail (все ответы 503), latencyMs (задержка ответов),
 * corrupt (записать в хранилище битый снимок — приложение восстановит демо-данные).
 * Этап 19: маршрут выключается env-флагом — без AIWS_DEBUG=1 отвечает 404 (в проде и
 * docker-контуре по умолчанию выключен; dev, юнит-тесты и e2e включают его сами).
 */
function disabled(): boolean {
  return process.env.AIWS_DEBUG !== "1";
}

export async function GET(req: Request) {
  if (disabled()) return Response.json({ code: "not_found", message: "Не найдено" }, { status: 404 });
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  return Response.json(getServerStore().getFaults());
}

export async function POST(req: Request) {
  if (disabled()) return Response.json({ code: "not_found", message: "Не найдено" }, { status: 404 });
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const body = (await readJsonBody(req)) as { fail?: unknown; latencyMs?: unknown; corrupt?: unknown };
    const store = getServerStore();
    store.setFaults({
      fail: typeof body.fail === "boolean" ? body.fail : undefined,
      latencyMs: typeof body.latencyMs === "number" ? body.latencyMs : undefined
    });
    if (body.corrupt === true) store.corrupt();
    return Response.json(store.getFaults());
  } catch (e) {
    return errorResponse(e);
  }
}
