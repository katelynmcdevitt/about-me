import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { formatTime } from "../lib/handoffs";
import type { PlannerState } from "../usePlanner";
export default function WeeklySchedule({ p }: { p: PlannerState }) {
  return (
    <section className="panel weekly-panel">
      <div className="panel-heading">
        <div>
          <h2>
            {p.calendarView === "week" ? "Weekly schedule" : "Monthly schedule"}
          </h2>
        </div>
        <div className="filter">
          <button
            className={p.calendarView === "week" ? "chosen" : ""}
            onClick={() => p.setCalendarView("week")}
          >
            Week
          </button>
          <button
            className={p.calendarView === "month" ? "chosen" : ""}
            onClick={() => p.setCalendarView("month")}
          >
            Month
          </button>
        </div>
      </div>
      {p.calendarView === "week" && (
        <>
          <div className="week-toolbar">
            <div className="month-control">
              <button aria-label="Previous week" onClick={() => p.moveWeek(-1)}>
                <ChevronLeft size={18} />
              </button>
              <strong>
                {p.dateLabel(p.selectedWeek)} –{" "}
                {p.dateLabel(p.weekDays[4]!.date)}, {p.selectedWeek.slice(0, 4)}
              </strong>
              <button aria-label="Next week" onClick={() => p.moveWeek(1)}>
                <ChevronRight size={18} />
              </button>
            </div>
            <label>
              Week of
              <input
                type="date"
                value={p.selectedWeek}
                onChange={(e) => p.selectWeek(e.target.value)}
              />
            </label>
          </div>
          <div className="handoff-summary">
            <Clock size={16} />
            <span>
              {p.weekWarningDays
                ? `${p.weekWarningDays} days with handoff alerts`
                : "No handoff alerts"}{" "}
              · Both kids · Travel unchecked
            </span>
            <label>
              Gap ≤
              <input
                type="number"
                min={0}
                max={180}
                value={p.settingsHandoffBuffer}
                onBlur={() => {
                  void p.saveSettings(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                onChange={(e) =>
                  p.setHandoffBuffer(
                    Math.max(0, Math.min(180, Number(e.target.value))),
                  )
                }
              />
              min
            </label>
          </div>
          <div className="weekly-scroll">
            <div className="weekly-grid">
              {p.weekDays.map((day) => (
                <article key={day.date} className="week-day">
                  <h3>{day.label}</h3>
                  {p.kids.map(
                    (kid, i) =>
                      (p.filter < 0 || p.filter === i) && (
                        <section
                          key={i}
                          className={`week-camper week-camper-${i}`}
                        >
                          <strong>{kid}</strong>
                          {day.camps
                            .filter((c) => c.kid === i)
                            .map((camp) => (
                              <button
                                key={camp.id}
                                className="week-booking"
                                onClick={() => p.open(camp)}
                              >
                                <b>{camp.name}</b>
                                {camp.noCamp ? (
                                  <span>No camp</span>
                                ) : camp.type === "Grandparent" ? (
                                  <span>Family care</span>
                                ) : (
                                  <>
                                    <span>
                                      Drop-off{" "}
                                      <em>{formatTime(camp.dropoff)}</em>
                                    </span>
                                    <span>
                                      Pickup <em>{formatTime(camp.pickup)}</em>
                                    </span>
                                  </>
                                )}
                                {camp.location && (
                                  <small>{camp.location}</small>
                                )}
                                {camp.status === "Pending" && (
                                  <small>Pending</small>
                                )}
                              </button>
                            ))}
                          {!day.camps.some((c) => c.kid === i) && (
                            <p className="time-help">No booking</p>
                          )}
                        </section>
                      ),
                  )}
                  {day.warnings.map((warning, i) => (
                    <div key={i} className="handoff-alert">
                      <b>
                        {warning.gap === 0
                          ? "Same-time handoffs"
                          : `${warning.gap}-minute gap`}
                      </b>
                      <span>
                        {p.kids[warning.a.camp.kid]} ·{" "}
                        {warning.a.kind === "dropoff" ? "Drop-off" : "Pickup"}{" "}
                        {formatTime(warning.a.time)}
                      </span>
                      <span>
                        {p.kids[warning.b.camp.kid]} ·{" "}
                        {warning.b.kind === "dropoff" ? "Drop-off" : "Pickup"}{" "}
                        {formatTime(warning.b.time)}
                      </span>
                      <small>
                        {warning.a.camp.name === warning.b.camp.name
                          ? "Shared stop?"
                          : "Check travel time"}
                      </small>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
