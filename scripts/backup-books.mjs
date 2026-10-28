import { backup, DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve(process.env.BOOKS_DATABASE_PATH || "data/books.sqlite");
if (!existsSync(source))
  throw new Error("No books database yet. Open Shelf Notes first.");
const target = resolve(
  process.argv[2] ||
    `backups/books-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
if (existsSync(target))
  throw new Error(
    "The backup destination already exists. Choose a new filename.",
  );
mkdirSync(dirname(target), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, target);
  console.log(`Books database backed up to ${target}`);
} finally {
  db.close();
}
