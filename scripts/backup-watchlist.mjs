import { backup, DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
const source = resolve(process.env.WATCHLIST_DATABASE_PATH || "data/watchlist.sqlite");
if (!existsSync(source)) throw new Error("No watchlist database yet. Open The Watchlist first.");
const target = resolve(process.argv[2] || `backups/watchlist-${new Date().toISOString().replaceAll(":", "-")}.sqlite`);
if (existsSync(target)) throw new Error("Choose a new backup filename; that file already exists.");
mkdirSync(dirname(target), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, target); console.log(`Watchlist database backed up to ${target}`); } finally { db.close(); }
