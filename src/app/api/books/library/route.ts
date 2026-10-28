import { getBooksStore } from "../../../../server/books/database";
import { apiError, noCache, readJson } from "../../../../server/books/http";
import { LibraryError } from "../../../../server/books/errors";
import type { EntryChanges } from "../../../../features/books/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(getBooksStore().getLibrary(), { headers: noCache });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = (await readJson(request)) as {
      action?: string;
      id?: string;
      changes?: EntryChanges;
      name?: string;
      revision?: number;
    };
    if (!body || typeof body !== "object")
      throw new LibraryError("Invalid library edit.");
    const store = getBooksStore();
    if (
      (body.action === "updateEntry" || body.action === "addReading") &&
      typeof body.id === "string" &&
      body.changes &&
      typeof body.revision === "number"
    )
      return Response.json(
        body.action === "addReading"
          ? store.addReading(body.id, body.changes, body.revision)
          : store.updateEntry(body.id, body.changes, body.revision),
        { headers: noCache },
      );
    if (
      body.action === "addCategory" &&
      typeof body.name === "string" &&
      typeof body.revision === "number"
    )
      return Response.json(store.addCategory(body.name, body.revision), {
        headers: noCache,
      });
    throw new LibraryError("Invalid library edit.");
  } catch (error) {
    return apiError(error);
  }
}
