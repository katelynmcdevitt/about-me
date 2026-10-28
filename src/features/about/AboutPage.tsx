import Link from "next/link";
import styles from "./AboutPage.module.css";

const profile = {
  name: "Katelyn McDevitt",
  location: "Glen Mills, PA",
  linkedin: "https://www.linkedin.com/in/katelyn-mcdevitt",
  email: "katelyn.m.mcdevitt@gmail.com",
};

export default function AboutPage() {
  return (
    <div className={styles["site-shell"]}>
      <main id="main">
        <h1>
          <em>{profile.name}</em>
        </h1>
        <p className={styles["location"]}>Based in {profile.location}</p>
        <p className={styles["bio"]}>
          A front end software engineer with 15+ years of experience spanning
          individual contribution, technical leadership, and
          management—bringing both an engineering and a team perspective to my
          work.
        </p>
        
        <div className={styles["contact-actions"]}>
          <a className={styles["contact-link"]} href={`mailto:${profile.email}`}>
            Email me <span aria-hidden="true">↗</span>
          </a>
          <a
            className={styles["contact-link"]}
            href={profile.linkedin}
            target="_blank"
            rel="noopener noreferrer"
          >
            Connect on LinkedIn <span aria-hidden="true">↗</span>
          </a>
          <a className={styles["contact-link"]} href="/KatelynMcDevittResume.pdf" download>
            Download résumé <span aria-hidden="true">↓</span>
          </a>
        </div>
      </main>
      <footer>
        <Link href="/apps">Explore apps <span aria-hidden="true">↗</span></Link>
        <span>&copy; {new Date().getFullYear()} {profile.name}</span>
      </footer>
    </div>
  );
}
