import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Apps",
  description: "Apps and projects by Katelyn McDevitt.",
};

export default function AppsPage() {
  return (
    <main className={styles.page}>
      <Link href="/">← About me</Link>
      <h1>Apps</h1>
      <p>A home for the things I build.</p>
      <div className={styles.grid}>
        <Link className={styles.card} href="/apps/camp-schedule">
          <span className={styles.eyebrow}>PLANNING</span>
          <h2>
            Camp Days <span aria-hidden="true">↗</span>
          </h2>
          <p>
            Summer camps, weekly care, handoff alerts, and payments in one
            place.
          </p>
        </Link>
        <Link className={styles.card} href="/apps/books">
          <span className={styles.eyebrow}>READING</span>
          <h2>
            Shelf Notes <span aria-hidden="true">↗</span>
          </h2>
          <p>
            A reading library with categories, tags, reading statistics, and
            Google Sheets sync.
          </p>
        </Link>
      </div>
    </main>
  );
}
