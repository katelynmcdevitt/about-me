import type { Book } from "./model";
import { formatMix } from "./model";

export function needsReadingFormat(book: Book): boolean {
  return !["Audio", "Physical", "Kindle"].includes(book.format ?? "");
}
function finishMonth(book: Book) {
  const match = book.dateRead.match(/^(\d{4})[/-](\d{1,2})(?:[/-]\d{1,2})?$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return { year: match[1], month: Number(match[2]) - 1 };
}
export function yearlyReadingSummary(books: Book[], year: string) {
  const finished = books.filter((book) => finishMonth(book)?.year === year);
  const withPages = finished.filter(
    (book) =>
      typeof book.pages === "number" &&
      Number.isFinite(book.pages) &&
      book.pages > 0,
  );
  const rated = finished.filter(
    (book) => book.rating > 0 && Number.isFinite(book.rating),
  );
  const months = Array.from({ length: 12 }, (_, index) => ({
    label: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][index],
    count: finished.filter((book) => finishMonth(book)?.month === index).length,
  }));
  const mix = formatMix(finished);
  const counts = [mix.audio, mix.physical, mix.kindle, mix.unclear];
  // Allocate rounded percentages so the chart labels always sum to 100.
  const shares = counts.map((count) =>
    finished.length ? (count / finished.length) * 100 : 0,
  );
  const percentages = shares.map(Math.floor);
  let remaining = finished.length
    ? 100 - percentages.reduce((sum, value) => sum + value, 0)
    : 0;
  const order = shares
    .map((share, index) => ({ index, fraction: share - percentages[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of order) {
    if (!remaining) break;
    percentages[item.index]++;
    remaining--;
  }
  return {
    finished: finished.length,
    pages: withPages.reduce((sum, book) => sum + book.pages!, 0),
    missingPages: finished.length - withPages.length,
    rated: rated.length,
    averageRating: rated.length
      ? rated.reduce((sum, book) => sum + book.rating, 0) / rated.length
      : null,
    months,
    formats: ["Audio", "Physical", "Kindle", "Unclear"].map((label, index) => ({
      label,
      count: counts[index],
      percentage: percentages[index],
    })),
    undated: books.filter((book) => !finishMonth(book)).length,
    unknownFormats: books.filter(needsReadingFormat).length,
  };
}
