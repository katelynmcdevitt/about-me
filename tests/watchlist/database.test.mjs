import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadFile } from "../helpers/load-module.mjs";
const { WatchlistStore } = await loadFile(new URL("../../src/server/watchlist/store.ts", import.meta.url));
const entry = (id, title) => ({ id, title, kind: "Movie", status: "Want to watch", where: "", notes: "" });
test("database survives reopen, preserves edits, rejects stale changes and prevents migration resurrection", () => {
  const dir = mkdtempSync(join(tmpdir(), "watchlist-db-")); const file = join(dir, "watchlist.sqlite"); let store;
  try {
    store = new WatchlistStore(file);
    store.apply({ action: "add", entry: entry("1", "Database title"), revision: 0 });
    const old = [entry("1", "Old title"), entry("2", "Browser title")];
    store.apply({ action: "migrate", entries: old, revision: 1 });
    assert.equal(store.get().entries.find((e) => e.id === "1").title, "Database title");
    store.apply({ action: "edit", entry: { ...entry("2", "Browser title"), status: "Watched" }, revision: 2 });
    assert.throws(() => store.apply({ action: "delete", id: "1", revision: 2 }), /changed in another tab/);
    store.apply({ action: "delete", id: "1", revision: 3 }); store.close();
    store = new WatchlistStore(file); assert.equal(store.get().entries[0].status, "Watched");
    store.apply({ action: "migrate", entries: old, revision: 4 });
    assert.deepEqual(store.get().entries.map((e) => e.id), ["2"]);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("invalid migration is atomic and rejects invalid cover URLs", () => {
  const store = new WatchlistStore(":memory:");
  try {
    assert.throws(() => store.apply({ action: "migrate", entries: [entry("1", "Valid"), { ...entry("2", "Invalid"), cover: { url: "https://evil.example/image", sourceUrl: "https://evil.example" } }], revision: 0 }), /Invalid cover/);
    assert.deepEqual(store.get(), { entries: [], revision: 0, migrated: false });
  } finally { store.close(); }
});
test("library API saves through local origin and rejects foreign-origin or stale writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "watchlist-api-"));
  process.env.WATCHLIST_DATABASE_PATH = join(dir, "library.sqlite");
  try {
    const api = await loadFile(new URL("../../src/app/api/watchlist/library/route.ts", import.meta.url));
    const request = (payload, origin = "http://127.0.0.1:3000") => new Request("http://127.0.0.1:3000/api/watchlist/library", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(payload) });
    assert.equal((await api.GET()).status, 200);
    assert.equal((await api.POST(request({ action: "add", entry: entry("1", "A title"), revision: 0 }, "https://other.example"))).status, 403);
    assert.equal((await api.POST(request({ action: "add", entry: entry("1", "A title"), revision: 0 }))).status, 200);
    assert.equal((await api.POST(request({ action: "delete", id: "1", revision: 0 }))).status, 409);
    assert.equal((await (await api.GET()).json()).entries.length, 1);
  } finally {
    const stores = globalThis.watchlistStores; stores?.get(process.env.WATCHLIST_DATABASE_PATH)?.close(); stores?.delete(process.env.WATCHLIST_DATABASE_PATH);
    delete process.env.WATCHLIST_DATABASE_PATH; rmSync(dir, { recursive: true, force: true });
  }
});


test("rejected duplicate and missing edits leave the revision and entries intact", () => {
  const store = new WatchlistStore(":memory:");
  try {
    store.apply({ action: "add", entry: entry("1", "Original"), revision: 0 });
    const before = store.get();
    assert.throws(() => store.apply({ action: "add", entry: entry("1", "Duplicate"), revision: 1 }), /already exists/);
    assert.throws(() => store.apply({ action: "edit", entry: entry("missing", "Missing"), revision: 1 }), /no longer exists/);
    assert.throws(() => store.apply({ action: "delete", id: "missing", revision: 1 }), /no longer exists/);
    assert.deepEqual(store.get(), before);
  } finally { store.close(); }
});

test("online backup captures committed WAL data and refuses to overwrite a backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "watchlist-backup-"));
  const file = join(dir, "source.sqlite");
  const destination = join(dir, "backup.sqlite");
  const source = new WatchlistStore(file);
  let restored;
  try {
    source.apply({ action: "add", entry: entry("1", "Saved in WAL"), revision: 0 });
    const script = fileURLToPath(new URL("../../scripts/backup-watchlist.mjs", import.meta.url));
    const run = () => spawnSync(process.execPath, [script, destination], { env: { ...process.env, WATCHLIST_DATABASE_PATH: file }, encoding: "utf8" });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    restored = new WatchlistStore(destination);
    assert.equal(restored.get().entries[0].title, "Saved in WAL");
    restored.close(); restored = undefined;
    source.apply({ action: "add", entry: entry("2", "Later title"), revision: 1 });
    const second = run();
    assert.notEqual(second.status, 0);
    restored = new WatchlistStore(destination);
    assert.deepEqual(restored.get().entries.map((e) => e.id), ["1"]);
  } finally { restored?.close(); source.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("labels and TMDB cover metadata survive edits while invalid values leave the database unchanged", () => {
  const store = new WatchlistStore(":memory:");
  try {
    const cover = { url: "https://image.tmdb.org/t/p/w500/poster.jpg", sourceUrl: "https://www.themoviedb.org/movie/42" };
    store.apply({ action: "add", entry: { ...entry("1", "Movie"), label: "  For Owen  ", cover }, revision: 0 });
    assert.equal(store.get().entries[0].label, "For Owen");
    assert.deepEqual(store.get().entries[0].cover, cover);
    const before = store.get();
    assert.throws(() => store.apply({ action: "edit", entry: { ...before.entries[0], label: "x".repeat(81) }, revision: 1 }), /Invalid label/);
    assert.throws(() => store.apply({ action: "edit", entry: { ...before.entries[0], cover: { ...cover, url: "https://image.tmdb.org.evil.example/poster.jpg" } }, revision: 1 }), /Invalid cover/);
    assert.deepEqual(store.get(), before);
  } finally { store.close(); }
});

test("stores only valid TMDB links matching the title type", () => {
  const db = new WatchlistStore(":memory:");
  try {
    const added = db.apply({ action: "add", revision: 0, entry: { ...entry("1", "Beaches"), tmdbUrl: "https://www.themoviedb.org/movie/430642-beaches?tracking=ignored" } });
    assert.equal(added.entries[0].tmdbUrl, "https://www.themoviedb.org/movie/430642");
    for (const link of ["https://evil.example/movie/430642", "https://www.themoviedb.org/tv/430642", "http://www.themoviedb.org/movie/430642"]) {
      assert.throws(() => db.apply({ action: "edit", revision: 1, entry: { ...added.entries[0], tmdbUrl: link } }), /valid TMDB link/);
    }
    assert.equal(db.get().revision, 1);
  } finally { db.close(); }
});
