import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ImportDecision, ImportPreview, ImportRow } from "./contracts";
import type { Book } from "./model";
import { formatFinishedDate } from "./model";

function ResolutionControls({
  row,
  books,
  busy,
  onResolve,
}: {
  row: ImportRow;
  books: Book[];
  busy: boolean;
  onResolve: (decision: ImportDecision) => void;
}) {
  const review = row.review!;
  const [entryId, setEntryId] = useState(
    review.decision?.entryId ?? review.suggestedEntryIds[0] ?? "",
  );
  const suggested = books.filter((book) =>
    review.suggestedEntryIds.includes(book.id),
  );
  const others = books.filter(
    (book) => !review.suggestedEntryIds.includes(book.id),
  );
  const options = (entries: Book[]) =>
    entries.map((book) => (
      <option key={book.id} value={book.id}>
        {book.title} — {book.author} — {book.isbn || "no ISBN"} —{" "}
        {book.dateRead
          ? `finished ${formatFinishedDate(book.dateRead)}`
          : "finish date unknown"}
      </option>
    ));
  return (
    <div className="resolution-controls">
      <label>
        Existing book / reading
        <select
          aria-label={`Existing book for row ${row.row}`}
          disabled={busy}
          value={entryId}
          onChange={(event) => setEntryId(event.target.value)}
        >
          <option value="">Choose a book…</option>
          {suggested.length > 0 && (
            <optgroup label="Suggested matches">{options(suggested)}</optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Other readings">{options(others)}</optgroup>
          )}
        </select>
      </label>
      <div
        className="resolution-actions"
        role="group"
        aria-label={`Resolve row ${row.row}`}
      >
        <button
          disabled={busy || !entryId}
          aria-label={`Match row ${row.row} to existing book`}
          aria-pressed={review.decision?.action === "match"}
          onClick={() => onResolve({ row: row.row, action: "match", entryId })}
        >
          Match book
        </button>
        <button
          disabled={busy}
          aria-label={`Create separate book for row ${row.row}`}
          aria-pressed={review.decision?.action === "new"}
          onClick={() => onResolve({ row: row.row, action: "new" })}
        >
          Separate book / edition
        </button>
        <button
          disabled={busy}
          aria-label={`Skip row ${row.row}`}
          aria-pressed={review.decision?.action === "skip"}
          onClick={() => onResolve({ row: row.row, action: "skip" })}
        >
          Skip
        </button>
      </div>
      {review.decision && (
        <button
          className="text-button"
          disabled={busy}
          aria-label={`Undo choice for row ${row.row}`}
          onClick={() => onResolve({ row: row.row, action: "review" })}
        >
          Undo choice
        </button>
      )}
    </div>
  );
}

export default function ImportPreviewDialog({
  preview,
  books,
  busy,
  error,
  onClose,
  onConfirm,
  onResolve,
}: {
  preview: ImportPreview;
  books: Book[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
  onResolve: (decision: ImportDecision) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [onlyReview, setOnlyReview] = useState(preview.summary.ambiguous > 0);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const { summary } = preview;
  const reviewRows = preview.rows.filter((row) => row.review);
  const rows = onlyReview ? reviewRows : preview.rows;
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const chosenSkip = reviewRows.some(
    (row) => row.review?.decision?.action === "skip",
  );
  const canConfirm =
    !summary.ambiguous &&
    !!(summary.added + summary.updated + summary.unchanged || chosenSkip);
  return (
    <dialog
      ref={ref}
      className="import-preview"
      aria-labelledby="import-preview-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <button
        className="preview-close"
        aria-label="Close import preview"
        disabled={busy}
        onClick={onClose}
      >
        <X size={18} />
      </button>
      <h2 id="import-preview-title">Review your import</h2>
      <p>{preview.filename}</p>
      {error && <p role="alert">{error}</p>}
      <div className="preview-summary" role="status">
        <span>{summary.added} new readings</span>
        <span>{summary.updated} updates</span>
        <span>{summary.unchanged} unchanged</span>
        <span>{summary.skipped} skipped</span>
        <span>{summary.ambiguous} need review</span>
      </div>
      <p>
        Your tags and manual classifications will be kept. Existing books won’t
        be deleted. Choose how to handle each uncertain row before confirming.
      </p>
      {reviewRows.length > 0 && (
        <>
          <p>
            Choose an existing book, then select Match book. A different finish
            date adds a reread; without a date, choose the reading to update.
            Matching keeps the existing book’s identifiers.
          </p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setOnlyReview((value) => !value);
              setPage(0);
            }}
          >
            {onlyReview ? "Show all import rows" : "Show rows needing a choice"}
          </button>
        </>
      )}
      <div className="preview-rows">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Book</th>
              <th>Result</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentPage * 50, currentPage * 50 + 50).map((row) => (
              <tr key={row.row}>
                <td>{row.row}</td>
                <td>
                  {row.title}
                  {row.review && (
                    <small className="incoming-details">
                      {row.review.author} · ISBN:{" "}
                      {row.review.isbn || "not provided"} · Finished:{" "}
                      {row.review.dateRead || "unknown"}
                    </small>
                  )}
                </td>
                <td>{row.action}</td>
                <td>
                  <p>{row.detail}</p>
                  {row.review && (
                    <ResolutionControls
                      row={row}
                      books={books}
                      busy={busy}
                      onResolve={onResolve}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="preview-pagination" aria-label="Import preview pages">
          <button
            disabled={busy || !currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous rows
          </button>
          <span>
            Page {currentPage + 1} of {pageCount} · {rows.length} rows
          </span>
          <button
            disabled={busy || currentPage === pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next rows
          </button>
        </div>
      )}
      {!!summary.ambiguous && (
        <p role="status">
          {summary.ambiguous} uncertain{" "}
          {summary.ambiguous === 1 ? "row needs" : "rows need"} a choice before
          you can confirm.
        </p>
      )}
      <div className="preview-actions">
        <button className="text-button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="import-button"
          disabled={busy || !canConfirm}
          onClick={onConfirm}
        >
          {busy ? "Saving…" : "Confirm import"}
        </button>
      </div>
    </dialog>
  );
}
