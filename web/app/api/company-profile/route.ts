import { errorResponse, getServerStore, readJsonBody } from "@/lib/server/store";

/** GET /api/company-profile — описание компании (одиночная запись, не коллекция). */
export async function GET() {
  try {
    return Response.json(await getServerStore().api.companyProfile.get());
  } catch (e) {
    return errorResponse(e);
  }
}

/** PUT /api/company-profile — частичное обновление описания компании. */
export async function PUT(req: Request) {
  try {
    const patch = (await readJsonBody(req)) as Record<string, unknown>;
    return Response.json(await getServerStore().api.companyProfile.update(patch));
  } catch (e) {
    return errorResponse(e);
  }
}
