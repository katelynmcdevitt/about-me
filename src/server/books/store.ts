import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Book } from "../../features/books/model";
import { normalizeIsbn, uncategorized } from "../../features/books/model";
import type {
  EntryChanges,
  ImportHistory,
  ImportInput,
  ImportPreview,
  ImportRow,
  ImportSummary,
  Library,
} from "../../features/books/contracts";
import { parseImport } from "./import-file";
import { LibraryError } from "./errors";

type CatalogBook = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  goodreadsId: string;
  year: number | null;
  pages: number | null;
};
type Reading = Book & { catalogId: string };
type Plan = {
  revision: number;
  catalog: CatalogBook[];
  entries: Reading[];
  categories: string[];
  preview: ImportPreview;
};
const identity = (title: string, author: string) =>
  `${title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()}|${author
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()}`;
const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every(
    (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 100,
  );

export class BooksStore {
  private db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    const version = Number(
      this.db.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (version > 1)
      throw new Error("This database was created by a newer app version.");
    if (version === 0)
      this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE books (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, isbn TEXT NOT NULL DEFAULT '', goodreads_id TEXT NOT NULL DEFAULT '', year INTEGER, pages INTEGER);
      CREATE UNIQUE INDEX books_isbn ON books(isbn) WHERE isbn <> '';
      CREATE UNIQUE INDEX books_goodreads ON books(goodreads_id) WHERE goodreads_id <> '';
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
      CREATE TABLE reading_entries (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), date_read TEXT NOT NULL DEFAULT '', rating REAL NOT NULL CHECK(rating BETWEEN 0 AND 5), format TEXT NOT NULL, kind TEXT NOT NULL, kind_source TEXT NOT NULL, kind_checked_at INTEGER NOT NULL DEFAULT 0, category_id INTEGER NOT NULL REFERENCES categories(id), shelves_json TEXT NOT NULL);
      CREATE UNIQUE INDEX reading_dates ON reading_entries(book_id,date_read);
      CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
      CREATE TABLE reading_tags (entry_id TEXT NOT NULL REFERENCES reading_entries(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id), PRIMARY KEY(entry_id,tag_id));
      CREATE TABLE imports (id TEXT PRIMARY KEY, filename TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL, summary_json TEXT NOT NULL);
      CREATE TABLE import_drafts (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, plan_json TEXT NOT NULL);
      CREATE TABLE library_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
      INSERT INTO library_meta VALUES(1,0);
      PRAGMA user_version=1;
      COMMIT;
    `);
  }
  close() {
    this.db.close();
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private revision() {
    return Number(
      this.db.prepare("SELECT revision FROM library_meta WHERE id=1").get()!
        .revision,
    );
  }
  private incrementRevision() {
    this.db.exec("UPDATE library_meta SET revision=revision+1 WHERE id=1");
  }
  private checkRevision(revision: number) {
    if (!Number.isInteger(revision) || revision !== this.revision())
      throw new LibraryError(
        "The library changed. Reload it and try again.",
        409,
      );
  }
  private catalog(): CatalogBook[] {
    return this.db
      .prepare(
        "SELECT id,title,author,isbn,goodreads_id AS goodreadsId,year,pages FROM books",
      )
      .all() as unknown as CatalogBook[];
  }
  private readings(): Reading[] {
    const tags = new Map<string, string[]>();
    for (const row of this.db
      .prepare(
        "SELECT rt.entry_id,t.name FROM reading_tags rt JOIN tags t ON t.id=rt.tag_id ORDER BY t.id",
      )
      .all()) {
      const id = String(row.entry_id);
      tags.set(id, [...(tags.get(id) ?? []), String(row.name)]);
    }
    return this.db
      .prepare(
        `SELECT r.id,r.book_id AS catalogId,b.title,b.author,b.isbn,b.goodreads_id AS goodreadsId,b.year,b.pages,r.date_read AS dateRead,r.rating,r.format,r.kind,r.kind_source AS kindSource,r.kind_checked_at AS kindCheckedAt,c.name AS category,r.shelves_json
      FROM reading_entries r JOIN books b ON b.id=r.book_id JOIN categories c ON c.id=r.category_id ORDER BY r.rowid`,
      )
      .all()
      .map((row) => {
        const { shelves_json, ...fields } = row;
        return {
          ...fields,
          shelves: JSON.parse(String(shelves_json)),
          tags: tags.get(String(row.id)) ?? [],
        } as Reading;
      });
  }
  getLibrary(): Library {
    return {
      books: this.readings().map(({ catalogId: _catalogId, ...book }) => book),
      categories: this.db
        .prepare("SELECT name FROM categories ORDER BY name COLLATE NOCASE")
        .all()
        .map((row) => String(row.name)),
      imports: this.db
        .prepare("SELECT * FROM imports ORDER BY rowid DESC LIMIT 20")
        .all()
        .map((row) => ({
          id: String(row.id),
          filename: String(row.filename),
          source: row.source,
          createdAt: String(row.created_at),
          summary: JSON.parse(String(row.summary_json)),
        })) as ImportHistory[],
      revision: this.revision(),
    };
  }
  private categoryId(name: string): number {
    this.db
      .prepare(
        "INSERT INTO categories(name) VALUES(?) ON CONFLICT(name) DO NOTHING",
      )
      .run(name);
    return Number(
      this.db
        .prepare("SELECT id FROM categories WHERE name=? COLLATE NOCASE")
        .get(name)!.id,
    );
  }
  private writeReading(entry: Reading) {
    const category = this.categoryId(entry.category || uncategorized);
    this.db
      .prepare(
        `INSERT INTO reading_entries(id,book_id,date_read,rating,format,kind,kind_source,kind_checked_at,category_id,shelves_json) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET date_read=excluded.date_read,rating=excluded.rating,format=excluded.format,kind=excluded.kind,kind_source=excluded.kind_source,kind_checked_at=excluded.kind_checked_at,category_id=excluded.category_id,shelves_json=excluded.shelves_json`,
      )
      .run(
        entry.id,
        entry.catalogId,
        entry.dateRead,
        entry.rating,
        entry.format ?? "Unclear",
        entry.kind ?? "Unclear",
        entry.kindSource ?? "",
        entry.kindCheckedAt ?? 0,
        category,
        JSON.stringify(entry.shelves),
      );
    this.db.prepare("DELETE FROM reading_tags WHERE entry_id=?").run(entry.id);
    for (const tag of entry.tags) {
      this.db
        .prepare(
          "INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING",
        )
        .run(tag);
      const id = this.db
        .prepare("SELECT id FROM tags WHERE name=? COLLATE NOCASE")
        .get(tag)!.id;
      this.db
        .prepare(
          "INSERT OR IGNORE INTO reading_tags(entry_id,tag_id) VALUES(?,?)",
        )
        .run(entry.id, id);
    }
  }
  updateEntry(id: string, changes: EntryChanges, revision: number): Library {
    return this.transaction(() => {
      this.checkRevision(revision);
      const entry = this.readings().find((e) => e.id === id);
      if (!entry)
        throw new LibraryError("This reading entry no longer exists.", 404);
      if (
        !changes ||
        typeof changes !== "object" ||
        Object.keys(changes).some(
          (key) => !["category", "tags", "kind", "format"].includes(key),
        )
      )
        throw new LibraryError("Invalid library edit.");
      if (
        changes.category !== undefined &&
        (typeof changes.category !== "string" ||
          !changes.category.trim() ||
          changes.category.length > 100)
      )
        throw new LibraryError("Category names must be 1–100 characters.");
      if (changes.tags !== undefined && !stringList(changes.tags))
        throw new LibraryError("Use up to 100 tags of 1–100 characters each.");
      if (
        changes.kind !== undefined &&
        !["Fiction", "Nonfiction", "Unclear"].includes(changes.kind)
      )
        throw new LibraryError("Invalid book type.");
      if (
        changes.format !== undefined &&
        !["Audio", "Physical", "Kindle", "Unclear"].includes(changes.format)
      )
        throw new LibraryError("Invalid reading format.");
      const edited = { ...entry, ...changes };
      if (changes.category) edited.category = changes.category.trim();
      if (changes.tags)
        edited.tags = [
          ...new Map(
            changes.tags.map((tag) => [tag.trim().toLowerCase(), tag.trim()]),
          ).values(),
        ];
      if (changes.kind) {
        edited.kindSource = "manual";
        edited.kindCheckedAt = Date.now();
      }
      this.writeReading(edited);
      this.incrementRevision();
      return this.getLibrary();
    });
  }
  addCategory(name: string, revision: number): Library {
    return this.transaction(() => {
      this.checkRevision(revision);
      if (typeof name !== "string" || !name.trim() || name.length > 100)
        throw new LibraryError("Category names must be 1–100 characters.");
      this.categoryId(name.trim());
      this.incrementRevision();
      return this.getLibrary();
    });
  }
  previewImport(input: ImportInput): ImportPreview {
    return this.transaction(() => this.buildPreview(input));
  }
  private buildPreview(input: ImportInput): ImportPreview {
    const parsed = parseImport(input);
    const catalog = this.catalog(),
      entries = this.readings();
    const writes = new Map<string, Reading>(),
      catalogWrites = new Map<string, CatalogBook>();
    const rows: ImportRow[] = [...parsed.rows];
    const touched = new Set<string>();
    for (const { book: incoming, row } of parsed.records) {
      const isbn = normalizeIsbn(incoming.isbn);
      const goodreadsId = incoming.goodreadsId ?? "";
      const direct = catalog.filter(
        (b) =>
          (isbn && b.isbn === isbn) ||
          (goodreadsId && b.goodreadsId === goodreadsId),
      );
      const candidates = direct.length
        ? direct
        : catalog.filter(
            (b) =>
              identity(b.title, b.author) ===
              identity(incoming.title, incoming.author),
          );
      if (
        candidates.length > 1 ||
        (candidates.length === 1 &&
          ((isbn && candidates[0].isbn && isbn !== candidates[0].isbn) ||
            (goodreadsId &&
              candidates[0].goodreadsId &&
              goodreadsId !== candidates[0].goodreadsId)))
      ) {
        rows.push({
          row,
          title: incoming.title,
          action: "ambiguous",
          detail:
            "Conflicting editions or identifiers. Review this row before importing it separately.",
        });
        continue;
      }
      let book = candidates[0];
      if (!book) {
        book = {
          id: randomUUID(),
          title: incoming.title,
          author: incoming.author,
          isbn,
          goodreadsId,
          year: incoming.year,
          pages: incoming.pages,
        };
        catalog.push(book);
        catalogWrites.set(book.id, book);
      }
      const reads = entries.filter((e) => e.catalogId === book.id);
      let previous = reads.find((e) => e.dateRead === incoming.dateRead);
      if (
        !previous &&
        (!incoming.dateRead || (reads.length === 1 && !reads[0].dateRead))
      ) {
        if (reads.length === 1) previous = reads[0];
        else if (reads.length > 1) {
          rows.push({
            row,
            title: incoming.title,
            action: "ambiguous",
            detail:
              "This book has multiple reading dates; provide a finish date.",
          });
          continue;
        }
      }
      if (previous && touched.has(previous.id)) {
        rows.push({
          row,
          title: incoming.title,
          action: "skipped",
          detail: "Duplicate reading in this file.",
        });
        continue;
      }
      const updatedBook = {
        ...book,
        isbn: book.isbn || isbn,
        goodreadsId: book.goodreadsId || goodreadsId,
        year: incoming.year ?? book.year,
        pages: incoming.pages ?? book.pages,
      };
      if (JSON.stringify(updatedBook) !== JSON.stringify(book)) {
        Object.assign(book, updatedBook);
        catalogWrites.set(book.id, book);
      }
      const tags = [
        ...new Map(
          [...(previous?.tags ?? []), ...incoming.tags].map((tag) => [
            tag.toLowerCase(),
            tag,
          ]),
        ).values(),
      ];
      const entry: Reading = {
        ...incoming,
        id: previous?.id ?? randomUUID(),
        catalogId: book.id,
        isbn: book.isbn,
        goodreadsId: book.goodreadsId,
        title: book.title,
        author: book.author,
        year: book.year,
        pages: book.pages,
        shelves: [
          ...new Set([...(previous?.shelves ?? []), ...incoming.shelves]),
        ],
        dateRead: incoming.dateRead || previous?.dateRead || "",
        rating: incoming.rating || previous?.rating || 0,
        category:
          previous?.category && previous.category !== uncategorized
            ? previous.category
            : incoming.category,
        tags,
        format:
          incoming.format && incoming.format !== "Unclear"
            ? incoming.format
            : (previous?.format ?? "Unclear"),
        kind:
          previous?.kindSource === "manual"
            ? previous.kind
            : incoming.kind && incoming.kind !== "Unclear"
              ? incoming.kind
              : (previous?.kind ?? "Unclear"),
        kindSource:
          previous?.kindSource === "manual"
            ? "manual"
            : incoming.kind && incoming.kind !== "Unclear"
              ? (incoming.kindSource ?? "")
              : (previous?.kindSource ?? ""),
        kindCheckedAt: previous?.kindCheckedAt ?? incoming.kindCheckedAt ?? 0,
      };
      touched.add(entry.id);
      const unchanged =
        previous &&
        JSON.stringify({ ...previous, ...entry }) === JSON.stringify(previous);
      const action = !previous
        ? "added"
        : unchanged && !catalogWrites.has(book.id)
          ? "unchanged"
          : "updated";
      if (!previous) entries.push(entry);
      else Object.assign(previous, entry);
      if (action !== "unchanged") writes.set(entry.id, entry);
      rows.push({
        row,
        title: incoming.title,
        action,
        detail:
          action === "added" && reads.length
            ? "Another reading of this book."
            : action === "updated"
              ? "Existing annotations will be retained."
              : action === "unchanged"
                ? "Already in your library."
                : "New book and reading.",
      });
    }
    rows.sort((a, b) => a.row - b.row);
    const summary: ImportSummary = {
      added: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      ambiguous: 0,
    };
    rows.forEach((row) => summary[row.action]++);
    const preview: ImportPreview = {
      id: randomUUID(),
      source: input.source,
      filename: input.filename,
      summary,
      rows,
    };
    const plan: Plan = {
      revision: this.revision(),
      catalog: [...catalogWrites.values()],
      entries: [...writes.values()],
      categories: parsed.categories,
      preview,
    };
    // Preview drafts expire after one day and do not alter the library.
    this.db
      .prepare("DELETE FROM import_drafts WHERE created_at < ?")
      .run(new Date(Date.now() - 86_400_000).toISOString());
    this.db
      .prepare("INSERT INTO import_drafts VALUES(?,?,?)")
      .run(preview.id, new Date().toISOString(), JSON.stringify(plan));
    return preview;
  }
  confirmImport(id: string): Library {
    return this.transaction(() => {
      const draft = this.db
        .prepare("SELECT * FROM import_drafts WHERE id=?")
        .get(id);
      if (
        !draft ||
        Date.parse(String(draft.created_at)) < Date.now() - 86_400_000
      )
        throw new LibraryError(
          "This preview expired or was already imported. Preview the file again.",
          409,
        );
      const plan: Plan = JSON.parse(String(draft.plan_json));
      this.checkRevision(plan.revision);
      if (
        !(
          plan.preview.summary.added +
          plan.preview.summary.updated +
          plan.preview.summary.unchanged
        )
      )
        throw new LibraryError("There are no valid readings to import.");
      for (const category of plan.categories) this.categoryId(category);
      for (const book of plan.catalog)
        this.db
          .prepare(
            `INSERT INTO books(id,title,author,isbn,goodreads_id,year,pages) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET isbn=excluded.isbn,goodreads_id=excluded.goodreads_id,year=excluded.year,pages=excluded.pages`,
          )
          .run(
            book.id,
            book.title,
            book.author,
            book.isbn,
            book.goodreadsId,
            book.year,
            book.pages,
          );
      for (const entry of plan.entries) this.writeReading(entry);
      this.db
        .prepare("INSERT INTO imports VALUES(?,?,?,?,?)")
        .run(
          id,
          plan.preview.filename,
          plan.preview.source,
          new Date().toISOString(),
          JSON.stringify(plan.preview.summary),
        );
      this.db.prepare("DELETE FROM import_drafts WHERE id=?").run(id);
      this.incrementRevision();
      return this.getLibrary();
    });
  }
}
