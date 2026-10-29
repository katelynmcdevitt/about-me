import type { Camp, MissingWeek } from "./types";
import { handoffWarnings } from "./lib/handoffs";

const iso = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
export function attentionItems(
  camps: Camp[],
  missingWeeks: MissingWeek[],
  year: number,
  handoffBuffer: number,
) {
  const payable = camps.filter(
    (camp) => camp.status !== "Wishlist" && !camp.costIncludedIn,
  );
  const unpaid = payable
    .filter((camp) => (camp.cost ?? 0) > 0 && !camp.paid)
    .sort((a, b) => a.start.localeCompare(b.start));
  const missingPrices = payable
    .filter((camp) => camp.cost == null)
    .sort((a, b) => a.start.localeCompare(b.start));
  const weeks = new Map<
    string,
    { start: string; end: string; days: number; warnings: number }
  >();
  const active = camps.filter(
    (camp) =>
      camp.status !== "Wishlist" &&
      !camp.noCamp &&
      (camp.dropoff || camp.pickup),
  );
  if (active.length) {
    const first = active.reduce(
      (date, camp) => (camp.start < date ? camp.start : date),
      `${year}-12-31`,
    );
    const last = active.reduce(
      (date, camp) => (camp.end > date ? camp.end : date),
      `${year}-01-01`,
    );
    for (
      const day = new Date(`${first}T12:00:00Z`);
      iso(day) <= last;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      if (
        day.getUTCFullYear() !== year ||
        day.getUTCDay() === 0 ||
        day.getUTCDay() === 6
      )
        continue;
      const warnings = handoffWarnings(active, iso(day), handoffBuffer);
      if (!warnings.length) continue;
      const monday = new Date(day);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      const start = iso(monday),
        friday = new Date(monday);
      friday.setUTCDate(friday.getUTCDate() + 4);
      const week = weeks.get(start) ?? {
        start,
        end: iso(friday),
        days: 0,
        warnings: 0,
      };
      week.days++;
      week.warnings += warnings.length;
      weeks.set(start, week);
    }
  }
  const handoffs = [...weeks.values()].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  return {
    missingWeeks,
    unpaid,
    missingPrices,
    handoffs,
    count:
      missingWeeks.length +
      unpaid.length +
      missingPrices.length +
      handoffs.length,
  };
}
