import { getBooksStore } from "../../../../../server/books/database";
import { apiError, noCache, readJson } from "../../../../../server/books/http";
import { LibraryError } from "../../../../../server/books/errors";
import type { ImportDecision } from "../../../../../features/books/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = (await readJson(request)) as {
      decision?: ImportDecision;
      version?: number;
    };
    if (!body || !body.decision || typeof body.version !== "number")
      throw new LibraryError("Choose a resolution for this row.");
    const { id } = await params;
    return Response.json(
      getBooksStore().resolveImport(id, body.decision, body.version),
      { headers: noCache },
    );
  } catch (error) {
    return apiError(error);
  }
}
