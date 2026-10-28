import { BookOpen, FileText, Star, Headphones } from "lucide-react";
import type { Book } from "./model";
import { yearlyReadingSummary } from "./readingStats";

export default function YearlyDashboard({
  books,
  year,
  years,
  onChangeYear,
  onViewFormats,
}: {
  books: Book[];
  year: string;
  years: string[];
  onChangeYear: (year: string) => void;
  onViewFormats: () => void;
}) {
  const stats = yearlyReadingSummary(books, year);
  const maximum = Math.max(1, ...stats.months.map((month) => month.count));
  return (
    <section
      className="yearly-dashboard"
      aria-labelledby="yearly-dashboard-title"
    >
      <div className="dashboard-heading">
        <div>
          <h2 id="yearly-dashboard-title">Yearly reading</h2>
          <p>
            {year
              ? `Your finished reading in ${year}.`
              : "Add finish dates to see your year in reading."}
          </p>
        </div>
        <label className="year-picker">
          Year
          <select
            aria-label="Dashboard year"
            disabled={!years.length}
            value={year}
            onChange={(event) => onChangeYear(event.target.value)}
          >
            {!years.length && <option value="">No dated readings</option>}
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!years.length && (
        <p className="dashboard-notice">
          No finished dates yet. Import a reading log or add a finish date in
          Book details.
        </p>
      )}
      <div className="dashboard-metrics">
        <article aria-label="Books finished">
          <BookOpen size={18} />
          <strong>{stats.finished.toLocaleString()}</strong>
          <h3>Books finished</h3>
          <p>Rereads count as separate finishes.</p>
        </article>
        <article aria-label="Pages read">
          <FileText size={18} />
          <strong>{stats.pages.toLocaleString()}</strong>
          <h3>Pages read</h3>
          <p>
            {stats.missingPages}{" "}
            {stats.missingPages === 1 ? "reading missing" : "readings missing"}{" "}
            page counts.
          </p>
        </article>
        <article aria-label="Average rating">
          <Star size={18} />
          <strong>
            {stats.averageRating === null
              ? "—"
              : stats.averageRating.toFixed(1)}
          </strong>
          <h3>Average rating</h3>
          <p>
            {stats.rated} of {stats.finished} readings rated. Unrated books
            excluded.
          </p>
        </article>
        <article aria-label="Formats recorded">
          <Headphones size={18} />
          <strong>
            {stats.finished - stats.formats[3].count} / {stats.finished}
          </strong>
          <h3>Formats recorded</h3>
          <p>{stats.formats[3].count} unclear in this year.</p>
        </article>
      </div>
      <p className="dashboard-footnote">
        Pages total known page counts for finished readings, including rereads
        and audiobook editions. {stats.undated}{" "}
        {stats.undated === 1 ? "reading has" : "readings have"} no known finish
        date and {stats.undated === 1 ? "is" : "are"} excluded from yearly
        totals.
      </p>
      <section
        className="dashboard-panel"
        aria-labelledby="monthly-reading-title"
      >
        <h3 id="monthly-reading-title">Books finished by month</h3>
        <div className="monthly-chart-scroll">
          <ol className="monthly-chart">
            {stats.months.map((month) => (
              <li
                key={month.label}
                aria-label={`${month.label}: ${month.count} ${month.count === 1 ? "book" : "books"}`}
              >
                <span className="month-count">{month.count}</span>
                <div className="month-track" aria-hidden="true">
                  <span
                    style={{ height: `${(month.count / maximum) * 100}%` }}
                  />
                </div>
                <span className="month-name">{month.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section
        className="dashboard-panel"
        aria-labelledby="yearly-formats-title"
      >
        <h3 id="yearly-formats-title">Reading formats</h3>
        <div
          className="dashboard-format-bar"
          role="img"
          aria-label={stats.formats
            .map(
              (format) =>
                `${format.label}: ${format.count} (${format.percentage}%)`,
            )
            .join(", ")}
        >
          {stats.formats.map((format) => (
            <span
              key={format.label}
              className={`dashboard-format-${format.label.toLowerCase()}`}
              style={{ width: `${format.percentage}%` }}
            />
          ))}
        </div>
        <ul className="dashboard-format-legend">
          {stats.formats.map((format) => (
            <li key={format.label}>
              <span
                className={`format-swatch dashboard-format-${format.label.toLowerCase()}`}
              />
              <span>{format.label}</span>
              <strong>
                {format.count} · {format.percentage}%
              </strong>
            </li>
          ))}
        </ul>
        {stats.unknownFormats > 0 && (
          <button className="text-button" onClick={onViewFormats}>
            Set missing formats across your library ({stats.unknownFormats}) →
          </button>
        )}
      </section>
    </section>
  );
}
