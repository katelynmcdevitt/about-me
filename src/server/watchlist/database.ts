import { resolve } from "node:path";
import { WatchlistStore } from "./store";
const cache = globalThis as typeof globalThis & { watchlistStores?: Map<string, WatchlistStore> };
export function getWatchlistStore() {
  const filename = resolve(process.env.WATCHLIST_DATABASE_PATH || "data/watchlist.sqlite");
  cache.watchlistStores ??= new Map();
  let store = cache.watchlistStores.get(filename);
  if (!store) { store = new WatchlistStore(filename); cache.watchlistStores.set(filename, store); }
  return store;
}
