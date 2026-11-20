import { useEffect, useRef, useState } from "react";
import type { EntryChanges } from "./contracts";
import type { ReadingFormat } from "./model";

export default function AddReadingDialog({
  busy,
  error,
  onClose,
  onSave,
}: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (changes: EntryChanges) => Promise<boolean>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [format, setFormat] = useState<ReadingFormat>("Unclear");
  const close = () => {
    if (!busy && (!(title || author) || window.confirm("Discard this book?")))
      onClose();
  };
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="book-details"
      aria-labelledby="add-reading-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id="add-reading-title">Add currently reading</h2>
      <p>
        We’ll look for a cover using the title and author. You can mark the book
        finished when you’re done.
      </p>
      {error && (
        <div className="details-error" role="alert">
          {error}
        </div>
      )}
      <form className="site-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ title, author, format }).then((saved) => {
            if (saved) onClose();
          });
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Title
            <input
              autoFocus
              required
              maxLength={2000}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Author
            <input
              required
              maxLength={1000}
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
            />
          </label>
          <label>
            Reading format
            <select
              value={format}
              onChange={(event) =>
                setFormat(event.target.value as ReadingFormat)
              }
            >
              {["Unclear", "Audio", "Physical", "Kindle"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <div className="details-actions">
            <button type="button" className="text-button" onClick={close}>
              Cancel
            </button>
            <button className="import-button site-button" type="submit">
              {busy ? "Finding cover & saving…" : "Add book"}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  );
}
