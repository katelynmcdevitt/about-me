# Katelyn McDevitt — About Me & Apps

A local Next.js app using the App Router, React, and TypeScript. The About Me page is the home page at `/`, and `/apps` is the landing page for additional projects.

## Run locally

Use Node.js 22.12 or newer and npm.

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

Search, sorting, categories, personal tags, manual fiction/nonfiction types,
reading-year comparisons, format breakdowns, and Goodreads CSV import are retained.
The supplied Google reading sheet's four tabs sync on opening, every 15 minutes,
and with **Sync sheet**. The Vite-only proxy is replaced by a Next.js endpoint at
`/api/books/google-sheet/<gid>`, which reads only the configured sheet and tabs.
It works in both development and the local production preview. The sheet must
remain readable without authentication; if it is unavailable, the saved library
and CSV import still work. ISBN classification and covers continue to use Open
Library. Font loading is optional, with local fallbacks.

Browser data keeps the original `shelf-notes-*` storage keys. The library stays on
your device; sheet sync reads the source and does not write back to it. Manual
categories, tags, and classifications survive syncs. **Export backup** saves the
library and annotations as JSON; **Import backup** validates a backup and asks
before replacing the current library.

### Bring over existing browser annotations

Storage is specific to the hostname and port. If the old app used a different
address, its saved tags and categories will not automatically appear here. Sheet
sync and Goodreads CSV import can rebuild the book list, but they do not contain
browser-only annotations.

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

Then select **Import backup** at the bottom of the new Shelf Notes page. Export
its current library first if you want to keep it.

`npm test` runs both apps' suites. Books checks cover CSV and sheet parsing,
classification, sync merges, proxy responses, searching, sorting, annotations,
local saves, storage failures, and backup validation. External services are mocked
and React interactions use JSDOM; browser layout and live sheet access are not
covered by these tests.
