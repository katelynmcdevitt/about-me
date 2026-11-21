import test from "node:test";
import assert from "node:assert/strict";
import { loadFile } from "../helpers/load-module.mjs";
const { findAvailability } = await loadFile(new URL("../../src/server/watchlist/availability.ts", import.meta.url));

test("Watchmode searches by exact movie title and returns country-specific streaming options", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(new URL(url)); assert.equal(init.headers["X-API-Key"], "secret"); assert.equal(init.cache, "no-store");
    if (calls.length === 1) return Response.json({ title_results: [{ id: 42, name: "A Movie", type: "movie" }] });
    return Response.json({ tmdb_id: 15, tmdb_type: "movie", poster: "https://image.tmdb.org/t/p/w500/poster.jpg", sources: [{ name: "Streamer", type: "sub", region: "US" }, { name: "Free service", type: "free", region: "US" }, { name: "Rental", type: "rent", region: "US" }, { name: "Foreign", type: "sub", region: "CA" }] });
  };
  assert.deepEqual(await findAvailability("A Movie", "Movie", { apiKey: "secret", fetcher }), { where: "US · Stream: Streamer; Free: Free service; Rent: Rental", cover: { url: "https://image.tmdb.org/t/p/w500/poster.jpg", sourceUrl: "https://www.themoviedb.org/movie/15" } });
  assert.equal(calls[0].searchParams.get("search_value"), "A Movie"); assert.equal(calls[1].pathname, "/v1/title/42/details/");
  assert.equal(calls[1].searchParams.get("regions"), "US"); assert.ok(!calls.some((url) => url.href.includes("secret")));
});

test("matches TV series and applies the requested region", async () => {
  const fetcher = async (url) => url.pathname === "/v1/search/" ? Response.json({ title_results: [{ id: 7, name: "A Show", type: "tv_miniseries" }] }) : Response.json({ sources: [{ name: "Service", type: "sub", region: "CA" }] });
  assert.deepEqual(await findAvailability("A Show", "TV show", { apiKey: "token", region: "CA", fetcher }), { where: "CA · Stream: Service" });
});

test("ambiguous titles and wrong media types never pick arbitrary matches", async () => {
  const fetcher = async () => Response.json({ title_results: [{ id: 1, name: "Same", type: "movie" }, { id: 2, name: "Same", type: "movie" }] });
  assert.equal(await findAvailability("Same", "Movie", { apiKey: "token", fetcher }), null);
  assert.equal(await findAvailability("Same", "TV show", { apiKey: "token", fetcher }), null);
  assert.equal(await findAvailability("", "Movie", { apiKey: "token", fetcher }), null);
  assert.equal(await findAvailability("Same", "Movie", { fetcher }), null);
});

test("service errors do not masquerade as a missing match", async () => {
  await assert.rejects(() => findAvailability("Offline", "TV show", { apiKey: "token", fetcher: async () => { throw Error("offline"); } }), /unavailable/);
  await assert.rejects(() => findAvailability("Offline", "Movie", { apiKey: "token", fetcher: async () => new Response("", { status: 401 }) }), /unavailable/);
});

test("unsupported poster hosts are not displayed", async () => {
  let calls = 0;
  const fetcher = async () => ++calls === 1 ? Response.json({ title_results: [{ id: 1, name: "Film", type: "movie" }] }) : Response.json({ tmdb_id: 2, tmdb_type: "movie", poster: "https://images.example/poster.jpg", sources: [] });
  assert.deepEqual(await findAvailability("Film", "Movie", { apiKey: "token", fetcher }), { where: null });
});

test("availability route explains missing configuration without exposing a key", async () => {
  const previous = process.env.WATCHMODE_API_KEY;
  delete process.env.WATCHMODE_API_KEY;
  try {
    const { POST } = await loadFile(new URL("../../src/app/api/watchlist/availability/route.ts", import.meta.url));
    const response = await POST(new Request("http://127.0.0.1:3000/api/watchlist/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Film", kind: "Movie" }) }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /WATCHMODE_API_KEY/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { if (previous === undefined) delete process.env.WATCHMODE_API_KEY; else process.env.WATCHMODE_API_KEY = previous; }
});

test("rejects same-name wrong-type results without fetching details", async () => {
  let count = 0;
  const fetcher = async (url) => {
    count++;
    assert.equal(url.searchParams.get("types"), "movie");
    return Response.json({ title_results: [{ id: 8, name: "Same", type: "tv_series" }] });
  };
  assert.equal(await findAvailability("Same", "Movie", { apiKey: "token", fetcher }), null);
  assert.equal(count, 1);
});

test("filters and deduplicates providers and defaults invalid region to US", async () => {
  let count = 0;
  const fetcher = async (url) => {
    if (++count === 1) return Response.json({ title_results: [{ id: 1, name: "Film", type: "movie" }] });
    assert.equal(url.searchParams.get("regions"), "US");
    return Response.json({ sources: [{ name: " Streamer ", type: "sub", region: "US" }, { name: "Streamer", type: "sub", region: "US" }, { name: "Other", type: "sub", region: "CA" }, { name: "Unknown", type: "unknown", region: "US" }, { name: "Cable", type: "tve", region: "US" }] });
  };
  assert.deepEqual(await findAvailability("Film", "Movie", { apiKey: "token", region: "../", fetcher }), { where: "US · Stream: Streamer; TV provider: Cable" });
});


test("availability route rejects foreign-origin requests before any lookup", async () => {
  const { POST } = await loadFile(new URL("../../src/app/api/watchlist/availability/route.ts", import.meta.url));
  const response = await POST(new Request("http://127.0.0.1:3000/api/watchlist/availability", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://other.example" }, body: JSON.stringify({ title: "Film", kind: "Movie" }) }));
  assert.equal(response.status, 403);
});
