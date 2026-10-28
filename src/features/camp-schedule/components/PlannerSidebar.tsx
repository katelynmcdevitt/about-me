import Link from "next/link";
import {
  Sun,
  CalendarDays,
  LayoutDashboard,
  Tent,
  Wallet,
  Settings2,
  ArrowLeft,
} from "lucide-react";
import type { PlannerState } from "../usePlanner";

export default function PlannerSidebar({ p }: { p: PlannerState }) {
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => p.setTab("Overview")}>
        <span className="brand-mark">
          <Sun size={25} />
        </span>
        camp days<span className="brand-dot">.</span>
      </button>
      <nav aria-label="Camp planner">
        {[
          { name: "Overview", icon: LayoutDashboard },
          { name: "Schedule", icon: CalendarDays },
          { name: "Camps", icon: Tent },
          { name: "Payments", icon: Wallet },
        ].map(({ name, icon: Icon }) => (
          <button
            key={name}
            className={p.tab === name ? "active" : ""}
            onClick={() => p.setTab(name)}
            aria-current={p.tab === name ? "page" : undefined}
          >
            <Icon size={19} />
            {name}
            {name === "Camps" && (
              <span className="nav-count">{p.camps.length}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-kids">
        <div className="workspace-label">
          YOUR CAMPERS
          <button aria-label="Edit campers" onClick={() => p.setSettings(true)}>
            <Settings2 size={14} />
          </button>
        </div>
        {p.kids.map((kid, i) => (
          <button
            key={i}
            onClick={() => p.setFilter(p.filter === i ? -1 : i)}
            className={`kid-row ${p.filter === i ? "selected" : ""}`}
            aria-pressed={p.filter === i}
          >
            <span className={`avatar kid-${i}`}>{kid.slice(0, 1)}</span>
            <span>{kid}</span>
            <span className={`kid-dot dot-${i}`} />
          </button>
        ))}
      </div>
      <button className="settings-link" onClick={() => p.setSettings(true)}>
        <Settings2 size={17} /> Family settings
      </button>
      <Link className="back-link" href="/apps">
        <ArrowLeft size={14} /> All apps
      </Link>
      <div className="local-note" role="status">
        <span />
        {p.storageError ? "Not saved" : "Saved on this device"}
      </div>
    </aside>
  );
}
