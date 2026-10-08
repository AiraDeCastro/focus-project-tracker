import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "@/db/client";
import { focusLog, projects } from "@/db/schema";
import { normalizeLiveUrl, type DoneKind } from "./done-rules";

export type DoneError = "not_found" | "already_done" | "not_done" | "url_required" | "invalid_url";

export type DoneResult = { ok: true; wasFocus: boolean } | { ok: false; error: DoneError };

export const DONE_ERROR_MESSAGES: Record<DoneError, string> = {
  not_found: "That project was not found.",
  already_done: "That project is already marked done.",
  not_done: "Only a finished or deployed project can be reopened.",
  url_required: "Add the live address of the deployed project.",
  invalid_url: "That does not look like a web address. Try something like my-site.vercel.app.",
};

/**
 * Marks a project finished (nothing to deploy) or deployed (live at an address).
 *
 * The owner decides when a project is done, so this needs only the call itself, plus a valid
 * address for `deployed`. If the project had focus, focus is freed and its log entry is closed,
 * so the dashboard goes back to asking for the next focus project. Writes run as one batch.
 */
export async function markDone(
  db: Db,
  name: string,
  kind: DoneKind,
  liveUrl: string | null | undefined,
  now: Date = new Date(),
): Promise<DoneResult> {
  const [target] = await db.select().from(projects).where(eq(projects.name, name));
  if (!target) return { ok: false, error: "not_found" };
  if (target.status === "finished" || target.status === "deployed") {
    return { ok: false, error: "already_done" };
  }

  let url: string | null = null;
  if (kind === "deployed") {
    if (!(liveUrl ?? "").trim()) return { ok: false, error: "url_required" };
    url = normalizeLiveUrl(liveUrl);
    if (!url) return { ok: false, error: "invalid_url" };
  }

  const stamp = now.toISOString();
  const wasFocus = target.status === "focus";
  const writes: BatchItem<"sqlite">[] = [];

  if (wasFocus) {
    // Finishing is the good way to leave focus, so the log entry closes with no switch reason.
    writes.push(
      db
        .update(focusLog)
        .set({ endedAt: stamp })
        .where(sql`${focusLog.repoId} = ${target.repoId} and ${focusLog.endedAt} is null`),
    );
  }
  writes.push(
    db
      .update(projects)
      .set({
        status: kind,
        deployedUrl: url,
        needsDeploy: kind === "deployed",
        finishedAt: sql`coalesce(${projects.finishedAt}, ${stamp})`,
      })
      .where(eq(projects.repoId, target.repoId)),
  );

  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { ok: true, wasFocus };
}

/**
 * Undoes a "done" by mistake, or restarts a project: it goes back to the backlog and its
 * finished date is cleared. The live address is kept in case it is marked deployed again.
 */
export async function reopenProject(db: Db, name: string): Promise<DoneResult> {
  const [target] = await db.select().from(projects).where(eq(projects.name, name));
  if (!target) return { ok: false, error: "not_found" };
  if (target.status !== "finished" && target.status !== "deployed") {
    return { ok: false, error: "not_done" };
  }
  await db
    .update(projects)
    .set({ status: "backlog", finishedAt: null })
    .where(eq(projects.repoId, target.repoId));
  return { ok: true, wasFocus: false };
}
