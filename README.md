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

The summer camp planner lives at `/apps/camp-schedule` and is linked from `/apps`.
Its React components, typed planning logic, and supplied 2026 schedules live in
`src/features/camp-schedule/`. The original neighboring `camp-schedule` repo is unchanged.

The port keeps the monthly and weekly calendars, camper filters, care coverage,
missing-week navigation, camp editing, handoff alerts, payments, family settings,
year selection, and JSON backups. Data continues to save locally under the
original `camp-days-<year>` and `camp-days-selected-year` storage keys.

### Bring over browser edits

Browser storage belongs to an origin (hostname and port). Saves on the old Vite
address will not automatically appear at the new Next.js address.

1. In the original app, select the summer and click **Export backup**.
2. Open `/apps/camp-schedule` here and select the same summer.
3. Click **Import backup**, choose that JSON file, and confirm replacing that
   summer's local plan. Export the current plan first if you want to keep it.
4. Repeat for each summer you want to transfer.

Import validates the backup before replacing anything. Existing exported backups
are supported, including deleted supplied camps and shared payment links.
No data is uploaded to a server. If both apps use exactly the same origin, their
compatible storage keys let the new app read the existing saves directly.

`npm test` checks the real React screens and state, supplied payment totals,
shared payments, handoffs, coverage, camp editing, season persistence, legacy
saves, storage failures, and backup import. These tests use JSDOM; they do not
verify browser layout. `npm run build` checks production compilation and types.

## Shelf Notes (Books)

The reading library lives at `/apps/books` and is linked from `/apps`. Its React
UI and CSV/import logic live in `src/features/books/`. The original neighboring
`books` repo is unchanged.

Shelf Notes now uses a local Next.js backend and SQLite database. The library starts
empty; no sample data is inserted. Search, sorting, categories, tags, manual book
types, reading-year comparisons, and format breakdowns remain in the interface.
Camp Days still uses its existing browser storage.

### Import your reading log

1. Choose **Goodreads** or **Google Sheets** in **CSV source**.
2. Click **Import CSV** and choose a file (up to 4 MB and 20,000 records).
3. Review the counts and row results. Previewing does not change your library.
4. Click **Confirm import** to save the accepted readings in one transaction.

Goodreads imports require Title/Author columns and a read shelf/status. Google
Sheets imports accept Title/Author headers (with optional Format, Nonfiction?,
Rating, and Date Read columns), or the month-heading layout from your original
reading sheet. Download a Google Sheets tab as CSV; import each tab separately.
Finish dates accept YYYY-MM-DD, YYYY/MM/DD, or a year/month. Invalid rows and
ambiguous matches are shown in the preview and not imported. The first 100 row
results are displayed; counts include the entire file. Previews expire after a
day and must be recreated if the library changes before confirmation.

Imports match by Goodreads ID or ISBN, then normalized title and author. Conflicting
identifiers or ambiguous undated rereads need review. The same book and finish
date updates the existing reading; a different date adds a reread. Reimporting
retains existing tags, categories, and manual classifications and does not delete
books omitted from the file. Imports are recorded in the history below the library.
Two separate readings on exactly the same finish date cannot yet be distinguished.
Automatic Google Sheets sync and automatic classification lookups are not part of
this version. Open Library cover images still load when ISBNs are available.

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

To restore a full database backup, stop the dev/preview server, move the current
`data/` directory to a safe backup location (including any `-wal`/`-shm` sidecars),
create a fresh `data/` directory, and copy the chosen backup to `data/books.sqlite`.
Then restart the app. If using `BOOKS_DATABASE_PATH`, restore to that path instead.
Keep the previous directory until you've checked the restored library.

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
