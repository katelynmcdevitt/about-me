import { loadSeason, parseSavedPlan } from "../../features/camp-schedule/model";
import type { Camp } from "../../features/camp-schedule/types";
import { HttpError } from "../http";

export function validYear(value: unknown): number {
  const year =
    typeof value === "string" && /^\d{4}$/.test(value) ? Number(value) : value;
  if (
    typeof year !== "number" ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  )
    throw new HttpError("Select a summer between 2000 and 2100.");
  return year;
}
function validDate(value: string, year: number) {
  if (!new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function validatePlan(year: number, value: unknown) {
  let plan;
  try {
    plan = parseSavedPlan(value);
  } catch (cause) {
    throw new HttpError(
      cause instanceof Error ? cause.message : "Invalid camp schedule.",
    );
  }
  if (plan.kids.some((name) => !name.trim() || name.length > 24))
    throw new HttpError("Use camper names of 1–24 characters.");
  if (!Number.isInteger(plan.handoffBuffer))
    throw new HttpError("Use a whole number of minutes for handoff alerts.");
  if (plan.camps.length > 2000)
    throw new HttpError("A summer can contain up to 2,000 camps.");
  for (const camp of plan.camps) {
    if (
      !camp.id ||
      camp.id.length > 200 ||
      !camp.name.trim() ||
      camp.name.length > 300 ||
      camp.location.length > 1000 ||
      (camp.time !== undefined &&
        (typeof camp.time !== "string" || camp.time.length > 100))
    )
      throw new HttpError("Add a valid camp name, identifier, and location.");
    if (!validDate(camp.start, year) || !validDate(camp.end, year))
      throw new HttpError(`Use valid camp dates in ${year}.`);
    if (camp.dropoff && camp.pickup && camp.pickup <= camp.dropoff)
      throw new HttpError("Pickup must be after drop-off.");
    if (
      !["Confirmed", "Pending", "Wishlist"].includes(camp.status) ||
      ![
        "Dance",
        "Theater",
        "Soccer",
        "Sports",
        "YMCA",
        "Grandparent",
        "Other",
      ].includes(camp.type)
    )
      throw new HttpError("Choose a valid camp status and type.");
    if (camp.costIncludedIn) {
      const owner = plan.camps.find((item) => item.id === camp.costIncludedIn);
      if (!owner || owner.id === camp.id || owner.costIncludedIn)
        throw new HttpError(
          "Shared payments must link directly to another camp in this summer.",
        );
      if (camp.cost != null)
        throw new HttpError(
          "A shared payment cannot also have a separate cost.",
        );
    }
  }
  return {
    ...plan,
    appliedImports: plan.appliedImports ?? [],
    kids: plan.kids.map((name) => name.trim()),
    camps: plan.camps.map((camp): Camp => ({
      id: camp.id,
      name: camp.name.trim(),
      kid: camp.kid,
      start: camp.start,
      end: camp.end,
      location: camp.location,
      cost: camp.cost ?? null,
      paid: camp.paid ?? false,
      status: camp.status,
      type: camp.type,
      noCamp: camp.noCamp ?? false,
      dropoff: camp.dropoff || null,
      pickup: camp.pickup || null,
      ...(camp.time ? { time: camp.time } : {}),
      ...(camp.costIncludedIn ? { costIncludedIn: camp.costIncludedIn } : {}),
    })),
  };
}
export function importedPlan(year: number, value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { year?: unknown }).year !== year
  )
    throw new HttpError(
      `Select Summer ${String((value as { year?: unknown } | null)?.year ?? "matching the backup")} before importing this file.`,
    );
  let plan;
  try {
    plan = parseSavedPlan(value);
  } catch (cause) {
    throw new HttpError(
      cause instanceof Error ? cause.message : "Invalid backup.",
    );
  }
  // Imported plans are authoritative, including empty schedules and deleted supplied camps.
  const loaded = loadSeason(year, {
    getItem: () =>
      JSON.stringify({
        ...plan,
        appliedImports: ["owen-2026-v1", "handoff-times-2026-v1"],
      }),
  });
  const ids = new Set(loaded.camps.map((camp) => camp.id));
  // Earlier browser-only versions could leave a dangling payment link after deleting its owner.
  const camps = loaded.camps.map((camp) => {
    if (
      !camp.costIncludedIn ||
      (ids.has(camp.costIncludedIn) && camp.cost == null)
    )
      return camp;
    const { costIncludedIn: _link, ...detached } = camp;
    return ids.has(camp.costIncludedIn)
      ? detached
      : { ...detached, cost: null, paid: false };
  });
  return validatePlan(year, { ...loaded, camps, kids: plan.kids });
}
