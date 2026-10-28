import { resolve } from "node:path";
import { CampStore } from "./store";
const cache = globalThis as typeof globalThis & {
  campStores?: Map<string, CampStore>;
};
export function getCampStore() {
  const filename = resolve(
    process.env.CAMP_DATABASE_PATH || "data/camp-schedule.sqlite",
  );
  cache.campStores ??= new Map();
  let store = cache.campStores.get(filename);
  if (!store) {
    store = new CampStore(filename);
    cache.campStores.set(filename, store);
  }
  return store;
}
