import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "@/db/client";
import { focusLog, projects } from "@/db/schema";
import {
  checkFinishedDate,
  FINISHED_DATE_MESSAGES,
  normalizeLiveUrl,
  type DoneKind,
} from "./done-rules";
import { localDate } from "./timezone";

export type DoneError =
  | "not_found"
  | "already_done"
  | "not_done"
  | "url_required"
  | "invalid_url"
  | "invalid_date"
  | "future_date"
  | "too_old";

export type DoneResult = { ok: true; wasFocus: boolean } | { ok: false; error: DoneError };

export const DONE_ERROR_MESSAGES: Record<DoneError, string> = {
  not_found: "That project was not found.",
  already_done: "That project is already marked done.",
  not_done: "Only a finished or deployed project can be reopened.",
  url_required: "Add the live address of the deployed project.",
  invalid_url: "That does not look like a web address. Try something like my-site.vercel.app.",
  ...FINISHED_DATE_MESSAGES,
};

/**
 * Marks a project finished (nothing to deploy) or deployed (live at an address).
 *
 * The owner decides when a project is done, so this needs only the call itself, plus a valid
 * address for `deployed`. If the project had focus, focus is freed and its log entry is closed,
 * so the dashboard goes back to asking for the next focus project. Writes run as one batch.
 *
 * The owner can say the day it really finished (`options.finishedOn`, "YYYY-MM-DD", not in the
 * future). Without one, or for today, the moment of the call is stored. `options.today` is the
 * owner's date; it defaults to the UTC date of `now`.
 */
export async function markDone(
  db: Db,
  name: string,
  kind: DoneKind,
  liveUrl: string | null | undefined,
  now: Date = new Date(),
  options: { finishedOn?: string; today?: string } = {},
): Promise<DoneResult> {
  const [target] = await db.select().from(projects).where(eq(projects.name, name));
  if (!target) return { ok: false, error: "not_found" };
  if (target.status === "finished" || target.status === "deployed") {
    return { ok: false, error: "already_done" };
  }

  const today = options.today ?? localDate(now, "UTC");
  const finishedOn = options.finishedOn ?? today;
  const dateError = checkFinishedDate(finishedOn, today);
  if (dateError) return { ok: false, error: dateError };

  let url: string | null = null;
  if (kind === "deployed") {
    if (!(liveUrl ?? "").trim()) return { ok: false, error: "url_required" };
    url = normalizeLiveUrl(liveUrl);
    if (!url) return { ok: false, error: "invalid_url" };
  }

  // Today keeps the exact moment; an earlier day is stored as the date alone.
  const stamp = finishedOn === today ? now.toISOString() : finishedOn;
  const endedAt = finishedOn === today ? stamp : `${finishedOn}T12:00:00.000Z`;
  const wasFocus = target.status === "focus";
  const writes: BatchItem<"sqlite">[] = [];

  if (wasFocus) {
    // Finishing is the good way to leave focus, so the log entry closes with no switch reason.
    writes.push(
      db
        .update(focusLog)
        // Never before the stretch began, in case the chosen day is earlier than the focus pick.
        .set({ endedAt: sql`max(${endedAt}, ${focusLog.startedAt})` })
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
        finishedAt: stamp,
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

/**
 * Changes the day a finished or deployed project is recorded as done, for example when it was
 * marked done long after it really finished. The date must be real and not in the future.
 */
export async function setFinishedDate(
  db: Db,
  name: string,
  finishedOn: string,
  today: string,
): Promise<DoneResult> {
  const [target] = await db.select().from(projects).where(eq(projects.name, name));
  if (!target) return { ok: false, error: "not_found" };
  if (target.status !== "finished" && target.status !== "deployed") {
    return { ok: false, error: "not_done" };
  }
  const dateError = checkFinishedDate(finishedOn, today);
  if (dateError) return { ok: false, error: dateError };
  await db
    .update(projects)
    .set({ finishedAt: finishedOn })
    .where(eq(projects.repoId, target.repoId));
  return { ok: true, wasFocus: false };
}
