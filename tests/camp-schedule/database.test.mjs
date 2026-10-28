import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { loadFile } from "../helpers/load-module.mjs";
const { CampStore } = await loadFile(
  new URL("../../src/server/camp-schedule/store.ts", import.meta.url),
);
const root = mkdtempSync(join(tmpdir(), "camp-db-test-"));
let store;
test.beforeEach(() => {
  store = new CampStore(":memory:");
});
test.afterEach(() => store.close());
test.after(() => rmSync(root, { recursive: true, force: true }));
const camp = (fields = {}) => ({
  id: "new",
  name: "New camp",
  kid: 0,
  start: "2027-06-14",
  end: "2027-06-18",
  cost: 200,
  paid: false,
  type: "Other",
  status: "Confirmed",
  location: "",
  dropoff: "09:00",
  pickup: "15:00",
  ...fields,
});

test("seasons seed once, remain isolated and never resurrect deleted camps", () => {
  let plan = store.getSeason(2026);
  assert.equal(plan.camps.length, 22);
  plan = store.mutate(2026, {
    action: "deleteCamp",
    id: plan.camps[0].id,
    revision: plan.revision,
  });
  assert.equal(store.getSeason(2026).camps.length, 21);
  const fresh = store.getSeason(2027);
  assert.equal(fresh.camps.length, 0);
  store.mutate(2027, {
    action: "saveCamp",
    camp: camp(),
    editing: false,
    revision: fresh.revision,
  });
  assert.equal(store.getSeason(2026).camps.length, 21);
  assert.equal(store.getSeason(2027).camps.length, 1);
});

test("shared payment toggles update one owner, and deleting an owner detaches dependent costs", () => {
  let plan = store.getSeason(2026);
  const linked = plan.camps.find((camp) => camp.costIncludedIn);
  const ownerId = linked.costIncludedIn;
  plan = store.mutate(2026, {
    action: "togglePaid",
    id: linked.id,
    revision: plan.revision,
  });
  assert.equal(plan.camps.find((camp) => camp.id === ownerId).paid, false);
  plan = store.mutate(2026, {
    action: "deleteCamp",
    id: ownerId,
    revision: plan.revision,
  });
  assert.ok(!plan.camps.find((camp) => camp.id === linked.id).costIncludedIn);
  assert.equal(plan.camps.find((camp) => camp.id === linked.id).cost, null);
});

test("invalid dates, settings and shared links do not change the committed season", () => {
  const plan = store.getSeason(2027);
  for (const fields of [
    { name: " " },
    { start: "2027-02-30" },
    { start: "2026-06-15" },
    { pickup: "08:00" },
    { cost: -1 },
    { kid: 8 },
    { status: "Not valid" },
    { cost: null, costIncludedIn: "missing" },
  ]) {
    assert.throws(() =>
      store.mutate(2027, {
        action: "saveCamp",
        camp: camp(fields),
        editing: false,
        revision: plan.revision,
      }),
    );
    assert.equal(store.getSeason(2027).camps.length, 0);
    assert.equal(store.getSeason(2027).revision, plan.revision);
  }
  assert.throws(() =>
    store.mutate(2027, {
      action: "settings",
      kids: ["", "Other"],
      handoffBuffer: 30,
      revision: plan.revision,
    }),
  );
  assert.throws(() =>
    store.mutate(2027, {
      action: "settings",
      kids: ["A", "B"],
      handoffBuffer: 30.5,
      revision: plan.revision,
    }),
  );
  assert.throws(() => store.getSeason(9999));
});

test("restore and browser migration preserve deletions and empty plans, with stale revision protection", () => {
  let plan = store.getSeason(2026);
  const imported = {
    ...plan,
    camps: plan.camps.slice(1),
    kids: ["Renamed", "Kayleigh"],
  };
  plan = store.mutate(2026, {
    action: "migrateBrowser",
    plan: imported,
    revision: plan.revision,
  });
  assert.equal(plan.camps.length, 21);
  assert.equal(plan.browserMigrated, true);
  assert.equal(plan.kids[0], "Renamed");
  assert.throws(
    () =>
      store.mutate(2026, {
        action: "migrateBrowser",
        plan: imported,
        revision: plan.revision,
      }),
    /already migrated/,
  );
  assert.throws(
    () =>
      store.mutate(2026, { action: "restore", plan: imported, revision: 0 }),
    /another tab/,
  );
  plan = store.mutate(2026, {
    action: "restore",
    plan: { ...plan, camps: [] },
    revision: plan.revision,
  });
  assert.equal(store.getSeason(2026).camps.length, 0);
  assert.throws(
    () =>
      store.mutate(2026, {
        action: "restore",
        plan: { ...plan, year: 2027 },
        revision: plan.revision,
      }),
    /Summer 2027/,
  );
});

test("database and selected-year preferences survive restarting and can be backed up", async () => {
  const file = join(root, "persistent.sqlite");
  let durable = new CampStore(file);
  durable.selectYear(2027);
  let plan = durable.getSeason(2027);
  durable.mutate(2027, {
    action: "saveCamp",
    camp: camp(),
    editing: false,
    revision: plan.revision,
  });
  durable.close();
  durable = new CampStore(file);
  assert.equal(durable.getIndex().selectedYear, 2027);
  assert.equal(durable.getSeason(2027).camps[0].name, "New camp");
  durable.close();
  const db = new DatabaseSync(file, { readOnly: true });
  const target = join(root, "backup.sqlite");
  await backup(db, target);
  db.close();
  const restored = new CampStore(target);
  assert.equal(restored.getSeason(2027).camps.length, 1);
  restored.close();
});

test("a failed plan write rolls back camp deletions, replacements, settings and revisions", () => {
  const file = join(root, "rollback.sqlite");
  const durable = new CampStore(file);
  let plan = durable.getSeason(2027);
  plan = durable.mutate(2027, {
    action: "saveCamp",
    camp: camp(),
    editing: false,
    revision: plan.revision,
  });
  const db = new DatabaseSync(file);
  db.exec(
    "CREATE TRIGGER fail_write BEFORE INSERT ON camps BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
  );
  assert.throws(
    () =>
      durable.mutate(2027, {
        action: "settings",
        kids: ["Changed", "Changed"],
        handoffBuffer: 45,
        revision: plan.revision,
      }),
    /test failure/,
  );
  assert.deepEqual(durable.getSeason(2027), plan);
  db.close();
  durable.close();
});

test("old browser backups with a deleted shared-payment owner migrate without resurrecting it", () => {
  const plan = store.getSeason(2026);
  const linked = plan.camps.find((camp) => camp.costIncludedIn);
  const oldBackup = {
    ...plan,
    camps: plan.camps.filter((camp) => camp.id !== linked.costIncludedIn),
  };
  const migrated = store.mutate(2026, {
    action: "migrateBrowser",
    revision: plan.revision,
    plan: oldBackup,
  });
  assert.equal(migrated.camps.length, 21);
  assert.ok(
    !migrated.camps.find((camp) => camp.id === linked.id).costIncludedIn,
  );
  assert.equal(migrated.camps.find((camp) => camp.id === linked.id).cost, null);
});
