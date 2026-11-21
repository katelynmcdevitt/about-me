import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { loadFile } from "../helpers/load-module.mjs";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { render, fireEvent, screen, within, waitFor, cleanup } = await import("@testing-library/react");
const { createElement } = await import("react");
const { default: Watchlist } = await loadFile(new URL("../../src/features/watchlist/Watchlist.tsx", import.meta.url));
const { WatchlistStore } = await loadFile(new URL("../../src/server/watchlist/store.ts", import.meta.url));
const originalFetch = globalThis.fetch;
let store, coverResponse, availabilityResponse, failSave;
const entry = (id, title, kind = "Movie", status = "Want to watch") => ({ id, title, kind, status, where: "", notes: "" });
beforeEach(() => {
  store = new WatchlistStore(":memory:"); coverResponse = null; availabilityResponse = null; failSave = false;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("/api/watchlist/availability")) return Response.json({ where: availabilityResponse });
    if (String(url).startsWith("/api/watchlist/cover")) {
      if (coverResponse instanceof Error) throw coverResponse;
      return Response.json({ cover: coverResponse });
    }
    if (String(url) === "/api/watchlist/library") {
      if (!options.method) return Response.json(store.get());
      if (failSave) return Response.json({ error: "Your changes could not be saved. Please try again." }, { status: 500 });
      try { return Response.json(store.apply(JSON.parse(options.body))); }
      catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
    }
    throw Error(`Unexpected request: ${url}`);
  };
});
afterEach(() => { cleanup(); localStorage.clear(); store.close(); globalThis.fetch = originalFetch; });
async function openForm() { await waitFor(() => assert.equal(screen.getByRole("button", { name: /add a title/i }).disabled, false)); fireEvent.click(screen.getByRole("button", { name: /add a title/i })); return within(screen.getByRole("dialog")); }
function seed(entries) { let rev = store.get().revision; for (const item of entries) { store.apply({ action: "add", entry: item, revision: rev }); rev++; } }

test("adding a title saves its cover and details to the database and survives reload", async () => {
  coverResponse = { url: "https://static.tvmaze.com/poster.jpg", sourceUrl: "https://www.tvmaze.com/shows/1" };
  const view = render(createElement(Watchlist)); const form = await openForm();
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "  A Show  " } });
  fireEvent.change(form.getByLabelText("Type"), { target: { value: "TV show" } });
  fireEvent.change(form.getByLabelText(/Where to watch/), { target: { value: " Streamer " } });
  fireEvent.change(form.getByLabelText(/Notes/), { target: { value: " Recommended " } });
  fireEvent.click(form.getByRole("button", { name: /add title/i }));
  await screen.findByRole("heading", { name: "A Show" });
  assert.equal(store.get().entries[0].where, "Streamer"); assert.equal(store.get().entries[0].notes, "Recommended");
  assert.deepEqual(store.get().entries[0].cover, coverResponse);
  view.unmount(); render(createElement(Watchlist)); assert.ok(await screen.findByRole("heading", { name: "A Show" }));
});

test("existing browser titles migrate once without removing the browser copy", async () => {
  const legacy = [entry("one", "Older show", "TV show")]; localStorage.setItem("watchlist-v1", JSON.stringify(legacy));
  const view = render(createElement(Watchlist)); await screen.findByRole("heading", { name: "Older show" });
  assert.equal(store.get().migrated, true); assert.deepEqual(JSON.parse(localStorage.getItem("watchlist-v1")), legacy);
  store.apply({ action: "delete", id: "one", revision: store.get().revision });
  view.unmount(); render(createElement(Watchlist)); await waitFor(() => assert.equal(screen.getByRole("button", { name: /add a title/i }).disabled, false));
  assert.equal(screen.queryByRole("heading", { name: "Older show" }), null);
});

test("offline artwork lookup still saves a placeholder", async () => {
  coverResponse = new Error("offline"); render(createElement(Watchlist)); const form = await openForm();
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "A Movie" } }); fireEvent.click(form.getByRole("button", { name: /add title/i }));
  await screen.findByRole("heading", { name: "A Movie" }); assert.equal(store.get().entries[0].cover, undefined);
});

test("edit, filter, and delete update the database and sidebar counts", async () => {
  seed([entry("1", "Arrival", "Movie", "Watched"), entry("2", "Severance", "TV show", "Watching"), entry("3", "The Bear", "TV show")]);
  render(createElement(Watchlist)); await screen.findByRole("heading", { name: "Severance" });
  const nav = within(screen.getByRole("navigation", { name: "Filter by status" }));
  fireEvent.click(nav.getByRole("button", { name: "Watching" }));
  assert.equal(screen.queryByRole("heading", { name: "Arrival" }), null);
  fireEvent.click(screen.getByRole("button", { name: /edit details/i })); const form = within(screen.getByRole("dialog"));
  fireEvent.change(form.getByLabelText("Status"), { target: { value: "Watched" } }); fireEvent.click(form.getByRole("button", { name: /save changes/i }));
  await waitFor(() => assert.ok(!screen.queryByRole("heading", { name: "Severance" })));
  assert.match(nav.getByRole("button", { name: "Watched" }).textContent, /2/);
  fireEvent.click(nav.getByRole("button", { name: "All titles" }));
  fireEvent.change(screen.getByLabelText("Filter by type"), { target: { value: "TV show" } });
  fireEvent.change(screen.getByLabelText("Search titles"), { target: { value: "BEAR" } });
  assert.ok(screen.getByRole("heading", { name: "The Bear" }));
  dom.window.confirm = () => false; fireEvent.click(screen.getByRole("button", { name: "Remove" })); assert.equal(store.get().entries.length, 3);
  dom.window.confirm = () => true; fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  await waitFor(() => assert.equal(store.get().entries.length, 2));
  assert.equal(screen.getByRole("link", { name: /all apps/i }).getAttribute("href"), "/apps");
});

test("failed saves keep the draft and committed database unchanged", async () => {
  seed([entry("1", "Existing")]); render(createElement(Watchlist)); const form = await openForm(); failSave = true;
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "Unsaved" } }); fireEvent.click(form.getByRole("button", { name: /add title/i }));
  await waitFor(() => assert.match(screen.getByRole("alert").textContent, /could not be saved/i));
  assert.equal(form.getByLabelText("Title").value, "Unsaved"); assert.deepEqual(store.get().entries.map((item) => item.title), ["Existing"]);
});

test("unavailable browser storage warns but still loads and saves database titles", async () => {
  seed([entry("1", "Existing database title")]);
  const originalGetItem = dom.window.Storage.prototype.getItem;
  dom.window.Storage.prototype.getItem = () => { throw new Error("Browser storage unavailable"); };
  try {
    render(createElement(Watchlist));
    await screen.findByRole("heading", { name: "Existing database title" });
    assert.match(screen.getByRole("alert").textContent, /browser/i);
    const form = await openForm();
    fireEvent.change(form.getByLabelText("Title"), { target: { value: "New database title" } });
    fireEvent.click(form.getByRole("button", { name: /add title/i }));
    await screen.findByRole("heading", { name: "New database title" });
    assert.deepEqual(store.get().entries.map((item) => item.title), ["New database title", "Existing database title"]);
  } finally { dom.window.Storage.prototype.getItem = originalGetItem; }
});

test("automatically saves found availability and lets existing titles refresh it", async () => {
  availabilityResponse = "US · Stream: Example · JustWatch via TMDB";
  render(createElement(Watchlist)); const form = await openForm();
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "A Movie" } });
  fireEvent.click(form.getByRole("button", { name: /add title/i }));
  await screen.findByRole("heading", { name: "A Movie" });
  assert.equal(store.get().entries[0].where, availabilityResponse);
  availabilityResponse = "US · Rent: Another · JustWatch via TMDB";
  fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
  const edit = within(screen.getByRole("dialog"));
  fireEvent.click(edit.getByRole("button", { name: /find network or streamer/i }));
  await waitFor(() => assert.equal(edit.getByLabelText(/Where to watch/).value, availabilityResponse));
  assert.notEqual(store.get().entries[0].where, availabilityResponse);
  fireEvent.click(edit.getByRole("button", { name: /save changes/i }));
  await waitFor(() => assert.equal(store.get().entries[0].where, availabilityResponse));
});

test("labels can be saved, searched and edited", async () => {
  render(createElement(Watchlist)); const form = await openForm();
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "A Movie" } });
  fireEvent.change(form.getByLabelText(/Label/), { target: { value: "For Owen" } });
  fireEvent.click(form.getByRole("button", { name: /add title/i }));
  await screen.findByRole("heading", { name: "A Movie" });
  assert.equal(store.get().entries[0].label, "For Owen");
  fireEvent.change(screen.getByLabelText("Search titles"), { target: { value: "for owen" } });
  assert.ok(within(screen.getByRole("article")).getByText("For Owen"));
  fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
  const edit = within(screen.getByRole("dialog"));
  assert.equal(edit.getByLabelText(/Label/).value, "For Owen");
  fireEvent.change(edit.getByLabelText(/Label/), { target: { value: "Family" } });
  fireEvent.click(edit.getByRole("button", { name: /save changes/i }));
  await waitFor(() => assert.equal(store.get().entries[0].label, "Family"));
});

test("For Owen navigation filters labeled titles and updates its count", async () => {
  seed([{ ...entry("1", "For Owen movie", "Movie", "Watched"), label: "For Owen" }, entry("2", "Other show", "TV show")]);
  render(createElement(Watchlist)); await screen.findByRole("heading", { name: "For Owen movie" });
  const nav = within(screen.getByRole("navigation", { name: "Filter by label" }));
  const filter = nav.getByRole("button", { name: "For Owen" });
  assert.match(filter.textContent, /1/); fireEvent.click(filter);
  assert.equal(filter.getAttribute("aria-pressed"), "true");
  assert.ok(screen.getByRole("heading", { name: "For Owen movie" }));
  assert.ok(!screen.queryByRole("heading", { name: "Other show" }));
  fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
  const edit = within(screen.getByRole("dialog"));
  fireEvent.change(edit.getByLabelText(/Label/), { target: { value: "Family" } });
  fireEvent.click(edit.getByRole("button", { name: /save changes/i }));
  await waitFor(() => assert.match(filter.textContent, /0/));
  assert.ok(!screen.queryByRole("heading", { name: "For Owen movie" }));
});

test("find artwork updates an existing title only after saving", async () => {
  seed([entry("one", "A Movie")]);
  coverResponse = { url: "https://image.tmdb.org/t/p/w500/poster.jpg", sourceUrl: "https://www.themoviedb.org/movie/42" };
  render(createElement(Watchlist)); await screen.findByRole("heading", { name: "A Movie" });
  fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
  const edit = within(screen.getByRole("dialog"));
  fireEvent.click(edit.getByRole("button", { name: "Find artwork" }));
  await edit.findByText("Artwork found. Save to keep it.");
  assert.equal(store.get().entries[0].cover, undefined);
  fireEvent.click(edit.getByRole("button", { name: /save changes/i }));
  await waitFor(() => assert.deepEqual(store.get().entries[0].cover, coverResponse));
  assert.ok(within(screen.getByRole("article")).getByRole("link", { name: /TMDB/ }));
});

test("shows without TVMaze artwork offer a title search link", async () => {
  seed([entry("1", "A Show & More", "TV show"), entry("2", "A Movie", "Movie")]);
  render(createElement(Watchlist));
  const heading = await screen.findByRole("heading", { name: "A Show & More" });
  const article = heading.closest("article"); assert.ok(article);
  const link = within(article).getByRole("link", { name: /Search TVMaze/ });
  const url = new URL(link.href);
  assert.equal(url.origin, "https://www.tvmaze.com");
  assert.equal(url.searchParams.get("q"), "A Show & More");
  assert.equal(within(screen.getByRole("heading", { name: "A Movie" }).closest("article")).queryByRole("link", { name: /TVMaze/ }), null);
});

test("a manually supplied streaming location is preserved on a new title", async () => {
  availabilityResponse = "US · Stream: Auto provider · JustWatch via TMDB";
  render(createElement(Watchlist));
  const form = await openForm();
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "A Movie" } });
  fireEvent.change(form.getByLabelText(/Where to watch/), { target: { value: "My choice" } });
  fireEvent.click(form.getByRole("button", { name: /add title/i }));
  await screen.findByRole("heading", { name: "A Movie" });
  assert.equal(store.get().entries[0].where, "My choice");
});

test("network lookup protects the title, type and manual availability while pending", async () => {
  seed([entry("one", "A Movie")]);
  const apiFetch = globalThis.fetch; let complete;
  globalThis.fetch = (url, options) => String(url).startsWith("/api/watchlist/availability") ? new Promise((resolve) => { complete = resolve; }) : apiFetch(url, options);
  render(createElement(Watchlist)); await screen.findByRole("heading", { name: "A Movie" });
  fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
  const edit = within(screen.getByRole("dialog"));
  fireEvent.change(edit.getByLabelText(/Where to watch/), { target: { value: "My choice" } });
  fireEvent.click(edit.getByRole("button", { name: /find network or streamer/i }));
  assert.equal(edit.getByLabelText("Title").disabled, true);
  assert.equal(edit.getByLabelText("Type").disabled, true);
  assert.equal(edit.getByLabelText(/Where to watch/).disabled, true);
  complete(Response.json({ where: "US · Stream: Example · JustWatch via TMDB" }));
  await waitFor(() => assert.equal(edit.getByLabelText(/Where to watch/).disabled, false));
  assert.equal(edit.getByLabelText(/Where to watch/).value, "US · Stream: Example · JustWatch via TMDB");
});

test("saving a title locks its draft until automatic lookups finish", async () => {
  const apiFetch = globalThis.fetch; let complete;
  globalThis.fetch = (url, options) => String(url).startsWith("/api/watchlist/cover") ? new Promise((resolve) => { complete = resolve; }) : apiFetch(url, options);
  render(createElement(Watchlist)); const form = await openForm();
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "A Movie" } });
  fireEvent.click(form.getByRole("button", { name: /add title/i }));
  assert.equal(form.getByLabelText("Title").closest("fieldset").disabled, true);
  assert.equal(form.getByLabelText(/Notes/).closest("fieldset").disabled, true);
  complete(Response.json({ cover: null }));
  await screen.findByRole("heading", { name: "A Movie" });
  assert.equal(store.get().entries[0].title, "A Movie");
});
