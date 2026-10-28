import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { PlannerState } from "../usePlanner";
export default function MonthCalendar({ p }: { p: PlannerState }) {
  return (
    <section className="panel calendar-panel">
      <div className="panel-heading">
        <div>
          <h2>Calendar</h2>
        </div>
        <button
          className="icon-btn"
          title="View all camps"
          onClick={() => p.setTab("Camps")}
        >
          <ArrowUpRight size={19} />
        </button>
      </div>
      <div className="calendar-toolbar">
        <div className="month-control">
          <h3>{p.monthName}</h3>
          <button aria-label="Previous month" onClick={() => p.move(-1)}>
            <ChevronLeft size={17} />
          </button>
          <button aria-label="Next month" onClick={() => p.move(1)}>
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="filter">
          <button
            className={p.filter === -1 ? "chosen" : ""}
            onClick={() => p.setFilter(-1)}
          >
            Both kids
          </button>
          {p.kids.map((kid, i) => (
            <button
              key={i}
              className={p.filter === i ? "chosen" : ""}
              onClick={() => p.setFilter(i)}
            >
              <i className={`dot-${i}`} />
              {kid}
            </button>
          ))}
        </div>
      </div>
      <div className="calendar">
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
          <div key={d} className="weekday">
            {d}
          </div>
        ))}
        {p.days.map((day) => (
          <div
            key={day.date}
            className={`day ${!day.current ? "muted" : ""} ${day.weekday === 0 || day.weekday === 6 ? "weekend" : ""}`}
          >
            <span className="day-number">{day.number}</span>
            {p.forDay(day.date).map((camp) => (
              <button
                key={camp.id}
                title={`${camp.name} · ${p.kids[camp.kid]}`}
                className={`calendar-event event-${camp.kid}`}
                onClick={() => p.open(camp)}
              >
                <span />
                {camp.name}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="calendar-footer">
        {p.kids.map((kid, i) => (
          <span key={i}>
            <i className={`dot-${i}`} />
            {kid}’s camps
          </span>
        ))}
      </div>
    </section>
  );
}
