export type Camp = {
  id: string;
  name: string;
  kid: number;
  start: string;
  end: string;
  time?: string;
  dropoff?: string | null;
  pickup?: string | null;
  location: string;
  paid?: boolean;
  cost: number | null;
  costIncludedIn?: string;
  status: string;
  type: string;
  noCamp?: boolean;
};

export type CareWeek = {
  start: string;
  end: string;
  label: string;
  filled: boolean[];
};
export type MissingWeek = {
  kid: string;
  kidIndex: number;
  start: string;
  end: string;
  reason: string;
};
export type PaymentRow = {
  key: string;
  label: string;
  dates: string;
  entries: Camp[][];
};
export type CalendarDay = {
  number: number;
  current: boolean;
  date: string;
  weekday: number;
};
export type WeekDay = {
  date: string;
  label: string;
  camps: Camp[];
  warnings: ReturnType<typeof import("./lib/handoffs").handoffWarnings>;
};
