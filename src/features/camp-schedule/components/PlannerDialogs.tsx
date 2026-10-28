import { X, Check } from "lucide-react";
import type { PlannerState } from "../usePlanner";
import type { Camp } from "../types";
import Modal from "./Modal";
export default function PlannerDialogs({ p }: { p: PlannerState }) {
  const close = () => {
    if (p.busy) return;
    p.setModal(false);
    p.setSettings(false);
  };
  const update = <K extends keyof Omit<Camp, "id">>(
    field: K,
    value: Omit<Camp, "id">[K],
  ) => p.setForm((previous) => ({ ...previous, [field]: value }));
  const { form } = p;
  return (
    <Modal
      label={p.settings ? "Family settings" : "Camp details"}
      onClose={close}
    >
      <button
        disabled={p.busy}
        className="close"
        aria-label="Close"
        onClick={close}
      >
        <X size={21} />
      </button>
      <fieldset className="dialog-fields" disabled={p.busy || !p.loaded}>
        {p.settings ? (
          <>
            <h2>Family settings</h2>
            {p.settingsKids.map((kid, i) => (
              <label key={i}>
                Camper {i + 1}
                <input
                  value={kid}
                  onChange={(e) =>
                    p.setKids((previous) =>
                      previous.map((name, index) =>
                        index === i ? e.target.value : name,
                      ),
                    )
                  }
                  maxLength={24}
                  placeholder="Camper name"
                />
              </label>
            ))}
            <label>
              Flag handoffs within (minutes)
              <input
                type="number"
                min={0}
                max={180}
                required
                value={p.settingsHandoffBuffer}
                onChange={(e) =>
                  p.setHandoffBuffer(
                    Math.max(0, Math.min(180, Number(e.target.value))),
                  )
                }
              />
            </label>
            {p.error && (
              <p className="error" role="alert">
                {p.error}
              </p>
            )}
            <button
              className="primary"
              onClick={() => {
                void p.saveSettings();
              }}
            >
              Done <Check size={16} />
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              p.save();
            }}
          >
            <h2>{p.editing ? "Camp details" : "Add a camp"}</h2>
            <label>
              Camp name
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
                placeholder="Camp name"
              />
            </label>
            <div className="form-row">
              <label>
                Camper
                <select
                  value={form.kid}
                  onChange={(e) => update("kid", Number(e.target.value))}
                >
                  {p.kids.map((kid, i) => (
                    <option key={i} value={i}>
                      {kid}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => update("status", e.target.value)}
                >
                  {["Confirmed", "Pending", "Wishlist"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                First day
                <input
                  type="date"
                  value={form.start}
                  min={`${p.season.year}-01-01`}
                  max={`${p.season.year}-12-31`}
                  required
                  onChange={(e) => update("start", e.target.value)}
                />
              </label>
              <label>
                Last day
                <input
                  type="date"
                  value={form.end}
                  min={`${p.season.year}-01-01`}
                  max={`${p.season.year}-12-31`}
                  required
                  onChange={(e) => update("end", e.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Drop-off
                <input
                  type="time"
                  value={form.dropoff ?? ""}
                  onChange={(e) => update("dropoff", e.target.value || null)}
                />
              </label>
              <label>
                Pickup
                <input
                  type="time"
                  value={form.pickup ?? ""}
                  onChange={(e) => update("pickup", e.target.value || null)}
                />
              </label>
            </div>
            <p className="time-help">Weekday times · blank = N/A</p>
            <label>
              Location
              <input
                value={form.location}
                placeholder="Location"
                onChange={(e) => update("location", e.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                Cost ($)
                {form.costIncludedIn && form.cost == null && (
                  <span>Included in Owen’s YMCA cost</span>
                )}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.cost ?? ""}
                  placeholder="Not provided"
                  onChange={(e) =>
                    update(
                      "cost",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                />
              </label>
              <label>
                Type
                <select
                  value={form.type}
                  onChange={(e) => update("type", e.target.value)}
                >
                  {[
                    "Dance",
                    "Theater",
                    "Soccer",
                    "Sports",
                    "YMCA",
                    "Grandparent",
                    "Other",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!form.noCamp}
                onChange={(e) => update("noCamp", e.target.checked)}
              />{" "}
              No care this week
            </label>
            {!form.costIncludedIn && (
              <label>
                Payment status
                <select
                  value={String(!!form.paid)}
                  onChange={(e) => update("paid", e.target.value === "true")}
                >
                  <option value="false">Unpaid</option>
                  <option value="true">Paid</option>
                </select>
              </label>
            )}
            {p.error && (
              <p className="error" role="alert">
                {p.error}
              </p>
            )}
            <div className="form-actions">
              {p.editing && (
                <button type="button" className="delete" onClick={p.remove}>
                  Delete camp
                </button>
              )}
              <button className="primary" type="submit">
                {p.editing ? "Save changes" : "Add camp"} <Check size={16} />
              </button>
            </div>
          </form>
        )}
      </fieldset>
    </Modal>
  );
}
