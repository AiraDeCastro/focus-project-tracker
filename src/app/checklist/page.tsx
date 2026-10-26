import Link from "next/link";
import { Walkthrough } from "./Walkthrough";
import styles from "./checklist.module.css";

export const metadata = { title: "Signed-in check | Focus Trail" };

export default function ChecklistPage() {
  return (
    <main className={styles.wrap}>
      <section className={styles.card} aria-labelledby="checklist-title">
        <Link href="/" className={styles.back}>
          Back to the dashboard
        </Link>
        <h1 id="checklist-title">Signed-in check</h1>
        <p className={styles.lead}>
          These are the things only you can try, because they need your GitHub sign-in. Work through
          them in order. Mark each one <b>Worked</b> or <b>Problem</b>, add a note for a problem,
          then copy your results and send them back. Your answers stay in this browser.
        </p>
        <Walkthrough />
      </section>
    </main>
  );
}
