import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "./load-module.mjs";
import { loadFile } from "../helpers/load-module.mjs";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const { renderHook, act, cleanup, render, fireEvent, screen, waitFor, within } =
  await import("@testing-library/react");
const { createElement } = await import("react");
const { usePlanner } = await load("usePlanner.ts");
const { loadSeason, derivePlan, parseSavedPlan } = await load("model.ts");
const { handoffWarnings, formatTime } = await load("lib/handoffs.ts");
const { default: PlannerDialogs } = await load("components/PlannerDialogs.tsx");
const { default: MissingWeeksDialog } = await load(
  "components/MissingWeeksDialog.tsx",
);
const { default: CampPlanner } = await load("CampPlanner.tsx");
const { default: PaymentsTable } = await load("components/PaymentsTable.tsx");
const { GET: indexGet, PATCH: indexPatch } = await loadFile(
  new URL("../../src/app/api/camp-schedule/route.ts", import.meta.url),
);
const { GET: seasonGet, PATCH: seasonPatch } = await loadFile(
  new URL("../../src/app/api/camp-schedule/[year]/route.ts", import.meta.url),
);
const { getCampStore } = await loadFile(
  new URL("../../src/server/camp-schedule/database.ts", import.meta.url),
);
const root = mkdtempSync(join(tmpdir(), "camp-api-test-"));
let sequence = 0;
const originalFetch = globalThis.fetch;
const apiFetch = async (url, init = {}) => {
  const path = String(url),
    request = new Request(`http://localhost:3000${path}`, init);
  if (path === "/api/camp-schedule")
    return init.method === "PATCH" ? indexPatch(request) : indexGet();
  const match = path.match(/^\/api\/camp-schedule\/(\d{4})$/);
  if (match) {
    const context = { params: Promise.resolve({ year: match[1] }) };
    return init.method === "PATCH"
      ? seasonPatch(request, context)
      : seasonGet(request, context);
  }
  throw new Error(`Unexpected request: ${path}`);
};
const ready = async (result) => waitFor(() => assert.ok(result.current.loaded));
const uiReady = async () =>
  waitFor(() =>
    assert.ok(
      !screen.getByRole("button", { name: "Add a camp" }).closest("fieldset")
        .disabled,
    ),
  );
test.beforeEach(() => {
  process.env.CAMP_DATABASE_PATH = join(root, `${sequence++}.sqlite`);
  localStorage.clear();
  globalThis.fetch = apiFetch;
  window.confirm = () => true;
});
test.afterEach(() => {
  cleanup();
  getCampStore().close();
  globalThis.fetch = originalFetch;
});
test.after(() => {
  delete process.env.CAMP_DATABASE_PATH;
  rmSync(root, { recursive: true, force: true });
});

test("supplied payments, care and handoffs remain correct with database-backed payment toggles", async () => {
  const { result } = renderHook(() => usePlanner(2026));
  await ready(result);
  const p = () => result.current;
  assert.equal(p().camps.length, 22);
  assert.equal(p().total, 4726.8);
  assert.deepEqual(p().paidByKid, [2959.8, 1767]);
  assert.equal(p().covered, 21);
  assert.equal(p().missingWeeks.length, 1);
  assert.equal(p().missingWeeks[0].reason, "No camp");
  const shared = p().camps.find((camp) => camp.id === "kayleigh-2026-week-6");
  await act(async () => {
    await p().togglePaid(shared);
  });
  assert.equal(p().paymentLabel(shared), "Unpaid");
  assert.equal(p().total, 4057);
  assert.equal(p().unpaidTotal, 669.8);
  await act(async () => {
    await p().togglePaid(shared);
  });
  assert.equal(p().total, 4726.8);
  act(() => p().setFilter(0));
  assert.ok(
    p().weekDays.every((day) => day.camps.every((camp) => camp.kid === 0)),
  );
  assert.equal(p().weekWarningDays, 5);
  assert.equal(localStorage.getItem("camp-days-2026"), null);
});

test("camp edits, deletions and settings persist independently across seasons and reloads", async () => {
  let hook = renderHook(() => usePlanner(2026));
  await ready(hook.result);
  act(() => {
    hook.result.current.setKids(["Owen edited", "Kayleigh"]);
    hook.result.current.setHandoffBuffer(45);
  });
  await act(async () => {
    await hook.result.current.saveSettings(false);
  });
  act(() => hook.result.current.open(hook.result.current.camps[0]));
  await act(async () => {
    await hook.result.current.remove();
  });
  const saved2026 = getCampStore().getSeason(2026);
  hook.unmount();
  hook = renderHook(() => usePlanner(2027));
  await ready(hook.result);
  assert.equal(hook.result.current.form.start, "2027-06-14");
  assert.equal(hook.result.current.form.end, "2027-06-18");
  act(() =>
    hook.result.current.setForm((previous) => ({
      ...previous,
      name: "Two weeks",
      end: "2027-06-25",
      cost: 500,
    })),
  );
  await act(async () => {
    await hook.result.current.save();
  });
  assert.equal(hook.result.current.unpaidTotal, 500);
  assert.equal(
    hook.result.current.paymentRows.flatMap((row) => row.entries.flat()).length,
    1,
  );
  act(() => hook.result.current.open(hook.result.current.camps[0]));
  act(() =>
    hook.result.current.setForm((previous) => ({
      ...previous,
      name: "Edited",
      paid: true,
    })),
  );
  await act(async () => {
    await hook.result.current.save();
  });
  assert.equal(hook.result.current.total, 500);
  assert.deepEqual(getCampStore().getSeason(2026), saved2026);
  hook.unmount();
  hook = renderHook(() => usePlanner(2026));
  await ready(hook.result);
  assert.equal(hook.result.current.camps.length, 21);
  assert.equal(hook.result.current.kids[0], "Owen edited");
  assert.equal(hook.result.current.handoffBuffer, 45);
  hook.unmount();
  hook = renderHook(() => usePlanner(2027));
  await ready(hook.result);
  assert.equal(hook.result.current.camps[0].name, "Edited");
  act(() => hook.result.current.open(hook.result.current.camps[0]));
  await act(async () => {
    await hook.result.current.remove();
  });
  hook.unmount();
  hook = renderHook(() => usePlanner(2027));
  await ready(hook.result);
  assert.deepEqual(hook.result.current.camps, []);
});

test("invalid names, years, reversed dates and times cannot be saved", async () => {
  const { result } = renderHook(() => usePlanner(2027));
  await ready(result);
  const blank = result.current.form;
  for (const fields of [
    { name: " " },
    { name: "Wrong year", start: "2026-06-15" },
    { name: "Reversed", end: "2027-06-13" },
    { name: "Times", dropoff: "15:00", pickup: "08:00" },
  ]) {
    act(() => result.current.setForm({ ...blank, ...fields }));
    await act(async () => {
      await result.current.save();
    });
    assert.ok(result.current.error);
    assert.equal(result.current.camps.length, 0);
  }
});

test("missing-week navigation and week selection still work", async () => {
  const { result } = renderHook(() => usePlanner(2026));
  await ready(result);
  act(() => result.current.viewMissingWeek("2026-08-17", 1));
  assert.equal(result.current.tab, "Schedule");
  assert.equal(result.current.filter, 1);
  act(() => result.current.selectWeek("2026-07-22"));
  assert.equal(result.current.selectedWeek, "2026-07-20");
  act(() => result.current.moveWeek(-1));
  assert.equal(result.current.selectedWeek, "2026-07-13");
});

test("JSON backup restores preserve deletions, reject wrong years, and honor cancellation", async () => {
  const { result } = renderHook(() => usePlanner(2026));
  await ready(result);
  const exported = {
    year: 2026,
    kids: ["Owen imported", "Kayleigh"],
    camps: result.current.camps.slice(1),
    handoffBuffer: 20,
  };
  await act(async () => {
    await result.current.importData({
      text: async () => JSON.stringify(exported),
    });
  });
  assert.equal(result.current.camps.length, 21);
  assert.equal(result.current.kids[0], "Owen imported");
  await act(async () => {
    await result.current.importData({
      text: async () => JSON.stringify({ ...exported, year: 2027 }),
    });
  });
  assert.match(result.current.importMessage, /Select Summer 2027/);
  assert.equal(result.current.camps.length, 21);
  window.confirm = () => false;
  await act(async () => {
    await result.current.importData({
      text: async () => JSON.stringify({ ...exported, camps: [] }),
    });
  });
  assert.equal(result.current.camps.length, 21);
  assert.throws(() =>
    parseSavedPlan({ kids: ["A", "B"], camps: [{ id: "x" }] }),
  );
});

test("failed saves keep committed camps unchanged and retain the editable draft", async () => {
  const { result } = renderHook(() => usePlanner(2027));
  await ready(result);
  globalThis.fetch = async (url, init) =>
    init?.method === "PATCH"
      ? Response.json({ error: "Database unavailable" }, { status: 500 })
      : apiFetch(url, init);
  act(() => result.current.open());
  act(() =>
    result.current.setForm((previous) => ({ ...previous, name: "Keep draft" })),
  );
  await act(async () => {
    await result.current.save();
  });
  assert.equal(result.current.camps.length, 0);
  assert.equal(result.current.modal, true);
  assert.equal(result.current.form.name, "Keep draft");
  assert.match(result.current.error, /Database unavailable/);
});

test("React payment controls save the shared owner before updating totals", async () => {
  function Payments() {
    return createElement(PaymentsTable, { p: usePlanner(2026) });
  }
  render(createElement(Payments));
  const button = await screen.findByRole("button", {
    name: /Kayleigh · YMCA: Paid.*shared payment/,
  });
  fireEvent.click(button);
  await waitFor(() =>
    assert.equal(button.getAttribute("aria-pressed"), "false"),
  );
  assert.ok(screen.getByText("$669.80 unpaid"));
  assert.equal(
    getCampStore()
      .getSeason(2026)
      .camps.find((camp) => camp.id === "owen-2026-week-6").paid,
    false,
  );
});

test("full planner switches years, adds camps, and saves family settings with Done", async () => {
  render(createElement(CampPlanner));
  await screen.findByRole("heading", { name: "Overview", exact: true });
  await uiReady();
  fireEvent.click(
    screen.getByRole("button", { name: "Schedule", exact: true }),
  );
  assert.ok(screen.getByRole("heading", { name: "Weekly schedule" }));
  fireEvent.click(screen.getByRole("button", { name: "Month", exact: true }));
  assert.ok(screen.getByRole("heading", { name: "Calendar", exact: true }));
  fireEvent.change(screen.getByRole("combobox", { name: "Summer year" }), {
    target: { value: "2027" },
  });
  await waitFor(() =>
    assert.equal(
      screen.getByRole("combobox", { name: "Summer year" }).value,
      "2027",
    ),
  );
  await uiReady();
  fireEvent.click(screen.getByRole("button", { name: "Add a camp" }));
  fireEvent.change(screen.getByLabelText("Camp name"), {
    target: { value: "Year switch test" },
  });
  fireEvent.change(screen.getByLabelText("Cost ($)"), {
    target: { value: "215.50" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Add camp", exact: true }),
  );
  await waitFor(() => assert.ok(!screen.queryByRole("dialog")));
  assert.equal(getCampStore().getSeason(2027).camps[0].cost, 215.5);
  fireEvent.click(
    screen.getAllByRole("button", { name: "Family settings", exact: true })[0],
  );
  fireEvent.change(screen.getByLabelText("Camper 1"), {
    target: { value: "Renamed camper" },
  });
  assert.notEqual(getCampStore().getSeason(2027).kids[0], "Renamed camper");
  fireEvent.click(screen.getByRole("button", { name: "Done", exact: true }));
  await waitFor(() => assert.ok(!screen.queryByRole("dialog")));
  assert.equal(getCampStore().getSeason(2027).kids[0], "Renamed camper");
  cleanup();
  render(createElement(CampPlanner));
  await screen.findByRole("heading", { name: "Overview", exact: true });
  await uiReady();
  assert.equal(
    screen.getByRole("combobox", { name: "Summer year" }).value,
    "2027",
  );
  assert.equal(getCampStore().getIndex().selectedYear, 2027);
});

test("browser migration is explicit and leaves the old browser data intact", async () => {
  const original = loadSeason(2026);
  const legacy = {
    camps: original.camps.slice(1),
    kids: ["Browser Owen", "Kayleigh"],
    handoffBuffer: 40,
    appliedImports: original.appliedImports,
  };
  const raw = JSON.stringify(legacy);
  localStorage.setItem("camp-days-2026", raw);
  render(createElement(CampPlanner));
  await screen.findByRole("heading", { name: "Overview", exact: true });
  await uiReady();
  assert.equal(getCampStore().getSeason(2026).camps.length, 22);
  fireEvent.click(screen.getByRole("button", { name: "Migrate browser plan" }));
  await screen.findByText(/Migrated browser plan for 2026/);
  assert.equal(getCampStore().getSeason(2026).camps.length, 21);
  assert.equal(getCampStore().getSeason(2026).kids[0], "Browser Owen");
  assert.equal(localStorage.getItem("camp-days-2026"), raw);
  assert.ok(!screen.queryByRole("button", { name: "Migrate browser plan" }));
});

test("camp API rejects foreign-origin writes and invalid years without altering plans", async () => {
  const request = new Request("http://localhost:3000/api/camp-schedule/2026", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.com",
    },
    body: JSON.stringify({ action: "deleteCamp", id: "x", revision: 0 }),
  });
  assert.equal(
    (await seasonPatch(request, { params: Promise.resolve({ year: "2026" }) }))
      .status,
    403,
  );
  assert.equal(
    (
      await seasonGet(new Request("http://localhost/api/camp-schedule/nope"), {
        params: Promise.resolve({ year: "nope" }),
      })
    ).status,
    400,
  );
  assert.equal(getCampStore().getSeason(2026).camps.length, 22);
});
test("old saves migrate types and retain edited values and deleted entries", () => {
  const original = loadSeason(2026);
  original.camps = original.camps.filter((c) => c.id !== "owen-2026-week-2");
  original.camps.find((c) => c.id === "owen-2026-week-1").type = "adventure";
  const noCamp = original.camps.find((c) => c.id === "kayleigh-2026-week-10");
  noCamp.type = "none";
  delete noCamp.noCamp;
  const migrated = loadSeason(2026, {
    getItem: () => JSON.stringify(original),
  });
  assert.equal(migrated.camps.length, 21);
  assert.equal(
    migrated.camps.find((c) => c.id === "owen-2026-week-1").type,
    "Sports",
  );
  assert.equal(migrated.camps.find((c) => c.id === noCamp.id).noCamp, true);
});

test("handoffs compare pickup/drop-off pairs across kids and ignore wishlist and no-care entries", () => {
  const { camps } = loadSeason(2026);
  assert.equal(handoffWarnings(camps, "2026-06-22", 30)[0].gap, 15);
  assert.equal(handoffWarnings(camps, "2026-06-22", 10).length, 0);
  assert.equal(handoffWarnings(camps, "2026-08-17", 30).length, 0);
  assert.equal(formatTime("12:00"), "12:00 PM");
  assert.equal(formatTime("08:45"), "8:45 AM");
  assert.equal(formatTime(null), "N/A");
  const make = (kid, dropoff, pickup) => ({
    id: String(kid),
    kid,
    name: "Camp",
    start: "2026-06-15",
    end: "2026-06-19",
    status: "Confirmed",
    type: "Other",
    dropoff,
    pickup,
  });
  assert.ok(
    handoffWarnings(
      [make(0, "08:00", "12:00"), make(1, "12:15", "17:00")],
      "2026-06-15",
      30,
    ).some((w) => w.a.kind === "pickup" && w.b.kind === "dropoff"),
  );
  assert.equal(
    handoffWarnings(
      [
        { ...make(1, "08:00", "12:00"), status: "Wishlist" },
        make(0, "08:00", "12:00"),
      ],
      "2026-06-15",
      30,
    ).length,
    0,
  );
});

test("Needs attention routes to care weeks and handoff weeks, and saved payments and prices leave the queue", async () => {
  const store = getCampStore();
  let plan = store.getSeason(2026);
  plan = store.mutate(2026, {
    action: "togglePaid",
    id: "kayleigh-2026-week-6",
    revision: plan.revision,
  });
  const missing = plan.camps.find((camp) => camp.id === "kayleigh-2026-week-1");
  plan = store.mutate(2026, {
    action: "saveCamp",
    camp: { ...missing, cost: null },
    editing: true,
    revision: plan.revision,
  });
  render(createElement(CampPlanner));
  await screen.findByRole("heading", { name: "Overview", exact: true });
  await uiReady();
  fireEvent.click(screen.getByRole("button", { name: /Needs attention/ }));
  let view = within(
    screen.getByRole("region", { name: "Needs attention overview" }),
  );
  const payments = within(view.getByRole("region", { name: "Unpaid camps" }));
  assert.equal(payments.getAllByRole("listitem").length, 1);
  fireEvent.click(payments.getByRole("button", { name: /Edit payment/ }));
  let dialog = within(
    await screen.findByRole("dialog", { name: "Camp details" }),
  );
  fireEvent.change(dialog.getByLabelText("Payment status"), {
    target: { value: "true" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.ok(!screen.queryByRole("dialog")));
  assert.ok(view.getByText("No unpaid camp costs."));
  fireEvent.click(
    within(view.getByRole("region", { name: "Missing prices" })).getByRole(
      "button",
      { name: /Add price/ },
    ),
  );
  dialog = within(await screen.findByRole("dialog", { name: "Camp details" }));
  fireEvent.change(dialog.getByLabelText("Cost ($)"), {
    target: { value: "0" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.ok(!screen.queryByRole("dialog")));
  assert.ok(view.getByText("All camp prices are recorded."));
  fireEvent.click(
    within(view.getByRole("region", { name: "Missing care" })).getByRole(
      "button",
      { name: /View week/ },
    ),
  );
  assert.ok(screen.getByRole("heading", { name: "Weekly schedule" }));
  assert.equal(screen.getByLabelText("Week of").value, "2026-08-17");
  fireEvent.click(screen.getByRole("button", { name: /Needs attention/ }));
  view = within(
    screen.getByRole("region", { name: "Needs attention overview" }),
  );
  fireEvent.click(
    within(view.getByRole("region", { name: "Handoff alerts" })).getAllByRole(
      "button",
      { name: /Review week/ },
    )[0],
  );
  assert.ok(screen.getByRole("heading", { name: "Weekly schedule" }));
  assert.equal(screen.getByLabelText("Week of").value, "2026-06-15");
  assert.ok(screen.getAllByText("Owen", { selector: "strong" }).length > 0);
});

test("Needs attention reports all clear when both campers have full care, known costs and no handoff alerts", async () => {
  const store = getCampStore();
  store.selectYear(2027);
  const plan = store.getSeason(2027);
  const entries = [0, 1].map((kid) => ({
    id: `full-care-${kid}`,
    name: `Full care ${kid}`,
    kid,
    start: "2027-06-14",
    end: "2027-08-27",
    location: "",
    cost: 0,
    paid: false,
    status: "Confirmed",
    type: "Grandparent",
    dropoff: null,
    pickup: null,
  }));
  store.mutate(2027, {
    action: "restore",
    revision: plan.revision,
    plan: {
      year: 2027,
      kids: ["One", "Two"],
      handoffBuffer: 30,
      camps: entries,
    },
  });
  render(createElement(CampPlanner));
  await screen.findByRole("heading", { name: "Overview", exact: true });
  await uiReady();
  fireEvent.click(screen.getByRole("button", { name: /Needs attention/ }));
  assert.ok(screen.getByRole("heading", { name: "Nothing needs attention" }));
  assert.match(
    screen.getByRole("button", { name: /Needs attention/ }).textContent,
    /0$/,
  );
});
