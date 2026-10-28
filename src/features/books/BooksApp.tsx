"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  Download,
  BookOpen,
  ListFilter,
  Headphones,
  BarChart3,
  Check,
  ChevronDown,
  Library,
  Plus,
  Search,
  Star,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import styles from "./BooksApp.module.css";
import {
  uncategorized,
  bookMix,
  formatMix,
  mixPercent,
  formatFinishedDate,
  STORAGE_KEY,
  CATEGORIES_KEY,
  DEMO_KEY,
  readStorage,
} from "./model";
import type { Book, BookKind } from "./model";
import type { ImportSource } from "./contracts";
import { useLibrary } from "./useLibrary";
import ImportPreviewDialog from "./ImportPreviewDialog";
import BookDetailsDialog from "./BookDetailsDialog";
import YearlyDashboard from "./YearlyDashboard";
import { needsReadingFormat } from "./readingStats";

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
  const db = useLibrary();
  const { books, categories: customCategories, imports } = db.library;
  const [importSource, setImportSource] = useState<"goodreads" | "sheets">(
    "goodreads",
  );
  const [legacyBackup, setLegacyBackup] = useState<unknown>(() => {
    try {
      const stored = readStorage(STORAGE_KEY);
      return stored && readStorage(DEMO_KEY) === "false"
        ? {
            version: 1,
            books: JSON.parse(stored),
            categories: JSON.parse(readStorage(CATEGORIES_KEY) || "[]"),
            isDemo: false,
            lastSyncedAt: "",
          }
        : null;
    } catch {
      return null;
    }
  });
  const [libraryView, setLibraryView] = useState<
    "all" | "unclassified" | "formats" | "yearly"
  >("all");
  const needsClassification = libraryView === "unclassified";
  const needsFormat = libraryView === "formats";
  const isQueue = needsClassification || needsFormat;
  const missingFormatCount = books.filter(needsReadingFormat).length;
  const unclassifiedCount = books.filter(
    (book) => !book.kind || book.kind === "Unclear",
  ).length;
  const queueComplete =
    books.length > 0 &&
    (needsClassification
      ? unclassifiedCount === 0
      : needsFormat && missingFormatCount === 0);
  const [activeCategory, setActiveCategory] = useState("All books");
  const [selectedBook, setSelectedBook] = useState<{
    book: Book;
    revision: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [notice, setNotice] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [addingTagBookId, setAddingTagBookId] = useState("");
  const [selectedReadingYear, setSelectedReadingYear] = useState("");
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
        (book) => !needsClassification || !book.kind || book.kind === "Unclear",
      )
      .filter((book) => !needsFormat || needsReadingFormat(book))
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
  }, [activeCategory, books, query, sortBy, needsClassification, needsFormat]);

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
    void db.saveEntry(id, { category });
  }
  function updateBookKind(id: string, kind: BookKind) {
    void db.saveEntry(id, { kind });
  }
  async function addTag(event: React.FormEvent<HTMLFormElement>, book: Book) {
    event.preventDefault();
    const tag = tagDraft.trim();
    if (!tag) return;
    if (
      await db.saveEntry(book.id, {
        tags: [
          ...new Map(
            [...book.tags, tag].map((value) => [value.toLowerCase(), value]),
          ).values(),
        ],
      })
    ) {
      setTagDraft("");
      setAddingTagBookId("");
    }
  }
  function removeTag(bookId: string, tagToRemove: string) {
    const book = books.find((book) => book.id === bookId);
    if (book)
      void db.saveEntry(bookId, {
        tags: book.tags.filter((tag) => tag !== tagToRemove),
      });
  }
  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = categoryDraft.trim();
    if (!category) return;
    if (await db.addCategory(category)) {
      setLibraryView("all");
      setActiveCategory(category);
      setCategoryDraft("");
      setIsAddingCategory(false);
    }
  }
  async function importFile(file: File | undefined, source: ImportSource) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      db.setError("Choose a file smaller than 4 MB.");
      return;
    }
    try {
      const text = await file.text();
      await db.previewInput({
        source,
        filename: file.name,
        ...(source === "backup" ? { backup: JSON.parse(text) } : { csv: text }),
      });
    } catch {
      db.setError(
        "The file could not be read. Choose a CSV or valid JSON backup.",
      );
    }
  }
  async function confirmImport() {
    const isMigration = db.preview?.source === "browser";
    if (await db.confirmImport()) {
      if (isMigration) setLegacyBackup(null);
      setLibraryView("all");
      setActiveCategory("All books");
      setQuery("");
      setNotice("Import saved to your library.");
    }
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
              isDemo: false,
              lastSyncedAt: "",
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

  const categoryCount = (category: string) =>
    books.filter((book) => book.category === category).length;

  return (
    <div className={styles.root} aria-busy={db.busy || !db.loaded}>
      {!db.loaded && !db.error && (
        <p className="library-status" role="status">
          Loading your library…
        </p>
      )}
      {db.error && (
        <div className="library-error" role="alert">
          {db.error}{" "}
          {!db.loaded && (
            <button onClick={() => window.location.reload()}>Retry</button>
          )}
        </div>
      )}
      <fieldset className="app-shell" disabled={db.busy || !db.loaded}>
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
          <nav className="library-nav" aria-label="Library views">
            <button
              className={`side-link ${libraryView === "all" && activeCategory === "All books" ? "active" : ""}`}
              aria-current={
                libraryView === "all" && activeCategory === "All books"
                  ? "page"
                  : undefined
              }
              onClick={() => {
                setLibraryView("all");
                setActiveCategory("All books");
              }}
            >
              <Library size={17} /> <span>All books</span>
              <span className="side-count">{books.length}</span>
            </button>
            <button
              className={`side-link ${needsClassification ? "active" : ""}`}
              aria-current={needsClassification ? "page" : undefined}
              onClick={() => {
                setLibraryView("unclassified");
                setActiveCategory("All books");
                setQuery("");
              }}
            >
              <ListFilter size={17} /> <span>Needs classification</span>
              <span className="side-count">{unclassifiedCount}</span>
            </button>
            <button
              className={`side-link ${needsFormat ? "active" : ""}`}
              aria-current={needsFormat ? "page" : undefined}
              onClick={() => {
                setLibraryView("formats");
                setActiveCategory("All books");
                setQuery("");
              }}
            >
              <Headphones size={17} />
              <span>Needs reading format</span>
              <span className="side-count">{missingFormatCount}</span>
            </button>
            <button
              className={`side-link ${libraryView === "yearly" ? "active" : ""}`}
              aria-current={libraryView === "yearly" ? "page" : undefined}
              onClick={() => {
                setLibraryView("yearly");
                setQuery("");
              }}
            >
              <BarChart3 size={17} />
              <span>Yearly reading</span>
            </button>
          </nav>

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
                className={`side-link ${libraryView === "all" && activeCategory === category ? "active" : ""}`}
                onClick={() => {
                  setLibraryView("all");
                  setActiveCategory(category);
                }}
              >
                <span className={`category-dot dot-${index % 6}`} />
                <span className="category-name">{category}</span>
                <span className="side-count">{categoryCount(category)}</span>
              </button>
            ))}
            {books.some((book) => book.category === uncategorized) && (
              <button
                className={`side-link ${libraryView === "all" && activeCategory === uncategorized ? "active" : ""}`}
                onClick={() => {
                  setLibraryView("all");
                  setActiveCategory(uncategorized);
                }}
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
              <span className="sync-status">
                {db.busy ? "Saving…" : "Saved locally"}
              </span>
              <label className="import-source">
                CSV source
                <select
                  aria-label="CSV source"
                  value={importSource}
                  onChange={(event) =>
                    setImportSource(
                      event.target.value as "goodreads" | "sheets",
                    )
                  }
                >
                  <option value="goodreads">Goodreads</option>
                  <option value="sheets">Google Sheets</option>
                </select>
              </label>
              <label htmlFor="goodreads-file" className="import-button">
                <Upload size={16} /> Import CSV
              </label>
              <input
                id="goodreads-file"
                className="file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  void importFile(event.target.files?.[0], importSource);
                  event.target.value = "";
                }}
              />
            </div>
          </header>

          <section className="page-intro">
            <div>
              <h1>
                {libraryView === "yearly"
                  ? "Your reading year"
                  : "Your library"}
              </h1>
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

          {legacyBackup !== null &&
            !imports.some((item) => item.source === "browser") && (
              <div className="notice">
                <span>
                  You have a library saved in this browser. Bring its books,
                  tags, and categories into the database.
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    void db.previewInput({
                      source: "browser",
                      filename: "Browser library",
                      backup: legacyBackup,
                    });
                  }}
                >
                  Preview browser migration
                </button>
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

          {libraryView === "yearly" ? (
            <YearlyDashboard
              books={books}
              year={readingYear}
              years={readingYears}
              onChangeYear={setSelectedReadingYear}
              onViewFormats={() => {
                setLibraryView("formats");
                setActiveCategory("All books");
                setQuery("");
              }}
            />
          ) : (
            <>
              {!isQueue && (
                <>
                  <section
                    className="stats-row"
                    aria-label="Library statistics"
                  >
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

                  <section
                    className="reading-mix"
                    aria-labelledby="reading-mix-title"
                  >
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
                        {
                          label: "Overall",
                          mix: overallMix,
                          total: books.length,
                        },
                        {
                          label: readingYear || "Selected year",
                          mix: yearlyMix,
                          total: books.filter((book) =>
                            book.dateRead.startsWith(readingYear),
                          ).length,
                        },
                      ].map(({ label, mix, total }) => {
                        const classified = mix.fiction + mix.nonfiction;
                        const fictionPercent = mixPercent(
                          mix.fiction,
                          classified,
                        );
                        const nonfictionPercent = classified
                          ? 100 - fictionPercent
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
                                    Nonfiction{" "}
                                    <strong>{nonfictionPercent}%</strong>
                                  </span>
                                </>
                              ) : (
                                <span>No classified books</span>
                              )}
                              <span className="mix-unclear">
                                {mix.unclear} unclear
                              </span>
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
                      <h2 id="format-mix-title">
                        Audio, physical &amp; Kindle
                      </h2>
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
                        const classified =
                          mix.audio + mix.physical + mix.kindle;
                        const audioPercent = mixPercent(mix.audio, classified);
                        const physicalPercent = mixPercent(
                          mix.physical,
                          classified,
                        );
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
                              <span className="mix-unclear">
                                {mix.unclear} unclear
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </>
              )}
              <section className="collection-section">
                <div className="collection-heading">
                  <div>
                    <h2>
                      {needsClassification
                        ? "Needs classification"
                        : needsFormat
                          ? "Needs reading format"
                          : activeCategory}
                      <span className="heading-count">
                        {filteredBooks.length}
                      </span>
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

                {needsClassification && (
                  <p className="classification-help">
                    Choose Fiction or Nonfiction for each book. Books leave this
                    list once your choice is saved.
                  </p>
                )}
                {needsFormat && (
                  <p className="classification-help">
                    Choose Audio, Physical, or Kindle for each book. Books leave
                    this list once the format is saved.
                  </p>
                )}
                {filteredBooks.length ? (
                  <div className="book-list">
                    {filteredBooks.map((book, index) => (
                      <article className="book-row" key={book.id}>
                        <BookCover key={book.isbn} book={book} index={index} />
                        <div className="book-info">
                          <h3>
                            <button
                              className="book-title-button"
                              type="button"
                              title="Edit book details"
                              onClick={() => {
                                db.setError("");
                                setSelectedBook({
                                  book,
                                  revision: db.library.revision,
                                });
                              }}
                            >
                              {book.title}
                            </button>
                          </h3>
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
                        <div
                          className={`book-controls ${isQueue ? "classification-controls" : ""}`}
                        >
                          {needsFormat ? (
                            <div
                              className="classification-buttons"
                              role="group"
                              aria-label={`Reading format for ${book.title}`}
                            >
                              {(["Audio", "Physical", "Kindle"] as const).map(
                                (format) => (
                                  <button
                                    key={format}
                                    type="button"
                                    aria-label={`Mark ${book.title} as ${format.toLowerCase()}`}
                                    onClick={() => {
                                      void db.saveEntry(book.id, { format });
                                    }}
                                  >
                                    {format}
                                  </button>
                                ),
                              )}
                            </div>
                          ) : needsClassification ? (
                            <div
                              className="classification-buttons"
                              role="group"
                              aria-label={`Classify ${book.title}`}
                            >
                              <button
                                type="button"
                                aria-label={`Mark ${book.title} as fiction`}
                                onClick={() =>
                                  updateBookKind(book.id, "Fiction")
                                }
                              >
                                Fiction
                              </button>
                              <button
                                type="button"
                                aria-label={`Mark ${book.title} as nonfiction`}
                                onClick={() =>
                                  updateBookKind(book.id, "Nonfiction")
                                }
                              >
                                Nonfiction
                              </button>
                            </div>
                          ) : (
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
                          )}
                          <label className="category-select-wrap">
                            <select
                              value={book.category}
                              onChange={(event) =>
                                updateCategory(book.id, event.target.value)
                              }
                              aria-label={`Category for ${book.title}`}
                            >
                              <option value={uncategorized}>
                                {uncategorized}
                              </option>
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
                    <h3>
                      {queueComplete
                        ? needsFormat
                          ? "All reading formats set"
                          : "All books classified"
                        : books.length
                          ? "No matches"
                          : "No books yet"}
                    </h3>
                    {queueComplete ? (
                      <>
                        <p>
                          {needsFormat
                            ? "Every book has an Audio, Physical, or Kindle format."
                            : "Every book is marked as fiction or nonfiction."}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setLibraryView("all");
                            setActiveCategory("All books");
                            setQuery("");
                          }}
                        >
                          View all books
                        </button>
                      </>
                    ) : books.length ? (
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
                          void importFile(event.target.files?.[0], "backup");
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </footer>
              </section>
            </>
          )}
          {libraryView !== "yearly" && imports.length > 0 && (
            <section className="import-history" aria-label="Import history">
              <h2>Recent imports</h2>
              <ul>
                {imports.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <strong>{item.filename}</strong> ·{" "}
                    {new Date(item.createdAt).toLocaleDateString()} ·{" "}
                    {item.summary.added} added, {item.summary.updated} updated,{" "}
                    {item.summary.unchanged} unchanged,{" "}
                    {item.summary.skipped + item.summary.ambiguous} not imported
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </fieldset>
      {selectedBook && (
        <BookDetailsDialog
          book={selectedBook.book}
          categories={categories}
          busy={db.busy}
          error={db.error}
          onClose={() => {
            setSelectedBook(null);
            db.setError("");
          }}
          onSave={(changes) =>
            db.saveEntry(selectedBook.book.id, changes, selectedBook.revision)
          }
          onAddReading={(changes) =>
            db.addReading(selectedBook.book.id, changes, selectedBook.revision)
          }
        />
      )}
      {db.preview && (
        <ImportPreviewDialog
          preview={db.preview}
          books={books}
          onResolve={(decision) => {
            void db.resolveImport(decision);
          }}
          busy={db.busy}
          error={db.error}
          onClose={() => db.setPreview(null)}
          onConfirm={() => {
            void confirmImport();
          }}
        />
      )}
    </div>
  );
}

export default BooksApp;
