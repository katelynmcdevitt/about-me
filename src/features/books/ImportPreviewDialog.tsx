import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ImportPreview } from "./contracts";

export default function ImportPreviewDialog({
  preview,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  preview: ImportPreview;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const { summary } = preview;
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
        Your tags and manual classifications will be kept. Skipped and ambiguous
        rows won’t be imported. Existing books won’t be deleted.
      </p>
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
            {preview.rows.slice(0, 100).map((row, i) => (
              <tr key={i}>
                <td>{row.row}</td>
                <td>{row.title}</td>
                <td>{row.action}</td>
                <td>{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.rows.length > 100 && (
        <p>
          Showing the first 100 of {preview.rows.length} rows. Counts include
          the entire file.
        </p>
      )}
      <div className="preview-actions">
        <button className="text-button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="import-button"
          disabled={
            busy || !(summary.added + summary.updated + summary.unchanged)
          }
          onClick={onConfirm}
        >
          {busy ? "Saving…" : "Confirm import"}
        </button>
      </div>
    </dialog>
  );
}
