import test from "node:test";
import assert from "node:assert/strict";
import { loadFile } from "../helpers/load-module.mjs";
const { findAvailability } = await loadFile(new URL("../../src/server/watchlist/availability.ts", import.meta.url));

test("finds US streaming, free and rental options for an exact movie match", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(String(url)); assert.equal(init.headers.Authorization, "Bearer secret");
    if (calls.length === 1) return Response.json({ results: [{ id: 42, title: "A Movie" }] });
    return Response.json({ results: { US: { flatrate: [{ provider_name: "Streamer" }], free: [{ provider_name: "Free service" }], rent: [{ provider_name: "Rental" }] } } });
  };
  assert.equal(await findAvailability("A Movie", "Movie", { apiKey: "secret", fetcher }), "US · Stream: Streamer; Free: Free service; Rent: Rental · JustWatch via TMDB");
  assert.match(calls[0], /search\/movie/); assert.match(calls[1], /movie\/42\/watch\/providers/);
  assert.ok(!calls.some((url) => url.includes("secret")));
});

test("TVMaze reports an original network without claiming current availability", async () => {
  const result = await findAvailability("A Show", "TV show", { fetcher: async () => Response.json([{ show: { name: "A Show", network: { name: "Network" }, webChannel: null } }]) });
  assert.equal(result, "Original network: Network (TVMaze)");
});

test("ambiguous matches, missing data, and offline sources return no result", async () => {
  assert.equal(await findAvailability("Same", "Movie", { apiKey: "token", fetcher: async () => Response.json({ results: [{ id: 1, title: "Same" }, { id: 2, title: "Same" }] }) }), null);
  assert.equal(await findAvailability("Same", "TV show", { fetcher: async () => Response.json([{ show: { name: "Same", network: { name: "One" } } }, { show: { name: "Same", network: { name: "Two" } } }]) }), null);
  assert.equal(await findAvailability("Offline", "TV show", { fetcher: async () => { throw Error("offline"); } }), null);
  assert.equal(await findAvailability("", "Movie", { fetcher: async () => { throw Error("unexpected"); } }), null);
});
