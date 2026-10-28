import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Book } from "../../features/books/model";
import {
  inferReadingFormat,
  normalizeIsbn,
  uncategorized,
} from "../../features/books/model";
import type {
  EntryChanges,
  ImportHistory,
  ImportDecision,
  ImportInput,
  ImportPreview,
  ImportRow,
  ImportSummary,
  Library,
} from "../../features/books/contracts";
import type { ParsedImport } from "./import-file";
import { normalizedDate, parseImport } from "./import-file";
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
  parsed?: ParsedImport;
  decisions?: ImportDecision[];
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
    if (version > 3)
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
    if (version < 2)
      this.transaction(() => {
        let changed = false;
        for (const row of this.db
          .prepare(
            "SELECT r.id,r.format,c.name AS category,r.shelves_json FROM reading_entries r JOIN categories c ON c.id=r.category_id",
          )
          .all()) {
          const format = inferReadingFormat({
            format: String(row.format),
            category: String(row.category),
            shelves: JSON.parse(String(row.shelves_json)),
          });
          if (format !== "Unclear" && format !== row.format) {
            this.db
              .prepare("UPDATE reading_entries SET format=? WHERE id=?")
              .run(format, row.id);
            changed = true;
          }
        }
        if (changed) this.incrementRevision();
        this.db.exec("PRAGMA user_version=2");
      });
    if (version < 3)
      this.transaction(() => {
        let changed = false;
        const providers = new Set(["everand", "libby", "audible"]);
        for (const row of this.db
          .prepare(
            "SELECT r.id,r.format,c.name AS category,r.shelves_json FROM reading_entries r JOIN categories c ON c.id=r.category_id",
          )
          .all()) {
          const category = String(row.category);
          const shelves: string[] = JSON.parse(String(row.shelves_json));
          const providerCategory = providers.has(category.trim().toLowerCase());
          const providerShelf = shelves.some((shelf) =>
            providers.has(shelf.trim().toLowerCase()),
          );
          // This one-time category mapping is the user's requested correction.
          // Subsequent manual format edits are left alone on future restarts.
          const format = providerCategory
            ? "Audio"
            : row.format === "Unclear" && providerShelf
              ? inferReadingFormat({ category, shelves })
              : row.format;
          if (format === "Audio" && row.format !== "Audio") {
            this.db
              .prepare("UPDATE reading_entries SET format='Audio' WHERE id=?")
              .run(row.id);
            changed = true;
          }
        }
        if (changed) this.incrementRevision();
        this.db.exec("PRAGMA user_version=3");
      });
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
    return this.editReading(id, changes, revision, false);
  }
  addReading(id: string, changes: EntryChanges, revision: number): Library {
    return this.editReading(id, changes, revision, true);
  }
  private editReading(
    id: string,
    changes: EntryChanges,
    revision: number,
    create: boolean,
  ): Library {
    return this.transaction(() => {
      this.checkRevision(revision);
      const entry = this.readings().find((e) => e.id === id);
      if (!entry)
        throw new LibraryError("This reading entry no longer exists.", 404);
      if (
        !changes ||
        typeof changes !== "object" ||
        Object.keys(changes).some(
          (key) =>
            ![
              "category",
              "tags",
              "kind",
              "format",
              "title",
              "author",
              "isbn",
              "year",
              "pages",
              "rating",
              "dateRead",
            ].includes(key),
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
      const metadataFields = [
        "title",
        "author",
        "isbn",
        "year",
        "pages",
      ] as const;
      if (create && metadataFields.some((key) => changes[key] !== undefined))
        throw new LibraryError(
          "Save shared book details separately before recording a reread.",
        );
      for (const [field, max] of [
        ["title", 2000],
        ["author", 1000],
      ] as const) {
        if (
          changes[field] !== undefined &&
          (typeof changes[field] !== "string" ||
            !changes[field]!.trim() ||
            changes[field]!.length > max)
        )
          throw new LibraryError(`Enter a ${field} of 1–${max} characters.`);
      }
      if (
        changes.isbn !== undefined &&
        (typeof changes.isbn !== "string" || changes.isbn.length > 100)
      )
        throw new LibraryError("Enter a valid ISBN or leave it blank.");
      const isbn =
        changes.isbn !== undefined ? normalizeIsbn(changes.isbn) : entry.isbn;
      if (
        changes.isbn !== undefined &&
        isbn &&
        !/^(?:\d{13}|\d{9}[\dX])$/.test(isbn)
      )
        throw new LibraryError(
          "ISBN must contain 10 or 13 digits, or be blank.",
        );
      if (
        isbn &&
        this.catalog().some(
          (book) => book.id !== entry.catalogId && book.isbn === isbn,
        )
      )
        throw new LibraryError(
          "That ISBN already belongs to another book in your library.",
        );
      if (
        changes.year !== undefined &&
        changes.year !== null &&
        (!Number.isInteger(changes.year) ||
          changes.year < 1 ||
          changes.year > 9999)
      )
        throw new LibraryError(
          "Publication year must be between 1 and 9999, or blank.",
        );
      if (
        changes.pages !== undefined &&
        changes.pages !== null &&
        (!Number.isInteger(changes.pages) ||
          changes.pages < 1 ||
          changes.pages > 1000000)
      )
        throw new LibraryError(
          "Pages must be a positive whole number or blank.",
        );
      if (
        changes.rating !== undefined &&
        (typeof changes.rating !== "number" ||
          !Number.isFinite(changes.rating) ||
          changes.rating < 0 ||
          changes.rating > 5)
      )
        throw new LibraryError("Rating must be between 0 and 5.");
      if (
        changes.dateRead !== undefined &&
        (typeof changes.dateRead !== "string" ||
          normalizedDate(changes.dateRead) === null)
      )
        throw new LibraryError(
          "Use a valid finish date in YYYY-MM-DD or YYYY-MM format.",
        );
      const edited: Reading = {
        ...entry,
        ...(create ? { id: randomUUID(), dateRead: "", rating: 0 } : {}),
        ...changes,
        isbn,
      };
      edited.title = edited.title.trim();
      edited.author = edited.author.trim();
      edited.dateRead = normalizedDate(edited.dateRead)!;
      if (create && !edited.dateRead)
        throw new LibraryError("Add a finish date for the reread.");
      if (
        this.db
          .prepare(
            "SELECT id FROM reading_entries WHERE book_id=? AND date_read=? AND id<>?",
          )
          .get(entry.catalogId, edited.dateRead, edited.id)
      )
        throw new LibraryError(
          "This book already has a reading with that finish date. Choose another date or edit the existing reading.",
        );
      if (!create)
        this.db
          .prepare(
            "UPDATE books SET title=?,author=?,isbn=?,year=?,pages=? WHERE id=?",
          )
          .run(
            edited.title,
            edited.author,
            edited.isbn,
            edited.year,
            edited.pages,
            entry.catalogId,
          );
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
  private buildPreview(
    input: ImportInput,
    options?: {
      parsed: ParsedImport;
      decisions: ImportDecision[];
      id: string;
      version: number;
    },
  ): ImportPreview {
    const parsed = options?.parsed ?? parseImport(input);
    const decisions = options?.decisions ?? [];
    const decisionMap = new Map(
      decisions.map((decision) => [decision.row, decision]),
    );
    const catalog = this.catalog(),
      entries = this.readings();
    const writes = new Map<string, Reading>(),
      catalogWrites = new Map<string, CatalogBook>();
    const rows: ImportRow[] = [...parsed.rows];
    const touched = new Set<string>();
    const persistedIds = new Set(entries.map((entry) => entry.id));
    for (const { book: sourceBook, row } of parsed.records) {
      const incoming = { ...sourceBook };
      const decision = decisionMap.get(row);
      let isbn = normalizeIsbn(incoming.isbn);
      let goodreadsId = incoming.goodreadsId ?? "";
      let identifierNote = "";
      const direct = catalog.filter(
        (b) =>
          (isbn && b.isbn === isbn) ||
          (goodreadsId && b.goodreadsId === goodreadsId),
      );
      let candidates = direct.length
        ? direct
        : catalog.filter(
            (b) =>
              identity(b.title, b.author) ===
              identity(incoming.title, incoming.author),
          );
      const suggestions = entries
        .filter(
          (entry) =>
            persistedIds.has(entry.id) &&
            candidates.some((book) => book.id === entry.catalogId),
        )
        .map((entry) => entry.id);
      const reviewInfo = () => ({
        author: sourceBook.author,
        isbn: sourceBook.isbn,
        dateRead: sourceBook.dateRead,
        suggestedEntryIds: suggestions,
        ...(decision ? { decision } : {}),
      });
      if (decision?.action === "skip") {
        rows.push({
          row,
          title: incoming.title,
          action: "skipped",
          detail: "You chose to skip this row.",
          review: reviewInfo(),
        });
        continue;
      }
      let selected: Reading | undefined;
      if (decision?.action === "match") {
        selected = entries.find(
          (entry) =>
            persistedIds.has(entry.id) && entry.id === decision.entryId,
        );
        if (!selected)
          throw new LibraryError(
            "Choose an existing reading from your library.",
          );
        candidates = catalog.filter((book) => book.id === selected!.catalogId);
      }
      if (decision?.action === "new") {
        const omitted: string[] = [];
        if (isbn && catalog.some((book) => book.isbn === isbn)) {
          isbn = "";
          omitted.push("ISBN");
        }
        if (
          goodreadsId &&
          catalog.some((book) => book.goodreadsId === goodreadsId)
        ) {
          goodreadsId = "";
          omitted.push("Goodreads ID");
        }
        if (omitted.length)
          identifierNote = ` ${omitted.join(" and ")} already in use; the separate book will leave ${omitted.length === 1 ? "it" : "them"} blank.`;
        candidates = [];
      }
      if (
        !selected &&
        (candidates.length > 1 ||
          (candidates.length === 1 &&
            ((isbn && candidates[0].isbn && isbn !== candidates[0].isbn) ||
              (goodreadsId &&
                candidates[0].goodreadsId &&
                goodreadsId !== candidates[0].goodreadsId))))
      ) {
        rows.push({
          row,
          title: incoming.title,
          action: "ambiguous",
          review: reviewInfo(),
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
      let previous =
        selected && !incoming.dateRead
          ? selected
          : reads.find((e) => e.dateRead === incoming.dateRead);
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
            review: {
              ...reviewInfo(),
              suggestedEntryIds: reads
                .filter((entry) => persistedIds.has(entry.id))
                .map((entry) => entry.id),
            },
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
          ...(decision ? { review: reviewInfo() } : {}),
        });
        continue;
      }
      const updatedBook = {
        ...book,
        isbn: selected ? book.isbn : book.isbn || isbn,
        goodreadsId: selected
          ? book.goodreadsId
          : book.goodreadsId || goodreadsId,
        year: book.year ?? incoming.year,
        pages: book.pages ?? incoming.pages,
      };
      if (JSON.stringify(updatedBook) !== JSON.stringify(book)) {
        Object.assign(book, updatedBook);
        catalogWrites.set(book.id, book);
      }
      const annotations = previous ?? selected;
      const tags = [
        ...new Map(
          [...(annotations?.tags ?? []), ...incoming.tags].map((tag) => [
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
          annotations?.category && annotations.category !== uncategorized
            ? annotations.category
            : incoming.category,
        tags,
        format:
          incoming.format && incoming.format !== "Unclear"
            ? incoming.format
            : (previous?.format ?? "Unclear"),
        kind:
          annotations?.kindSource === "manual"
            ? annotations.kind
            : incoming.kind && incoming.kind !== "Unclear"
              ? incoming.kind
              : (annotations?.kind ?? "Unclear"),
        kindSource:
          annotations?.kindSource === "manual"
            ? "manual"
            : incoming.kind && incoming.kind !== "Unclear"
              ? (incoming.kindSource ?? "")
              : (annotations?.kindSource ?? ""),
        kindCheckedAt:
          annotations?.kindCheckedAt ?? incoming.kindCheckedAt ?? 0,
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
        ...(decision ? { review: reviewInfo() } : {}),
        detail:
          (decision?.action === "new"
            ? "Separate book or edition."
            : action === "added" && reads.length
              ? "Another reading of this book."
              : action === "updated"
                ? "Existing annotations will be retained."
                : action === "unchanged"
                  ? "Already in your library."
                  : "New book and reading.") + identifierNote,
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
      id: options?.id ?? randomUUID(),
      version: options?.version ?? 0,
      source: input.source,
      filename: input.filename,
      summary,
      rows,
    };
    const plan: Plan = {
      parsed,
      decisions,
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
      .prepare(
        "INSERT INTO import_drafts VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET plan_json=excluded.plan_json",
      )
      .run(preview.id, new Date().toISOString(), JSON.stringify(plan));
    return preview;
  }
  resolveImport(
    id: string,
    decision: ImportDecision,
    version: number,
  ): ImportPreview {
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
      if (!plan.parsed)
        throw new LibraryError(
          "Preview the file again to review these matches.",
          409,
        );
      if (!Number.isInteger(version) || version !== plan.preview.version)
        throw new LibraryError(
          "This preview changed. Preview the file again.",
          409,
        );
      if (
        !decision ||
        !Number.isInteger(decision.row) ||
        !["match", "new", "skip", "review"].includes(decision.action) ||
        !plan.preview.rows.some((row) => row.row === decision.row && row.review)
      )
        throw new LibraryError("Choose a resolution for an uncertain row.");
      if (decision.action === "match" && typeof decision.entryId !== "string")
        throw new LibraryError("Choose an existing reading from your library.");
      const decisions = (plan.decisions ?? []).filter(
        (item) => item.row !== decision.row,
      );
      if (decision.action !== "review")
        decisions.push({
          row: decision.row,
          action: decision.action,
          ...(decision.action === "match" ? { entryId: decision.entryId } : {}),
        });
      return this.buildPreview(
        { source: plan.preview.source, filename: plan.preview.filename },
        { parsed: plan.parsed, decisions, id, version: version + 1 },
      );
    });
  }
  confirmImport(id: string, version?: number): Library {
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
      if (version !== undefined && version !== plan.preview.version)
        throw new LibraryError(
          "This preview changed. Review it again before confirming.",
          409,
        );
      if (plan.preview.summary.ambiguous)
        throw new LibraryError(
          "Resolve each uncertain row or choose Skip before confirming.",
        );
      if (!(
        plan.preview.summary.added +
          plan.preview.summary.updated +
          plan.preview.summary.unchanged ||
        plan.decisions?.some((decision) => decision.action === "skip")
      ))
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
