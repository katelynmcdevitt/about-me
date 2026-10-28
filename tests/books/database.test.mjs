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
  assert.throws(() => store.confirmImport(preview.id), /no valid readings/);
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
