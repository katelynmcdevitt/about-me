import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadSeason } from "../../features/camp-schedule/model";
import general from "../../features/camp-schedule/data/general.json";
import type {
  CampSeason,
  CampCommand,
  CampIndex,
} from "../../features/camp-schedule/contracts";
import type { Camp } from "../../features/camp-schedule/types";
import { HttpError } from "../http";
import { importedPlan, validYear, validatePlan } from "./validation";

export class CampStore {
  private db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    const version = Number(
      this.db.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (version > 1)
      throw new Error("This camp database belongs to a newer app version.");
    if (!version)
      this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE seasons (year INTEGER PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, handoff_buffer INTEGER NOT NULL, imports_json TEXT NOT NULL, browser_migrated INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE campers (year INTEGER NOT NULL REFERENCES seasons(year), kid INTEGER NOT NULL CHECK(kid IN (0,1)), name TEXT NOT NULL, PRIMARY KEY(year,kid));
      CREATE TABLE camps (year INTEGER NOT NULL REFERENCES seasons(year), id TEXT NOT NULL, kid INTEGER NOT NULL, name TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, location TEXT NOT NULL, cost REAL, paid INTEGER NOT NULL, status TEXT NOT NULL, type TEXT NOT NULL, no_camp INTEGER NOT NULL, dropoff TEXT, pickup TEXT, time TEXT, cost_included_in TEXT, PRIMARY KEY(year,id), FOREIGN KEY(year,kid) REFERENCES campers(year,kid), FOREIGN KEY(year,cost_included_in) REFERENCES camps(year,id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TABLE preferences (id INTEGER PRIMARY KEY CHECK(id=1), selected_year INTEGER);
      INSERT INTO preferences VALUES(1,NULL);
      PRAGMA user_version=1; COMMIT;`);
  }
  close() {
    this.db.close();
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private ensureSeason(year: number) {
    if (this.db.prepare("SELECT year FROM seasons WHERE year=?").get(year))
      return;
    const seed = loadSeason(year);
    this.db
      .prepare(
        "INSERT INTO seasons(year,handoff_buffer,imports_json) VALUES(?,?,?)",
      )
      .run(year, seed.handoffBuffer, JSON.stringify(seed.appliedImports));
    this.writePlan(year, validatePlan(year, seed), false);
  }
  private readSeason(year: number): CampSeason {
    const row = this.db
      .prepare("SELECT * FROM seasons WHERE year=?")
      .get(year)!;
    const camps = this.db
      .prepare("SELECT * FROM camps WHERE year=? ORDER BY rowid")
      .all(year)
      .map((camp): Camp => ({
        id: String(camp.id),
        name: String(camp.name),
        kid: Number(camp.kid),
        start: String(camp.start),
        end: String(camp.end),
        location: String(camp.location),
        cost: camp.cost == null ? null : Number(camp.cost),
        paid: !!camp.paid,
        status: String(camp.status),
        type: String(camp.type),
        noCamp: !!camp.no_camp,
        dropoff: camp.dropoff == null ? null : String(camp.dropoff),
        pickup: camp.pickup == null ? null : String(camp.pickup),
        ...(camp.time ? { time: String(camp.time) } : {}),
        ...(camp.cost_included_in
          ? { costIncludedIn: String(camp.cost_included_in) }
          : {}),
      }));
    return {
      year,
      camps,
      kids: this.db
        .prepare("SELECT name FROM campers WHERE year=? ORDER BY kid")
        .all(year)
        .map((kid) => String(kid.name)),
      handoffBuffer: Number(row.handoff_buffer),
      appliedImports: JSON.parse(String(row.imports_json)),
      revision: Number(row.revision),
      browserMigrated: !!row.browser_migrated,
    };
  }
  private writePlan(
    year: number,
    plan: ReturnType<typeof validatePlan>,
    increment = true,
  ) {
    for (const [kid, name] of plan.kids.entries())
      this.db
        .prepare(
          "INSERT INTO campers(year,kid,name) VALUES(?,?,?) ON CONFLICT(year,kid) DO UPDATE SET name=excluded.name",
        )
        .run(year, kid, name);
    this.db.prepare("DELETE FROM camps WHERE year=?").run(year);
    for (const camp of plan.camps)
      this.db
        .prepare(
          "INSERT INTO camps(year,id,kid,name,start,end,location,cost,paid,status,type,no_camp,dropoff,pickup,time,cost_included_in) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          year,
          camp.id,
          camp.kid,
          camp.name,
          camp.start,
          camp.end,
          camp.location,
          camp.cost,
          +!!camp.paid,
          camp.status,
          camp.type,
          +!!camp.noCamp,
          camp.dropoff ?? null,
          camp.pickup ?? null,
          camp.time ?? null,
          camp.costIncludedIn || null,
        );
    this.db
      .prepare(
        "UPDATE seasons SET handoff_buffer=?, imports_json=?, revision=revision+? WHERE year=?",
      )
      .run(
        plan.handoffBuffer,
        JSON.stringify(plan.appliedImports ?? []),
        increment ? 1 : 0,
        year,
      );
  }
  getSeason(year: number): CampSeason {
    validYear(year);
    return this.transaction(() => {
      this.ensureSeason(year);
      return this.readSeason(year);
    });
  }
  getIndex(): CampIndex {
    return this.transaction(() => {
      this.ensureSeason(general.season.year);
      const saved = this.db
        .prepare("SELECT selected_year FROM preferences WHERE id=1")
        .get()!.selected_year;
      return {
        selectedYear: saved == null ? null : Number(saved),
        years: [
          ...new Set([
            ...Array.from(
              { length: 6 },
              (_, index) => general.season.year + index,
            ),
            ...this.db
              .prepare("SELECT year FROM seasons")
              .all()
              .map((row) => Number(row.year)),
          ]),
        ].sort((a, b) => a - b),
      };
    });
  }
  selectYear(year: number): CampIndex {
    validYear(year);
    this.transaction(() => {
      this.ensureSeason(year);
      this.db
        .prepare("UPDATE preferences SET selected_year=? WHERE id=1")
        .run(year);
    });
    return this.getIndex();
  }
  mutate(year: number, command: CampCommand): CampSeason {
    validYear(year);
    return this.transaction(() => {
      this.ensureSeason(year);
      const current = this.readSeason(year);
      if (
        !command ||
        typeof command !== "object" ||
        !Number.isInteger(command.revision)
      )
        throw new HttpError("Provide a valid camp action and revision.");
      if (command.revision !== current.revision)
        throw new HttpError(
          "This summer changed in another tab. The latest plan has been loaded; review it and try again.",
          409,
        );
      let plan = {
        camps: current.camps,
        kids: current.kids,
        handoffBuffer: current.handoffBuffer,
        appliedImports: current.appliedImports,
      };
      if (command.action === "saveCamp") {
        if (!command.camp || typeof command.editing !== "boolean")
          throw new HttpError("Provide valid camp details.");
        const exists = current.camps.some(
          (camp) => camp.id === command.camp.id,
        );
        if (exists !== command.editing)
          throw new HttpError(
            exists
              ? "That camp already exists. Edit it instead."
              : "This camp no longer exists. Close the editor and try again.",
          );
        const camp = { ...command.camp };
        if (
          typeof camp.start === "string" &&
          typeof camp.end === "string" &&
          camp.end < camp.start
        )
          throw new HttpError(
            "The end date must be on or after the start date.",
          );
        // Entering a separate cost detaches a formerly shared payment.
        if (camp.costIncludedIn && camp.cost != null)
          delete camp.costIncludedIn;
        plan.camps = command.editing
          ? current.camps.map((item) => (item.id === camp.id ? camp : item))
          : [...current.camps, camp];
      } else if (command.action === "deleteCamp") {
        if (!current.camps.some((camp) => camp.id === command.id))
          throw new HttpError("This camp no longer exists.", 404);
        plan.camps = current.camps
          .filter((camp) => camp.id !== command.id)
          .map((camp) => {
            if (camp.costIncludedIn !== command.id) return camp;
            const { costIncludedIn: _link, ...detached } = camp;
            return { ...detached, cost: null, paid: false };
          });
      } else if (command.action === "togglePaid") {
        const selected = current.camps.find((camp) => camp.id === command.id);
        if (!selected) throw new HttpError("This camp no longer exists.", 404);
        const owner =
          current.camps.find((camp) => camp.id === selected.costIncludedIn) ??
          selected;
        plan.camps = current.camps.map((camp) =>
          camp.id === owner.id ? { ...camp, paid: !camp.paid } : camp,
        );
      } else if (command.action === "settings") {
        if (
          !Array.isArray(command.kids) ||
          typeof command.handoffBuffer !== "number"
        )
          throw new HttpError("Provide camper names and a handoff alert gap.");
        plan.kids = command.kids;
        plan.handoffBuffer = command.handoffBuffer;
      } else if (
        command.action === "restore" ||
        command.action === "migrateBrowser"
      ) {
        if (command.action === "migrateBrowser" && current.browserMigrated)
          throw new HttpError(
            "This browser plan was already migrated. Use Import backup to replace it again.",
          );
        plan = importedPlan(year, command.plan);
      } else throw new HttpError("Unknown camp schedule action.");
      this.writePlan(year, validatePlan(year, plan));
      if (command.action === "migrateBrowser")
        this.db
          .prepare("UPDATE seasons SET browser_migrated=1 WHERE year=?")
          .run(year);
      return this.readSeason(year);
    });
  }
}
