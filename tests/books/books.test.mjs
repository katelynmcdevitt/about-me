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
const { PATCH: resolvePatch } = await loadFile(
  new URL("../../src/app/api/books/imports/[id]/route.ts", import.meta.url),
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
  const resolution = path.match(/^\/api\/books\/imports\/([^/]+)$/);
  if (resolution)
    return resolvePatch(request, {
      params: Promise.resolve({ id: resolution[1] }),
    });
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

test("book details saves corrections, records rereads, and retains both after reloading", async () => {
  globalThis.fetch = apiFetch;
  await seed();
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  fireEvent.click(
    screen.getByRole("button", { name: "Imported book", exact: true }),
  );
  let panel = within(
    await screen.findByRole("dialog", { name: "Book details" }),
  );
  fireEvent.change(panel.getByLabelText("Title"), {
    target: { value: "Corrected book" },
  });
  fireEvent.change(panel.getByLabelText("Author"), {
    target: { value: "Corrected writer" },
  });
  fireEvent.change(panel.getByLabelText("Pages"), { target: { value: "250" } });
  fireEvent.change(panel.getByLabelText("Publication year"), {
    target: { value: "2020" },
  });
  fireEvent.change(panel.getByLabelText("Rating"), {
    target: { value: "4.75" },
  });
  fireEvent.change(panel.getByLabelText("Reading format"), {
    target: { value: "Kindle" },
  });
  fireEvent.change(panel.getByLabelText("Category"), {
    target: { value: "New category" },
  });
  fireEvent.change(panel.getByLabelText("Tags"), {
    target: { value: "Favorite, Revisit" },
  });
  fireEvent.click(panel.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.ok(screen.queryByRole("dialog") === null));
  assert.ok(screen.getByRole("heading", { name: "Corrected book" }));
  let library = getBooksStore().getLibrary();
  assert.equal(library.books[0].rating, 4.75);
  assert.equal(library.books[0].pages, 250);
  assert.equal(library.books[0].format, "Kindle");
  assert.deepEqual(library.books[0].tags, ["Favorite", "Revisit"]);
  fireEvent.click(
    screen.getByRole("button", { name: "Corrected book", exact: true }),
  );
  panel = within(await screen.findByRole("dialog", { name: "Book details" }));
  fireEvent.click(panel.getByRole("button", { name: "Record a reread" }));
  panel = within(screen.getByRole("dialog", { name: "Record a reread" }));
  fireEvent.change(panel.getByLabelText("Finished date"), {
    target: { value: "2025-06" },
  });
  fireEvent.change(panel.getByLabelText("Rating"), {
    target: { value: "3.5" },
  });
  fireEvent.click(panel.getByRole("button", { name: "Save reread" }));
  await waitFor(() => assert.ok(screen.queryByRole("dialog") === null));
  library = getBooksStore().getLibrary();
  assert.equal(library.books.length, 2);
  assert.ok(
    library.books.some(
      (book) => book.dateRead === "2025-06" && book.rating === 3.5,
    ),
  );
  cleanup();
  render(createElement(BooksApp));
  await waitFor(() => assert.equal(screen.getAllByRole("article").length, 2));
  assert.ok(
    getBooksStore()
      .getLibrary()
      .books.every((book) => book.title === "Corrected book"),
  );
});

test("cancel and failed detail saves retain the stored data and keep editable drafts", async () => {
  globalThis.fetch = apiFetch;
  await seed();
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  fireEvent.click(
    screen.getByRole("button", { name: "Imported book", exact: true }),
  );
  let panel = within(
    await screen.findByRole("dialog", { name: "Book details" }),
  );
  fireEvent.change(panel.getByLabelText("Title"), {
    target: { value: "Unsaved" },
  });
  fireEvent.click(panel.getByRole("button", { name: "Cancel" }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(getBooksStore().getLibrary().books[0].title, "Imported book");
  fireEvent.click(
    screen.getByRole("button", { name: "Imported book", exact: true }),
  );
  panel = within(await screen.findByRole("dialog", { name: "Book details" }));
  fireEvent.change(panel.getByLabelText("Title"), {
    target: { value: "Keep this draft" },
  });
  globalThis.fetch = async (url, init) =>
    init?.method === "PATCH"
      ? Response.json({ error: "Save failed" }, { status: 500 })
      : apiFetch(url, init);
  fireEvent.click(panel.getByRole("button", { name: "Save changes" }));
  await panel.findByRole("alert");
  assert.equal(panel.getByLabelText("Title").value, "Keep this draft");
  assert.equal(getBooksStore().getLibrary().books[0].title, "Imported book");
});

test("import preview resolves a conflicting match, preserves annotations, and confirms the reviewed result", async () => {
  globalThis.fetch = apiFetch;
  const library = await seed();
  getBooksStore().updateEntry(
    library.books[0].id,
    { tags: ["Keep annotation"], kind: "Nonfiction" },
    library.revision,
  );
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  const csv =
    "Book Id,Title,Author,Exclusive Shelf,Date Read,My Rating\n456,Imported book,Writer,read,2026/10/01,5";
  fireEvent.change(screen.getByLabelText("Import CSV"), {
    target: { files: [uploadFile(csv)] },
  });
  const panel = within(
    await screen.findByRole("dialog", { name: "Review your import" }),
  );
  assert.ok(panel.getByRole("button", { name: "Confirm import" }).disabled);
  fireEvent.click(
    panel.getByRole("button", { name: "Match row 2 to existing book" }),
  );
  await waitFor(() =>
    assert.equal(
      panel
        .getByRole("button", { name: "Match row 2 to existing book" })
        .getAttribute("aria-pressed"),
      "true",
    ),
  );
  assert.ok(!panel.getByRole("button", { name: "Confirm import" }).disabled);
  assert.equal(getBooksStore().getLibrary().books[0].rating, 4.5);
  fireEvent.click(panel.getByRole("button", { name: "Confirm import" }));
  await waitFor(() => assert.ok(screen.queryByRole("dialog") === null));
  const saved = getBooksStore().getLibrary();
  assert.equal(saved.books.length, 1);
  assert.equal(saved.books[0].rating, 5);
  assert.equal(saved.books[0].goodreadsId, "123");
  assert.equal(saved.books[0].kind, "Nonfiction");
  assert.deepEqual(saved.books[0].tags, ["Keep annotation"]);
});

test("every uncertain row remains accessible through preview pagination, including rows beyond 100", async () => {
  globalThis.fetch = apiFetch;
  await seed();
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  const csv =
    "Book Id,Title,Author,Exclusive Shelf\n" +
    Array.from(
      { length: 101 },
      (_, i) => `${1000 + i},Imported book,Writer,read`,
    ).join("\n");
  fireEvent.change(screen.getByLabelText("Import CSV"), {
    target: { files: [uploadFile(csv)] },
  });
  const panel = within(
    await screen.findByRole("dialog", { name: "Review your import" }),
  );
  fireEvent.click(panel.getByRole("button", { name: "Next rows" }));
  fireEvent.click(panel.getByRole("button", { name: "Next rows" }));
  assert.ok(panel.getByRole("button", { name: "Skip row 102" }));
  fireEvent.click(panel.getByRole("button", { name: "Skip row 102" }));
  await waitFor(() =>
    assert.equal(
      panel
        .getByRole("button", { name: "Skip row 102" })
        .getAttribute("aria-pressed"),
      "true",
    ),
  );
  assert.ok(panel.getByText("100 need review"));
  assert.equal(getBooksStore().getLibrary().books.length, 1);
});

test("CSV format labels in categories and shelves populate both reading-format charts", async () => {
  const row = (values) =>
    bookFromRow({
      Title: "Book",
      Author: "Writer",
      "Exclusive Shelf": "read",
      ...values,
    });
  assert.equal(row({ Bookshelves: "read, audio" }).format, "Audio");
  assert.equal(row({ Category: "Kindle" }).format, "Kindle");
  assert.equal(row({ Category: "Physical" }).format, "Physical");
  assert.equal(row({ Category: "Audio", Format: "Kindle" }).format, "Kindle");
  assert.equal(
    row({ Category: "Audio", Bookshelves: "Kindle" }).format,
    "Unclear",
  );
  for (const provider of ["Everand", "Libby", "Audible"]) {
    assert.equal(row({ Category: provider }).format, "Audio");
    assert.equal(row({ Bookshelves: provider.toLowerCase() }).format, "Audio");
    assert.equal(row({ Format: provider }).format, "Audio");
  }
  assert.equal(row({ Category: "Libby", Format: "Kindle" }).format, "Kindle");
  const preview = getBooksStore().previewImport({
    source: "goodreads",
    filename: "shelves.csv",
    csv: "Title,Author,Exclusive Shelf,Date Read,Bookshelves\nAudio title,Writer,read,2026/01/01,audio\nPhysical title,Writer,read,2026/01/02,physical\nKindle title,Writer,read,2026/01/03,kindle",
  });
  getBooksStore().confirmImport(preview.id);
  globalThis.fetch = apiFetch;
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Audio title" });
  const chart = within(
    screen.getByRole("region", { name: "Audio, physical & Kindle" }),
  );
  assert.ok(
    chart.getByRole("img", {
      name: "Overall: 33% audio, 33% physical, 34% Kindle, 0 unclear",
    }),
  );
  assert.ok(
    chart.getByRole("img", {
      name: "2026: 33% audio, 33% physical, 34% Kindle, 0 unclear",
    }),
  );
  assert.equal(chart.getAllByRole("img")[0].querySelectorAll("span").length, 3);
});

test("reading format queue saves all three choices, keeps failed saves, and stays complete after reload", async () => {
  globalThis.fetch = apiFetch;
  await seed();
  const preview = getBooksStore().previewImport({
    source: "goodreads",
    filename: "formats-queue.csv",
    csv: "Title,Author,Exclusive Shelf,Format\nNeeds print,Writer,read,\nNeeds ebook,Writer,read,\nKnown book,Writer,read,Audio",
  });
  getBooksStore().confirmImport(preview.id);
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  fireEvent.click(screen.getByRole("button", { name: /Needs reading format/ }));
  assert.equal(screen.getAllByRole("article").length, 3);
  assert.ok(!screen.queryByRole("heading", { name: "Known book" }));
  globalThis.fetch = async (url, init) =>
    init?.method === "PATCH"
      ? Response.json({ error: "Format save failed" }, { status: 500 })
      : apiFetch(url, init);
  fireEvent.click(
    screen.getByRole("button", { name: "Mark Imported book as audio" }),
  );
  await screen.findByRole("alert");
  assert.ok(screen.getByRole("heading", { name: "Imported book" }));
  globalThis.fetch = apiFetch;
  fireEvent.click(
    screen.getByRole("button", { name: "Mark Imported book as audio" }),
  );
  await waitFor(() =>
    assert.ok(!screen.queryByRole("heading", { name: "Imported book" })),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Mark Needs print as physical" }),
  );
  await waitFor(() =>
    assert.ok(!screen.queryByRole("heading", { name: "Needs print" })),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Mark Needs ebook as kindle" }),
  );
  await screen.findByRole("heading", { name: "All reading formats set" });
  assert.match(
    screen.getByRole("button", { name: /Needs reading format/ }).textContent,
    /0$/,
  );
  const saved = getBooksStore().getLibrary().books;
  assert.equal(
    saved.find((book) => book.title === "Imported book").format,
    "Audio",
  );
  assert.equal(
    saved.find((book) => book.title === "Needs print").format,
    "Physical",
  );
  assert.equal(
    saved.find((book) => book.title === "Needs ebook").format,
    "Kindle",
  );
  cleanup();
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "Imported book" });
  fireEvent.click(screen.getByRole("button", { name: /Needs reading format/ }));
  assert.ok(screen.getByRole("heading", { name: "All reading formats set" }));
});

test("yearly dashboard changes years, reports missing data, and links to the format queue", async () => {
  globalThis.fetch = apiFetch;
  const preview = getBooksStore().previewImport({
    source: "goodreads",
    filename: "dashboard.csv",
    csv: "Title,Author,Exclusive Shelf,Date Read,My Rating,Number of Pages,Format\nJanuary book,Writer,read,2026/01/01,4,100,Audio\nFebruary book,Writer,read,2026/02,0,,\nEarlier book,Writer,read,2025/03/01,5,300,Kindle\nUndated book,Writer,read,,3,900,Physical",
  });
  getBooksStore().confirmImport(preview.id);
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "January book" });
  fireEvent.click(screen.getByRole("button", { name: "Yearly reading" }));
  const dashboard = within(
    screen.getByRole("region", { name: "Yearly reading" }),
  );
  assert.equal(
    dashboard.getByRole("combobox", { name: "Dashboard year" }).value,
    "2026",
  );
  assert.ok(
    within(
      dashboard.getByRole("article", { name: "Books finished" }),
    ).getByText("2"),
  );
  assert.ok(
    within(dashboard.getByRole("article", { name: "Pages read" })).getByText(
      "100",
    ),
  );
  assert.ok(
    within(
      dashboard.getByRole("article", { name: "Average rating" }),
    ).getByText("4.0"),
  );
  assert.ok(dashboard.getByRole("listitem", { name: "Jan: 1 book" }));
  assert.ok(dashboard.getByText(/1 reading has no known finish date/));
  fireEvent.change(
    dashboard.getByRole("combobox", { name: "Dashboard year" }),
    { target: { value: "2025" } },
  );
  assert.ok(
    within(dashboard.getByRole("article", { name: "Pages read" })).getByText(
      "300",
    ),
  );
  assert.ok(
    within(
      dashboard.getByRole("article", { name: "Average rating" }),
    ).getByText("5.0"),
  );
  fireEvent.click(
    dashboard.getByRole("button", {
      name: /Set missing formats across your library/,
    }),
  );
  assert.ok(screen.getByRole("heading", { name: "February book" }));
  assert.equal(screen.getAllByRole("article").length, 1);
});

test("yearly dashboard handles an empty library without implying that undated books belong to a year", async () => {
  globalThis.fetch = apiFetch;
  render(createElement(BooksApp));
  await screen.findByRole("heading", { name: "No books yet" });
  await waitFor(() =>
    assert.ok(
      !screen
        .getByRole("button", { name: "Yearly reading" })
        .closest("fieldset").disabled,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Yearly reading" }));
  const dashboard = within(
    screen.getByRole("region", { name: "Yearly reading" }),
  );
  assert.ok(
    dashboard.getByRole("combobox", { name: "Dashboard year" }).disabled,
  );
  assert.ok(dashboard.getByText(/No finished dates yet/));
  assert.ok(
    within(
      dashboard.getByRole("article", { name: "Books finished" }),
    ).getByText("0"),
  );
  assert.ok(
    within(
      dashboard.getByRole("article", { name: "Average rating" }),
    ).getByText("—"),
  );
});
