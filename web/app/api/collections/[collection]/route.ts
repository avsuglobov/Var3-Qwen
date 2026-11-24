import type { CollectionName, ItemOf } from "@/lib/schemas";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { repoOf } from "@/lib/server/routes";

type Ctx = { params: Promise<{ collection: string }> };

/** GET /api/collections/[collection] — список записей коллекции. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { collection } = await ctx.params;
    return Response.json(await repoOf(collection).list());
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/collections/[collection] — создание записи (201); схема коллекции проверяется движком. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { collection } = await ctx.params;
    const item = await readJsonBody(req);
    const created = await repoOf(collection).create(item as ItemOf<Exclude<CollectionName, "COMPANY_PROFILE">>);
    return Response.json(created, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
