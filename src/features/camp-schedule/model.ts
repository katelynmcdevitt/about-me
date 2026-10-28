import owen from "./data/owen.json";
import kayleigh from "./data/kayleigh.json";
import general from "./data/general.json";
import { handoffWarnings } from "./lib/handoffs";
import type { Camp } from "./types";
export type SavedPlan = {
  camps: Camp[];
  kids: string[];
  handoffBuffer: number;
  appliedImports?: string[];
};
export function parseSavedPlan(value: unknown): SavedPlan {
  if (!value || typeof value !== "object") throw new Error("Invalid backup.");
  const plan = value as SavedPlan;
  if (
    !Array.isArray(plan.kids) ||
    plan.kids.length !== 2 ||
    !plan.kids.every((k) => typeof k === "string") ||
    !Array.isArray(plan.camps) ||
    !plan.camps.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        typeof c.name === "string" &&
        Number.isInteger(c.kid) &&
        c.kid >= 0 &&
        c.kid < plan.kids.length &&
        typeof c.start === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.start) &&
        typeof c.end === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.end) &&
        c.end >= c.start &&
        typeof c.status === "string" &&
        typeof c.type === "string" &&
        typeof c.location === "string" &&
        (c.cost == null ||
          (typeof c.cost === "number" &&
            Number.isFinite(c.cost) &&
            c.cost >= 0)) &&
        (c.dropoff == null ||
          (typeof c.dropoff === "string" &&
            /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(c.dropoff))) &&
        (c.pickup == null ||
          (typeof c.pickup === "string" &&
            /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(c.pickup))) &&
        (c.paid === undefined || typeof c.paid === "boolean") &&
        (c.noCamp === undefined || typeof c.noCamp === "boolean") &&
        (c.costIncludedIn === undefined ||
          typeof c.costIncludedIn === "string"),
    )
  )
    throw new Error(
      "Choose a Camp Days JSON backup with two campers and valid camp entries.",
    );
  if (new Set(plan.camps.map((c) => c.id)).size !== plan.camps.length)
    throw new Error("Backup contains duplicate camp IDs.");
  if (
    plan.appliedImports !== undefined &&
    (!Array.isArray(plan.appliedImports) ||
      !plan.appliedImports.every((v) => typeof v === "string"))
  )
    throw new Error("Invalid import history.");
  if (
    plan.handoffBuffer !== undefined &&
    (!Number.isFinite(plan.handoffBuffer) ||
      plan.handoffBuffer < 0 ||
      plan.handoffBuffer > 180)
  )
    throw new Error("Handoff gap must be between 0 and 180 minutes.");
  return {
    ...plan,
    handoffBuffer: plan.handoffBuffer ?? general.handoffBufferMinutes,
  };
}
export function loadSeason(
  seasonYear: number,
  storage?: Pick<Storage, "getItem">,
) {
  // Each mounted planner owns one season; switching years remounts it.
  const coverageDate = new Date(seasonYear, 5, 15, 12);
  coverageDate.setDate(
    coverageDate.getDate() - ((coverageDate.getDay() + 6) % 7),
  );
  const season =
    seasonYear === general.season.year
      ? general.season
      : {
          ...general.season,
          year: seasonYear,
          coverageStart: `${coverageDate.getFullYear()}-${String(coverageDate.getMonth() + 1).padStart(2, "0")}-${String(coverageDate.getDate()).padStart(2, "0")}`,
        };
  const campers = [owen, kayleigh];
  const initial: Camp[] = campers.flatMap((camper, kid) =>
    camper.camps.map((camp) => ({ ...camp, kid })),
  );
  const seasonStart = new Date(season.coverageStart + "T12:00:00");
  const firstWeekEnd = new Date(seasonStart);
  firstWeekEnd.setDate(firstWeekEnd.getDate() + season.daysPerWeek - 1);
  const defaultCampEnd = `${firstWeekEnd.getFullYear()}-${String(firstWeekEnd.getMonth() + 1).padStart(2, "0")}-${String(firstWeekEnd.getDate()).padStart(2, "0")}`;
  const totalCamperWeeks = season.weekCount * campers.length;
  const storageKey = `camp-days-${season.year}`;
  let saved: SavedPlan | null = null;
  try {
    saved = parseSavedPlan(JSON.parse(storage?.getItem(storageKey) || "null"));
  } catch {}
  const importedSchedule = "owen-2026-v1";
  const appliedImports: string[] = [...(saved?.appliedImports ?? [])];
  const startingCamps: Camp[] = saved?.camps
    ? structuredClone(saved.camps)
    : season.year === general.season.year
      ? structuredClone(initial)
      : [];
  // Add this supplied schedule once without replacing existing browser edits.
  if (
    season.year === general.season.year &&
    !appliedImports.includes(importedSchedule)
  ) {
    for (const camp of initial.filter((camp) => camp.kid === 0)) {
      if (!startingCamps.some((existing) => existing.id === camp.id))
        startingCamps.push({ ...camp });
    }
    const sharedCamp = startingCamps.find(
      (camp) => camp.id === "kayleigh-2026-week-6",
    );
    if (sharedCamp && sharedCamp.cost == null)
      sharedCamp.costIncludedIn = "owen-2026-week-6";
    appliedImports.push(importedSchedule);
  }
  const timesImport = "handoff-times-2026-v1";
  if (
    season.year === general.season.year &&
    !appliedImports.includes(timesImport)
  ) {
    for (const camp of startingCamps) {
      const source = initial.find((item) => item.id === camp.id);
      if (!source) continue;
      if (camp.dropoff === undefined) camp.dropoff = source.dropoff;
      if (camp.pickup === undefined) camp.pickup = source.pickup;
    }
    appliedImports.push(timesImport);
  }
  for (const camp of startingCamps) {
    if (camp.paid === undefined)
      camp.paid =
        initial.find((source) => source.id === camp.id)?.paid ?? false;
  }
  // Migrate the old categories without changing any other saved camp details.
  const campTypes = [
    "Dance",
    "Theater",
    "Soccer",
    "Sports",
    "YMCA",
    "Grandparent",
    "Other",
  ];
  for (const camp of startingCamps) {
    if (!campTypes.includes(camp.type)) {
      if (camp.type === "none") camp.noCamp = true;
      const name = camp.name.toLowerCase();
      camp.type = name.includes("dance")
        ? "Dance"
        : name.includes("soccer")
          ? "Soccer"
          : name === "ymca"
            ? "YMCA"
            : camp.type === "family"
              ? "Grandparent"
              : ["football", "sports"].some((sport) => name.includes(sport))
                ? "Sports"
                : "Other";
    }
  }
  const sampleNames = ["Oliver", "Emma"];
  const kids = campers.map((camper, index) => {
    const savedName = saved?.kids?.[index];
    return savedName && savedName !== sampleNames[index]
      ? savedName
      : camper.name;
  });
  return {
    season,
    seasonStart,
    defaultCampEnd,
    totalCamperWeeks,
    storageKey,
    camps: startingCamps,
    kids,
    handoffBuffer: saved?.handoffBuffer ?? general.handoffBufferMinutes,
    appliedImports,
  };
}
export function derivePlan(
  camps: Camp[],
  kids: string[],
  season: ReturnType<typeof loadSeason>["season"],
  filter: number,
  year: number,
  month: number,
  selectedWeek: string,
  handoffBuffer: number,
) {
  const seasonStart = new Date(season.coverageStart + "T12:00:00");
  const dateLabel = (s: string) =>
    new Date(s + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  const visible = camps
    .filter((c) => filter < 0 || c.kid === filter)
    .sort((a, b) => a.start.localeCompare(b.start));
  const total = camps
    .filter((c) => c.status !== "Wishlist" && c.paid)
    .reduce((s, c) => s + (c.cost ?? 0), 0);
  const unpaidTotal = camps
    .filter((c) => c.status !== "Wishlist" && !c.paid)
    .reduce((s, c) => s + (c.cost ?? 0), 0);
  const unknownCosts = camps.filter(
    (c) => c.status !== "Wishlist" && c.cost == null && !c.costIncludedIn,
  ).length;
  const currency = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const costLabel = (camp: Camp) =>
    camp.cost == null
      ? camp.costIncludedIn
        ? "Included in Owen’s YMCA cost"
        : "Cost not provided"
      : currency(camp.cost);
  const monthName = new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const days = (() => {
    const offset = new Date(year, month, 1).getDay();
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(year, month, i - offset + 1);
      return {
        number: d.getDate(),
        current: d.getMonth() === month,
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        weekday: d.getDay(),
      };
    });
  })();
  const forDay = (date: string) =>
    visible.filter(
      (c) => c.start <= date && c.end >= date && c.status !== "Wishlist",
    );
  const conflicts = camps.filter(
    (c, i) =>
      c.status !== "Wishlist" &&
      camps.some(
        (o, j) =>
          i !== j &&
          o.status !== "Wishlist" &&
          o.kid === c.kid &&
          c.start <= o.end &&
          c.end >= o.start,
      ),
  );
  const weeks = Array.from({ length: season.weekCount }, (_, i) => {
    const d = new Date(seasonStart);
    d.setDate(d.getDate() + i * 7);
    const end = new Date(d);
    end.setDate(end.getDate() + season.daysPerWeek - 1);
    const iso = (v: Date) =>
      `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
    return {
      start: iso(d),
      end: iso(end),
      label: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      filled: kids.map((_, k) =>
        camps.some(
          (c) =>
            c.kid === k &&
            c.status === "Confirmed" &&
            !c.noCamp &&
            c.start <= iso(d) &&
            c.end >= iso(end),
        ),
      ),
    };
  });
  const paymentRows = (() => {
    const rows = weeks.map((week, index) => ({
      key: week.start,
      label: `Week ${index + 1}`,
      dates: `${dateLabel(week.start)} – ${dateLabel(week.end)}`,
      entries: kids.map(() => [] as Camp[]),
    }));
    const other = {
      key: "other",
      label: "Other dates",
      dates: "",
      entries: kids.map(() => [] as Camp[]),
    };
    for (const camp of camps) {
      // Show each payment once, even when a camp spans multiple weeks.
      const index = weeks.findIndex(
        (week) => camp.start <= week.end && camp.end >= week.start,
      );
      const row = index < 0 ? other : rows[index]!;
      row.entries[camp.kid]?.push(camp);
    }
    if (other.entries.some((entries) => entries.length)) rows.push(other);
    return rows;
  })();
  const paidByKid = kids.map((_, kid) =>
    camps
      .filter((c) => c.kid === kid && c.status !== "Wishlist" && c.paid)
      .reduce((sum, camp) => sum + (camp.cost ?? 0), 0),
  );
  const missingWeeks = kids.flatMap((kid, index) =>
    weeks
      .filter((week) => !week.filled[index])
      .map((week) => ({
        kid,
        kidIndex: index,
        start: week.start,
        end: week.end,
        reason: camps.some(
          (c) =>
            c.kid === index &&
            c.noCamp &&
            c.start <= week.start &&
            c.end >= week.end,
        )
          ? "No camp"
          : "Care not confirmed for the full week",
      })),
  );
  const localISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(selectedWeek + "T12:00:00");
    d.setDate(d.getDate() + i);
    const date = localISO(d);
    return {
      date,
      label: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      camps: visible.filter(
        (c) => c.start <= date && c.end >= date && c.status !== "Wishlist",
      ),
      warnings: handoffWarnings(camps, date, handoffBuffer),
    };
  });
  const weekWarningDays = weekDays.filter((day) => day.warnings.length).length;
  const covered = weeks.reduce(
    (s, w) => s + w.filled.filter(Boolean).length,
    0,
  );
  return {
    visible,
    total,
    unpaidTotal,
    unknownCosts,
    currency,
    costLabel,
    monthName,
    days,
    forDay,
    conflicts,
    weeks,
    paymentRows,
    paidByKid,
    missingWeeks,
    weekDays,
    weekWarningDays,
    covered,
    dateLabel,
  };
}
