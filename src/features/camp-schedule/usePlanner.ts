import { useEffect, useRef, useState } from "react";
import { derivePlan, loadSeason, parseSavedPlan } from "./model";
import general from "./data/general.json";
import type { Camp } from "./types";
import type { CampCommand, CampSeason } from "./contracts";

type CampMutation = CampCommand extends infer T
  ? T extends CampCommand
    ? Omit<T, "revision">
    : never
  : never;
async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Could not load or save the camp plan.");
  return data as T;
}
export function usePlanner(seasonYear: number) {
  const [initial] = useState(() => loadSeason(seasonYear));
  const { season, seasonStart, defaultCampEnd, totalCamperWeeks, storageKey } =
    initial;
  const [snapshot, setSnapshot] = useState<CampSeason | null>(null);
  const current = snapshot ?? {
    year: seasonYear,
    camps: [],
    kids: initial.kids,
    handoffBuffer: initial.handoffBuffer,
    appliedImports: [],
    revision: 0,
    browserMigrated: false,
  };
  const { camps, kids, handoffBuffer } = current;
  const snapshotRef = useRef(current);
  snapshotRef.current = current;
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [settingsKids, setKids] = useState(initial.kids);
  const [settingsHandoffBuffer, setHandoffBuffer] = useState(
    initial.handoffBuffer,
  );
  const [calendarView, setCalendarView] = useState<"month" | "week">("week");
  const [selectedWeek, setSelectedWeek] = useState(season.coverageStart);
  const [tab, setTab] = useState("Overview");
  const [filter, setFilter] = useState(-1);
  const [month, setMonth] = useState(seasonStart.getMonth());
  const [year, setYear] = useState(season.year);
  const [missingOpen, setMissingOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [settings, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState("");
  const [editRevision, setEditRevision] = useState(0);
  const [error, setError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [legacyPlan, setLegacyPlan] = useState<unknown>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? { ...JSON.parse(stored), year: seasonYear } : null;
    } catch {
      return null;
    }
  });
  const blank = (): Omit<Camp, "id"> => ({
    ...general.newCamp,
    name: "",
    kid: 0,
    start: season.coverageStart,
    end: defaultCampEnd,
    location: "",
  });
  const [form, setForm] = useState(blank);
  const path = `/api/camp-schedule/${seasonYear}`;
  function apply(data: CampSeason, resetDrafts = true) {
    setSnapshot(data);
    if (resetDrafts) {
      setKids(data.kids);
      setHandoffBuffer(data.handoffBuffer);
    }
  }
  useEffect(() => {
    let active = true;
    fetch(path, { cache: "no-store" })
      .then(readResponse<CampSeason>)
      .then((data) => {
        if (active) apply(data);
      })
      .catch((cause) => {
        if (active)
          setRequestError(
            cause instanceof Error
              ? cause.message
              : "Could not load this summer.",
          );
      });
    return () => {
      active = false;
    };
  }, [path]);
  async function reload() {
    try {
      apply(
        await readResponse<CampSeason>(
          await fetch(path, { cache: "no-store" }),
        ),
      );
      setRequestError("");
    } catch (cause) {
      setRequestError(
        cause instanceof Error ? cause.message : "Could not load this summer.",
      );
    }
  }
  async function mutate(
    command: CampMutation,
    revision = snapshotRef.current.revision,
  ): Promise<boolean> {
    if (pending.current || !snapshot) return false;
    pending.current = true;
    setBusy(true);
    setRequestError("");
    setError("");
    try {
      const response = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command, revision }),
      });
      if (response.status === 409) {
        const cause = await response.json();
        apply(
          await readResponse<CampSeason>(
            await fetch(path, { cache: "no-store" }),
          ),
          false,
        );
        throw new Error(
          `${cause.error} Close and reopen any editor before saving its draft.`,
        );
      }
      apply(await readResponse<CampSeason>(response));
      return true;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not save this change.";
      setError(message);
      setRequestError(message);
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
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
  const togglePaid = (camp: Camp) =>
    mutate({ action: "togglePaid", id: camp.id });
  const setSettings = (open: boolean) => {
    if (busy) return;
    setKids(snapshotRef.current.kids);
    setHandoffBuffer(snapshotRef.current.handoffBuffer);
    setError("");
    setRequestError("");
    setEditRevision(snapshotRef.current.revision);
    setSettingsOpen(open);
  };
  async function saveSettings(close = true) {
    if (
      !close &&
      JSON.stringify(settingsKids) === JSON.stringify(kids) &&
      settingsHandoffBuffer === handoffBuffer
    )
      return true;
    const saved = await mutate(
      {
        action: "settings",
        kids: settingsKids,
        handoffBuffer: settingsHandoffBuffer,
      },
      close ? editRevision : snapshotRef.current.revision,
    );
    if (saved && close) setSettingsOpen(false);
    return saved;
  }
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
    setRequestError("");
    setEditRevision(snapshotRef.current.revision);
    setModal(true);
  };
  const save = async () => {
    if (!form.name.trim() || !form.start || !form.end) {
      setError("Add a camp name and both dates.");
      return false;
    }
    const saved = await mutate(
      {
        action: "saveCamp",
        editing: !!editing,
        camp: {
          ...form,
          name: form.name.trim(),
          id: editing || crypto.randomUUID(),
          cost: typeof form.cost === "number" ? form.cost : null,
        },
      },
      editRevision,
    );
    if (saved) setModal(false);
    return saved;
  };
  const remove = async () => {
    const saved = await mutate(
      { action: "deleteCamp", id: editing },
      editRevision,
    );
    if (saved) setModal(false);
    return saved;
  };
  const move = (offset: number) => {
    const date = new Date(year, month + offset);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
  };
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              year: season.year,
              kids,
              camps,
              handoffBuffer,
              appliedImports: current.appliedImports,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `camp-days-${season.year}-backup.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importData = async (file: File) => {
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Choose a backup smaller than 4 MB.");
      const raw = JSON.parse(await file.text());
      parseSavedPlan(raw);
      if (raw.year !== seasonYear)
        throw new Error(
          `Select Summer ${raw.year ?? "matching the backup"} before importing this file.`,
        );
      if (
        !window.confirm(
          `Replace the ${seasonYear} database plan with this backup? Export the current plan first to keep it.`,
        )
      )
        return;
      if (await mutate({ action: "restore", plan: raw }))
        setImportMessage(
          `Imported ${raw.camps.length} camps for ${seasonYear}.`,
        );
    } catch (cause) {
      setImportMessage(
        cause instanceof Error ? cause.message : "Could not read this backup.",
      );
    }
  };
  const migrateBrowser = async () => {
    try {
      const legacy = parseSavedPlan(legacyPlan);
      if (
        !window.confirm(
          `Replace the ${seasonYear} database plan (${camps.length} camps) with this browser's saved plan (${legacy.camps.length} camps)? Export the database plan first to keep it.`,
        )
      )
        return;
      if (await mutate({ action: "migrateBrowser", plan: legacyPlan })) {
        setLegacyPlan(null);
        setImportMessage(
          `Migrated browser plan for ${seasonYear}. The old browser save is unchanged.`,
        );
      }
    } catch (cause) {
      setRequestError(
        cause instanceof Error
          ? cause.message
          : "Could not migrate this browser plan.",
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
    setKids,
    setHandoffBuffer,
    settingsKids,
    settingsHandoffBuffer,
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
    requestError,
    storageError: !!requestError,
    busy,
    loaded: !!snapshot,
    reload,
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
    saveSettings,
    hasBrowserPlan: legacyPlan !== null && !current.browserMigrated,
    migrateBrowser,
  };
}
export type PlannerState = ReturnType<typeof usePlanner>;
