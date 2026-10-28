import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/focus-trail-logo.png";
import preview from "@/assets/dashboard-preview.png";
import styles from "./landing.module.css";

const REPO = "https://github.com/AiraDeCastro/focus-project-tracker";
const PORTFOLIO = "https://airadecastro.com";

const FEATURES = [
  {
    title: "One focus project at a time",
    text: "The rule is enforced in code and by a database constraint. Switching focus needs a written reason, which is logged.",
  },
  {
    title: "Real GitHub data",
    text: "Pulls repos, milestones and issues, and graphs progress per project. Daily snapshots build the history GitHub does not keep.",
  },
  {
    title: "Daily jobs and a gentle email",
    text: "Scheduled jobs on Vercel store snapshots and send a reminder with the next tasks. Away mode pauses the alerts.",
  },
  {
    title: "Works with GitHub Projects",
    text: "Connects a repo to its Project through the GraphQL API, imports a task list, and only ever adds or closes. Nothing is deleted.",
  },
];

const STACK = [
  "Next.js",
  "TypeScript",
  "Turso (SQLite)",
  "Drizzle",
  "Auth.js",
  "GitHub REST and GraphQL APIs",
  "Vercel Cron",
  "Resend",
];

/**
 * The front page for anyone who is not signed in, such as a recruiter following a link. It is
 * static: it reads no session, no database and no GitHub data. The only person who can sign in
 * is the owner, so "Sign in" is a small link at the bottom.
 */
export function Landing() {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Image
          src={logo}
          alt="Focus Trail"
          width={150}
          height={58}
          priority
          className={styles.logo}
        />
        <nav className={styles.nav} aria-label="Main">
          <Link href="/demo">Demo</Link>
          <a href={REPO}>Code</a>
          <a href={PORTFOLIO}>Portfolio</a>
        </nav>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title">One focus project at a time.</h1>
          <p className={styles.lead}>
            Focus Trail is a dashboard I built that turns your GitHub milestones into a progress
            graph, and keeps you on a single project until it ships.
          </p>
          <div className={styles.actions}>
            <Link href="/demo" className={styles.primary}>
              Try the demo
            </Link>
            <a href={REPO} className={styles.secondary}>
              View the code
            </a>
          </div>
          <p className={styles.note}>The demo uses example data. Nothing is saved.</p>
        </section>

        <section className={styles.shot} aria-label="A screenshot of the dashboard">
          <Image
            src={preview}
            alt="The Focus Trail dashboard: a progress ring, a milestone graph and a list of today's tasks."
            sizes="(max-width: 1100px) 100vw, 1000px"
            className={styles.image}
            priority
          />
        </section>

        <section className={styles.section} aria-labelledby="inside-title">
          <h2 id="inside-title">What is inside</h2>
          <ul className={styles.grid}>
            {FEATURES.map((f) => (
              <li key={f.title} className={styles.card}>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="built-title">
          <h2 id="built-title">How it was built</h2>
          <p className={styles.body}>
            I built Focus Trail myself, directing Claude Code through a written workflow: a rules
            file, a task list, and pull requests I review before they merge. It ships with more than
            650 unit tests, GitHub Actions checks on every change, protected branches and an
            accessibility pass in light and dark themes.
          </p>
          <ul className={styles.stack} aria-label="Tech used">
            {STACK.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          Built by Aira De Castro. <a href={PORTFOLIO}>See my portfolio</a> or{" "}
          <a href={REPO}>the code on GitHub</a>.
        </p>
        <p className={styles.owner}>
          This is a personal tool, so only its owner can sign in.{" "}
          <Link href="/sign-in">Owner sign-in</Link>
        </p>
      </footer>
    </div>
  );
}
