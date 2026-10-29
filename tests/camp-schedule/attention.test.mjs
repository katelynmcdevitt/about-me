import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-module.mjs";
const { attentionItems } = await load("attention.ts");
const camp = (changes) => ({
  id: "camp",
  name: "Camp",
  kid: 0,
  start: "2027-05-03",
  end: "2027-05-07",
  location: "",
  cost: 100,
  paid: false,
  type: "Other",
  status: "Confirmed",
  ...changes,
});

test("attention counts each payable owner once and excludes free, wishlist and included costs", () => {
  const camps = [
    camp({ id: "owner" }),
    camp({ id: "shared", kid: 1, cost: null, costIncludedIn: "owner" }),
    camp({ id: "missing", cost: null }),
    camp({ id: "included-missing", cost: null, costIncludedIn: "missing" }),
    camp({ id: "free", cost: 0 }),
    camp({ id: "wish", status: "Wishlist", cost: null }),
  ];
  const result = attentionItems(camps, [], 2027, 30);
  assert.deepEqual(
    result.unpaid.map((camp) => camp.id),
    ["owner"],
  );
  assert.deepEqual(
    result.missingPrices.map((camp) => camp.id),
    ["missing"],
  );
  assert.equal(result.count, 2);
});

test("handoff alerts include weekday bookings outside coverage weeks and are grouped by Monday", () => {
  const camps = [
    camp({ id: "first", dropoff: "09:00", pickup: "15:00" }),
    camp({ id: "second", kid: 1, dropoff: "09:15", pickup: "16:00" }),
    camp({
      id: "weekend",
      kid: 1,
      start: "2027-05-08",
      end: "2027-05-09",
      dropoff: "09:00",
    }),
  ];
  const result = attentionItems(camps, [], 2027, 30);
  assert.deepEqual(result.handoffs, [
    { start: "2027-05-03", end: "2027-05-07", days: 5, warnings: 5 },
  ]);
  assert.equal(attentionItems(camps, [], 2027, 10).handoffs.length, 0);
  assert.equal(
    attentionItems(
      camps.map((camp) => ({ ...camp, status: "Wishlist" })),
      [],
      2027,
      30,
    ).handoffs.length,
    0,
  );
});

test("care gaps use daily coverage so consecutive partial-week camps cover the week together", async () => {
  const { derivePlan, loadSeason } = await load("model.ts");
  const initial = loadSeason(2027);
  const camps = [
    camp({ id: "early", start: "2027-06-14", end: "2027-06-16" }),
    camp({ id: "late", start: "2027-06-17", end: "2027-06-18" }),
  ];
  const derived = derivePlan(
    camps,
    initial.kids,
    initial.season,
    -1,
    2027,
    5,
    "2027-06-14",
    30,
  );
  assert.equal(derived.weeks[0].filled[0], true);
  assert.ok(
    !derived.missingWeeks.some(
      (week) => week.kidIndex === 0 && week.start === "2027-06-14",
    ),
  );
  const gap = derivePlan(
    [camps[0]],
    initial.kids,
    initial.season,
    -1,
    2027,
    5,
    "2027-06-14",
    30,
  );
  assert.ok(
    gap.missingWeeks.some(
      (week) => week.kidIndex === 0 && week.start === "2027-06-14",
    ),
  );
});
