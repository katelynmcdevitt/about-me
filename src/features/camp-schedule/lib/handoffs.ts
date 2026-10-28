export type TimedCamp = {
  id: string;
  name: string;
  kid: number;
  start: string;
  end: string;
  status: string;
  type: string;
  noCamp?: boolean;
  dropoff?: string | null;
  pickup?: string | null;
};
export function formatTime(time?: string | null): string {
  if (!time) return "N/A";
  const [hour, minute] = time.split(":").map(Number);
  return `${hour! % 12 || 12}:${String(minute).padStart(2, "0")} ${hour! < 12 ? "AM" : "PM"}`;
}
export function handoffWarnings(
  camps: TimedCamp[],
  date: string,
  buffer: number,
) {
  const events = camps
    .filter(
      (c) =>
        c.start <= date &&
        c.end >= date &&
        c.status !== "Wishlist" &&
        !c.noCamp &&
        c.type !== "none",
    )
    .flatMap((c) =>
      (["dropoff", "pickup"] as const).flatMap((kind) => {
        const time = c[kind];
        if (!time) return [];
        const [h, m] = time.split(":").map(Number);
        return [{ camp: c, kind, time, minutes: h! * 60 + m! }];
      }),
    )
    .sort((a, b) => a.minutes - b.minutes);
  const warnings = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]!,
        b = events[j]!;
      const gap = b.minutes - a.minutes;
      if (gap > buffer) break;
      if (a.camp.kid !== b.camp.kid) warnings.push({ a, b, gap });
    }
  }
  return warnings;
}
