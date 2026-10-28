import type { Camp } from "./types";
export type CampSeason = {
  year: number;
  camps: Camp[];
  kids: string[];
  handoffBuffer: number;
  appliedImports: string[];
  revision: number;
  browserMigrated: boolean;
};
export type CampIndex = { years: number[]; selectedYear: number | null };
export type CampCommand =
  | { action: "saveCamp"; revision: number; camp: Camp; editing: boolean }
  | { action: "deleteCamp"; revision: number; id: string }
  | { action: "togglePaid"; revision: number; id: string }
  | {
      action: "settings";
      revision: number;
      kids: string[];
      handoffBuffer: number;
    }
  | { action: "restore" | "migrateBrowser"; revision: number; plan: unknown };
