import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { load } from "./load-module.mjs";

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
// JSDOM does not implement the dialog API.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const { renderHook, act, cleanup, render, fireEvent, screen } =
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

test.beforeEach(() => {
  localStorage.clear();
});
test.afterEach(() => {
  cleanup();
});

test("supplied schedule retains totals, shared payments, coverage and handoffs", () => {
  const { result } = renderHook(() => usePlanner(2026));
  const p = () => result.current;
  assert.equal(p().camps.length, 22);
  assert.equal(p().total, 4726.8);
  assert.deepEqual(p().paidByKid, [2959.8, 1767]);
  assert.equal(p().covered, 21);
  assert.equal(p().missingWeeks.length, 1);
  assert.deepEqual(p().missingWeeks[0], {
    kid: "Kayleigh",
    kidIndex: 1,
    start: "2026-08-17",
    end: "2026-08-21",
    reason: "No camp",
  });
  const shared = p().camps.find((c) => c.id === "kayleigh-2026-week-6");
  act(() => p().togglePaid(shared));
  assert.equal(p().paymentLabel(shared), "Unpaid");
  assert.equal(p().total, 4057);
  assert.equal(p().unpaidTotal, 669.8);
  act(() => p().togglePaid(shared));
  assert.equal(p().total, 4726.8);
  act(() => p().setFilter(0));
  assert.ok(p().weekDays.every((day) => day.camps.every((c) => c.kid === 0)));
  assert.equal(p().weekWarningDays, 5);
  assert.equal(p().weekDays[0].warnings.length, 2);
});

test("camp edits, deletions and settings persist separately for each summer", () => {
  let hook = renderHook(() => usePlanner(2026));
  act(() => {
    hook.result.current.setKids(["Owen edited", "Kayleigh"]);
    hook.result.current.setHandoffBuffer(45);
    hook.result.current.open(hook.result.current.camps[0]);
  });
  act(() => hook.result.current.remove());
  const saved2026 = localStorage.getItem("camp-days-2026");
  hook.unmount();
  hook = renderHook(() => usePlanner(2027));
  assert.equal(hook.result.current.camps.length, 0);
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
  act(() => hook.result.current.save());
  assert.equal(hook.result.current.camps.length, 1);
  assert.equal(hook.result.current.total, 0);
  assert.equal(hook.result.current.unpaidTotal, 500);
  assert.equal(
    hook.result.current.paymentRows.flatMap((row) => row.entries.flat()).length,
    1,
  );
  assert.equal(hook.result.current.paymentRows.length, 11);
  act(() => hook.result.current.open(hook.result.current.camps[0]));
  act(() =>
    hook.result.current.setForm((previous) => ({
      ...previous,
      name: "Edited",
      paid: true,
    })),
  );
  act(() => hook.result.current.save());
  assert.equal(hook.result.current.total, 500);
  assert.equal(localStorage.getItem("camp-days-2026"), saved2026);
  hook.unmount();
  hook = renderHook(() => usePlanner(2026));
  assert.equal(hook.result.current.camps.length, 21);
  assert.equal(hook.result.current.kids[0], "Owen edited");
  assert.equal(hook.result.current.handoffBuffer, 45);
  hook.unmount();
  hook = renderHook(() => usePlanner(2027));
  assert.equal(hook.result.current.camps[0].name, "Edited");
  act(() => hook.result.current.open(hook.result.current.camps[0]));
  act(() => hook.result.current.remove());
  hook.unmount();
  hook = renderHook(() => usePlanner(2027));
  assert.deepEqual(hook.result.current.camps, []);
});

test("invalid names, dates and times cannot be saved", () => {
  const { result } = renderHook(() => usePlanner(2027));
  const original = result.current.form;
  for (const fields of [
    { name: "  " },
    { name: "Wrong year", start: "2026-06-15" },
    { name: "Reversed", end: "2027-06-13" },
    { name: "Times", dropoff: "15:00", pickup: "08:00" },
  ]) {
    act(() => result.current.setForm({ ...original, ...fields }));
    act(() => result.current.save());
    assert.ok(result.current.error);
    assert.equal(result.current.camps.length, 0);
  }
});

test("missing weeks opens the matching week and camper", () => {
  const { result } = renderHook(() => usePlanner(2026));
  act(() => result.current.viewMissingWeek("2026-08-17", 1));
  assert.equal(result.current.tab, "Schedule");
  assert.equal(result.current.calendarView, "week");
  assert.equal(result.current.filter, 1);
  act(() => result.current.selectWeek("2026-07-22"));
  assert.equal(result.current.selectedWeek, "2026-07-20");
  act(() => result.current.moveWeek(-1));
  assert.equal(result.current.selectedWeek, "2026-07-13");
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

test("backup import accepts original exports, preserves deletions, rejects wrong year and invalid files", async () => {
  const { result, unmount } = renderHook(() => usePlanner(2026));
  window.confirm = () => true;
  const exported = {
    year: 2026,
    kids: ["Owen imported", "Kayleigh"],
    camps: result.current.camps.slice(1),
    handoffBuffer: 20,
  };
  await act(async () =>
    result.current.importData({ text: async () => JSON.stringify(exported) }),
  );
  assert.equal(result.current.camps.length, 21);
  assert.equal(result.current.kids[0], "Owen imported");
  assert.equal(result.current.handoffBuffer, 20);
  unmount();
  const next = renderHook(() => usePlanner(2026));
  assert.equal(next.result.current.camps.length, 21);
  await act(async () =>
    next.result.current.importData({
      text: async () => JSON.stringify({ ...exported, year: 2027 }),
    }),
  );
  assert.match(next.result.current.importMessage, /Select Summer 2027/);
  assert.equal(next.result.current.camps.length, 21);
  assert.throws(() =>
    parseSavedPlan({ kids: ["A", "B"], camps: [{ id: "x" }] }),
  );
  assert.throws(() => parseSavedPlan({ ...exported, handoffBuffer: -1 }));
  window.confirm = () => false;
  await act(async () =>
    next.result.current.importData({
      text: async () => JSON.stringify({ ...exported, camps: [] }),
    }),
  );
  assert.equal(next.result.current.camps.length, 21);
});

test("storage failures still allow editing and warn the user", () => {
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = () => {
    throw new Error("Full");
  };
  try {
    const { result } = renderHook(() => usePlanner(2027));
    assert.equal(result.current.storageError, true);
    act(() =>
      result.current.setForm((previous) => ({
        ...previous,
        name: "Still editable",
      })),
    );
    act(() => result.current.save());
    assert.equal(result.current.camps[0].name, "Still editable");
  } finally {
    dom.window.Storage.prototype.setItem = original;
  }
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

test("React dialog submits decimal costs, closes, and renders missing-week navigation", () => {
  function Editor() {
    const p = usePlanner(2027);
    return createElement(PlannerDialogs, { p });
  }
  render(createElement(Editor));
  fireEvent.change(screen.getByLabelText("Camp name"), {
    target: { value: "React camp" },
  });
  fireEvent.change(screen.getByLabelText("Cost ($)"), {
    target: { value: "215.50" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Add camp", exact: true }),
  );
  assert.equal(
    JSON.parse(localStorage.getItem("camp-days-2027")).camps[0].cost,
    215.5,
  );
  cleanup();
  const initial = loadSeason(2026);
  const derived = derivePlan(
    initial.camps,
    initial.kids,
    initial.season,
    -1,
    2026,
    5,
    "2026-06-15",
    30,
  );
  let viewed;
  render(
    createElement(MissingWeeksDialog, {
      p: {
        ...derived,
        setMissingOpen: () => {},
        viewMissingWeek: (...args) => {
          viewed = args;
        },
      },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: /View week/ }));
  assert.deepEqual(viewed, ["2026-08-17", 1]);
});

test("React payment buttons toggle the shared owner and update the displayed total", () => {
  function Payments() {
    const p = usePlanner(2026);
    return createElement(PaymentsTable, { p });
  }
  render(createElement(Payments));
  const button = screen.getByRole("button", {
    name: /Kayleigh · YMCA: Paid.*shared payment/,
  });
  fireEvent.click(button);
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.ok(screen.getByText("$669.80 unpaid"));
  assert.equal(
    JSON.parse(localStorage.getItem("camp-days-2026")).camps.find(
      (c) => c.id === "owen-2026-week-6",
    ).paid,
    false,
  );
});

test("full React planner navigates views, switches years, and restores saved selection", () => {
  render(createElement(CampPlanner));
  assert.ok(screen.getByRole("heading", { name: "Overview", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "Schedule", exact: true }),
  );
  assert.ok(screen.getByRole("heading", { name: "Weekly schedule" }));
  fireEvent.click(screen.getByRole("button", { name: "Month", exact: true }));
  assert.ok(screen.getByRole("heading", { name: "Calendar", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /^Camps/ }));
  assert.ok(screen.getByRole("heading", { name: "All camps", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "Payments", exact: true }),
  );
  assert.ok(screen.getByRole("table"));
  fireEvent.change(screen.getByRole("combobox", { name: "Summer year" }), {
    target: { value: "2027" },
  });
  assert.equal(localStorage.getItem("camp-days-selected-year"), "2027");
  assert.ok(screen.getByText("0 camps"));
  fireEvent.click(screen.getByRole("button", { name: "Add a camp" }));
  fireEvent.change(screen.getByLabelText("Camp name"), {
    target: { value: "Year switch test" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Add camp", exact: true }),
  );
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(
    JSON.parse(localStorage.getItem("camp-days-2027")).camps.length,
    1,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Summer year" }), {
    target: { value: "2026" },
  });
  assert.ok(screen.getByText("22 camps"));
  cleanup();
  render(createElement(CampPlanner));
  assert.equal(
    screen.getByRole("combobox", { name: "Summer year" }).value,
    "2026",
  );
  fireEvent.click(
    screen.getAllByRole("button", { name: "Family settings", exact: true })[0],
  );
  fireEvent.change(screen.getByLabelText("Camper 1"), {
    target: { value: "Renamed camper" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Done", exact: true }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(
    JSON.parse(localStorage.getItem("camp-days-2026")).kids[0],
    "Renamed camper",
  );
});
