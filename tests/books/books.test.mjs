import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
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
const sheetCsv =
  "Title,Author,Form,Nonfiction?,Rating,Date Read\nTest memoir,Writer B,Audio,Yes,4.5,2026/10/01\nTest novel,Writer A,Kindle,No,5,2025/09/01";
const mockSheet = () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /^\/api\/books\/google-sheet\/\d+$/);
    return new Response(sheetCsv);
  };
};
test.beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = async () => {
    throw new Error("Offline");
  };
  window.confirm = () => true;
});
test.afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  dom.window.Storage.prototype.setItem = originalSetItem;
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

test("UI sync replaces demo books, renders decimal ratings, and filters, sorts, and persists annotations", async () => {
  mockSheet();
  render(createElement(BooksApp));
  await waitFor(() => assert.equal(screen.getAllByRole("article").length, 2));
  assert.equal(screen.queryByRole("heading", { name: "Circe" }), null);
  assert.ok(screen.getByText("4.5"));
  assert.equal(localStorage.getItem(DEMO_KEY), "false");
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search books and authors" }),
    { target: { value: "memoir" } },
  );
  assert.equal(screen.getAllByRole("article").length, 1);
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Sort books" }), {
    target: { value: "author" },
  });
  assert.equal(
    within(screen.getAllByRole("article")[0]).getByRole("heading").textContent,
    "Test novel",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add category" }));
  fireEvent.change(screen.getByLabelText("New category name"), {
    target: { value: "Favorites" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save category" }));
  fireEvent.click(screen.getByRole("button", { name: /^All books/ }));
  fireEvent.change(
    screen.getByRole("combobox", { name: "Category for Test novel" }),
    { target: { value: "Favorites" } },
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Type for Test novel" }),
    { target: { value: "Nonfiction" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Add tag to Test novel" }),
  );
  fireEvent.change(screen.getByLabelText("New tag for Test novel"), {
    target: { value: "Revisit" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save tag for Test novel" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sync sheet" }));
  await waitFor(() =>
    assert.ok(screen.getByRole("button", { name: "Sync sheet" })),
  );
  const novel = JSON.parse(localStorage.getItem(STORAGE_KEY)).find(
    (b) => b.title === "Test novel",
  );
  assert.equal(novel.category, "Favorites");
  assert.equal(novel.kind, "Nonfiction");
  assert.deepEqual(novel.tags, ["Revisit"]);
  cleanup();
  globalThis.fetch = async () => {
    throw new Error("Offline");
  };
  render(createElement(BooksApp));
  await screen.findByText("Offline");
  assert.equal(
    screen.getByRole("combobox", { name: "Type for Test novel" }).value,
    "Nonfiction",
  );
  assert.deepEqual(JSON.parse(localStorage.getItem(CATEGORIES_KEY)), [
    "Favorites",
  ]);
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Revisit tag from Test novel" }),
  );
  assert.deepEqual(
    JSON.parse(localStorage.getItem(STORAGE_KEY)).find(
      (b) => b.title === "Test novel",
    ).tags,
    [],
  );
});

test("Goodreads CSV UI imports read books and handles invalid files", async () => {
  render(createElement(BooksApp));
  await screen.findByText("Offline");
  const input = screen.getByLabelText("Import CSV");
  fireEvent.change(input, {
    target: {
      files: [
        new dom.window.File(
          [
            "Title,Author,Exclusive Shelf,My Rating\nImported book,Writer,read,4.5\nUnread,Writer,to-read,0",
          ],
          "goodreads.csv",
          { type: "text/csv" },
        ),
      ],
    },
  });
  await screen.findByRole("heading", { name: "Imported book" });
  assert.equal(screen.getAllByRole("article").length, 1);
  assert.ok(within(screen.getByRole("article")).getByText("4.5"));
  fireEvent.change(input, {
    target: {
      files: [
        new dom.window.File(["Something,Else\nx,y"], "invalid.csv", {
          type: "text/csv",
        }),
      ],
    },
  });
  await screen.findByText(/does not look like a Goodreads export/);
  assert.equal(screen.getAllByRole("article").length, 1);
});

test("library backups validate before replacing books and preserve tags, categories and manual types", async () => {
  render(createElement(BooksApp));
  await screen.findByText("Offline");
  const backup = {
    version: 1,
    books: [
      {
        ...sampleBooks[0],
        title: "Restored book",
        tags: ["Restored tag"],
        kind: "Nonfiction",
        kindSource: "manual",
      },
    ],
    categories: ["Restored category"],
    isDemo: false,
    lastSyncedAt: "",
  };
  fireEvent.change(screen.getByLabelText("Import library backup"), {
    target: {
      files: [
        { name: "backup.json", text: async () => JSON.stringify(backup) },
      ],
    },
  });
  await screen.findByRole("heading", { name: "Restored book" });
  assert.ok(screen.getByText("Restored tag"));
  assert.ok(screen.getByRole("button", { name: /Restored category/ }));
  assert.equal(
    screen.getByRole("combobox", { name: "Type for Restored book" }).value,
    "Nonfiction",
  );
  assert.throws(() =>
    parseLibraryBackup({ ...backup, books: [{ title: "Broken" }] }),
  );
  assert.throws(() => parseLibraryBackup({ ...backup, categories: [null] }));
  window.confirm = () => false;
  await act(async () =>
    fireEvent.change(screen.getByLabelText("Import library backup"), {
      target: {
        files: [
          {
            name: "empty.json",
            text: async () => JSON.stringify({ ...backup, books: [] }),
          },
        ],
      },
    }),
  );
  assert.ok(screen.getByRole("heading", { name: "Restored book" }));
});

test("unavailable browser storage warns without crashing or losing in-memory editing", async () => {
  dom.window.Storage.prototype.setItem = () => {
    throw new Error("Full");
  };
  render(createElement(BooksApp));
  await screen.findByText("Offline");
  assert.match(screen.getByRole("alert").textContent, /could not be saved/);
  fireEvent.change(screen.getByRole("combobox", { name: "Type for Circe" }), {
    target: { value: "Fiction" },
  });
  assert.equal(
    screen.getByRole("combobox", { name: "Type for Circe" }).value,
    "Fiction",
  );
});
