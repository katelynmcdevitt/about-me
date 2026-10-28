import { Check } from "lucide-react";
import type { PlannerState } from "../usePlanner";
export default function PaymentsTable({ p }: { p: PlannerState }) {
  return (
    <section className="panel payments-panel">
      <div className="panel-heading">
        <h2>Payments</h2>
        {!!p.unpaidTotal && (
          <span className="small-pill">{p.currency(p.unpaidTotal)} unpaid</span>
        )}
      </div>
      <div className="payments-scroll">
        <table className="payments-table">
          <thead>
            <tr>
              <th scope="col">Week</th>
              {p.kids.map((kid, i) => (
                <th key={i} scope="col">
                  <span className="payment-camper">
                    <span className={`avatar kid-${i}`}>{kid.slice(0, 1)}</span>
                    {kid}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.paymentRows.map((row) => (
              <tr
                key={row.key}
                className={
                  !row.entries.some((entries) =>
                    entries.some(p.hasSeparateCost),
                  )
                    ? "no-cost-week"
                    : ""
                }
              >
                <th scope="row">
                  <strong>{row.label}</strong>
                  <small>{row.dates}</small>
                </th>
                {row.entries.map((entries, i) => (
                  <td
                    key={i}
                    className={
                      !entries.some(p.hasSeparateCost) ? "no-cost-cell" : ""
                    }
                  >
                    {entries.map((camp) => (
                      <div
                        key={camp.id}
                        className={`payment-record ${!p.hasSeparateCost(camp) ? "no-cost-entry" : ""}`}
                      >
                        <button
                          className="payment-entry"
                          onClick={() => p.open(camp)}
                        >
                          <span>
                            {camp.name}
                            {camp.status === "Wishlist" && (
                              <small>Wishlist · excluded</small>
                            )}
                          </span>
                          <b>{p.costLabel(camp)}</b>
                        </button>
                        {(p.paymentOwner(camp).cost ?? 0) > 0 ? (
                          <button
                            className={`paid-toggle ${p.paymentOwner(camp).paid ? "is-paid" : ""}`}
                            aria-pressed={!!p.paymentOwner(camp).paid}
                            aria-label={`${p.kids[camp.kid]} · ${camp.name}: ${p.paymentLabel(camp)}. Toggle payment status${camp.costIncludedIn ? " for shared payment" : ""}.`}
                            onClick={() => p.togglePaid(camp)}
                          >
                            {p.paymentOwner(camp).paid && <Check size={12} />}
                            {p.paymentLabel(camp)}
                            {camp.costIncludedIn && <span> · shared</span>}
                          </button>
                        ) : (
                          <span className="payment-note">
                            {p.paymentLabel(camp)}
                          </span>
                        )}
                      </div>
                    ))}
                    {!entries.length && (
                      <span className="payment-empty">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total paid</th>
              {p.paidByKid.map((paid, i) => (
                <td key={i}>{p.currency(paid)}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
