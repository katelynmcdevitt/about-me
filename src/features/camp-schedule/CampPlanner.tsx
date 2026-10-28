"use client";

import { useState } from "react";
import { Plus, ChevronDown, Download, Upload } from "lucide-react";
import general from "./data/general.json";
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
      <div className="app-shell">
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
            {p.storageError && (
              <div className="warning" role="alert">
                Changes not saved. Export a backup.
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
        {p.missingOpen && <MissingWeeksDialog p={p} />}
        {(p.modal || p.settings) && <PlannerDialogs p={p} />}
      </div>
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
  const [year, setYear] = useState(savedSelection.year);
  const years = [...new Set([...savedSelection.years, year])].sort(
    (a, b) => a - b,
  );
  const changeYear = (year: number) => {
    try {
      localStorage.setItem("camp-days-selected-year", String(year));
    } catch {}
    setYear(year);
  };
  return (
    <Planner
      key={year}
      seasonYear={year}
      years={years}
      changeYear={changeYear}
    />
  );
}
