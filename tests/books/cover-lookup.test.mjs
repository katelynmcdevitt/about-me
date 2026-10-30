import test from "node:test";
import assert from "node:assert/strict";
import { loadFile } from "../helpers/load-module.mjs";
const { findBookCover } = await loadFile(new URL("../../src/server/books/cover-lookup.ts", import.meta.url));

test("cover lookup uses title and author, checks matches, and requests a bounded search", async () => {
  const cover = await findBookCover("The Book!", "A. Writer", async (url, options) => {
    const query = new URL(url);
    assert.equal(query.origin, "https://openlibrary.org");
    assert.equal(query.searchParams.get("title"), "The Book!");
    assert.equal(query.searchParams.get("author"), "A. Writer");
    assert.equal(query.searchParams.get("limit"), "5");
    assert.ok(options.signal);
    return Response.json({ docs: [
      { title: "The Book", author_name: ["Other writer"], cover_i: 12 },
      { title: "Another Book", author_name: ["A. Writer"], cover_i: 13 },
      { title: "The Book", author_name: ["A Writer"], cover_i: 42 },
    ] });
  });
  assert.equal(cover, 42);
});

test("no cover, bad responses, and unavailable search leave cover unset", async () => {
  for (const fetcher of [
    async () => { throw new Error("Offline"); },
    async () => new Response("Busy", { status: 429 }),
    async () => Response.json({ docs: [{ title: "Book", author_name: ["Writer"], cover_i: -1 }] }),
    async () => Response.json({ docs: null }),
    async () => new Response("Invalid JSON"),
  ]) assert.equal(await findBookCover("Book", "Writer", fetcher), null);
  assert.equal(await findBookCover("", "Writer", () => { throw Error("Should not search"); }), null);
});
