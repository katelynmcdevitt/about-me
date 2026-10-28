"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  ArrowDownUp,
  ArrowLeft,
  Download,
  BookOpen,
  Check,
  ChevronDown,
  Library,
  Plus,
  RefreshCw,
  Search,
  Star,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import styles from "./BooksApp.module.css";
import {
  readStoredBooks,
  readStoredCategories,
  STORAGE_KEY,
  CATEGORIES_KEY,
  DEMO_KEY,
  LAST_SYNC_KEY,
  GOOGLE_SHEET_URL,
  uncategorized,
  loadSheetBooks,
  mergeBooks,
  lookupBookKinds,
  bookMix,
  formatMix,
  mixPercent,
  normalizeHeader,
  bookFromRow,
  formatFinishedDate,
  parseLibraryBackup,
  readStorage,
} from "./model";
import type { Book, BookKind } from "./model";

function BookCover({ book, index }: { book: Book; index: number }) {
  const [failed, setFailed] = useState(false);
  const coverUrl = book.isbn
    ? `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false`
    : "";

  return (
    <div
      className={`book-cover cover-${index % 6}`}
      aria-label={`Cover for ${book.title}`}
    >
      <span className="cover-title">{book.title}</span>
      <span className="cover-author">{book.author}</span>
      {coverUrl && !failed && (
        <img
          src={coverUrl}
          alt={`Cover of ${book.title}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function BooksApp() {
  const [books, setBooks] = useState<Book[]>(readStoredBooks);
  const [customCategories, setCustomCategories] =
    useState<string[]>(readStoredCategories);
  const [isDemo, setIsDemo] = useState(() => readStorage(DEMO_KEY) !== "false");
  const [activeCategory, setActiveCategory] = useState("All books");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [notice, setNotice] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [addingTagBookId, setAddingTagBookId] = useState("");
  const [selectedReadingYear, setSelectedReadingYear] = useState("");
  const [syncVersion, setSyncVersion] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(
    () => readStorage(LAST_SYNC_KEY) ?? "",
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const booksRef = useRef(books);
  const demoRef = useRef(isDemo);
  demoRef.current = isDemo;
  const syncEpoch = useRef(0);

  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    booksRef.current = books;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(customCategories));
      localStorage.setItem(DEMO_KEY, String(isDemo));
      if (lastSyncedAt) localStorage.setItem(LAST_SYNC_KEY, lastSyncedAt);
      else localStorage.removeItem(LAST_SYNC_KEY);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [books, customCategories, isDemo, lastSyncedAt]);

  useEffect(() => {
    let active = true;
    let syncing = false;
    const sync = async () => {
      if (syncing) return;
      syncing = true;
      const epoch = syncEpoch.current;
      setIsSyncing(true);
      try {
        const incoming = await loadSheetBooks();
        if (!active || epoch !== syncEpoch.current) return;
        const merged = mergeBooks(booksRef.current, incoming, demoRef.current);
        const classified = await lookupBookKinds(merged);
        if (!active || epoch !== syncEpoch.current) return;
        const replaceDemo = demoRef.current;
        setBooks((current) => mergeBooks(current, classified, replaceDemo));
        setIsDemo(false);
        setLastSyncedAt(new Date().toISOString());
        setNotice("");
      } catch (error) {
        if (active && epoch === syncEpoch.current)
          setNotice(
            error instanceof Error
              ? error.message
              : "Google Sheets sync failed.",
          );
      } finally {
        syncing = false;
        if (active) setIsSyncing(false);
      }
    };

    void sync();
    const interval = window.setInterval(
      () => {
        void sync();
      },
      15 * 60 * 1000,
    );
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [syncVersion]);

  const categories = useMemo(() => {
    const values = new Set([
      ...customCategories,
      ...books
        .map((book) => book.category)
        .filter((category) => category !== uncategorized),
    ]);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [books, customCategories]);

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return books
      .filter(
        (book) =>
          activeCategory === "All books" || book.category === activeCategory,
      )
      .filter(
        (book) =>
          !normalizedQuery ||
          `${book.title} ${book.author} ${book.category} ${book.shelves.join(" ")} ${(book.tags ?? []).join(" ")}`
            .toLowerCase()
            .includes(normalizedQuery),
      )
      .sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "author") return a.author.localeCompare(b.author);
        if (sortBy === "rating")
          return b.rating - a.rating || a.title.localeCompare(b.title);
        return (
          (Date.parse(b.dateRead) || 0) - (Date.parse(a.dateRead) || 0) ||
          a.title.localeCompare(b.title)
        );
      });
  }, [activeCategory, books, query, sortBy]);

  const ratedBooks = books.filter((book) => book.rating > 0);
  const averageRating = ratedBooks.length
    ? (
        ratedBooks.reduce((sum, book) => sum + book.rating, 0) /
        ratedBooks.length
      ).toFixed(1)
    : "—";
  const readingYears = [
    ...new Set(
      books
        .map((book) => book.dateRead.match(/^(\d{4})/)?.[1])
        .filter((year): year is string => Boolean(year)),
    ),
  ].sort((a, b) => Number(b) - Number(a));
  const readingYear = readingYears.includes(selectedReadingYear)
    ? selectedReadingYear
    : (readingYears[0] ?? "");
  const overallMix = bookMix(books);
  const yearlyMix = bookMix(
    books.filter((book) => book.dateRead.startsWith(readingYear)),
  );
  const overallFormatMix = formatMix(books);
  const yearlyFormatMix = formatMix(
    books.filter((book) => book.dateRead.startsWith(readingYear)),
  );

  function updateCategory(id: string, category: string) {
    setBooks((current) =>
      current.map((book) => (book.id === id ? { ...book, category } : book)),
    );
  }

  function updateBookKind(id: string, kind: BookKind) {
    setBooks((current) =>
      current.map((book) =>
        book.id === id
          ? { ...book, kind, kindSource: "manual", kindCheckedAt: Date.now() }
          : book,
      ),
    );
  }

  function addTag(event: React.FormEvent<HTMLFormElement>, book: Book) {
    event.preventDefault();
    const tag = tagDraft.trim();
    if (!tag) return;
    setBooks((current) =>
      current.map((item) =>
        item.id === book.id &&
        !(item.tags ?? []).some(
          (existing) => existing.toLowerCase() === tag.toLowerCase(),
        )
          ? { ...item, tags: [...(item.tags ?? []), tag] }
          : item,
      ),
    );
    setTagDraft("");
    setAddingTagBookId("");
  }

  function removeTag(bookId: string, tagToRemove: string) {
    setBooks((current) =>
      current.map((book) =>
        book.id === bookId
          ? {
              ...book,
              tags: (book.tags ?? []).filter((tag) => tag !== tagToRemove),
            }
          : book,
      ),
    );
  }

  function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = categoryDraft.trim();
    if (!category) return;
    if (
      !categories.some((item) => item.toLowerCase() === category.toLowerCase())
    ) {
      setCustomCategories((current) => [...current, category]);
    }
    setActiveCategory(category);
    setCategoryDraft("");
    setIsAddingCategory(false);
  }

  function importCsv(file?: File) {
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
      complete: ({ data, errors, meta }) => {
        const headers = (meta.fields ?? []).map(normalizeHeader);
        if (!headers.includes("title")) {
          setNotice(
            "This file does not look like a Goodreads export. Choose the CSV from your Goodreads library export.",
          );
          return;
        }

        const importedBooks = data
          .map((row) => bookFromRow(row))
          .filter((book): book is Book => book !== null);
        if (importedBooks.length === 0) {
          setNotice(
            "No books on the read shelf were found. Check that your Goodreads export includes the Exclusive Shelf column.",
          );
          return;
        }

        setBooks((current) =>
          mergeBooks(isDemo ? [] : current, importedBooks, false),
        );
        setIsDemo(false);
        setActiveCategory("All books");
        setQuery("");
        setNotice(
          `Added ${importedBooks.length} read ${importedBooks.length === 1 ? "book" : "books"} from ${file.name}${errors.length ? " with a few skipped rows" : ""}.`,
        );
      },
      error: () =>
        setNotice(
          "The CSV could not be read. Try exporting your Goodreads library again.",
        ),
    });
  }

  function exportBackup() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              version: 1,
              books,
              categories: customCategories,
              isDemo,
              lastSyncedAt,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "shelf-notes-backup.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const backup = parseLibraryBackup(JSON.parse(await file.text()));
      if (
        !window.confirm(
          "Replace the library on this device with this backup? Export a backup first to keep the current library.",
        )
      )
        return;
      // Cancel an in-flight sheet sync before restoring the backup.
      syncEpoch.current += 1;
      setBooks(backup.books);
      setCustomCategories(backup.categories);
      setIsDemo(backup.isDemo);
      setLastSyncedAt(backup.lastSyncedAt);
      setActiveCategory("All books");
      setQuery("");
      setNotice(`Imported ${backup.books.length} books from ${file.name}.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not read this backup.",
      );
    }
  }

  const categoryCount = (category: string) =>
    books.filter((book) => book.category === category).length;

  return (
    <div className={styles.root}>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#library" aria-label="Shelf Notes home">
            <span className="brand-mark">
              <BookOpen size={19} strokeWidth={2.2} />
            </span>
            <span>
              shelf<span className="brand-light">notes</span>
            </span>
          </a>

          <div className="side-label">YOUR LIBRARY</div>
          <button
            className={`side-link ${activeCategory === "All books" ? "active" : ""}`}
            onClick={() => setActiveCategory("All books")}
          >
            <Library size={17} /> <span>All books</span>
            <span className="side-count">{books.length}</span>
          </button>

          <div className="category-heading">
            <span className="side-label">CATEGORIES</span>
            <button
              className="icon-button add-category"
              onClick={() => setIsAddingCategory((current) => !current)}
              aria-label="Add category"
              title="Add category"
            >
              {isAddingCategory ? <X size={15} /> : <Plus size={16} />}
            </button>
          </div>
          {isAddingCategory && (
            <form className="new-category-form" onSubmit={addCategory}>
              <input
                autoFocus
                value={categoryDraft}
                onChange={(event) => setCategoryDraft(event.target.value)}
                placeholder="Category name"
                aria-label="New category name"
              />
              <button type="submit" aria-label="Save category">
                <Check size={15} />
              </button>
            </form>
          )}
          <nav className="category-nav" aria-label="Book categories">
            {categories.map((category, index) => (
              <button
                key={category}
                className={`side-link ${activeCategory === category ? "active" : ""}`}
                onClick={() => setActiveCategory(category)}
              >
                <span className={`category-dot dot-${index % 6}`} />
                <span className="category-name">{category}</span>
                <span className="side-count">{categoryCount(category)}</span>
              </button>
            ))}
            {books.some((book) => book.category === uncategorized) && (
              <button
                className={`side-link ${activeCategory === uncategorized ? "active" : ""}`}
                onClick={() => setActiveCategory(uncategorized)}
              >
                <span className="category-dot dot-muted" />
                <span className="category-name">{uncategorized}</span>
                <span className="side-count">
                  {categoryCount(uncategorized)}
                </span>
              </button>
            )}
          </nav>
          <Link className="back-link" href="/apps">
            <ArrowLeft size={14} /> All apps
          </Link>
        </aside>

        <main className="main-content" id="library">
          <header className="topbar">
            <div className="topbar-right">
              <a
                className="sheet-profile-link"
                href={GOOGLE_SHEET_URL}
                target="_blank"
                rel="noreferrer"
              >
                Reading sheet
              </a>
              {lastSyncedAt && (
                <span className="sync-status">
                  Synced{" "}
                  {new Date(lastSyncedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <button
                className="sync-button sync-button-icon"
                onClick={() => setSyncVersion((version) => version + 1)}
                disabled={isSyncing}
                aria-label={isSyncing ? "Syncing sheet" : "Sync sheet"}
                title={isSyncing ? "Syncing sheet" : "Sync sheet"}
              >
                <RefreshCw
                  size={15}
                  className={isSyncing ? "syncing-icon" : ""}
                />
              </button>
              <label htmlFor="goodreads-file" className="import-button">
                <Upload size={16} /> Import CSV
              </label>
              <input
                ref={fileInput}
                id="goodreads-file"
                className="file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  importCsv(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
          </header>

          <section className="page-intro">
            <div>
              <h1>Your library</h1>
            </div>
            <div className="intro-illustration" aria-hidden="true">
              <div className="sun-disc" />
              <div className="book-stack stack-back" />
              <div className="book-stack stack-middle" />
              <div className="book-stack stack-front">
                <span />
              </div>
              <span className="spark spark-one">✳</span>
              <span className="spark spark-two">✳</span>
            </div>
          </section>

          {isDemo && (
            <div className="demo-notice">
              <span>
                <Star size={15} fill="currentColor" /> Sample data
              </span>
            </div>
          )}
          {storageError && (
            <div className="notice" role="alert">
              Changes could not be saved on this device. Export a library backup
              to keep your edits.
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <section className="stats-row" aria-label="Library statistics">
            <div className="stat-item">
              <span className="stat-number">{books.length}</span>
              <span className="stat-label">books read</span>
            </div>
            <span className="stat-divider" />
            <div className="stat-item">
              <span className="stat-number">{categories.length}</span>
              <span className="stat-label">categories</span>
            </div>
            <span className="stat-divider" />
            <div className="stat-item">
              <span className="stat-number stat-rating">
                <Star size={17} fill="currentColor" />
                {averageRating}
              </span>
              <span className="stat-label">average rating</span>
            </div>
          </section>

          <section className="reading-mix" aria-labelledby="reading-mix-title">
            <div className="reading-mix-heading">
              <h2 id="reading-mix-title">Fiction &amp; nonfiction</h2>
              <label className="year-picker">
                <span>Year</span>
                <select
                  value={readingYear}
                  onChange={(event) =>
                    setSelectedReadingYear(event.target.value)
                  }
                  aria-label="Compare year"
                >
                  {readingYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
            <div className="reading-mix-grid">
              {[
                { label: "Overall", mix: overallMix, total: books.length },
                {
                  label: readingYear || "Selected year",
                  mix: yearlyMix,
                  total: books.filter((book) =>
                    book.dateRead.startsWith(readingYear),
                  ).length,
                },
              ].map(({ label, mix, total }) => {
                const classified = mix.fiction + mix.nonfiction;
                const fictionPercent = mixPercent(mix.fiction, classified);
                const nonfictionPercent = classified ? 100 - fictionPercent : 0;
                return (
                  <div className="reading-mix-item" key={label}>
                    <div className="mix-item-heading">
                      <h3>{label}</h3>
                      <span>
                        {classified} / {total} classified
                      </span>
                    </div>
                    <div
                      className={`mix-bar ${classified ? "" : "mix-bar-empty"}`}
                      role="img"
                      aria-label={`${label}: ${fictionPercent}% fiction, ${nonfictionPercent}% nonfiction, ${mix.unclear} unclear`}
                    >
                      {classified > 0 && (
                        <>
                          <span
                            className="mix-fiction"
                            style={{ width: `${fictionPercent}%` }}
                          />
                          <span
                            className="mix-nonfiction"
                            style={{ width: `${nonfictionPercent}%` }}
                          />
                        </>
                      )}
                    </div>
                    <div className="mix-labels">
                      {classified > 0 ? (
                        <>
                          <span>
                            <i className="mix-dot mix-dot-fiction" />
                            Fiction <strong>{fictionPercent}%</strong>
                          </span>
                          <span>
                            <i className="mix-dot mix-dot-nonfiction" />
                            Nonfiction <strong>{nonfictionPercent}%</strong>
                          </span>
                        </>
                      ) : (
                        <span>No classified books</span>
                      )}
                      <span className="mix-unclear">{mix.unclear} unclear</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className="reading-mix format-mix"
            aria-labelledby="format-mix-title"
          >
            <div className="reading-mix-heading">
              <h2 id="format-mix-title">Audio, physical &amp; Kindle</h2>
            </div>
            <div className="reading-mix-grid">
              {[
                {
                  label: "Overall",
                  mix: overallFormatMix,
                  total: books.length,
                },
                {
                  label: readingYear || "Selected year",
                  mix: yearlyFormatMix,
                  total: books.filter((book) =>
                    book.dateRead.startsWith(readingYear),
                  ).length,
                },
              ].map(({ label, mix, total }) => {
                const classified = mix.audio + mix.physical + mix.kindle;
                const audioPercent = mixPercent(mix.audio, classified);
                const physicalPercent = mixPercent(mix.physical, classified);
                const kindlePercent = classified
                  ? 100 - audioPercent - physicalPercent
                  : 0;
                return (
                  <div className="reading-mix-item" key={label}>
                    <div className="mix-item-heading">
                      <h3>{label}</h3>
                      <span>
                        {classified} / {total} classified
                      </span>
                    </div>
                    <div
                      className={`mix-bar ${classified ? "" : "mix-bar-empty"}`}
                      role="img"
                      aria-label={`${label}: ${audioPercent}% audio, ${physicalPercent}% physical, ${kindlePercent}% Kindle, ${mix.unclear} unclear`}
                    >
                      {classified > 0 && (
                        <>
                          <span
                            className="mix-audio"
                            style={{ width: `${audioPercent}%` }}
                          />
                          <span
                            className="mix-physical"
                            style={{ width: `${physicalPercent}%` }}
                          />
                          <span
                            className="mix-kindle"
                            style={{ width: `${kindlePercent}%` }}
                          />
                        </>
                      )}
                    </div>
                    <div className="mix-labels">
                      {classified > 0 ? (
                        <>
                          <span>
                            <i className="mix-dot mix-dot-audio" />
                            Audio <strong>{audioPercent}%</strong>
                          </span>
                          <span>
                            <i className="mix-dot mix-dot-physical" />
                            Physical <strong>{physicalPercent}%</strong>
                          </span>
                          <span>
                            <i className="mix-dot mix-dot-kindle" />
                            Kindle <strong>{kindlePercent}%</strong>
                          </span>
                        </>
                      ) : (
                        <span>No format data</span>
                      )}
                      <span className="mix-unclear">{mix.unclear} unclear</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="collection-section">
            <div className="collection-heading">
              <div>
                <h2>
                  {activeCategory}
                  <span className="heading-count">{filteredBooks.length}</span>
                </h2>
              </div>
              <div className="collection-actions">
                <label className="search-box">
                  <Search size={16} />
                  <input
                    type="search"
                    placeholder="Search books"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search books and authors"
                  />
                  {query && (
                    <button
                      className="search-clear"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
                <label className="sort-select">
                  <ArrowDownUp size={15} />
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    aria-label="Sort books"
                  >
                    <option value="recent">Recently read</option>
                    <option value="title">Title</option>
                    <option value="author">Author</option>
                    <option value="rating">Rating</option>
                  </select>
                  <ChevronDown size={13} />
                </label>
              </div>
            </div>

            {filteredBooks.length ? (
              <div className="book-list">
                {filteredBooks.map((book, index) => (
                  <article className="book-row" key={book.id}>
                    <BookCover book={book} index={index} />
                    <div className="book-info">
                      <h3>{book.title}</h3>
                      <p className="book-author">{book.author}</p>
                      <div className="book-meta">
                        {book.year && <span>{book.year}</span>}
                        {book.pages && (
                          <>
                            <span className="meta-divider">·</span>
                            <span>{book.pages} pages</span>
                          </>
                        )}
                        {book.dateRead && (
                          <>
                            <span className="meta-divider">·</span>
                            <span>
                              Finished {formatFinishedDate(book.dateRead)}
                            </span>
                          </>
                        )}
                      </div>
                      <div
                        className="book-tags"
                        aria-label={`Tags for ${book.title}`}
                      >
                        {(book.tags ?? []).map((tag) => (
                          <span className="book-tag" key={tag}>
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(book.id, tag)}
                              aria-label={`Remove ${tag} tag from ${book.title}`}
                              title={`Remove ${tag}`}
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                        {addingTagBookId === book.id ? (
                          <form
                            className="add-tag-form"
                            onSubmit={(event) => addTag(event, book)}
                          >
                            <input
                              autoFocus
                              value={tagDraft}
                              onChange={(event) =>
                                setTagDraft(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  setAddingTagBookId("");
                                  setTagDraft("");
                                }
                              }}
                              placeholder="Add tag"
                              aria-label={`New tag for ${book.title}`}
                            />
                            <button
                              type="submit"
                              aria-label={`Save tag for ${book.title}`}
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingTagBookId("");
                                setTagDraft("");
                              }}
                              aria-label="Cancel adding tag"
                            >
                              <X size={12} />
                            </button>
                          </form>
                        ) : (
                          <button
                            className="add-book-tag"
                            type="button"
                            onClick={() => {
                              setAddingTagBookId(book.id);
                              setTagDraft("");
                            }}
                            aria-label={`Add tag to ${book.title}`}
                            title="Add tag"
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      className="book-rating"
                      aria-label={
                        book.rating
                          ? `Rated ${book.rating} out of 5`
                          : "Not rated"
                      }
                    >
                      {book.rating ? (
                        <>
                          <Star size={14} fill="currentColor" />
                          <span>{book.rating.toFixed(1)}</span>
                        </>
                      ) : (
                        <span className="unrated">Not rated</span>
                      )}
                    </div>
                    <div className="book-controls">
                      <label className="book-kind-select-wrap">
                        <select
                          value={book.kind ?? "Unclear"}
                          onChange={(event) =>
                            updateBookKind(
                              book.id,
                              event.target.value as BookKind,
                            )
                          }
                          aria-label={`Type for ${book.title}`}
                        >
                          <option value="Unclear">Unclear</option>
                          <option value="Fiction">Fiction</option>
                          <option value="Nonfiction">Nonfiction</option>
                        </select>
                        <ChevronDown size={13} />
                      </label>
                      <label className="category-select-wrap">
                        <select
                          value={book.category}
                          onChange={(event) =>
                            updateCategory(book.id, event.target.value)
                          }
                          aria-label={`Category for ${book.title}`}
                        >
                          <option value={uncategorized}>{uncategorized}</option>
                          {categories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={13} />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <BookOpen size={24} />
                </div>
                <h3>{books.length ? "No matches" : "No books yet"}</h3>
                {books.length ? (
                  <button
                    className="text-button"
                    onClick={() => {
                      setQuery("");
                      setActiveCategory("All books");
                    }}
                  >
                    Clear filters
                  </button>
                ) : (
                  <label htmlFor="goodreads-file" className="import-button">
                    <Upload size={16} /> Choose Goodreads CSV
                  </label>
                )}
              </div>
            )}

            <footer className="list-footer">
              <span>
                {filteredBooks.length} of {books.length} books
              </span>
              <div className="backup-actions">
                <button onClick={exportBackup}>
                  <Download size={14} /> Export backup
                </button>
                <label className="backup-import">
                  <Upload size={14} /> Import backup
                  <input
                    type="file"
                    accept=".json,application/json"
                    aria-label="Import library backup"
                    onChange={(event) => {
                      void importBackup(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </footer>
          </section>
        </main>
      </div>
    </div>
  );
}

export default BooksApp;
