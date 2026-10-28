"use client";

import { useEffect, useState } from "react";
import { Plus, ChevronDown, Download, Upload } from "lucide-react";
import general from "./data/general.json";
import Link from "next/link";
import type { CampIndex } from "./contracts";
import { usePlanner } from "./usePlanner";
import PlannerSidebar from "./components/PlannerSidebar";
import PlannerSummary from "./components/PlannerSummary";
import WeeklySchedule from "./components/WeeklySchedule";
import MonthCalendar from "./components/MonthCalendar";
import CampList from "./components/CampList";
import CareOverview from "./components/CareOverview";
import PaymentsTable from "./components/PaymentsTable";
import MissingWeeksDialog from "./components/MissingWeeksDialog";
import PlannerDialogs from "./components/PlannerDialogs";
import styles from "./CampPlanner.module.css";

function Planner({
  seasonYear,
  years,
  changeYear,
}: {
  seasonYear: number;
  years: number[];
  changeYear: (year: number) => void;
}) {
  const p = usePlanner(seasonYear);
  return (
    <div className={styles.root}>
      {!p.loaded && !p.requestError && (
        <p className="camp-status" role="status">
          Loading this summer’s plan…
        </p>
      )}
      {p.requestError && (
        <div className="camp-error" role="alert">
          {p.requestError}
          {!p.loaded && (
            <button
              onClick={() => {
                void p.reload();
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
      <fieldset className="app-shell" disabled={p.busy || !p.loaded}>
        <PlannerSidebar p={p} />
        <main>
          <header>
            <div className="breadcrumb">
              <b>{p.tab}</b>
            </div>
            <div className="header-right">
              <label className="season-picker">
                Summer
                <span className="season-select">
                  <select
                    value={p.season.year}
                    aria-label="Summer year"
                    onChange={(e) => changeYear(Number(e.target.value))}
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </span>
              </label>
              <button
                className="family-avatar"
                onClick={() => p.setSettings(true)}
                aria-label="Family settings"
              >
                K
              </button>
            </div>
          </header>
          <div className="page-content">
            <div className="page-heading">
              <h1>{p.tab}</h1>
              <button className="primary" onClick={() => p.open()}>
                <Plus size={17} /> Add a camp
              </button>
            </div>
            {p.loaded && p.hasBrowserPlan && (
              <div className="warning">
                <span>
                  A saved {p.season.year} plan is available in this browser.
                </span>
                <button
                  onClick={() => {
                    void p.migrateBrowser();
                  }}
                >
                  Migrate browser plan
                </button>
              </div>
            )}
            {!!p.conflicts.length && (
              <div className="warning">
                {p.conflicts.length} overlapping bookings for the same camper.
              </div>
            )}
            {!!p.unknownCosts && (
              <div className="warning">
                {p.unknownCosts} missing prices · excluded from totals
              </div>
            )}
            {(p.tab === "Overview" || p.tab === "Payments") && (
              <PlannerSummary p={p} />
            )}
            {p.tab === "Schedule" && <WeeklySchedule p={p} />}
            {p.tab !== "Payments" && (
              <div
                className={`main-grid ${p.tab !== "Overview" ? "full-grid" : ""}`}
              >
                {(p.tab === "Overview" ||
                  (p.tab === "Schedule" && p.calendarView === "month")) && (
                  <MonthCalendar p={p} />
                )}
                {(p.tab === "Overview" || p.tab === "Camps") && (
                  <CampList p={p} />
                )}
              </div>
            )}
            {(p.tab === "Overview" || p.tab === "Schedule") && (
              <CareOverview p={p} />
            )}
            {p.tab === "Payments" && <PaymentsTable p={p} />}
            <footer>
              <button onClick={p.exportData}>
                <Download size={14} /> Export backup
              </button>
              <label className="import-backup">
                <Upload size={14} /> Import backup
                <input
                  type="file"
                  accept=".json,application/json"
                  aria-label="Import backup"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void p.importData(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </footer>
            {p.importMessage && (
              <p className="import-message" role="status">
                {p.importMessage}
              </p>
            )}
          </div>
        </main>
      </fieldset>
      {p.missingOpen && <MissingWeeksDialog p={p} />}
      {(p.modal || p.settings) && <PlannerDialogs p={p} />}
    </div>
  );
}

export default function CampPlanner() {
  const [savedSelection] = useState(() => {
    let year = general.season.year;
    const years = Array.from({ length: 6 }, (_, i) => year + i);
    try {
      const saved = Number(localStorage.getItem("camp-days-selected-year"));
      if (Number.isInteger(saved) && saved >= 2000 && saved <= 2100)
        year = saved;
      for (let i = 0; i < localStorage.length; i++) {
        const match = localStorage.key(i)?.match(/^camp-days-(\d{4})$/);
        if (match) years.push(Number(match[1]));
      }
    } catch {}
    return { year, years };
  });
  const [selection, setSelection] = useState<CampIndex | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [changingYear, setChangingYear] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/camp-schedule", {
          cache: "no-store",
        });
        let data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load camp plans.");
        if (data.selectedYear === null) {
          const selected = await fetch("/api/camp-schedule", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ year: savedSelection.year }),
          });
          data = await selected.json();
          if (!selected.ok)
            throw new Error(
              data.error || "Could not remember the selected summer.",
            );
        }
        if (active) {
          setSelection(data);
          setSelectionError("");
        }
      } catch (cause) {
        if (active)
          setSelectionError(
            cause instanceof Error
              ? cause.message
              : "Could not load camp plans.",
          );
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [reload, savedSelection.year]);
  const changeYear = async (year: number) => {
    if (changingYear) return;
    setChangingYear(true);
    setSelectionError("");
    try {
      const response = await fetch("/api/camp-schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not select this summer.");
      setSelection(data);
    } catch (cause) {
      setSelectionError(
        cause instanceof Error
          ? cause.message
          : "Could not select this summer.",
      );
    } finally {
      setChangingYear(false);
    }
  };
  if (!selection || selection.selectedYear === null)
    return (
      <div className={styles.root}>
        <div className="camp-boot">
          <Link href="/apps">← All apps</Link>
          {selectionError ? (
            <div role="alert">
              {selectionError}
              <button onClick={() => setReload((value) => value + 1)}>
                Retry
              </button>
            </div>
          ) : (
            <p role="status">Loading Camp Days…</p>
          )}
        </div>
      </div>
    );
  const years = [
    ...new Set([
      ...selection.years,
      ...savedSelection.years,
      selection.selectedYear,
    ]),
  ].sort((a, b) => a - b);
  return (
    <>
      {selectionError && <p role="alert">{selectionError}</p>}
      <fieldset
        className="season-switch"
        disabled={changingYear}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <Planner
          key={selection.selectedYear}
          seasonYear={selection.selectedYear}
          years={years}
          changeYear={(year) => {
            void changeYear(year);
          }}
        />
      </fieldset>
    </>
  );
}
