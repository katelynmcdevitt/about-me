import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { loadFile } from "../helpers/load-module.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { render, fireEvent, screen, within, waitFor, cleanup } = await import("@testing-library/react");
const { createElement } = await import("react");
const { default: Watchlist } = await loadFile(new URL("../../src/features/watchlist/Watchlist.tsx", import.meta.url));
const originalFetch = globalThis.fetch;
const originalSetItem = dom.window.Storage.prototype.setItem;
afterEach(() => { cleanup(); localStorage.clear(); globalThis.fetch = originalFetch; dom.window.Storage.prototype.setItem = originalSetItem; });
const saved = () => JSON.parse(localStorage.getItem("watchlist-v1"));
const entry = (id, title, kind = "Movie", status = "Want to watch") => ({ id, title, kind, status, where: "", notes: "" });
function openForm() { fireEvent.click(screen.getByRole("button", { name: /add a title/i })); return within(screen.getByRole("dialog")); }

test("adding a title finds a cover, saves details, and survives reload", async () => {
  let request;
  globalThis.fetch = async (url) => { request = String(url); return Response.json({ cover: { url: "https://static.tvmaze.com/poster.jpg", sourceUrl: "https://www.tvmaze.com/shows/1" } }); };
  const view = render(createElement(Watchlist));
  const form = openForm();
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "  A Show  " } });
  fireEvent.change(form.getByLabelText("Type"), { target: { value: "TV show" } });
  fireEvent.change(form.getByLabelText(/Where to watch/), { target: { value: " Streamer " } });
  fireEvent.change(form.getByLabelText(/Notes/), { target: { value: " Recommended " } });
  fireEvent.click(form.getByRole("button", { name: /add title/i }));
  await screen.findByRole("heading", { name: "A Show" });
  const params = new URL(request, "http://localhost").searchParams;
  assert.equal(params.get("title"), "A Show"); assert.equal(params.get("kind"), "TV show");
  assert.equal(saved()[0].where, "Streamer"); assert.equal(saved()[0].notes, "Recommended");
  assert.equal(saved()[0].cover.url, "https://static.tvmaze.com/poster.jpg");
  view.unmount(); render(createElement(Watchlist));
  assert.ok(await screen.findByRole("heading", { name: "A Show" }));
  assert.ok(screen.getByRole("link", { name: /TVMaze/ }));
});

test("unavailable cover lookup still saves a title with a placeholder", async () => {
  globalThis.fetch = async () => { throw new Error("offline"); };
  render(createElement(Watchlist));
  const form = openForm();
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "A Movie" } });
  fireEvent.click(form.getByRole("button", { name: /add title/i }));
  await screen.findByRole("heading", { name: "A Movie" });
  assert.equal(saved()[0].cover, undefined);
  assert.equal(document.querySelector("article img"), null);
});

test("editing and deletion persist, with cancellation preserving the title", async () => {
  localStorage.setItem("watchlist-v1", JSON.stringify([entry("one", "Original")]));
  let lookupCalls = 0;
  globalThis.fetch = async () => { lookupCalls++; throw new Error("unexpected lookup"); };
  render(createElement(Watchlist));
  fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
  const form = within(screen.getByRole("dialog"));
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "Updated" } });
  fireEvent.change(form.getByLabelText("Status"), { target: { value: "Watched" } });
  fireEvent.click(form.getByRole("button", { name: /save changes/i }));
  await screen.findByRole("heading", { name: "Updated" });
  assert.equal(saved()[0].status, "Watched");
  assert.equal(lookupCalls, 0);
  dom.window.confirm = () => false;
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  assert.equal(saved().length, 1);
  dom.window.confirm = () => true;
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  assert.equal(saved().length, 0);
  assert.ok(screen.getByText(/ready for its first title/i));
});

test("search, status, and type filters narrow the saved list", () => {
  localStorage.setItem("watchlist-v1", JSON.stringify([entry("1", "Arrival", "Movie", "Watched"), entry("2", "Severance", "TV show", "Watching"), entry("3", "The Bear", "TV show")]));
  render(createElement(Watchlist));
  fireEvent.click(screen.getByRole("button", { name: "Watching" }));
  assert.ok(screen.getByRole("heading", { name: "Severance" }));
  assert.equal(screen.queryByRole("heading", { name: "Arrival" }), null);
  fireEvent.click(screen.getByRole("button", { name: "All titles" }));
  fireEvent.change(screen.getByLabelText("Filter by type"), { target: { value: "TV show" } });
  assert.equal(screen.queryByRole("heading", { name: "Arrival" }), null);
  fireEvent.change(screen.getByLabelText("Search titles"), { target: { value: "BEAR" } });
  assert.ok(screen.getByRole("heading", { name: "The Bear" }));
  assert.equal(screen.queryByRole("heading", { name: "Severance" }), null);
});

test("storage write failures leave the draft available and the saved list unchanged", async () => {
  localStorage.setItem("watchlist-v1", JSON.stringify([entry("1", "Existing")]));
  globalThis.fetch = async () => Response.json({ cover: null });
  dom.window.Storage.prototype.setItem = () => { throw new Error("storage full"); };
  render(createElement(Watchlist));
  const form = openForm();
  fireEvent.change(form.getByLabelText("Title"), { target: { value: "Unsaved" } });
  fireEvent.click(form.getByRole("button", { name: /add title/i }));
  await waitFor(() => assert.match(screen.getByRole("alert").textContent, /could not be saved/i));
  assert.equal(form.getByLabelText("Title").value, "Unsaved");
  assert.deepEqual(saved().map((item) => item.title), ["Existing"]);
  assert.equal(screen.queryByRole("heading", { name: "Unsaved" }), null);
});

test("editing preserves cover metadata and a broken image falls back to the placeholder", async () => {
  const cover = { url: "https://static.tvmaze.com/poster.jpg", sourceUrl: "https://www.tvmaze.com/shows/1" };
  localStorage.setItem("watchlist-v1", JSON.stringify([{ ...entry("one", "A Show", "TV show"), cover }]));
  render(createElement(Watchlist));
  const image = document.querySelector("article img");
  assert.ok(image);
  fireEvent.error(image);
  assert.equal(image.style.display, "none");
  fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
  const form = within(screen.getByRole("dialog"));
  fireEvent.change(form.getByLabelText("Status"), { target: { value: "Watching" } });
  fireEvent.click(form.getByRole("button", { name: /save changes/i }));
  await waitFor(() => assert.equal(saved()[0].status, "Watching"));
  assert.deepEqual(saved()[0].cover, cover);
});
