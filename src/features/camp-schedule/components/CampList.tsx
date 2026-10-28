import {
  ArrowUpRight,
  ChevronRight,
  Music,
  Drama,
  CircleDot,
  Trophy,
  Tent,
  Users,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import type { PlannerState } from "../usePlanner";
const typeIcons: Record<string, LucideIcon> = {
  Dance: Music,
  Theater: Drama,
  Soccer: CircleDot,
  Sports: Trophy,
  YMCA: Tent,
  Grandparent: Users,
  Other: Shapes,
};
export default function CampList({ p }: { p: PlannerState }) {
  return (
    <section className="panel camp-panel">
      <div className="panel-heading">
        <div>
          <h2>{p.tab === "Camps" ? "All camps" : "Upcoming camps"}</h2>
        </div>
        <span className="small-pill">{p.visible.length} camps</span>
      </div>
      {p.tab === "Camps" && (
        <div className="list-filters filter">
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
              {kid}
            </button>
          ))}
        </div>
      )}
      <div className="camp-list">
        {(p.tab === "Camps" ? p.visible : p.visible.slice(0, 4)).map((camp) => {
          const Icon = typeIcons[camp.type] || Shapes;
          return (
            <button
              key={camp.id}
              className="camp-card"
              onClick={() => p.open(camp)}
            >
              <div className={`camp-art ${camp.type}`}>
                <Icon size={25} />
              </div>
              <div className="camp-info">
                <div className="camp-card-top">
                  <span className={`kid-tag tag-${camp.kid}`}>
                    {p.kids[camp.kid]}
                  </span>
                  <span
                    className={`status ${camp.status !== "Confirmed" ? "pending" : ""}`}
                  >
                    {camp.status === "Confirmed" ? "✓ " : ""}
                    {camp.status}
                  </span>
                </div>
                <h3>{camp.name}</h3>
                <p>
                  {p.dateLabel(camp.start)} – {p.dateLabel(camp.end)}
                  <span>·</span>
                  {p.costLabel(camp)}
                </p>
              </div>
              <ChevronRight size={15} className="card-arrow" />
            </button>
          );
        })}
        {!p.visible.length && <p className="empty">No camps</p>}
      </div>
      {p.tab === "Overview" && (
        <button className="view-all" onClick={() => p.setTab("Camps")}>
          View all camps <ArrowUpRight size={15} />
        </button>
      )}
    </section>
  );
}
