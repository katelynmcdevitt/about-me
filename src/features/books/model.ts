import Papa from "papaparse";
import { GOOGLE_SHEET_GIDS } from "./sheet";

export type Book = {
  id: string;
  title: string;
  author: string;
  category: string;
  rating: number;
  year: number | null;
  dateRead: string;
  isbn: string;
  pages: number | null;
  shelves: string[];
  tags: string[];
  format?: ReadingFormat;
  kind?: BookKind;
  kindSource?: "lookup" | "manual" | "sheet" | "";
  kindCheckedAt?: number;
};

export type BookKind = "Fiction" | "Nonfiction" | "Unclear";
export type ReadingFormat = "Audio" | "Physical" | "Kindle" | "Unclear";

export type OpenLibraryEntry = {
  title?: string;
  subjects?: { name: string }[];
};

export type BookMix = {
  fiction: number;
  nonfiction: number;
  unclear: number;
};

export type FormatMix = {
  audio: number;
  physical: number;
  kindle: number;
  unclear: number;
};

export const STORAGE_KEY = "shelf-notes-books";
export const CATEGORIES_KEY = "shelf-notes-categories";
export const DEMO_KEY = "shelf-notes-demo";
export { GOOGLE_SHEET_URL } from "./sheet";
export const LAST_SYNC_KEY = "shelf-notes-sheet-last-sync";
export const uncategorized = "Uncategorized";

export const sampleBooks: Book[] = [
  {
    id: "9780316556347",
    title: "Circe",
    author: "Madeline Miller",
    category: "Myth & legend",
    rating: 5,
    year: 2018,
    dateRead: "2025/01/14",
    isbn: "9780316556347",
    pages: 393,
    shelves: ["myth-retellings", "favorites"],
    tags: [],
  },
  {
    id: "9780399590504",
    title: "Educated",
    author: "Tara Westover",
    category: "Memoir",
    rating: 5,
    year: 2018,
    dateRead: "2024/11/02",
    isbn: "9780399590504",
    pages: 334,
    shelves: ["memoir", "favorites"],
    tags: [],
  },
  {
    id: "9781635575637",
    title: "Piranesi",
    author: "Susanna Clarke",
    category: "Literary fiction",
    rating: 4,
    year: 2020,
    dateRead: "2024/09/18",
    isbn: "9781635575637",
    pages: 272,
    shelves: ["fiction", "dreamlike"],
    tags: [],
  },
  {
    id: "9780525657743",
    title: "Crying in H Mart",
    author: "Michelle Zauner",
    category: "Memoir",
    rating: 4,
    year: 2021,
    dateRead: "2024/06/30",
    isbn: "9780525657743",
    pages: 256,
    shelves: ["memoir", "music"],
    tags: [],
  },
  {
    id: "9780441172719",
    title: "Dune",
    author: "Frank Herbert",
    category: "Science fiction",
    rating: 5,
    year: 1965,
    dateRead: "2024/03/11",
    isbn: "9780441172719",
    pages: 688,
    shelves: ["science-fiction", "favorites"],
    tags: [],
  },
  {
    id: "9781571313560",
    title: "Braiding Sweetgrass",
    author: "Robin Wall Kimmerer",
    category: "Nature & science",
    rating: 5,
    year: 2013,
    dateRead: "2023/12/05",
    isbn: "9781571313560",
    pages: 408,
    shelves: ["nature", "nonfiction"],
    tags: [],
  },
  {
    id: "9780062060624",
    title: "The Song of Achilles",
    author: "Madeline Miller",
    category: "Myth & legend",
    rating: 4,
    year: 2011,
    dateRead: "2023/08/23",
    isbn: "9780062060624",
    pages: 416,
    shelves: ["myth-retellings", "romance"],
    tags: [],
  },
  {
    id: "9780441478125",
    title: "The Left Hand of Darkness",
    author: "Ursula K. Le Guin",
    category: "Science fiction",
    rating: 4,
    year: 1969,
    dateRead: "2022/04/17",
    isbn: "9780441478125",
    pages: 304,
    shelves: ["science-fiction", "classics"],
    tags: [],
  },
];

export function readStoredBooks(): Book[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const books = stored ? (JSON.parse(stored) as Book[]) : sampleBooks;
    return normalizeBooks(books);
  } catch {
    return sampleBooks;
  }
}

export function readStoredCategories(): string[] {
  try {
    const stored = localStorage.getItem(CATEGORIES_KEY);
    const categories: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(categories) &&
      categories.every((c) => typeof c === "string")
      ? categories
      : [];
  } catch {
    return [];
  }
}

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

export function shelfLabel(value: string) {
  const known: Record<string, string> = {
    "sci-fi": "Science fiction",
    "science-fiction": "Science fiction",
    "non-fiction": "Nonfiction",
    "graphic-novels": "Graphic novels",
    ya: "Young adult",
  };
  const cleaned = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return (
    known[cleaned.toLowerCase()] ??
    cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function categoryFromShelves(shelves: string[]) {
  const ignored = new Set([
    "read",
    "currently-reading",
    "to-read",
    "favorites",
    "owned",
    "wishlist",
  ]);
  const category = shelves.find(
    (shelf) => !ignored.has(shelf.trim().toLowerCase()),
  );
  return category ? shelfLabel(category) : uncategorized;
}

export function rowValue(row: Record<string, string>, ...names: string[]) {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );
  for (const name of names) {
    const value = normalized.get(normalizeHeader(name));
    if (value?.trim()) return value.trim();
  }
  return "";
}

export function parseNumber(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseRating(value: string) {
  const match = value
    .trim()
    .replace(",", ".")
    .match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5 ? parsed : null;
}

export function normalizeStoredRating(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value <= 5) return value;
  if (Number.isInteger(value) && value <= 50) return value / 10;
  if (Number.isInteger(value) && value <= 500) return value / 100;
  return 0;
}

export function normalizeIsbn(value: string) {
  const isbn = value.replace(/[="\s-]/g, "").toUpperCase();
  if (/^\d{13}$/.test(isbn)) return isbn;
  if (!/^\d{9}[\dX]$/.test(isbn)) return isbn;

  const base = `978${isbn.slice(0, 9)}`;
  const checksum = [...base].reduce(
    (sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1),
    0,
  );
  return `${base}${(10 - (checksum % 10)) % 10}`;
}

export function formatFinishedDate(value: string) {
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Number(year), Number(month) - 1, Number(day)));
  }
  const monthMatch = value.match(/^(\d{4})[/-](\d{1,2})$/);
  if (monthMatch) {
    const [, year, month] = monthMatch;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    }).format(new Date(Number(year), Number(month) - 1, 1));
  }
  return value;
}

export function bookMix(books: Book[]): BookMix {
  return books.reduce<BookMix>(
    (mix, book) => {
      if (book.kind === "Fiction") mix.fiction++;
      else if (book.kind === "Nonfiction") mix.nonfiction++;
      else mix.unclear++;
      return mix;
    },
    { fiction: 0, nonfiction: 0, unclear: 0 },
  );
}

export function mixPercent(count: number, classifiedCount: number) {
  return classifiedCount ? Math.round((count / classifiedCount) * 100) : 0;
}

export function formatMix(books: Book[]): FormatMix {
  return books.reduce<FormatMix>(
    (mix, book) => {
      if (book.format === "Audio") mix.audio++;
      else if (book.format === "Physical") mix.physical++;
      else if (book.format === "Kindle") mix.kindle++;
      else mix.unclear++;
      return mix;
    },
    { audio: 0, physical: 0, kindle: 0, unclear: 0 },
  );
}

export function bookFromRow(
  row: Record<string, string>,
  assumeRead = false,
  fallbackDate = "",
  classificationSource: "manual" | "sheet" = "manual",
): Book | null {
  const title = rowValue(row, "Title", "Book Title");
  if (!title) return null;

  const shelves = rowValue(row, "Bookshelves", "Shelves", "Custom Shelves")
    .split(/[,;|]/)
    .map((shelf) => shelf.trim())
    .filter(Boolean);
  const exclusiveShelf = rowValue(row, "Exclusive Shelf").toLowerCase();
  const readStatus = rowValue(
    row,
    "Reading Status",
    "Status",
    "Read?",
  ).toLowerCase();
  const isRead = exclusiveShelf
    ? exclusiveShelf === "read"
    : readStatus
      ? ["read", "finished", "complete", "completed", "yes"].includes(
          readStatus,
        )
      : shelves.some((shelf) => shelf.toLowerCase() === "read") || assumeRead;
  if (!isRead) return null;

  const isbn = normalizeIsbn(rowValue(row, "ISBN13", "ISBN"));
  const author =
    rowValue(row, "Author", "Author l-f", "Author Name") || "Unknown author";
  const id =
    isbn.replace(/[^\dX]/gi, "") ||
    `${title.toLowerCase()}-${author.toLowerCase()}`;
  const dateRead =
    rowValue(
      row,
      "Date Read",
      "Read Date",
      "Date Finished",
      "Finished Date",
      "Date Completed",
    ) || fallbackDate;
  const typeValue = rowValue(
    row,
    "Nonfiction?",
    "Non Fiction?",
    "Non-fiction?",
    "Book Type",
    "Kind",
  ).toLowerCase();
  const kind: BookKind = [
    "yes",
    "true",
    "1",
    "nonfiction",
    "non-fiction",
  ].includes(typeValue)
    ? "Nonfiction"
    : ["no", "false", "0", "fiction"].includes(typeValue)
      ? "Fiction"
      : "Unclear";
  const categories = rowValue(
    row,
    "Category",
    "Genre",
    "Genres",
    "Primary Genre",
  );
  const tags = rowValue(row, "Tags", "My Tags", "Personal Tags")
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const rawFormat = rowValue(row, "Form", "Format", "Type", "Medium")
    .trim()
    .toLowerCase();
  const format: ReadingFormat = ["audio", "audiobook", "audio book"].includes(
    rawFormat,
  )
    ? "Audio"
    : ["physical", "print", "paperback", "hardcover"].includes(rawFormat)
      ? "Physical"
      : ["kindle", "ebook", "e-book", "e book"].includes(rawFormat)
        ? "Kindle"
        : "Unclear";
  const form = rowValue(row, "Form", "Format", "Type", "Medium");
  if (form && !shelves.includes(form)) shelves.push(form);

  return {
    id,
    title,
    author,
    category:
      categories || (kind !== "Unclear" ? kind : categoryFromShelves(shelves)),
    rating: parseRating(rowValue(row, "My Rating", "Rating")) ?? 0,
    year: parseNumber(
      rowValue(row, "Original Publication Year", "Year Published"),
    ),
    dateRead,
    isbn: isbn.replace(/[^\dX]/gi, ""),
    pages: parseNumber(rowValue(row, "Number of Pages", "Pages")),
    shelves,
    tags,
    format,
    kind,
    kindSource: kind === "Unclear" ? "" : classificationSource,
  };
}

export function monthSummary(value: string) {
  const match = value
    .trim()
    .match(
      /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})$/i,
    );
  if (!match) return "";
  const monthIndex = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(match[1].slice(0, 3).toLowerCase());
  return monthIndex >= 0
    ? `${match[2]}/${String(monthIndex + 1).padStart(2, "0")}`
    : "";
}

export function sheetBooksFromCsv(csv: string) {
  const rows = Papa.parse<string[]>(csv, {
    header: false,
    skipEmptyLines: "greedy",
  }).data;
  const books: Book[] = [];
  let headers = ["Title", "Author", "Form", "Nonfiction?", "Rating"];
  let finishedMonth = "";

  for (const cells of rows) {
    const firstCell = cells[0]?.trim() ?? "";
    const month = monthSummary(firstCell);
    if (month) {
      finishedMonth = month;
      const extraHeaders = cells
        .slice(2)
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (
        extraHeaders.some((header) =>
          ["form", "type", "rating", "nonfiction?", "non fiction?"].includes(
            header.toLowerCase(),
          ),
        )
      ) {
        headers = [
          "Title",
          "Author",
          ...cells.slice(2).map((cell) => cell.trim()),
        ];
      }
      continue;
    }

    const hasTitleHeader = cells.some(
      (cell) =>
        normalizeHeader(cell) === "title" ||
        normalizeHeader(cell) === "book title",
    );
    const hasAuthorHeader = cells.some(
      (cell) =>
        normalizeHeader(cell) === "author" ||
        normalizeHeader(cell) === "author name",
    );
    if (hasTitleHeader && hasAuthorHeader) {
      headers = cells.map((cell) => cell.trim());
      continue;
    }

    const row = Object.fromEntries(
      headers.map((header, index) => [header, cells[index]?.trim() ?? ""]),
    );
    const book = bookFromRow(row, true, finishedMonth, "sheet");
    if (book) books.push(book);
  }

  return books;
}

export async function loadSheetBooks() {
  const tabData = await Promise.all(
    GOOGLE_SHEET_GIDS.map(async (gid) => {
      const response = await fetch(`/api/books/google-sheet/${gid}`, {
        cache: "no-store",
      });
      const csv = await response.text();
      if (!response.ok || /^\s*</.test(csv)) {
        throw new Error(
          "The reading sheet could not be read. Check its access or import a Goodreads CSV instead.",
        );
      }
      return sheetBooksFromCsv(csv);
    }),
  );
  const books = mergeBooks([], tabData.flat(), false);
  if (!books.length)
    throw new Error("No book rows found in the selected Google Sheet tabs.");
  return books;
}

export function mergeBooks(
  current: Book[],
  incoming: Book[],
  replaceCurrent: boolean,
) {
  const merged = new Map(
    (replaceCurrent ? [] : current).map((book) => [book.id, book]),
  );
  for (const book of incoming) {
    const previous =
      merged.get(book.id) ??
      [...merged.values()].find(
        (candidate) => candidate.isbn && candidate.isbn === book.isbn,
      );
    if (previous && previous.id !== book.id) merged.delete(previous.id);
    const keepManualKind = previous?.kindSource === "manual";
    const useIncomingKind =
      ["lookup", "sheet"].includes(book.kindSource ?? "") && !keepManualKind;
    merged.set(
      book.id,
      previous
        ? {
            ...book,
            category: previous.category,
            tags: previous.tags ?? [],
            format:
              book.format && book.format !== "Unclear"
                ? book.format
                : (previous.format ?? "Unclear"),
            kind: keepManualKind
              ? previous.kind
              : useIncomingKind
                ? book.kind
                : (previous.kind ?? book.kind ?? "Unclear"),
            kindSource: keepManualKind
              ? "manual"
              : useIncomingKind
                ? book.kindSource
                : (previous.kindSource ?? book.kindSource ?? ""),
            kindCheckedAt: keepManualKind
              ? previous.kindCheckedAt
              : useIncomingKind
                ? book.kindCheckedAt
                : (previous.kindCheckedAt ?? book.kindCheckedAt ?? 0),
          }
        : book,
    );
  }
  return [...merged.values()];
}

export function classifySubjects(subjects: string[]): BookKind {
  const normalized = subjects.map((subject) =>
    subject.toLowerCase().replace(/[_-]+/g, " "),
  );
  const fiction = normalized.some((subject) =>
    /\bfiction\b|\bnovel\b|\bshort stories\b|\bfantasy\b|\bmystery\b|\bthriller\b|\bhorror\b|\bromance\b|\bpoetry\b|\bdrama\b/.test(
      subject,
    ),
  );
  if (fiction) return "Fiction";

  const nonfiction = normalized.some((subject) =>
    /\bnon fiction\b|\bbiograph|\bmemoir\b|\bhistory\b|\bscience\b|\bbotany\b|\becology\b|\bsocial science\b|\bpolitic|\bbusiness\b|\bphilosophy\b|\bpsychology\b|\bnature\b|\btravel\b|\beducation\b|\breference\b|\bhealth\b|\breligion\b|\bcooking\b|\beconomics\b|\blaw\b|\btechnology\b|\banthropology\b|\bsociology\b|\bethnology\b/.test(
      subject,
    ),
  );
  return nonfiction ? "Nonfiction" : "Unclear";
}

export function titlesMatch(bookTitle: string, catalogTitle: string) {
  const normalize = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const expected = normalize(bookTitle);
  const actual = normalize(catalogTitle);
  return Boolean(
    expected &&
    actual &&
    (actual.includes(expected) || expected.includes(actual)),
  );
}

export async function lookupBookKinds(books: Book[]) {
  const checkedBefore = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const lookupBooks = books.filter(
    (book) =>
      book.isbn &&
      book.kindSource !== "manual" &&
      (book.kindCheckedAt ?? 0) < checkedBefore,
  );
  if (!lookupBooks.length) return books;

  const classificationByIsbn = new Map<
    string,
    { kind: BookKind; checkedAt: number }
  >();
  const isbns = [...new Set(lookupBooks.map((book) => book.isbn))];

  for (let index = 0; index < isbns.length; index += 40) {
    const batch = isbns.slice(index, index + 40);
    const bibkeys = batch.map((isbn) => `ISBN:${isbn}`).join(",");
    try {
      const response = await fetch(
        `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(bibkeys)}&format=json&jscmd=data`,
      );
      if (!response.ok) continue;
      const entries = (await response.json()) as Record<
        string,
        OpenLibraryEntry
      >;
      const checkedAt = Date.now();
      for (const isbn of batch) {
        const entry = entries[`ISBN:${isbn}`];
        const matchingTitle =
          entry?.title &&
          lookupBooks.some(
            (book) =>
              book.isbn === isbn && titlesMatch(book.title, entry.title!),
          );
        const subjects = matchingTitle
          ? (entry.subjects ?? []).map((subject) => subject.name)
          : [];
        classificationByIsbn.set(isbn, {
          kind: classifySubjects(subjects),
          checkedAt,
        });
      }
    } catch {
      return books;
    }
  }

  return books.map((book) => {
    if (!book.isbn || book.kindSource === "manual") return book;
    const classification = classificationByIsbn.get(book.isbn);
    return classification
      ? {
          ...book,
          kind: classification.kind,
          kindSource: "lookup" as const,
          kindCheckedAt: classification.checkedAt,
        }
      : book;
  });
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function normalizeBooks(value: unknown): Book[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (book) =>
        book &&
        typeof book.id === "string" &&
        typeof book.title === "string" &&
        typeof book.author === "string" &&
        typeof book.category === "string" &&
        typeof book.dateRead === "string" &&
        typeof book.isbn === "string" &&
        typeof book.rating === "number" &&
        Number.isFinite(book.rating) &&
        (book.year === null ||
          (typeof book.year === "number" && Number.isFinite(book.year))) &&
        (book.pages === null ||
          (typeof book.pages === "number" && Number.isFinite(book.pages))) &&
        Array.isArray(book.shelves) &&
        book.shelves.every((s: unknown) => typeof s === "string") &&
        (book.tags === undefined ||
          (Array.isArray(book.tags) &&
            book.tags.every((t: unknown) => typeof t === "string"))),
    )
  )
    throw new Error(
      "Choose a Shelf Notes library backup with valid book entries.",
    );
  if (new Set(value.map((book) => book.id)).size !== value.length)
    throw new Error("The backup contains duplicate book IDs.");
  return (value as Book[]).map((book) => ({
    ...book,
    tags: book.tags ?? [],
    rating: normalizeStoredRating(book.rating),
    format: ["Audio", "Physical", "Kindle"].includes(book.format ?? "")
      ? book.format
      : "Unclear",
    kind: ["Fiction", "Nonfiction"].includes(book.kind ?? "")
      ? book.kind
      : "Unclear",
    kindSource: ["manual", "sheet", "lookup"].includes(book.kindSource ?? "")
      ? book.kindSource
      : "",
    kindCheckedAt:
      typeof book.kindCheckedAt === "number" &&
      Number.isFinite(book.kindCheckedAt)
        ? book.kindCheckedAt
        : 0,
  }));
}

export function parseLibraryBackup(value: unknown) {
  if (!value || typeof value !== "object")
    throw new Error("Choose a Shelf Notes JSON backup.");
  const backup = value as Record<string, unknown>;
  if (backup.version !== undefined && backup.version !== 1)
    throw new Error("Unsupported library backup version.");
  const books = normalizeBooks(backup.books);
  if (
    !Array.isArray(backup.categories) ||
    !backup.categories.every((c) => typeof c === "string")
  )
    throw new Error("The backup categories are invalid.");
  if (backup.isDemo !== undefined && typeof backup.isDemo !== "boolean")
    throw new Error("The backup sample-data setting is invalid.");
  if (
    backup.lastSyncedAt !== undefined &&
    (typeof backup.lastSyncedAt !== "string" ||
      (backup.lastSyncedAt !== "" &&
        !Number.isFinite(Date.parse(backup.lastSyncedAt))))
  )
    throw new Error("The backup sync date is invalid.");
  return {
    books,
    categories: backup.categories as string[],
    isDemo: backup.isDemo === true,
    lastSyncedAt: (backup.lastSyncedAt as string | undefined) ?? "",
  };
}
