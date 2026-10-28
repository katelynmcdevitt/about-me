import { ArrowUpRight, X } from "lucide-react";
import type { PlannerState } from "../usePlanner";
import Modal from "./Modal";
export default function MissingWeeksDialog({ p }: { p: PlannerState }) {
  return (
    <Modal
      className="missing-weeks-dialog"
      labelledBy="missing-weeks-title"
      onClose={() => p.setMissingOpen(false)}
    >
      <button
        className="close"
        aria-label="Close missing weeks"
        onClick={() => p.setMissingOpen(false)}
      >
        <X size={21} />
      </button>
      <h2 id="missing-weeks-title">Missing weeks</h2>
      {!p.missingWeeks.length && (
        <p className="empty">Care arranged for all weeks.</p>
      )}
      {p.missingWeeks.map((week) => (
        <button
          key={`${week.kidIndex}-${week.start}`}
          className="missing-week"
          onClick={() => p.viewMissingWeek(week.start, week.kidIndex)}
        >
          <span className={`avatar kid-${week.kidIndex}`}>
            {week.kid.slice(0, 1)}
          </span>
          <span className="missing-week-info">
            <strong>{week.kid}</strong>
            <span>
              {p.dateLabel(week.start)} – {p.dateLabel(week.end)},{" "}
              {week.start.slice(0, 4)}
            </span>
            <small>{week.reason}</small>
          </span>
          <span className="missing-link">
            View week <ArrowUpRight size={14} />
          </span>
        </button>
      ))}
    </Modal>
  );
}
