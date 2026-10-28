import { resolve } from "node:path";
import { BooksStore } from "./store";

const stores = globalThis as typeof globalThis & {
  booksStores?: Map<string, BooksStore>;
};
export function getBooksStore(): BooksStore {
  const filename = resolve(
    process.env.BOOKS_DATABASE_PATH || "data/books.sqlite",
  );
  stores.booksStores ??= new Map();
  let store = stores.booksStores.get(filename);
  if (!store) {
    store = new BooksStore(filename);
    stores.booksStores.set(filename, store);
  }
  return store;
}
