import { ApiError } from "@/lib/api/types";
import { errorResponse, getServerStore, readJsonBody } from "@/lib/server/store";

/** POST /api/collections/courses/[id]/complete — завершение курса выдачей сертификата (db.js completeCourse). */
export async function POST(req: Request, ctx: { params: Promise<{ collection: string; id: string }> }) {
  try {
    const { collection, id } = await ctx.params;
    if (collection !== "courses") throw new ApiError("not_found", `Завершение курса недоступно для ${collection}`);
    const body = (await readJsonBody(req)) as { name?: unknown; score?: unknown };
    const certificate = await getServerStore().api.courses.complete(id, { name: String(body.name ?? ""), score: Number(body.score ?? 0) });
    return Response.json(certificate, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
