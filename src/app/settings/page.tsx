import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isExampleMode } from "@/lib/data";
import {
  DatabaseNotMigratedError,
  DatabaseUnavailableError,
  describeDatabaseProblem,
  translateDatabaseError,
} from "@/lib/db-errors";
import { DEFAULT_SETTINGS } from "@/lib/settings-rules";
import { saveSettingsAction } from "../actions";
import { SettingsForm } from "./SettingsForm";
import styles from "./settings.module.css";

async function SettingsLoader() {
  if (isExampleMode()) {
    return (
      <>
        <p className={styles.note}>Example data: nothing you change here is saved.</p>
        <SettingsForm initial={DEFAULT_SETTINGS} />
      </>
    );
  }
  // The auth and database code is loaded only for real data, like the dashboard does.
  const [{ auth }, { getDb }, { loadEditableSettings }] = await Promise.all([
    import("@/auth"),
    import("@/db/client"),
    import("@/lib/settings"),
  ]);
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  let initial;
  try {
    initial = await loadEditableSettings(getDb());
  } catch (error) {
    const translated = translateDatabaseError(error);
    if (
      translated instanceof DatabaseNotMigratedError ||
      translated instanceof DatabaseUnavailableError
    ) {
      const problem = describeDatabaseProblem(translated);
      return (
        <p className={styles.note} role="alert">
          <b>{problem.title}.</b> {problem.text}
          {problem.command && <code> {problem.command}</code>}
        </p>
      );
    }
    throw error;
  }
  return <SettingsForm initial={initial} onSave={saveSettingsAction} />;
}

export default function SettingsPage() {
  return (
    <main className={styles.wrap}>
      <section className={styles.card} aria-labelledby="settings-title">
        <Link href="/" className={styles.back}>
          Back to the dashboard
        </Link>
        <h1 id="settings-title">Settings</h1>
        <Suspense fallback={<p aria-busy="true">Loading your settings...</p>}>
          <SettingsLoader />
        </Suspense>
        <Link href="/checklist" className={styles.back}>
          Signed-in check: things to try after a deploy
        </Link>
      </section>
    </main>
  );
}
