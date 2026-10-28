# Katelyn McDevitt — About Me & Apps

A local Next.js app using the App Router, React, and TypeScript. The About Me page is the home page at `/`, and `/apps` is the landing page for additional projects.

## Run locally

Use Node.js 22.13 or newer (24+ recommended) and npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. The server binds to your computer's loopback address. Stop it with Ctrl+C.

```sh
npm test
npm run typecheck
npm run build
npm start
```

`build` creates a production build in `.next/`; `start` serves it locally. None of these commands deploy the project. Keep `.openai/hosting.json` only as identification for the earlier hosted copy.

## Structure

```text
src/
  app/
    layout.tsx              # Root HTML, metadata, and global styles
    globals.css             # Shared typography, colors, and resets
    page.tsx                # About Me at /
    apps/
      page.tsx              # Apps landing page at /apps
      page.module.css
  features/
    about/
      AboutPage.tsx         # Personal details and About Me content
      AboutPage.module.css  # Styles scoped to About Me
public/
  KatelynMcDevittResume.pdf
```

## Bring over another app

1. Create `src/app/apps/<slug>/page.tsx` for its URL, such as `/apps/budget`.
2. Put its components and logic in `src/features/<slug>/`. Shared components can go in `src/components/` as needed.
3. Use CSS Modules (`*.module.css`) to keep each app's styles separate. Add a route `layout.tsx` if the app needs its own navigation or shared UI.
4. Add `"use client"` at the top of components that use hooks, event handlers, or browser APIs. Route pages and layouts are Server Components by default.
5. Move static assets to `public/apps/<slug>/` and reference them with `/apps/<slug>/filename`.
6. Add a `next/link` link to the app in `src/app/apps/page.tsx`.

Existing apps' entry points and routers need adapting to Next.js routes; they should not mount another React root. Add server endpoints under `src/app/api/<slug>/route.ts` when needed. Keep secrets in an untracked `.env.local` file; only values intended for the browser should use `NEXT_PUBLIC_`.

The home page links to the apps landing page. Fonts currently load from Google Fonts, with local fallbacks when unavailable.

## Camp Days

The camp planner lives at `/apps/camp-schedule`. It uses a local Next.js backend
and a separate SQLite file, `data/camp-schedule.sqlite`. Books continues to use
`data/books.sqlite`. Both files and their sidecars are ignored by Git.

Camps, payment status, shared payment links, camper names, handoff thresholds,
and the selected summer are stored by the backend. The supplied 2026 schedule
is seeded once; other summers start empty. Deleted camps do not return after
restarting. Seasons keep independent revisions, camps, and family settings.
No accounts or external database service are required.

Camp edits and payment toggles update the interface after a successful save.
**Family settings → Done** saves camper names and the handoff threshold. In the
weekly view, changing the handoff gap saves when you leave the field or press
Enter. Errors leave editor drafts available and keep committed data unchanged.
Stale edits reload the current season; close and reopen an editor before saving
its draft against the updated plan.

### Migrate existing browser schedules

1. Open the summer you want to transfer.
2. If an old `camp-days-<year>` browser save exists, click **Migrate browser plan**.
3. Confirm replacing that summer's database plan with the browser save. Export
   the current database plan first if you want to keep it.
4. Repeat for each summer. The original browser keys are left intact.

Browser data belongs to its original hostname and port. For saves in the old app
at a different address, select that summer there, **Export backup**, then use
**Import backup** in this app with the same summer selected. Imports validate
real dates, payment links, prices, campers, and settings before replacing a plan
in one transaction. Empty schedules and deleted supplied camps stay deleted.
Older dangling shared-payment links are detached with an unknown cost instead
of recreating a deleted payment owner.

### Back up and restore camp data

The footer's **Export backup** downloads the committed selected summer as JSON;
**Import backup** restores that summer after confirmation. A full database backup
includes all summers and the selected-year preference:

```sh
npm run db:backup:camps
npm run db:backup:camps -- /absolute/path/camps-backup.sqlite
```

Backups use SQLite's online backup API and default to timestamped files in
`backups/`. Set `CAMP_DATABASE_PATH` in the process environment to use another
camp database path; use the same environment for the app and backup command.

To restore SQLite, stop the app, move the current `camp-schedule.sqlite` file and
any `camp-schedule.sqlite-wal` / `camp-schedule.sqlite-shm` sidecars into a safe
backup location, and copy the chosen backup to `data/camp-schedule.sqlite` (or the
configured path). Leave the books database in place. Restart and verify your
summers before deleting the previous files.

### Implementation and checks

- `src/server/camp-schedule/`: SQLite tables, validation, transactional writes,
  season revisions, browser migration, and JSON restoration.
- `src/app/api/camp-schedule/route.ts`: list summers and remember the selection.
- `src/app/api/camp-schedule/[year]/route.ts`: load and mutate a summer.
- `src/features/camp-schedule/usePlanner.ts`: frontend requests, drafts, errors,
  and the existing coverage, payment, and handoff calculations.
- `src/server/http.ts`: shared local-origin and bounded JSON request handling.

`npm test` uses temporary databases and real API handlers to check restart
persistence, season isolation, payments, deletions, backup restoration, browser
migration, failed writes, stale edits, validation, and React interactions.
Tests do not write to either real database. `npm run build` validates production
compilation and TypeScript. Browser layout is not covered by JSDOM tests.

## Shelf Notes (Books)

The reading library lives at `/apps/books` and is linked from `/apps`. Its React
UI and CSV/import logic live in `src/features/books/`. The original neighboring
`books` repo is unchanged.

Shelf Notes now uses a local Next.js backend and SQLite database. The library starts
empty; no sample data is inserted. Search, sorting, categories, tags, manual book
types, reading-year comparisons, and format breakdowns remain in the interface.
Camp Days has its own database and backend, described above.

### Import your reading log

1. Choose **Goodreads** or **Google Sheets** in **CSV source**.
2. Click **Import CSV** and choose a file (up to 4 MB and 20,000 records).
3. Review the counts and row results. Previewing does not change your library.
4. Click **Confirm import** to save the accepted readings in one transaction.

Goodreads imports require Title/Author columns and a read shelf/status. Google
Sheets imports accept Title/Author headers (with optional Format, Nonfiction?,
Rating, and Date Read columns), or the month-heading layout from your original
reading sheet. Download a Google Sheets tab as CSV; import each tab separately.
Finish dates accept YYYY-MM-DD, YYYY/MM/DD, or a year/month. Invalid rows are
shown in the preview and skipped. Uncertain matches need an explicit choice before
confirmation. Results are paginated in groups of 50 so every row can be reached;
counts include the entire file. Previews expire after a day and must be recreated
if the library changes before confirmation.

Imports match by Goodreads ID or ISBN, then normalized title and author. Conflicting
identifiers or ambiguous undated rereads need review. The same book and finish
date updates the existing reading; a different date adds a reread. Reimporting
retains existing tags, categories, and manual classifications and does not delete
books omitted from the file. Imports are recorded in the history below the library.
Two separate readings on exactly the same finish date cannot yet be distinguished.
Automatic Google Sheets sync and automatic classification lookups are not part of
this version. Open Library cover images still load when ISBNs are available.

### Reading formats

The **Audio, physical & Kindle** charts use each reading's format, separately from
its category. CSV imports prefer a recognized Form/Format/Type/Medium value, then
infer a format from unambiguous category or shelf labels such as audio, audiobook,
physical, paperback, Kindle, and ebook. Conflicting labels remain Unclear; provider
labels Everand, Libby, and Audible count as Audio for this library.

Database version 2 performs this inference once for existing unclear formats.
Categories, tags, ratings, and other details are preserved, and known format
choices take precedence. Later manual edits are not re-inferred on every restart.
Database version 3 applies the requested Everand/Libby/Audible → Audio category
mapping once, including existing Kindle entries with those categories. Category
names remain intact. Later explicit format edits remain possible and are not
reapplied on every restart. You can set **Reading format** in Book details.

### Finish setting reading formats

Choose **Needs reading format** in the left navigation. It lists readings whose
format is still Unclear, with **Audio**, **Physical**, and **Kindle** buttons. A
reading leaves the queue only after its choice is saved to the database. Failed
saves leave it available to retry. The navigation count updates as you work, and
a completion message appears when no formats are missing. This queue covers the
whole library and supports search and sorting.

### Explore a reading year

Choose **Yearly reading** in the left navigation and select a year. The dashboard
shows books finished, known pages read, average rating, monthly finish counts, and
an Audio/Physical/Kindle/Unclear breakdown. Each reread counts as a separate finish.
Month-only finish dates count in the corresponding month. Readings without finish
dates are excluded from yearly totals, and unrated books are excluded from the
average. Missing page counts are reported separately; pages total known page
counts for finished readings, including rereads and audiobook editions.

The format breakdown includes Unclear entries and percentages sum to 100 for a
nonempty year. A shortcut opens **Needs reading format** for the whole library.
Year selection shares the existing comparison-year choice in the library views.
Statistics are computed from the current database-backed library and update after
edits. No data is written just by viewing the dashboard.

### Resolve uncertain import matches

When the preview contains uncertain rows, it initially shows those rows. For each
one, compare the incoming author, ISBN, and finish date with your library, then:

- **Match book:** choose an existing book/reading, then click **Match book**. Your
  book's identifiers, tags, categories, and manual classification are kept. A
  different finish date adds a reread. If the imported date is unknown and the
  book has multiple readings, choose the reading to update.
- **Separate book / edition:** add the row as a distinct book. Any ISBN or Goodreads
  ID already assigned to another book is left blank on the new book; the preview
  explicitly lists which identifiers will be omitted. You can correct them later
  in Book details.
- **Skip:** leave this row out of the import.

Choices recalculate the preview and counts without changing your library. Use
**Undo choice** or choose another action to revise a decision. **Show all import
rows** lets you check the rest of the file, and **Previous rows / Next rows** makes
all results reachable. Confirm import is enabled only after every uncertain row
has a choice. An import containing only explicitly skipped rows can be confirmed
and recorded in history without adding books. Choices apply to that import;
future files are matched afresh and may need review again.

Draft versions and library revisions are checked when updating choices and when
confirming, so an outdated preview cannot overwrite newer decisions or edits.
Cancelling never applies your proposed library changes.

### Edit book details and record rereads

Click a book's title to open **Book details**. You can correct its title, author,
ISBN, publication year, and page count, and update the selected reading's rating,
finish date, format, classification, category, and tags. Categories can be typed
or chosen from suggestions; tags are separated with commas. A rating of zero is
unrated. Finish dates accept a full date, a year/month, or blank when unknown.

Book information is shared across that book's readings. Ratings, dates, formats,
categories, tags, and classifications are saved per reading. Existing nonempty
publication years and page counts are retained on subsequent CSV imports.

Select **Record a reread** from an unchanged details panel, enter a distinct
finish date, and select **Save reread**. Earlier readings stay intact. Save your
pending edits before recording a reread. Duplicate finish dates and ISBNs already
assigned to another book are rejected without changing the database.

Save failures leave your draft open. Cancelling changed details asks before
discarding them. If another tab edits the library, close and reopen the panel to
review the latest details before saving; stale changes are not applied.

### Database and backend

The database is created on the first library request at `data/books.sqlite`.
Set `BOOKS_DATABASE_PATH` in the process environment to use a different file. That
path must stay the same across restarts. No separate database service or new
package is needed: this uses Node's built-in `node:sqlite` module. Node 22 may print
an experimental SQLite warning.

- `src/server/books/store.ts`: schema initialization/versioning, transactions,
  matching, import drafts, confirmation, and annotation edits.
- `src/server/books/import-file.ts`: CSV and legacy backup validation.
- `src/app/api/books/library/route.ts`: load the library and save edits.
- `src/app/api/books/imports/route.ts`: prepare an import preview.
- `src/app/api/books/imports/[id]/route.ts`: resolve an uncertain row and update the preview.
- `src/app/api/books/imports/[id]/confirm/route.ts`: commit a preview.
- `src/features/books/useLibrary.ts`: frontend requests and save/error states.

Tables separate books, reading entries, categories, tags, tag assignments, import
history, and temporary import plans. Raw CSV files are not retained. Normalized
preview data stays in SQLite for up to a day and is removed on confirmation or
when a subsequent preview cleans up expired drafts. IDs, SQL parameters, database
constraints, request size limits, and revision checks protect data integrity.
Edits appear only after the backend confirms a save. Failed requests show errors;
stale edits refresh the library instead of silently overwriting newer changes.

The database, SQLite sidecars, and backups are ignored by Git and live outside
`public/` and `.next/`. Keep the server bound to `127.0.0.1` as provided by the
scripts. This first version is a single local library without accounts.

### Back up and restore

**Export backup** downloads your committed library, categories, and tags as JSON.
**Import backup** previews and merges such a file, using the same confirmation
flow as CSV. It does not replace or delete existing readings.

For a complete SQLite backup, including import history, run:

```sh
npm run db:backup
# Or choose a new destination:
npm run db:backup -- /absolute/path/books-backup.sqlite
```

The default destination is a timestamped file under `backups/`. The command uses
SQLite's online backup API, so it also captures committed data when the app is
running in WAL mode. It refuses to overwrite an existing backup file.

To restore a full books database backup, stop the dev/preview server, move only
`books.sqlite` and any `books.sqlite-wal` / `books.sqlite-shm` sidecars to a safe
backup location, and copy the chosen backup to `data/books.sqlite`. Leave the
camp database in place. Then restart the app. If using `BOOKS_DATABASE_PATH`,
restore to that path instead. Keep the previous files until you've checked the
restored library.

See the [Node SQLite documentation](https://nodejs.org/api/sqlite.html) and
[Next.js route handler documentation](https://nextjs.org/docs/app/getting-started/route-handlers)
for the underlying APIs.

### Bring over existing browser annotations

When this app finds a non-demo library in the old `shelf-notes-*` browser keys,
select **Preview browser migration**, review the entries, then confirm. The old
browser data is left intact. Once confirmed, the backend database is authoritative
and is shared between browsers using this local server.

Browser storage is specific to the hostname and port. If the old app used a
different address, its saved tags and categories will not automatically appear
here. Goodreads CSV imports do not contain browser-only annotations.

To transfer those annotations, open the original books app and run this snippet
in that page's browser developer console. It downloads a backup without changing
the original library:

```js
const backup = {
  version: 1,
  books: JSON.parse(localStorage.getItem("shelf-notes-books") || "[]"),
  categories: JSON.parse(
    localStorage.getItem("shelf-notes-categories") || "[]",
  ),
  isDemo: localStorage.getItem("shelf-notes-demo") !== "false",
  lastSyncedAt: localStorage.getItem("shelf-notes-sheet-last-sync") || "",
};
const backupUrl = URL.createObjectURL(
  new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  }),
);
const download = document.createElement("a");
download.href = backupUrl;
download.download = "shelf-notes-backup.json";
download.click();
setTimeout(() => URL.revokeObjectURL(backupUrl), 1000);
```

Then select **Import backup** at the bottom of the new Shelf Notes page, review
the preview, and confirm. Sample/demo backups are rejected to keep sample books
out of your database.

`npm test` runs both apps' suites. Books tests use temporary SQLite files and the
actual API handlers to check imports, rereads, duplicate matching, annotation
preservation, stale revisions, invalid requests, transaction rollback, restart
persistence, SQLite backups, and React import/edit/migration flows. Tests do not
write into your real database. React interactions use JSDOM; browser layout is
not covered by those tests.
