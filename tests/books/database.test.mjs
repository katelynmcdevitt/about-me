import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { loadFile } from "../helpers/load-module.mjs";
const { BooksStore } = await loadFile(
  new URL("../../src/server/books/store.ts", import.meta.url),
);
const { parseImport } = await loadFile(
  new URL("../../src/server/books/import-file.ts", import.meta.url),
);
const root = mkdtempSync(join(tmpdir(), "books-database-test-"));
let store;
test.beforeEach(() => {
  store = new BooksStore(":memory:");
});
test.afterEach(() => store.close());
test.after(() => rmSync(root, { recursive: true, force: true }));
const csv =
  "Book Id,Title,Author,ISBN13,Exclusive Shelf,My Rating,Date Read,Bookshelves\n123,My book,Writer,9780316556347,read,4.5,2026/10/01,fiction\n999,Unread,Writer,,to-read,0,,\n";
const input = (csvText = csv) => ({
  source: "goodreads",
  filename: "goodreads.csv",
  csv: csvText,
});
const confirm = (value = input()) => {
  const preview = store.previewImport(value);
  return store.confirmImport(preview.id);
};

test("preview does not change library; confirmation saves normalized books and history once", () => {
  const preview = store.previewImport(input());
  assert.deepEqual(preview.summary, {
    added: 1,
    updated: 0,
    unchanged: 0,
    skipped: 1,
    ambiguous: 0,
  });
  assert.equal(store.getLibrary().books.length, 0);
  const library = store.confirmImport(preview.id);
  assert.equal(library.books.length, 1);
  assert.equal(library.books[0].rating, 4.5);
  assert.equal(library.books[0].dateRead, "2026-10-01");
  assert.equal(library.books[0].goodreadsId, "123");
  assert.equal(library.imports[0].filename, "goodreads.csv");
  assert.throws(() => store.confirmImport(preview.id), /already imported/);
});

test("reimport is idempotent, preserves annotations and doesn't delete absent books", () => {
  let library = confirm();
  library = store.updateEntry(
    library.books[0].id,
    { tags: ["My tag"], category: "Favorites", kind: "Nonfiction" },
    library.revision,
  );
  const preview = store.previewImport(input());
  assert.equal(preview.summary.added, 0);
  assert.equal(preview.summary.unchanged, 1);
  library = store.confirmImport(preview.id);
  assert.equal(library.books.length, 1);
  assert.deepEqual(library.books[0].tags, ["My tag"]);
  assert.equal(library.books[0].category, "Favorites");
  assert.equal(library.books[0].kind, "Nonfiction");
  library = confirm(
    input("Title,Author,Exclusive Shelf\nOther book,Another,read"),
  );
  assert.equal(library.books.length, 2);
});

test("different finish dates represent rereads, duplicates within a CSV are skipped", () => {
  confirm();
  const two = csv.replaceAll("2026/10/01", "2025/09/01");
  confirm(input(two));
  const entries = store.getLibrary().books;
  assert.equal(entries.length, 2);
  assert.equal(new Set(entries.map((b) => b.id)).size, 2);
  const preview = store.previewImport(
    input(
      "Title,Author,Exclusive Shelf,Date Read\nMy book,Writer,read,2025/09/01\nMy book,Writer,read,2025/09/01",
    ),
  );
  assert.equal(preview.summary.skipped, 1);
  assert.equal(preview.summary.unchanged, 1);
  const missingDate = store.previewImport(
    input("Title,Author,Exclusive Shelf\nMy book,Writer,read"),
  );
  assert.equal(missingDate.summary.ambiguous, 1);
});

test("conflicting identifiers are ambiguous; invalid ratings and dates are skipped", () => {
  confirm();
  const preview = store.previewImport(
    input(
      "Title,Author,ISBN13,Exclusive Shelf,Date Read,My Rating\nMy book,Writer,9780399590504,read,2026/10/01,5\nBad date,Writer,,read,2026/02/30,4\nBad rating,Writer,,read,2026/01/01,11",
    ),
  );
  assert.equal(preview.summary.ambiguous, 1);
  assert.equal(preview.summary.skipped, 2);
  assert.throws(() => store.confirmImport(preview.id), /uncertain row/);
  assert.equal(store.getLibrary().books.length, 1);
});

test("changed library invalidates previews and stale edits instead of overwriting newer work", () => {
  let library = confirm();
  const preview = store.previewImport(input());
  store.updateEntry(
    library.books[0].id,
    { tags: ["Newer work"] },
    library.revision,
  );
  assert.throws(() => store.confirmImport(preview.id), /library changed/);
  assert.throws(
    () =>
      store.updateEntry(
        library.books[0].id,
        { kind: "Fiction" },
        library.revision,
      ),
    /library changed/,
  );
  assert.deepEqual(store.getLibrary().books[0].tags, ["Newer work"]);
});

test("database persists after closing and reopening, and SQLite backup is restorable", async () => {
  const path = join(root, "persistent.sqlite");
  let persistent = new BooksStore(path);
  const preview = persistent.previewImport(input());
  persistent.confirmImport(preview.id);
  persistent.close();
  persistent = new BooksStore(path);
  assert.equal(persistent.getLibrary().books[0].title, "My book");
  persistent.close();
  const handle = new DatabaseSync(path, { readOnly: true });
  const copy = join(root, "backup.sqlite");
  await backup(handle, copy);
  handle.close();
  const restored = new BooksStore(copy);
  assert.equal(restored.getLibrary().books[0].rating, 4.5);
  restored.close();
});

test("Google Sheets month-heading imports and legacy backups preserve formats and manual types", () => {
  const sheet = {
    source: "sheets",
    filename: "reading.csv",
    csv: "October 2026,,Form,Nonfiction?,Rating\nA memoir,Writer,Audio,Yes,4.5\nA novel,Author,Kindle,No,5",
  };
  let library = confirm(sheet);
  assert.equal(library.books.length, 2);
  assert.equal(library.books[0].dateRead, "2026-10");
  assert.equal(library.books[0].format, "Audio");
  assert.equal(library.books[0].kind, "Nonfiction");
  const legacy = {
    version: 1,
    books: [
      {
        ...library.books[0],
        tags: ["Imported tag"],
        category: "Legacy",
        kindSource: "manual",
      },
    ],
    categories: ["Legacy", "Empty category"],
    isDemo: false,
    lastSyncedAt: "",
  };
  library = confirm({
    source: "browser",
    filename: "Browser library",
    backup: legacy,
  });
  assert.deepEqual(library.books[0].tags, ["Imported tag"]);
  assert.ok(library.categories.includes("Empty category"));
  assert.throws(
    () =>
      parseImport({
        source: "backup",
        filename: "samples.json",
        backup: { ...legacy, isDemo: true },
      }),
    /sample data/,
  );
});

test("SQL values are parameterized and invalid edits fail without changing the library", () => {
  let library = confirm();
  library = store.addCategory(
    "Favorites'); DROP TABLE books;--",
    library.revision,
  );
  assert.equal(library.books.length, 1);
  const revision = library.revision;
  assert.throws(
    () => store.updateEntry(library.books[0].id, { tags: [null] }, revision),
    /tags/,
  );
  assert.equal(store.getLibrary().revision, revision);
  assert.throws(
    () => store.updateEntry(library.books[0].id, { kind: "Nope" }, revision),
    /type/,
  );
  assert.equal(store.getLibrary().books.length, 1);
});

test("a failed confirmation rolls back all writes and can be retried", () => {
  const file = join(root, "rollback.sqlite");
  const durable = new BooksStore(file);
  const triggerDb = new DatabaseSync(file);
  triggerDb.exec(
    "CREATE TRIGGER fail_reading BEFORE INSERT ON reading_entries BEGIN SELECT RAISE(ABORT, 'test write failure'); END;",
  );
  const preview = durable.previewImport(input());
  assert.throws(() => durable.confirmImport(preview.id), /test write failure/);
  assert.equal(durable.getLibrary().books.length, 0);
  assert.equal(durable.getLibrary().imports.length, 0);
  assert.equal(
    triggerDb.prepare("SELECT count(*) AS count FROM books").get().count,
    0,
  );
  triggerDb.exec("DROP TRIGGER fail_reading");
  assert.equal(durable.confirmImport(preview.id).books.length, 1);
  triggerDb.close();
  durable.close();
});

test("details edits update shared metadata while ratings and finish dates stay with each reading", () => {
  let library = confirm();
  const firstId = library.books[0].id;
  library = store.addReading(
    firstId,
    { dateRead: "2025-09", rating: 3, format: "Audio" },
    library.revision,
  );
  const secondId = library.books.find((book) => book.id !== firstId).id;
  library = store.updateEntry(
    firstId,
    {
      title: "Corrected title",
      author: "Corrected author",
      isbn: "0399590501",
      year: 2018,
      pages: 334,
      rating: 4.75,
      dateRead: "2026/10/02",
      format: "Physical",
      category: "Favorites",
      tags: ["Revisit"],
    },
    library.revision,
  );
  assert.equal(library.books.length, 2);
  assert.ok(
    library.books.every(
      (book) =>
        book.title === "Corrected title" &&
        book.author === "Corrected author" &&
        book.isbn === "9780399590504" &&
        book.pages === 334,
    ),
  );
  const first = library.books.find((book) => book.id === firstId),
    second = library.books.find((book) => book.id === secondId);
  assert.equal(first.rating, 4.75);
  assert.equal(first.dateRead, "2026-10-02");
  assert.deepEqual(first.tags, ["Revisit"]);
  assert.equal(second.rating, 3);
  assert.equal(second.dateRead, "2025-09");
  assert.equal(second.format, "Audio");
  assert.notEqual(second.category, "Favorites");
});

test("invalid details and duplicate rereads fail atomically; stale detail edits cannot overwrite newer work", () => {
  let library = confirm();
  const id = library.books[0].id;
  const invalid = [
    { title: " " },
    { author: "" },
    { isbn: "invalid" },
    { year: 20.5 },
    { pages: -1 },
    { rating: 5.1 },
    { dateRead: "2026-02-30" },
  ];
  for (const changes of invalid) {
    assert.throws(() => store.updateEntry(id, changes, library.revision));
    assert.equal(store.getLibrary().revision, library.revision);
  }
  assert.throws(
    () => store.addReading(id, { dateRead: "2026-10-01" }, library.revision),
    /already has a reading/,
  );
  assert.throws(
    () => store.addReading(id, {}, library.revision),
    /finish date/,
  );
  assert.throws(
    () =>
      store.addReading(
        id,
        { dateRead: "2025-10-01", title: "Wrong" },
        library.revision,
      ),
    /shared book details/,
  );
  library = store.addReading(id, { dateRead: "2025-10-01" }, library.revision);
  assert.throws(
    () =>
      store.updateEntry(
        id,
        { title: "Must roll back", dateRead: "2025-10-01" },
        library.revision,
      ),
    /already has a reading/,
  );
  assert.equal(store.getLibrary().books[0].title, "My book");
  const oldRevision = library.revision;
  store.updateEntry(id, { author: "New author" }, library.revision);
  assert.throws(
    () => store.updateEntry(id, { author: "Stale author" }, oldRevision),
    /library changed/,
  );
});

test("duplicate ISBNs cannot merge books through the details editor", () => {
  let library = confirm();
  library = confirm(
    input(
      "Title,Author,ISBN13,Exclusive Shelf\nAnother book,Another author,9780399590504,read",
    ),
  );
  assert.throws(
    () =>
      store.updateEntry(
        library.books[0].id,
        { isbn: "9780399590504" },
        library.revision,
      ),
    /already belongs/,
  );
  assert.equal(store.getLibrary().books.length, 2);
});

test("explicit matches keep identifiers and annotations, and only write after confirmation", () => {
  let library = confirm();
  library = store.updateEntry(
    library.books[0].id,
    { tags: ["Keep me"], category: "Favorites", kind: "Nonfiction" },
    library.revision,
  );
  const id = library.books[0].id;
  const conflict = input(
    "Book Id,Title,Author,ISBN13,Exclusive Shelf,Date Read,My Rating\n123,My book,Writer,9780399590504,read,2026/10/01,5",
  );
  let preview = store.previewImport(conflict);
  assert.equal(preview.summary.ambiguous, 1);
  assert.throws(() => store.confirmImport(preview.id), /uncertain row/);
  preview = store.resolveImport(
    preview.id,
    { row: 2, action: "match", entryId: id },
    preview.version,
  );
  assert.equal(preview.summary.ambiguous, 0);
  assert.equal(preview.summary.updated, 1);
  assert.equal(store.getLibrary().books[0].rating, 4.5);
  library = store.confirmImport(preview.id, preview.version);
  assert.equal(library.books.length, 1);
  assert.equal(library.books[0].rating, 5);
  assert.equal(library.books[0].isbn, "9780316556347");
  assert.equal(library.books[0].goodreadsId, "123");
  assert.deepEqual(library.books[0].tags, ["Keep me"]);
  assert.equal(library.books[0].category, "Favorites");
  assert.equal(library.books[0].kind, "Nonfiction");
});

test("separate editions retain free identifiers and disclose identifiers already in use", () => {
  confirm();
  let preview = store.previewImport(
    input(
      "Book Id,Title,Author,ISBN13,Exclusive Shelf,Date Read\n123,My book,Writer,9780399590504,read,2026/10/01",
    ),
  );
  preview = store.resolveImport(
    preview.id,
    { row: 2, action: "new" },
    preview.version,
  );
  assert.equal(preview.summary.added, 1);
  assert.match(preview.rows[0].detail, /Goodreads ID already in use/);
  let library = store.confirmImport(preview.id, preview.version);
  assert.equal(library.books.length, 2);
  const second = library.books.find((book) => book.isbn === "9780399590504");
  assert.equal(second.goodreadsId, "");
  preview = store.previewImport(
    input(
      "Book Id,Title,Author,ISBN13,Exclusive Shelf,Date Read\n123,My book,Writer,9780399590504,read,2026/10/01",
    ),
  );
  assert.equal(preview.summary.ambiguous, 1);
  preview = store.resolveImport(
    preview.id,
    { row: 2, action: "new" },
    preview.version,
  );
  assert.match(preview.rows[0].detail, /ISBN and Goodreads ID already in use/);
  library = store.confirmImport(preview.id, preview.version);
  assert.equal(library.books.length, 3);
  assert.ok(library.books.some((book) => !book.isbn && !book.goodreadsId));
});

test("choices can be undone or changed; explicitly skipped-only imports can be confirmed", () => {
  confirm();
  let preview = store.previewImport(
    input(
      "Title,Author,ISBN13,Exclusive Shelf\nMy book,Writer,9780399590504,read",
    ),
  );
  preview = store.resolveImport(
    preview.id,
    { row: 2, action: "skip" },
    preview.version,
  );
  assert.equal(preview.summary.skipped, 1);
  assert.equal(preview.summary.ambiguous, 0);
  preview = store.resolveImport(
    preview.id,
    { row: 2, action: "review" },
    preview.version,
  );
  assert.equal(preview.summary.ambiguous, 1);
  preview = store.resolveImport(
    preview.id,
    { row: 2, action: "new" },
    preview.version,
  );
  assert.equal(preview.summary.added, 1);
  preview = store.resolveImport(
    preview.id,
    { row: 2, action: "skip" },
    preview.version,
  );
  const library = store.confirmImport(preview.id, preview.version);
  assert.equal(library.books.length, 1);
  assert.equal(library.imports[0].summary.skipped, 1);
});

test("undated reread ambiguity can target a reading without altering its finish date", () => {
  let library = confirm();
  const first = library.books[0].id;
  library = store.addReading(
    first,
    { dateRead: "2025-09-01", rating: 3 },
    library.revision,
  );
  const second = library.books.find((book) => book.id !== first).id;
  let preview = store.previewImport(
    input("Title,Author,Exclusive Shelf,My Rating\nMy book,Writer,read,4"),
  );
  assert.equal(preview.rows[0].review.suggestedEntryIds.length, 2);
  preview = store.resolveImport(
    preview.id,
    { row: 2, action: "match", entryId: second },
    preview.version,
  );
  library = store.confirmImport(preview.id, preview.version);
  assert.equal(library.books.length, 2);
  assert.equal(library.books.find((book) => book.id === second).rating, 4);
  assert.equal(
    library.books.find((book) => book.id === second).dateRead,
    "2025-09-01",
  );
  assert.equal(library.books.find((book) => book.id === first).rating, 4.5);
});

test("resolution requests reject invalid targets, normal rows, stale previews, and stale libraries", () => {
  const library = confirm();
  const conflict = input(
    "Title,Author,ISBN13,Exclusive Shelf\nMy book,Writer,9780399590504,read",
  );
  let preview = store.previewImport(conflict);
  assert.throws(
    () =>
      store.resolveImport(
        preview.id,
        { row: 2, action: "match", entryId: "missing" },
        preview.version,
      ),
    /existing reading/,
  );
  assert.throws(
    () =>
      store.resolveImport(
        preview.id,
        { row: 99, action: "new" },
        preview.version,
      ),
    /uncertain row/,
  );
  const oldVersion = preview.version;
  preview = store.resolveImport(
    preview.id,
    { row: 2, action: "new" },
    preview.version,
  );
  assert.throws(
    () => store.confirmImport(preview.id, oldVersion),
    /preview changed/,
  );
  assert.throws(
    () =>
      store.resolveImport(preview.id, { row: 2, action: "skip" }, oldVersion),
    /preview changed/,
  );
  const normal = store.previewImport(
    input("Title,Author,Exclusive Shelf\nOther book,Writer,read"),
  );
  assert.throws(
    () =>
      store.resolveImport(
        normal.id,
        { row: 2, action: "skip" },
        normal.version,
      ),
    /uncertain row/,
  );
  store.updateEntry(
    library.books[0].id,
    { tags: ["Newer edit"] },
    library.revision,
  );
  assert.throws(
    () =>
      store.resolveImport(
        preview.id,
        { row: 2, action: "skip" },
        preview.version,
      ),
    /library changed/,
  );
  assert.equal(store.getLibrary().books.length, 1);
});

test("format migration repairs known category and shelf labels once and preserves explicit formats and later edits", () => {
  const file = join(root, "legacy-formats.sqlite");
  let legacy = new BooksStore(file);
  const preview = legacy.previewImport({
    source: "goodreads",
    filename: "formats.csv",
    csv: "Title,Author,Exclusive Shelf,Category,Bookshelves,Format\nAudio book,Writer,read,Audio,,\nShelf book,Writer,read,Memoir,paperback,\nExplicit book,Writer,read,Audio,,Kindle\nUncertain book,Writer,read,Other service,,\nConflicting book,Writer,read,Audio,Kindle,",
  });
  let library = legacy.confirmImport(preview.id);
  const audioId = library.books.find((book) => book.title === "Audio book").id;
  const shelfId = library.books.find((book) => book.title === "Shelf book").id;
  legacy.close();
  const oldDb = new DatabaseSync(file);
  oldDb
    .prepare("UPDATE reading_entries SET format='Unclear' WHERE id IN (?,?)")
    .run(audioId, shelfId);
  oldDb.exec("PRAGMA user_version=1");
  oldDb.close();
  legacy = new BooksStore(file);
  library = legacy.getLibrary();
  assert.equal(
    library.books.find((book) => book.id === audioId).format,
    "Audio",
  );
  assert.equal(
    library.books.find((book) => book.id === shelfId).format,
    "Physical",
  );
  assert.equal(
    library.books.find((book) => book.title === "Explicit book").format,
    "Kindle",
  );
  assert.equal(
    library.books.find((book) => book.title === "Uncertain book").format,
    "Unclear",
  );
  assert.equal(
    library.books.find((book) => book.title === "Conflicting book").format,
    "Unclear",
  );
  assert.equal(
    library.books.find((book) => book.id === audioId).category,
    "Audio",
  );
  legacy.updateEntry(audioId, { format: "Unclear" }, library.revision);
  legacy.close();
  legacy = new BooksStore(file);
  assert.equal(
    legacy.getLibrary().books.find((book) => book.id === audioId).format,
    "Unclear",
  );
  legacy.close();
});

test("provider category mapping updates version-2 libraries once and allows later manual overrides", () => {
  const file = join(root, "provider-formats.sqlite");
  let libraryStore = new BooksStore(file);
  const preview = libraryStore.previewImport({
    source: "goodreads",
    filename: "providers.csv",
    csv: "Title,Author,Exclusive Shelf,Category,Format\nLibrary book,Writer,read,Libby,Kindle\nSubscription book,Writer,read,Everand,\nAudio book,Writer,read,Audible,",
  });
  libraryStore.confirmImport(preview.id);
  libraryStore.close();
  const oldDb = new DatabaseSync(file);
  oldDb.exec(
    "UPDATE reading_entries SET format='Unclear' WHERE format='Audio'; PRAGMA user_version=2",
  );
  oldDb.close();
  libraryStore = new BooksStore(file);
  let library = libraryStore.getLibrary();
  assert.ok(library.books.every((book) => book.format === "Audio"));
  assert.deepEqual(
    library.books.map((book) => book.category),
    ["Libby", "Everand", "Audible"],
  );
  libraryStore.updateEntry(
    library.books[0].id,
    { format: "Kindle" },
    library.revision,
  );
  libraryStore.close();
  libraryStore = new BooksStore(file);
  assert.equal(libraryStore.getLibrary().books[0].format, "Kindle");
  libraryStore.close();
});
