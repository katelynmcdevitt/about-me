import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Book, BookKind, ReadingFormat } from "./model";
import type { EntryChanges } from "./contracts";

type Form = {
  title: string;
  author: string;
  isbn: string;
  year: string;
  pages: string;
  rating: string;
  dateRead: string;
  format: ReadingFormat;
  kind: BookKind;
  category: string;
  tags: string;
};
const formFor = (book: Book): Form => ({
  title: book.title,
  author: book.author,
  isbn: book.isbn,
  year: book.year?.toString() ?? "",
  pages: book.pages?.toString() ?? "",
  rating: String(book.rating),
  dateRead: book.dateRead,
  format: book.format ?? "Unclear",
  kind: book.kind ?? "Unclear",
  category: book.category,
  tags: book.tags.join(", "),
});

export default function BookDetailsDialog({
  book,
  categories,
  busy,
  error,
  onClose,
  onSave,
  onAddReading,
}: {
  book: Book;
  categories: string[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (changes: EntryChanges) => Promise<boolean>;
  onAddReading: (changes: EntryChanges) => Promise<boolean>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const original = formFor(book);
  const [form, setForm] = useState(original);
  const [reread, setReread] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const change = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const close = () => {
    if (
      !busy &&
      (!dirty || window.confirm("Discard your unsaved book details?"))
    )
      onClose();
  };
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values: EntryChanges = {
      title: form.title.trim(),
      author: form.author.trim(),
      isbn: form.isbn.trim(),
      year: form.year === "" ? null : Number(form.year),
      pages: form.pages === "" ? null : Number(form.pages),
      rating: form.rating === "" ? 0 : Number(form.rating),
      dateRead: form.dateRead.trim(),
      format: form.format,
      kind: form.kind,
      category: form.category.trim(),
      tags: [
        ...new Map(
          form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .map((tag) => [tag.toLowerCase(), tag]),
        ).values(),
      ],
    };
    let saved = false;
    if (reread) {
      const {
        title: _title,
        author: _author,
        isbn: _isbn,
        year: _year,
        pages: _pages,
        ...reading
      } = values;
      saved = await onAddReading(reading);
    } else {
      const changes = Object.fromEntries(
        Object.entries(values).filter(
          ([key, value]) =>
            JSON.stringify(value) !==
            JSON.stringify(
              book[key as keyof Book] ??
                (key === "format" || key === "kind" ? "Unclear" : undefined),
            ),
        ),
      ) as EntryChanges;
      if (!Object.keys(changes).length) {
        onClose();
        return;
      }
      saved = await onSave(changes);
    }
    if (saved) onClose();
  }
  return (
    <dialog
      ref={ref}
      className="book-details"
      aria-labelledby="book-details-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <button
        className="details-close"
        aria-label="Close book details"
        disabled={busy}
        onClick={close}
      >
        <X size={20} />
      </button>
      <h2 id="book-details-title">
        {reread ? "Record a reread" : "Book details"}
      </h2>
      <p>
        {reread
          ? `Another reading of ${book.title}. Your earlier reading will stay in the library.`
          : "Book information is shared across rereads. Reading details apply to this entry."}
      </p>
      {error && (
        <div className="details-error" role="alert">
          {error}
          {/library changed/i.test(error) && (
            <p>
              Close and reopen this panel to review the latest version before
              saving.
            </p>
          )}
        </div>
      )}
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <fieldset disabled={busy}>
          {!reread && (
            <>
              <h3>Book information</h3>
              <label>
                Title
                <input
                  required
                  maxLength={2000}
                  value={form.title}
                  onChange={(event) => change("title", event.target.value)}
                />
              </label>
              <label>
                Author
                <input
                  required
                  maxLength={1000}
                  value={form.author}
                  onChange={(event) => change("author", event.target.value)}
                />
              </label>
              <label>
                ISBN
                <input
                  maxLength={100}
                  value={form.isbn}
                  onChange={(event) => change("isbn", event.target.value)}
                  placeholder="10 or 13 digits, or leave blank"
                />
              </label>
              <div className="details-row">
                <label>
                  Publication year
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    step={1}
                    value={form.year}
                    onChange={(event) => change("year", event.target.value)}
                  />
                </label>
                <label>
                  Pages
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    step={1}
                    value={form.pages}
                    onChange={(event) => change("pages", event.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          <h3>Reading details</h3>
          <div className="details-row">
            <label>
              Rating
              <input
                type="number"
                min={0}
                max={5}
                step="0.01"
                value={form.rating}
                onChange={(event) => change("rating", event.target.value)}
              />
            </label>
            <label>
              Finished date
              <input
                required={reread}
                value={form.dateRead}
                maxLength={10}
                placeholder="YYYY-MM-DD or YYYY-MM"
                aria-describedby="details-date-help"
                onChange={(event) => change("dateRead", event.target.value)}
              />
            </label>
          </div>
          <p id="details-date-help" className="details-help">
            Rating: 0 means unrated.{" "}
            {reread
              ? "Rereads need a distinct finish date; a year and month is enough."
              : "Dates can include just a year and month; leave blank if unknown."}
          </p>
          <div className="details-row">
            <label>
              Reading format
              <select
                value={form.format}
                onChange={(event) =>
                  change("format", event.target.value as ReadingFormat)
                }
              >
                {["Unclear", "Audio", "Physical", "Kindle"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Book type
              <select
                value={form.kind}
                onChange={(event) =>
                  change("kind", event.target.value as BookKind)
                }
              >
                {["Unclear", "Fiction", "Nonfiction"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Category
            <input
              required
              maxLength={100}
              list="book-details-categories"
              value={form.category}
              onChange={(event) => change("category", event.target.value)}
            />
          </label>
          <datalist id="book-details-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <label>
            Tags
            <input
              value={form.tags}
              onChange={(event) => change("tags", event.target.value)}
              placeholder="Separate tags with commas"
            />
          </label>
          <div className="details-actions">
            <button type="button" className="text-button" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="import-button">
              {busy ? "Saving…" : reread ? "Save reread" : "Save changes"}
            </button>
          </div>
          {!reread && (
            <div className="reread-action">
              <button
                type="button"
                className="text-button"
                disabled={dirty}
                onClick={() => {
                  setReread(true);
                  setForm({ ...original, dateRead: "", rating: "0" });
                }}
              >
                Record a reread
              </button>
              {dirty && (
                <p>Save or cancel your edits before recording a reread.</p>
              )}
            </div>
          )}
        </fieldset>
      </form>
    </dialog>
  );
}
