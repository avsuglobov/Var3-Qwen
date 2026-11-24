import { errorResponse, getServerStore, readJsonBody } from "@/lib/server/store";

/**
 * Панель сбоев для e2e и демонстрации настоящих сетевых состояний (этап 4).
 * GET — текущие сбои; POST — переключить: fail (все ответы 503), latencyMs (задержка ответов),
 * corrupt (записать в хранилище битый снимок — приложение восстановит демо-данные).
 */
export async function GET() {
  return Response.json(getServerStore().getFaults());
}

export async function POST(req: Request) {
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
