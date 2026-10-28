import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFile } from "../helpers/load-module.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement,
  FileReader: dom.window.FileReader,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const { render, fireEvent, screen, waitFor, cleanup, within, act } =
  await import("@testing-library/react");
const { createElement } = await import("react");
const model = await loadFile(
  new URL("../../src/features/books/model.ts", import.meta.url),
);
const { default: BooksApp } = await loadFile(
  new URL("../../src/features/books/BooksApp.tsx", import.meta.url),
);
const { GET } = await loadFile(
  new URL(
    "../../src/app/api/books/google-sheet/[gid]/route.ts",
    import.meta.url,
  ),
);
const {
  STORAGE_KEY,
  CATEGORIES_KEY,
  DEMO_KEY,
  sampleBooks,
  bookFromRow,
  sheetBooksFromCsv,
  mergeBooks,
  normalizeIsbn,
  parseRating,
  normalizeStoredRating,
  lookupBookKinds,
  parseLibraryBackup,
  bookMix,
  formatMix,
} = model;
const originalFetch = globalThis.fetch;
const originalSetItem = dom.window.Storage.prototype.setItem;
const testRoot = mkdtempSync(join(tmpdir(), "books-api-test-"));
const { GET: libraryGet, PATCH: libraryPatch } = await loadFile(
  new URL("../../src/app/api/books/library/route.ts", import.meta.url),
);
const { POST: previewPost } = await loadFile(
  new URL("../../src/app/api/books/imports/route.ts", import.meta.url),
);
const { POST: confirmPost } = await loadFile(
  new URL(
    "../../src/app/api/books/imports/[id]/confirm/route.ts",
    import.meta.url,
  ),
);
const { getBooksStore } = await loadFile(
  new URL("../../src/server/books/database.ts", import.meta.url),
);
let fileIndex = 0;
const apiFetch = async (url, init = {}) => {
  const path = String(url);
  const request = new Request(`http://localhost:3000${path}`, init);
  if (path === "/api/books/library")
    return init.method === "PATCH" ? libraryPatch(request) : libraryGet();
  if (path === "/api/books/imports") return previewPost(request);
  const confirm = path.match(/^\/api\/books\/imports\/([^/]+)\/confirm$/);
  if (confirm)
    return confirmPost(request, {
      params: Promise.resolve({ id: confirm[1] }),
    });
  throw new Error(`Unexpected request: ${path}`);
};
const inputCsv =
  "Book Id,Title,Author,Exclusive Shelf,My Rating,Date Read\n123,Imported book,Writer,read,4.5,2026/10/01\n999,Unread,Writer,to-read,0,";
const sheetCsv = inputCsv;
const uploadFile = (text, name = "goodreads.csv") => ({
  name,
  size: text.length,
  text: async () => text,
});
const jsonRequest = (body, method = "POST", headers = {}) => ({
  method,
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
async function seed() {
  const preview = await (
    await apiFetch(
      "/api/books/imports",
      jsonRequest({ source: "goodreads", filename: "seed.csv", csv: inputCsv }),
    )
  ).json();
  return (
    await apiFetch(`/api/books/imports/${preview.id}/confirm`, jsonRequest({}))
  ).json();
}
test.beforeEach(() => {
  process.env.BOOKS_DATABASE_PATH = join(testRoot, `${fileIndex++}.sqlite`);
  localStorage.clear();
  globalThis.fetch = async () => {
    throw new Error("Offline");
  };
  window.confirm = () => true;
});
test.afterEach(() => {
  cleanup();
  getBooksStore().close();
  globalThis.fetch = originalFetch;
  dom.window.Storage.prototype.setItem = originalSetItem;
});

test.after(() => {
  delete process.env.BOOKS_DATABASE_PATH;
  rmSync(testRoot, { recursive: true, force: true });
});

test("Goodreads rows retain read books, fractional ratings, normalized ISBNs and annotations", () => {
  const book = bookFromRow({
    Title: "Read book",
    Author: "Author",
    "Exclusive Shelf": "read",
    ISBN: '="0316556343"',
    "My Rating": "4,5",
    Bookshelves: "read, memoir",
    "Date Read": "2026/10/01",
    Tags: "favorite;gift",
    Format: "audiobook",
    "Nonfiction?": "yes",
    Pages: "334",
  });
  assert.equal(book.title, "Read book");
  assert.equal(book.rating, 4.5);
  assert.equal(book.isbn, "9780316556347");
  assert.equal(book.format, "Audio");
  assert.equal(book.kind, "Nonfiction");
  assert.equal(book.pages, 334);
  assert.deepEqual(book.tags, ["favorite", "gift"]);
  assert.equal(
    bookFromRow({ Title: "Unread", "Exclusive Shelf": "to-read" }),
    null,
  );
  assert.equal(bookFromRow({ Author: "Missing title", Status: "read" }), null);
  assert.equal(normalizeIsbn('="978-0316556347"'), "9780316556347");
  assert.equal(parseRating("4.75 stars"), 4.75);
  assert.equal(parseRating("12"), null);
  assert.equal(normalizeStoredRating(45), 4.5);
  assert.equal(normalizeStoredRating(450), 4.5);
});

test("month-heading sheet CSVs retain dates, formats, classification source and ratings", () => {
  const books = sheetBooksFromCsv(
    "October 2026,,Form,Nonfiction?,Rating\nA memoir,Author,Physical,Yes,4.5\nA novel,Writer,Kindle,No,5\nNovember 2026,,,,\nAnother,Writer,Audio,,3",
  );
  assert.equal(books.length, 3);
  assert.equal(books[0].dateRead, "2026/10");
  assert.equal(books[2].dateRead, "2026/11");
  assert.equal(books[0].kindSource, "sheet");
  assert.equal(books[1].kind, "Fiction");
  assert.equal(books[2].format, "Audio");
  assert.deepEqual(bookMix(books), { fiction: 1, nonfiction: 1, unclear: 1 });
  assert.deepEqual(formatMix(books), {
    audio: 1,
    physical: 1,
    kindle: 1,
    unclear: 0,
  });
});

test("merging synced books preserves manual classifications, categories, and tags without duplicates", () => {
  const previous = {
    ...sampleBooks[0],
    kind: "Nonfiction",
    kindSource: "manual",
    category: "My category",
    tags: ["mine"],
    format: "Physical",
  };
  const incoming = {
    ...previous,
    id: "new-id",
    category: "Sheet category",
    tags: [],
    kind: "Fiction",
    kindSource: "sheet",
    format: "Unclear",
  };
  const merged = mergeBooks([previous], [incoming], false);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "new-id");
  assert.equal(merged[0].kind, "Nonfiction");
  assert.equal(merged[0].category, "My category");
  assert.deepEqual(merged[0].tags, ["mine"]);
  assert.equal(merged[0].format, "Physical");
});

test("Open Library lookups respect manual overrides and reject mismatched titles", async () => {
  const manual = {
    ...sampleBooks[0],
    kind: "Nonfiction",
    kindSource: "manual",
  };
  const lookup = { ...sampleBooks[1], kind: "Unclear" };
  globalThis.fetch = async (url) => {
    assert.ok(!String(url).includes(manual.isbn));
    return Response.json({
      [`ISBN:${lookup.isbn}`]: {
        title: lookup.title,
        subjects: [{ name: "Memoir" }],
      },
    });
  };
  const books = await lookupBookKinds([manual, lookup]);
  assert.equal(books[0].kindSource, "manual");
  assert.equal(books[1].kind, "Nonfiction");
  globalThis.fetch = async () =>
    Response.json({
      [`ISBN:${lookup.isbn}`]: {
        title: "A completely different title",
        subjects: [{ name: "Fiction" }],
      },
    });
  assert.equal((await lookupBookKinds([lookup]))[0].kind, "Unclear");
});

test("Next.js sheet endpoint limits tabs, disables caching, and handles upstream errors", async () => {
  const call = (gid) =>
    GET(new Request(`http://localhost/api/books/google-sheet/${gid}`), {
      params: Promise.resolve({ gid }),
    });
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.match(
      String(url),
      /^https:\/\/docs.google.com\/spreadsheets\/d\/1gLdN5dpgPDGgn_HA4Ll0gAUOSftuFmY9yMxQALSB_UY\/export\?format=csv&gid=311097372$/,
    );
    assert.equal(options.cache, "no-store");
    return new Response(sheetCsv);
  };
  assert.equal((await call("unknown")).status, 404);
  assert.equal(calls, 0);
  const good = await call("311097372");
  assert.equal(good.status, 200);
  assert.match(good.headers.get("content-type"), /text\/csv/);
  assert.equal(good.headers.get("cache-control"), "no-store");
  assert.equal(await good.text(), sheetCsv);
  globalThis.fetch = async () => new Response("<html>Sign in</html>");
  assert.equal((await call("311097372")).status, 502);
  globalThis.fetch = async () => new Response("Denied", { status: 403 });
  assert.equal((await call("311097372")).status, 502);
  globalThis.fetch = async () => {
    throw new Error("Timeout");
  };
  assert.equal((await call("311097372")).status, 502);
});

test("CSV UI previews without saving, confirms, persists edits, and reloads from the database", async () => {
  globalThis.fetch = apiFetch;
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "No books yet" });
  await waitFor(() =>
    assert.equal(
      screen.getByLabelText("Import CSV").closest("fieldset").disabled,
      false,
    ),
  );
  fireEvent.change(screen.getByLabelText("Import CSV"), {
    target: { files: [uploadFile(inputCsv)] },
  });
  await screen.findByRole("dialog", { name: "Review your import" });
  assert.equal(getBooksStore().getLibrary().books.length, 0);
  assert.ok(screen.getByText("1 new readings"));
  assert.ok(screen.getByText("1 skipped"));
  fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
  await screen.findByRole("heading", { name: "Imported book" });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.ok(within(screen.getByRole("article")).getByText("4.5"));
  fireEvent.click(screen.getByRole("button", { name: "Add category" }));
  fireEvent.change(screen.getByLabelText("New category name"), {
    target: { value: "Favorites" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save category" }));
  await waitFor(() =>
    assert.ok(screen.getByRole("button", { name: /^Favorites/ })),
  );
  fireEvent.click(screen.getByRole("button", { name: /^All books/ }));
  fireEvent.change(
    screen.getByRole("combobox", { name: "Category for Imported book" }),
    { target: { value: "Favorites" } },
  );
  await waitFor(() =>
    assert.equal(getBooksStore().getLibrary().books[0].category, "Favorites"),
  );
  await waitFor(() =>
    assert.ok(
      !screen
        .getByRole("combobox", { name: "Type for Imported book" })
        .closest("fieldset").disabled,
    ),
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Type for Imported book" }),
    { target: { value: "Nonfiction" } },
  );
  await waitFor(() =>
    assert.equal(getBooksStore().getLibrary().books[0].kind, "Nonfiction"),
  );
  await waitFor(() =>
    assert.ok(
      !screen
        .getByRole("button", { name: "Add tag to Imported book" })
        .closest("fieldset").disabled,
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Add tag to Imported book" }),
  );
  fireEvent.change(screen.getByLabelText("New tag for Imported book"), {
    target: { value: "Revisit" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save tag for Imported book" }),
  );
  await screen.findByRole("button", {
    name: "Remove Revisit tag from Imported book",
  });
  cleanup();
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  assert.equal(
    screen.getByRole("combobox", { name: "Category for Imported book" }).value,
    "Favorites",
  );
  assert.equal(
    screen.getByRole("combobox", { name: "Type for Imported book" }).value,
    "Nonfiction",
  );
  assert.ok(
    screen.getByRole("button", {
      name: "Remove Revisit tag from Imported book",
    }),
  );
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
});

test("Google Sheets CSV import, cancel, search and sorting work against database entries", async () => {
  globalThis.fetch = apiFetch;
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "No books yet" });
  await waitFor(() =>
    assert.equal(
      screen.getByLabelText("Import CSV").closest("fieldset").disabled,
      false,
    ),
  );
  fireEvent.change(screen.getByRole("combobox", { name: "CSV source" }), {
    target: { value: "sheets" },
  });
  const csv =
    "October 2026,,Form,Nonfiction?,Rating\nMemoir,Writer B,Audio,Yes,4.5\nNovel,Writer A,Kindle,No,5";
  fireEvent.change(screen.getByLabelText("Import CSV"), {
    target: { files: [uploadFile(csv, "reading.csv")] },
  });
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  assert.equal(getBooksStore().getLibrary().books.length, 0);
  fireEvent.change(screen.getByLabelText("Import CSV"), {
    target: { files: [uploadFile(csv, "reading.csv")] },
  });
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
  await screen.findByRole("heading", { name: "Novel" });
  fireEvent.change(screen.getByRole("combobox", { name: "Sort books" }), {
    target: { value: "author" },
  });
  assert.equal(
    within(screen.getAllByRole("article")[0]).getByRole("heading").textContent,
    "Novel",
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "memoir" },
  });
  assert.equal(screen.getAllByRole("article").length, 1);
  assert.equal(getBooksStore().getLibrary().books[0].format, "Audio");
});

test("legacy browser library migrates only after preview and confirmation, leaving browser data intact", async () => {
  const saved = [
    {
      ...sampleBooks[0],
      tags: ["Legacy tag"],
      kind: "Fiction",
      kindSource: "manual",
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(["Legacy category"]));
  localStorage.setItem(DEMO_KEY, "false");
  globalThis.fetch = apiFetch;
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "No books yet" });
  await waitFor(() =>
    assert.equal(
      screen.getByLabelText("Import CSV").closest("fieldset").disabled,
      false,
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Preview browser migration" }),
  );
  await screen.findByRole("dialog");
  assert.equal(getBooksStore().getLibrary().books.length, 0);
  fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
  await screen.findByRole("heading", { name: "Circe" });
  assert.ok(
    screen.getByRole("button", { name: "Remove Legacy tag tag from Circe" }),
  );
  assert.equal(localStorage.getItem(STORAGE_KEY), JSON.stringify(saved));
  assert.equal(
    screen.queryByRole("button", { name: "Preview browser migration" }),
    null,
  );
});

test("failed saves show an error without changing the displayed or stored annotation", async () => {
  globalThis.fetch = apiFetch;
  await seed();
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  globalThis.fetch = async (url, init) =>
    init?.method === "PATCH"
      ? Response.json({ error: "Database unavailable" }, { status: 500 })
      : apiFetch(url, init);
  fireEvent.change(
    screen.getByRole("combobox", { name: "Type for Imported book" }),
    { target: { value: "Nonfiction" } },
  );
  await screen.findByRole("alert");
  assert.match(screen.getByRole("alert").textContent, /Database unavailable/);
  assert.equal(
    screen.getByRole("combobox", { name: "Type for Imported book" }).value,
    "Unclear",
  );
  assert.equal(getBooksStore().getLibrary().books[0].kind, "Unclear");
});

test("HTTP validation rejects cross-origin writes, invalid edits, malformed and oversized payloads", async () => {
  assert.equal(
    (
      await libraryPatch(
        new Request(
          "http://localhost:3000/api/books/library",
          jsonRequest(
            { action: "addCategory", name: "bad", revision: 0 },
            "PATCH",
            { Origin: "https://example.com" },
          ),
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await previewPost(
        new Request("http://localhost/api/books/imports", {
          method: "POST",
          body: "x",
          headers: { "Content-Type": "text/plain" },
        }),
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await previewPost(
        new Request("http://localhost/api/books/imports", {
          method: "POST",
          body: "{",
          headers: { "Content-Type": "application/json" },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await previewPost(
        new Request("http://localhost/api/books/imports", {
          method: "POST",
          body: "{}",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(6 * 1024 * 1024),
          },
        }),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await libraryPatch(
        new Request(
          "http://localhost/api/books/library",
          jsonRequest({ action: "bad" }, "PATCH"),
        ),
      )
    ).status,
    400,
  );
  assert.equal(getBooksStore().getLibrary().books.length, 0);
});

test("local writes accept the actual Host when Next normalizes the URL to localhost", async () => {
  const request = new Request(
    "http://localhost:3000/api/books/library",
    jsonRequest(
      { action: "addCategory", name: "Host test", revision: 0 },
      "PATCH",
      { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" },
    ),
  );
  const response = await libraryPatch(request);
  assert.equal(response.status, 200);
  assert.ok((await response.json()).categories.includes("Host test"));
  const foreignHost = new Request(
    "http://localhost:3000/api/books/library",
    jsonRequest(
      { action: "addCategory", name: "Rejected", revision: 1 },
      "PATCH",
      { Host: "external.example:3000", Origin: "http://external.example:3000" },
    ),
  );
  assert.equal((await libraryPatch(foreignHost)).status, 403);
});

test("classification view shows only unclear books, retains failures, and removes successfully classified books", async () => {
  globalThis.fetch = apiFetch;
  await seed();
  const preview = getBooksStore().previewImport({
    source: "sheets",
    filename: "classified.csv",
    csv: "Title,Author,Nonfiction?\nAlready classified,Writer,Yes",
  });
  getBooksStore().confirmImport(preview.id);
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  fireEvent.click(screen.getByRole("button", { name: /Needs classification/ }));
  assert.equal(screen.getAllByRole("article").length, 1);
  assert.equal(
    screen.queryByRole("heading", { name: "Already classified" }),
    null,
  );
  assert.equal(
    screen.queryByRole("region", { name: "Library statistics" }),
    null,
  );
  globalThis.fetch = async (url, init) =>
    init?.method === "PATCH"
      ? Response.json({ error: "Try saving again" }, { status: 500 })
      : apiFetch(url, init);
  fireEvent.click(
    screen.getByRole("button", { name: "Mark Imported book as fiction" }),
  );
  await screen.findByRole("alert");
  assert.ok(screen.getByRole("heading", { name: "Imported book" }));
  assert.match(
    screen.getByRole("button", { name: /Needs classification/ }).textContent,
    /1$/,
  );
  globalThis.fetch = apiFetch;
  fireEvent.click(
    screen.getByRole("button", { name: "Mark Imported book as nonfiction" }),
  );
  await screen.findByRole("heading", { name: "All books classified" });
  assert.match(
    screen.getByRole("button", { name: /Needs classification/ }).textContent,
    /0$/,
  );
  fireEvent.click(screen.getByRole("button", { name: "View all books" }));
  assert.equal(screen.getAllByRole("article").length, 2);
  assert.equal(
    screen.getByRole("combobox", { name: "Type for Imported book" }).value,
    "Nonfiction",
  );
  cleanup();
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  fireEvent.click(screen.getByRole("button", { name: /Needs classification/ }));
  assert.ok(screen.getByRole("heading", { name: "All books classified" }));
});
