import { useEffect, useState } from "react";
import { derivePlan, loadSeason, parseSavedPlan } from "./model";
import general from "./data/general.json";
import type { Camp } from "./types";

export function usePlanner(seasonYear: number) {
  const [initial] = useState(() => {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {}
    return loadSeason(seasonYear, storage);
  });
  const { season, seasonStart, defaultCampEnd, totalCamperWeeks, storageKey } =
    initial;
  const [camps, setCamps] = useState(initial.camps);
  const [kids, setKids] = useState(initial.kids);
  const [handoffBuffer, setHandoffBuffer] = useState(initial.handoffBuffer);
  const [appliedImports, setAppliedImports] = useState(initial.appliedImports);
  const [calendarView, setCalendarView] = useState<"month" | "week">("week");
  const [selectedWeek, setSelectedWeek] = useState(season.coverageStart);
  const [tab, setTab] = useState("Overview");
  const [filter, setFilter] = useState(-1);
  const [month, setMonth] = useState(seasonStart.getMonth());
  const [year, setYear] = useState(season.year);
  const [missingOpen, setMissingOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState("");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const blank = (): Omit<Camp, "id"> => ({
    ...general.newCamp,
    name: "",
    kid: 0,
    start: season.coverageStart,
    end: defaultCampEnd,
    location: "",
  });
  const [form, setForm] = useState(blank);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ camps, kids, handoffBuffer, appliedImports }),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [storageKey, camps, kids, handoffBuffer, appliedImports]);

  const derived = derivePlan(
    camps,
    kids,
    season,
    filter,
    year,
    month,
    selectedWeek,
    handoffBuffer,
  );
  const hasSeparateCost = (camp: Camp) =>
    !camp.costIncludedIn && (camp.cost ?? 0) > 0;
  const paymentOwner = (camp: Camp): Camp =>
    camps.find((c) => c.id === camp.costIncludedIn) ?? camp;
  const paymentLabel = (camp: Camp) => {
    const owner = paymentOwner(camp);
    if (owner.cost === 0) return "No payment due";
    if (owner.cost == null) return "Cost needed";
    return owner.paid ? "Paid" : "Unpaid";
  };
  const togglePaid = (camp: Camp) => {
    const id = paymentOwner(camp).id;
    setCamps((previous) =>
      previous.map((c) => (c.id === id ? { ...c, paid: !c.paid } : c)),
    );
  };
  const viewMissingWeek = (start: string, kid: number) => {
    setSelectedWeek(start);
    setFilter(kid);
    setCalendarView("week");
    setTab("Schedule");
    setMissingOpen(false);
  };
  const localISO = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const moveWeek = (offset: number) => {
    const date = new Date(selectedWeek + "T12:00:00");
    date.setDate(date.getDate() + offset * 7);
    setSelectedWeek(localISO(date));
  };
  const selectWeek = (value: string) => {
    const date = new Date(value + "T12:00:00");
    if (Number.isNaN(date.getTime())) return;
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    setSelectedWeek(localISO(date));
  };
  const open = (camp?: Camp) => {
    setEditing(camp?.id ?? "");
    setForm(camp ? { ...camp } : blank());
    setError("");
    setModal(true);
  };
  const save = () => {
    if (!form.name.trim() || !form.start || !form.end) {
      setError("Add a camp name and both dates.");
      return;
    }
    if (
      !form.start.startsWith(`${season.year}-`) ||
      !form.end.startsWith(`${season.year}-`)
    ) {
      setError(`Use dates in ${season.year}, or select another year.`);
      return;
    }
    if (form.end < form.start) {
      setError("The end date must be on or after the start date.");
      return;
    }
    if (form.dropoff && form.pickup && form.pickup <= form.dropoff) {
      setError("Pickup must be after drop-off.");
      return;
    }
    if (form.cost != null && (!Number.isFinite(form.cost) || form.cost < 0)) {
      setError("Enter a valid cost.");
      return;
    }
    const camp: Camp = {
      ...form,
      cost: typeof form.cost === "number" ? form.cost : null,
      name: form.name.trim(),
      id: editing || crypto.randomUUID(),
    };
    setCamps((previous) =>
      editing
        ? previous.map((c) => (c.id === editing ? camp : c))
        : [...previous, camp],
    );
    setModal(false);
  };
  const remove = () => {
    setCamps((previous) => previous.filter((c) => c.id !== editing));
    setModal(false);
  };
  const move = (offset: number) => {
    const date = new Date(year, month + offset);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
  };
  const exportData = () => {
    const anchor = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { year: season.year, kids, camps, handoffBuffer },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    anchor.href = url;
    anchor.download = `camp-days-${season.year}-backup.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importData = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const plan = parseSavedPlan(raw);
      if (
        raw.year !== season.year ||
        plan.camps.some(
          (c) =>
            !c.start.startsWith(`${season.year}-`) ||
            !c.end.startsWith(`${season.year}-`),
        )
      )
        throw new Error(
          `Select Summer ${raw.year ?? "matching the backup"} before importing this file.`,
        );
      if (
        !window.confirm(
          `Replace the ${season.year} plan on this device with this backup? Export first to keep the current plan.`,
        )
      )
        return;
      // Treat imported backups as authoritative, including deleted supplied entries.
      const imports =
        season.year === general.season.year
          ? ["owen-2026-v1", "handoff-times-2026-v1"]
          : [];
      const loaded = loadSeason(season.year, {
        getItem: () => JSON.stringify({ ...plan, appliedImports: imports }),
      });
      setCamps(loaded.camps);
      setKids(loaded.kids);
      setHandoffBuffer(loaded.handoffBuffer);
      setAppliedImports(loaded.appliedImports);
      setImportMessage(
        `Imported ${plan.camps.length} camps for ${season.year}.`,
      );
    } catch (cause) {
      setImportMessage(
        cause instanceof Error ? cause.message : "Could not read this backup.",
      );
    }
  };
  return {
    ...derived,
    season,
    totalCamperWeeks,
    camps,
    kids,
    handoffBuffer,
    setHandoffBuffer,
    setKids,
    calendarView,
    setCalendarView,
    selectedWeek,
    tab,
    setTab,
    filter,
    setFilter,
    missingOpen,
    setMissingOpen,
    modal,
    setModal,
    settings,
    setSettings,
    editing,
    error,
    storageError,
    form,
    setForm,
    hasSeparateCost,
    paymentOwner,
    paymentLabel,
    togglePaid,
    viewMissingWeek,
    moveWeek,
    selectWeek,
    open,
    save,
    remove,
    move,
    exportData,
    importData,
    importMessage,
  };
}
export type PlannerState = ReturnType<typeof usePlanner>;
