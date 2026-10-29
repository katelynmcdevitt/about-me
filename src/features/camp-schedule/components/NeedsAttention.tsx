import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { PlannerState } from "../usePlanner";

export default function NeedsAttention({ p }: { p: PlannerState }) {
  const { attention } = p;
  return (
    <section className="attention-view" aria-label="Needs attention overview">
      <p className="attention-intro">
        Both campers · Summer {p.season.year}. Review care gaps, payments,
        prices, and weekly handoffs in one place.
      </p>
      {!attention.count && (
        <div className="attention-clear" role="status">
          <CheckCircle2 size={24} />
          <div>
            <h2>Nothing needs attention</h2>
            <p>
              No open care weeks, unpaid costs, missing prices, or handoff
              alerts for this summer.
            </p>
          </div>
        </div>
      )}
      <div className="attention-grid">
        <section
          className="panel attention-panel"
          aria-labelledby="attention-care-title"
        >
          <div className="panel-heading">
            <h2 id="attention-care-title">Missing care</h2>
            <span className="small-pill">
              {attention.missingWeeks.length} camper-weeks
            </span>
          </div>
          <p className="attention-help">
            Confirmed care is needed for the full week. Weeks marked No camp are
            included.
          </p>
          {attention.missingWeeks.length ? (
            <ul>
              {attention.missingWeeks.map((week) => (
                <li key={`${week.kidIndex}-${week.start}`}>
                  <button
                    onClick={() => p.viewMissingWeek(week.start, week.kidIndex)}
                  >
                    <span>
                      <strong>{week.kid}</strong>
                      <small>
                        {p.dateLabel(week.start)} – {p.dateLabel(week.end)} ·{" "}
                        {week.reason}
                      </small>
                    </span>
                    <span className="attention-action">
                      View week <ArrowUpRight size={14} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="attention-empty">Care arranged for every week.</p>
          )}
        </section>
        <section
          className="panel attention-panel"
          aria-labelledby="attention-payments-title"
        >
          <div className="panel-heading">
            <h2 id="attention-payments-title">Unpaid camps</h2>
            <span className="small-pill">
              {attention.unpaid.length} payments
            </span>
          </div>
          <p className="attention-help">
            {p.currency(p.unpaidTotal)} unpaid. Shared payments appear once;
            wishlist camps are excluded.
          </p>
          {attention.unpaid.length ? (
            <ul>
              {attention.unpaid.map((camp) => (
                <li key={camp.id}>
                  <button onClick={() => p.open(camp)}>
                    <span>
                      <strong>{camp.name}</strong>
                      <small>
                        {p.kids[camp.kid]} · {p.dateLabel(camp.start)} –{" "}
                        {p.dateLabel(camp.end)} · {p.currency(camp.cost!)}
                      </small>
                    </span>
                    <span className="attention-action">
                      Edit payment <ArrowUpRight size={14} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="attention-empty">No unpaid camp costs.</p>
          )}
        </section>
        <section
          className="panel attention-panel"
          aria-labelledby="attention-prices-title"
        >
          <div className="panel-heading">
            <h2 id="attention-prices-title">Missing prices</h2>
            <span className="small-pill">
              {attention.missingPrices.length} camps
            </span>
          </div>
          <p className="attention-help">
            Unknown prices are excluded from totals. Free camps and costs
            included in another camp are not listed.
          </p>
          {attention.missingPrices.length ? (
            <ul>
              {attention.missingPrices.map((camp) => (
                <li key={camp.id}>
                  <button onClick={() => p.open(camp)}>
                    <span>
                      <strong>{camp.name}</strong>
                      <small>
                        {p.kids[camp.kid]} · {p.dateLabel(camp.start)} –{" "}
                        {p.dateLabel(camp.end)}
                      </small>
                    </span>
                    <span className="attention-action">
                      Add price <ArrowUpRight size={14} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="attention-empty">All camp prices are recorded.</p>
          )}
        </section>
        <section
          className="panel attention-panel"
          aria-labelledby="attention-handoffs-title"
        >
          <div className="panel-heading">
            <h2 id="attention-handoffs-title">Handoff alerts</h2>
            <span className="small-pill">
              {attention.handoffs.length} weeks
            </span>
          </div>
          <p className="attention-help">
            Weekdays across this summer’s bookings, using your {p.handoffBuffer}
            -minute threshold. Includes both campers regardless of filters.
            Shared stops may be fine; travel times are unchecked.
          </p>
          {attention.handoffs.length ? (
            <ul>
              {attention.handoffs.map((week) => (
                <li key={week.start}>
                  <button onClick={() => p.viewMissingWeek(week.start, -1)}>
                    <span>
                      <strong>
                        {p.dateLabel(week.start)} – {p.dateLabel(week.end)}
                      </strong>
                      <small>
                        {week.days} {week.days === 1 ? "day" : "days"} with
                        alerts · {week.warnings} handoff pairs
                      </small>
                    </span>
                    <span className="attention-action">
                      Review week <ArrowUpRight size={14} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="attention-empty">
              No handoff alerts at this threshold.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
