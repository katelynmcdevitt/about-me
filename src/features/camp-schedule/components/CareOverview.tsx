import { Fragment, type CSSProperties } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import type { PlannerState } from "../usePlanner";
export default function CareOverview({ p }: { p: PlannerState }) {
  return (
    <section className="panel coverage-panel">
      <div className="panel-heading">
        <div>
          <h2>Weeks with care</h2>
        </div>
        <button
          className="missing-link"
          aria-haspopup="dialog"
          onClick={() => p.setMissingOpen(true)}
        >
          Missing weeks ({p.missingWeeks.length})<ArrowUpRight size={14} />
        </button>
      </div>
      <div className="coverage-scroll">
        <div
          className="coverage-table"
          style={{ "--week-count": p.weeks.length } as CSSProperties}
        >
          <div />
          {p.weeks.map((week) => (
            <div key={week.start} className="week-label">
              {week.label}
            </div>
          ))}
          {p.kids.map((kid, i) => (
            <Fragment key={i}>
              <div className="coverage-kid">
                <span className={`avatar kid-${i}`}>{kid.slice(0, 1)}</span>
                {kid}
              </div>
              {p.weeks.map((week) => (
                <div
                  key={week.start}
                  className={`coverage-cell ${week.filled[i] ? "is-filled" : ""} coverage-${i}`}
                >
                  {week.filled[i] ? "Care arranged" : "Open week"}
                  {week.filled[i] && <Check size={12} />}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
