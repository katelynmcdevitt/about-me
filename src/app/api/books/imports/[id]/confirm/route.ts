import { getBooksStore } from "../../../../../../server/books/database";
import {
  apiError,
  noCache,
  readJson,
} from "../../../../../../server/books/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = (await readJson(request)) as { version?: number } | null;
    const { id } = await params;
    return Response.json(getBooksStore().confirmImport(id, body?.version), {
      headers: noCache,
    });
  } catch (error) {
    return apiError(error);
  }
}
