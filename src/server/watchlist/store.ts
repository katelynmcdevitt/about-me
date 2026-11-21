import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { HttpError } from "../http";

type Entry = { id: string; title: string; kind: "Movie" | "TV show"; status: "Want to watch" | "Watching" | "Watched"; where: string; notes: string; label?: string; cover?: { url: string; sourceUrl: string } };
function validate(value: unknown): Entry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("Invalid title.");
  const e = value as Record<string, unknown>;
  if (typeof e.id !== "string" || !e.id.trim() || e.id.length > 200 || typeof e.title !== "string" || !e.title.trim() || e.title.length > 200 || !["Movie", "TV show"].includes(e.kind as string) || !["Want to watch", "Watching", "Watched"].includes(e.status as string) || typeof e.where !== "string" || e.where.length > 200 || typeof e.notes !== "string" || e.notes.length > 1000) throw new HttpError("Invalid title details.");
  if (e.label !== undefined && (typeof e.label !== "string" || e.label.length > 80)) throw new HttpError("Invalid label.");
  let cover: Entry["cover"];
  if (e.cover != null) {
    if (typeof e.cover !== "object" || Array.isArray(e.cover)) throw new HttpError("Invalid cover.");
    const c = e.cover as Record<string, unknown>;
    if (typeof c.url !== "string" || typeof c.sourceUrl !== "string" || c.url.length > 2048 || c.sourceUrl.length > 2048) throw new HttpError("Invalid cover.");
    try {
      const image = new URL(c.url), source = new URL(c.sourceUrl);
      const allowed = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
      if (image.protocol !== "https:" || source.protocol !== "https:" || !(allowed(image.hostname, "tvmaze.com") || allowed(image.hostname, "mzstatic.com") || image.hostname === "image.tmdb.org") || !(allowed(source.hostname, "tvmaze.com") || allowed(source.hostname, "apple.com") || source.hostname === "www.themoviedb.org")) throw new Error();
    } catch { throw new HttpError("Invalid cover address."); }
    cover = { url: c.url, sourceUrl: c.sourceUrl };
  }
  return { id: e.id, title: e.title.trim(), kind: e.kind as Entry["kind"], status: e.status as Entry["status"], where: e.where.trim(), notes: e.notes.trim(), ...(typeof e.label === "string" && e.label.trim() ? { label: e.label.trim() } : {}), ...(cover ? { cover } : {}) };
}
export class WatchlistStore {
  private db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    const version = Number(this.db.prepare("PRAGMA user_version").get()!.user_version);
    if (version > 1) throw new Error("Watchlist database is from a newer app version.");
    if (!version) this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE entries (id TEXT PRIMARY KEY, data TEXT NOT NULL, position INTEGER NOT NULL);
      CREATE TABLE metadata (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, migrated INTEGER NOT NULL);
      INSERT INTO metadata VALUES (1,0,0); PRAGMA user_version=1; COMMIT;`);
  }
  close() { this.db.close(); }
  get() {
    const meta = this.db.prepare("SELECT revision, migrated FROM metadata WHERE id=1").get()!;
    return { entries: this.db.prepare("SELECT data FROM entries ORDER BY position DESC, id").all().map((row) => JSON.parse(String(row.data)) as Entry), revision: Number(meta.revision), migrated: Boolean(meta.migrated) };
  }
  apply(input: unknown) {
    if (!input || typeof input !== "object") throw new HttpError("Invalid request.");
    const cmd = input as { action?: unknown; revision?: unknown; entry?: unknown; id?: unknown; entries?: unknown };
    if (!Number.isSafeInteger(cmd.revision) || Number(cmd.revision) < 0) throw new HttpError("Invalid revision.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.get();
      if (state.revision !== cmd.revision) throw new HttpError("The watchlist changed in another tab. Reload and try again.", 409);
      if (cmd.action === "migrate") {
        if (!Array.isArray(cmd.entries) || cmd.entries.length > 20000) throw new HttpError("Invalid browser watchlist.");
        const entries = cmd.entries.map(validate);
        if (!state.migrated) {
          const insert = this.db.prepare("INSERT OR IGNORE INTO entries(id,data,position) VALUES(?,?,?)");
          let position = Number(this.db.prepare("SELECT COALESCE(MAX(position),0) AS n FROM entries").get()!.n);
          for (const e of [...entries].reverse()) insert.run(e.id, JSON.stringify(e), ++position);
          this.db.prepare("UPDATE metadata SET migrated=1, revision=revision+1 WHERE id=1").run();
        }
      } else if (cmd.action === "add" || cmd.action === "edit") {
        const e = validate(cmd.entry);
        if (cmd.action === "add") {
          if (this.db.prepare("SELECT 1 FROM entries WHERE id=?").get(e.id)) throw new HttpError("This title already exists.", 409);
          this.db.prepare("INSERT INTO entries VALUES(?,?,(SELECT COALESCE(MAX(position),0)+1 FROM entries))").run(e.id, JSON.stringify(e));
        } else {
          const result = this.db.prepare("UPDATE entries SET data=? WHERE id=?").run(JSON.stringify(e), e.id);
          if (!result.changes) throw new HttpError("This title no longer exists.", 409);
        }
        this.db.prepare("UPDATE metadata SET revision=revision+1 WHERE id=1").run();
      } else if (cmd.action === "delete") {
        if (typeof cmd.id !== "string" || !cmd.id || cmd.id.length > 200) throw new HttpError("Invalid title.");
        if (!this.db.prepare("DELETE FROM entries WHERE id=?").run(cmd.id).changes) throw new HttpError("This title no longer exists.", 409);
        this.db.prepare("UPDATE metadata SET revision=revision+1 WHERE id=1").run();
      } else throw new HttpError("Invalid request.");
      const result = this.get(); this.db.exec("COMMIT"); return result;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
