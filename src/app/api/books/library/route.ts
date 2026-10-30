import { findBookCover } from "../../../../server/books/cover-lookup";
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
    if (body.action === "refreshCover" && typeof body.id === "string" && typeof body.revision === "number") {
      const library = store.getLibrary();
      if (library.revision !== body.revision) throw new LibraryError("The library changed. Reload it and try again.", 409);
      const book = library.books.find(book => book.id === body.id);
      if (!book) throw new LibraryError("This reading entry no longer exists.", 404);
      const coverId = await findBookCover(book.title, book.author);
      return Response.json({ library: store.refreshCover(body.id, coverId, body.revision), found: coverId !== null }, { headers: noCache });
    }
    if (body.action === "deleteCurrentReading" && typeof body.id === "string" && typeof body.revision === "number")
      return Response.json(store.deleteCurrentReading(body.id, body.revision), { headers: noCache });
    if (body.action === "startReading" && body.changes && typeof body.revision === "number") {
      if (typeof body.changes.title !== "string" || typeof body.changes.author !== "string")
        throw new LibraryError("Enter a title and author.");
      const existing = store.getLibrary().books.find(book =>
        book.title.trim().toLowerCase() === body.changes!.title?.trim().toLowerCase() &&
        book.author.trim().toLowerCase() === body.changes!.author?.trim().toLowerCase(),
      );
      const coverId = existing?.coverId ?? await findBookCover(body.changes.title, body.changes.author);
      return Response.json(store.startReading(body.changes, body.revision, coverId), { headers: noCache });
    }
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
