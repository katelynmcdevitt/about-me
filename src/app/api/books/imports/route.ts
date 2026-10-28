import { getBooksStore } from "../../../../server/books/database";
import { apiError, noCache, readJson } from "../../../../server/books/http";
import { LibraryError } from "../../../../server/books/errors";
import type { ImportInput } from "../../../../features/books/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const input = await readJson(request);
    if (!input || typeof input !== "object")
      throw new LibraryError("Choose a CSV file or library backup.");
    return Response.json(getBooksStore().previewImport(input as ImportInput), {
      headers: noCache,
    });
  } catch (error) {
    return apiError(error);
  }
}
