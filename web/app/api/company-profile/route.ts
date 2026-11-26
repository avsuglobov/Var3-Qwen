import { errorResponse, getServerStore, readJsonBody } from "@/lib/server/store";
import { guardApi } from "@/lib/server/auth";

/** GET /api/company-profile — описание компании (одиночная запись, не коллекция). */
export async function GET(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    return Response.json(await getServerStore().api.companyProfile.get());
  } catch (e) {
    return errorResponse(e);
  }
}

/** PUT /api/company-profile — частичное обновление описания компании. */
export async function PUT(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const patch = (await readJsonBody(req)) as Record<string, unknown>;
    return Response.json(await getServerStore().api.companyProfile.update(patch));
  } catch (e) {
    return errorResponse(e);
  }
}
