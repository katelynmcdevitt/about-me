import Papa from "papaparse";
import {
  bookFromRow,
  monthSummary,
  normalizeHeader,
  parseLibraryBackup,
  parseRating,
  rowValue,
} from "../../features/books/model";
import type { Book } from "../../features/books/model";
import type { ImportInput, ImportRow } from "../../features/books/contracts";
import { LibraryError } from "./errors";

export type ParsedImport = {
  records: { row: number; book: Book }[];
  rows: ImportRow[];
  categories: string[];
};
export function normalizedDate(value: string): string | null {
  if (!value.trim()) return "";
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?$/);
  if (!match) return null;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3] ?? 1);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000 ||
    year > 9999 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${match[1]}-${String(month).padStart(2, "0")}${match[3] ? `-${String(day).padStart(2, "0")}` : ""}`;
}
export function parseImport(input: ImportInput): ParsedImport {
  if (!["goodreads", "sheets", "backup", "browser"].includes(input.source))
    throw new LibraryError(
      "Choose Goodreads, Google Sheets, or a library backup.",
    );
  if (
    typeof input.filename !== "string" ||
    !input.filename.trim() ||
    input.filename.length > 255
  )
    throw new LibraryError("Provide a filename of up to 255 characters.");
  const records: ParsedImport["records"] = [],
    rows: ImportRow[] = [];
  let categories: string[] = [];
  if (input.source === "backup" || input.source === "browser") {
    let backup;
    try {
      backup = parseLibraryBackup(input.backup);
    } catch (error) {
      throw new LibraryError(
        error instanceof Error ? error.message : "Invalid library backup.",
      );
    }
    if (backup.isDemo)
      throw new LibraryError(
        "This backup contains sample data. Import your reading log instead.",
      );
    categories = backup.categories;
    backup.books.forEach((book, index) =>
      records.push({ row: index + 1, book }),
    );
  } else {
    if (typeof input.csv !== "string" || !input.csv.trim())
      throw new LibraryError("Choose a nonempty CSV file.");
    const parsed = Papa.parse<string[]>(input.csv.replace(/^\uFEFF/, ""), {
      skipEmptyLines: "greedy",
    });
    if (parsed.errors.length)
      throw new LibraryError(
        `The CSV could not be parsed: ${parsed.errors[0].message}`,
      );
    let headers: string[] = [],
      finishedMonth = "",
      recognized = false;
    for (const [index, cells] of parsed.data.entries()) {
      const rowNumber = index + 1;
      const normalized = cells.map(normalizeHeader);
      if (
        normalized.some((h) => h === "title" || h === "book title") &&
        normalized.some((h) =>
          ["author", "author name", "author l-f"].includes(h),
        )
      ) {
        headers = cells.map((c) => c.trim());
        recognized = true;
        continue;
      }
      const month = monthSummary(cells[0] ?? "");
      if (input.source === "sheets" && month) {
        finishedMonth = month;
        recognized = true;
        const extra = cells.slice(2).map((c) => c.trim());
        headers = extra.some((h) =>
          [
            "form",
            "format",
            "type",
            "rating",
            "nonfiction?",
            "non fiction?",
          ].includes(normalizeHeader(h)),
        )
          ? ["Title", "Author", ...extra]
          : headers.length
            ? headers
            : ["Title", "Author", "Form", "Nonfiction?", "Rating"];
        continue;
      }
      if (!recognized) {
        rows.push({
          row: rowNumber,
          title: cells[0] ?? "",
          action: "skipped",
          detail: "Row precedes recognized column headings.",
        });
        continue;
      }
      const row = Object.fromEntries(
        headers.map((header, i) => [header, cells[i]?.trim() ?? ""]),
      );
      const title = rowValue(row, "Title", "Book Title");
      if (!title) {
        rows.push({
          row: rowNumber,
          title: "Untitled row",
          action: "skipped",
          detail: "Missing title.",
        });
        continue;
      }
      const rating = rowValue(row, "My Rating", "Rating");
      if (rating && parseRating(rating) === null) {
        rows.push({
          row: rowNumber,
          title,
          action: "skipped",
          detail: "Rating must be between 0 and 5.",
        });
        continue;
      }
      const book = bookFromRow(
        row,
        input.source === "sheets",
        finishedMonth,
        input.source === "sheets" ? "sheet" : "manual",
      );
      if (!book) {
        rows.push({
          row: rowNumber,
          title,
          action: "skipped",
          detail: "Not marked as read.",
        });
        continue;
      }
      const goodreadsId = rowValue(row, "Book Id", "Goodreads Id");
      records.push({
        row: rowNumber,
        book: { ...book, ...(goodreadsId ? { goodreadsId } : {}) },
      });
    }
    if (!recognized)
      throw new LibraryError(
        input.source === "goodreads"
          ? "Expected Goodreads columns including Title and Author."
          : "Expected Title and Author columns, or month headings from your reading sheet.",
      );
  }
  if (records.length + rows.length > 20_000)
    throw new LibraryError("Import up to 20,000 rows at a time.");
  if (categories.some((name) => !name.trim() || name.length > 100))
    throw new LibraryError("Category names must be 1–100 characters.");
  const valid = records.filter((record) => {
    const book = record.book;
    if (
      !book.title.trim() ||
      book.title.length > 2000 ||
      book.author.length > 1000 ||
      book.category.length > 100 ||
      book.tags.length > 100 ||
      book.tags.some((tag) => !tag.trim() || tag.length > 100) ||
      (book.goodreadsId !== undefined &&
        (typeof book.goodreadsId !== "string" || book.goodreadsId.length > 100))
    ) {
      rows.push({
        row: record.row,
        title: book.title,
        action: "skipped",
        detail:
          "Title, author, category, tags, or identifier is invalid or too long.",
      });
      return false;
    }
    const date = normalizedDate(record.book.dateRead);
    if (date === null) {
      rows.push({
        row: record.row,
        title: record.book.title,
        action: "skipped",
        detail: "Use a finish date in YYYY-MM-DD or YYYY-MM format.",
      });
      return false;
    }
    record.book.dateRead = date;
    return true;
  });
  return { records: valid, rows, categories };
}
