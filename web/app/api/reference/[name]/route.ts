import type { Api } from "@/lib/api/types";
import { errorResponse, getServerStore } from "@/lib/server/store";
import { guardApi } from "@/lib/server/auth";

/** Справочники этапа 2/3: слаг → метод api.reference. */
const REFERENCE_BY_SLUG: Record<string, (api: Api) => Promise<unknown>> = {
  channels: (api) => api.reference.channels(),
  stages: (api) => api.reference.stages(),
  funnels: (api) => api.reference.funnels(),
  activity: (api) => api.reference.activity(),
  quizzes: (api) => api.reference.quizzes(),
  "knowledge-sources": (api) => api.reference.knowledgeSources(),
  "chain-templates": (api) => api.reference.chainTemplates(),
  "supply-requests": (api) => api.reference.supplyRequests(),
  "supply-offers": (api) => api.reference.supplyOffers(),
  integrations: (api) => api.reference.integrations()
};

/** GET /api/reference/[name] — справочные данные (каналы, стадии, воронки, активности, тесты, интеграции…). */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const denied = guardApi(req);
  if (denied) return denied;
  const { name } = await ctx.params;
  const load = REFERENCE_BY_SLUG[name];
  if (!load) return Response.json({ code: "not_found", message: `Неизвестный справочник: ${name}` }, { status: 404 });
  try {
    return Response.json(await load(getServerStore().api));
  } catch (e) {
    return errorResponse(e);
  }
}
