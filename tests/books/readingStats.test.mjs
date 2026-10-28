import test from "node:test";
import assert from "node:assert/strict";
import { loadFile } from "../helpers/load-module.mjs";
const { yearlyReadingSummary, needsReadingFormat } = await loadFile(
  new URL("../../src/features/books/readingStats.ts", import.meta.url),
);
const { sampleBooks } = await loadFile(
  new URL("../../src/features/books/model.ts", import.meta.url),
);
const reading = (changes) => ({ ...sampleBooks[0], ...changes });

test("yearly totals include rereads, exclude undated and other-year entries, and explain missing data", () => {
  const books = [
    reading({
      id: "first",
      dateRead: "2026-01-14",
      pages: 100,
      rating: 4,
      format: "Audio",
    }),
    reading({
      id: "reread",
      dateRead: "2026-02",
      pages: 100,
      rating: 5,
      format: "Physical",
    }),
    reading({
      id: "missing",
      dateRead: "2026-04-01",
      pages: null,
      rating: 0,
      format: "Unclear",
    }),
    reading({
      id: "old",
      dateRead: "2025-01-01",
      pages: 500,
      rating: 1,
      format: "Kindle",
    }),
    reading({ id: "undated", dateRead: "", pages: 900, rating: 5 }),
  ];
  const stats = yearlyReadingSummary(books, "2026");
  assert.equal(stats.finished, 3);
  assert.equal(stats.pages, 200);
  assert.equal(stats.missingPages, 1);
  assert.equal(stats.averageRating, 4.5);
  assert.equal(stats.rated, 2);
  assert.equal(stats.undated, 1);
  assert.deepEqual(
    stats.months.map((month) => month.count),
    [1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  );
  assert.equal(
    stats.formats.reduce((sum, format) => sum + format.percentage, 0),
    100,
  );
  assert.equal(
    stats.formats.find((format) => format.label === "Unclear").count,
    1,
  );
  assert.equal(yearlyReadingSummary(books, "2025").pages, 500);
});

test("empty years and unrated books have no fabricated averages or percentages", () => {
  const empty = yearlyReadingSummary([], "");
  assert.equal(empty.finished, 0);
  assert.equal(empty.averageRating, null);
  assert.ok(empty.formats.every((format) => format.percentage === 0));
  assert.ok(empty.months.every((month) => month.count === 0));
  const unrated = yearlyReadingSummary(
    [
      reading({
        dateRead: "2026/06",
        rating: 0,
        pages: null,
        format: "Unclear",
      }),
    ],
    "2026",
  );
  assert.equal(unrated.averageRating, null);
  assert.equal(unrated.missingPages, 1);
  assert.equal(unrated.months[5].count, 1);
  assert.equal(needsReadingFormat(reading({ format: undefined })), true);
  assert.equal(needsReadingFormat(reading({ format: "Kindle" })), false);
});
