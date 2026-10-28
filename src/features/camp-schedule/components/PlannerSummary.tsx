import { CalendarDays, Wallet, ArrowUpRight } from "lucide-react";
import type { PlannerState } from "../usePlanner";
export default function PlannerSummary({ p }: { p: PlannerState }) {
  return (
    <section className="stats">
      <button
        type="button"
        className="stat care-stat"
        aria-haspopup="dialog"
        onClick={() => p.setMissingOpen(true)}
      >
        <div className="stat-label">
          WEEKS WITH CARE <CalendarDays size={18} />
        </div>
        <div className="stat-number">
          {p.covered}
          <span className="fraction"> / {p.totalCamperWeeks}</span>
          <span>kid-weeks</span>
        </div>
        <div className="mini-progress">
          <span
            style={{ width: `${(p.covered / p.totalCamperWeeks) * 100}%` }}
          />
        </div>
        <div className="stat-foot">
          {p.missingWeeks.length} open
          <span className="missing-link">
            View missing weeks <ArrowUpRight size={13} />
          </span>
        </div>
      </button>
      <div className="stat">
        <div className="stat-label">
          AMOUNT PAID <Wallet size={18} />
        </div>
        <div className="stat-number">{p.currency(p.total)}</div>
        {!!p.unpaidTotal && (
          <div className="stat-foot">{p.currency(p.unpaidTotal)} unpaid</div>
        )}
      </div>
    </section>
  );
}
