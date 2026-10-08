import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "@/db/client";
import { focusLog, projects } from "@/db/schema";
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from "./focus-rules";

export { MAX_REASON_LENGTH, MIN_REASON_LENGTH };

export type FocusError =
  | "not_found"
  | "already_focus"
  | "not_eligible"
  | "not_focusable"
  | "reason_required"
  | "reason_too_long";

export type FocusResult = { ok: true; previous: string | null } | { ok: false; error: FocusError };

export const FOCUS_ERROR_MESSAGES: Record<FocusError, string> = {
  not_found: "That project was not found.",
  already_focus: "That project is already your focus.",
  not_eligible: "A deployed or finished project can't be your focus.",
  not_focusable: "Practice and school work can't be your focus. Change its type to Project first.",
  reason_required: `Write at least ${MIN_REASON_LENGTH} characters about why you are switching.`,
  reason_too_long: `Keep the reason under ${MAX_REASON_LENGTH} characters.`,
};

/**
 * Makes `name` the one Focus Project and records it in the focus log.
 *
 * - Picking a first focus project needs no reason.
 * - Switching away from the current focus project needs a reason of at least
 *   `MIN_REASON_LENGTH` characters. The old project is paused and its log entry is closed with
 *   that reason.
 * - Only backlog and paused projects can take focus.
 *
 * Everything is checked before anything is written, and the writes run as one batch (a single
 * transaction), so a failure can never leave zero or two focus projects. The database's partial
 * unique index is the last line of defence.
 */
export async function setFocus(
  db: Db,
  name: string,
  reason: string | null | undefined,
  now: Date = new Date(),
): Promise<FocusResult> {
  const text = (reason ?? "").trim();
  if (text.length > MAX_REASON_LENGTH) return { ok: false, error: "reason_too_long" };

  const [target] = await db.select().from(projects).where(eq(projects.name, name));
  if (!target) return { ok: false, error: "not_found" };
  if (target.status === "focus") return { ok: false, error: "already_focus" };
  if (target.kind !== "project") return { ok: false, error: "not_focusable" };
  if (target.status !== "backlog" && target.status !== "paused") {
    return { ok: false, error: "not_eligible" };
  }

  const [current] = await db.select().from(projects).where(eq(projects.status, "focus"));
  if (current && text.length < MIN_REASON_LENGTH) return { ok: false, error: "reason_required" };

  const stamp = now.toISOString();
  const writes: BatchItem<"sqlite">[] = [];

  // The old focus project must leave focus first, or the unique index rejects the new one.
  if (current) {
    writes.push(
      db.update(projects).set({ status: "paused" }).where(eq(projects.repoId, current.repoId)),
    );
    writes.push(
      db
        .update(focusLog)
        .set({ endedAt: stamp, switchReason: text })
        .where(sql`${focusLog.repoId} = ${current.repoId} and ${focusLog.endedAt} is null`),
    );
  }
  writes.push(
    db
      .update(projects)
      .set({ status: "focus", startedAt: sql`coalesce(${projects.startedAt}, ${stamp})` })
      .where(eq(projects.repoId, target.repoId)),
  );
  writes.push(db.insert(focusLog).values({ repoId: target.repoId, startedAt: stamp }));

  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { ok: true, previous: current?.name ?? null };
}
