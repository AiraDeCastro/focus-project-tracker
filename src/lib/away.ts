import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { ensureSettings } from "./sync";

/** The furthest ahead a return date can be set. */
export const AWAY_MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AwayError = "invalid_date" | "not_future" | "too_far";

export const AWAY_ERROR_MESSAGES: Record<AwayError, string> = {
  invalid_date: "Pick a valid return date.",
  not_future: "Pick a return date after today.",
  too_far: "Pick a return date within the next year.",
};

function parseDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  // Date.parse rolls "2026-02-31" over to March; reject anything that does not round-trip.
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value ? null : ms;
}

/**
 * Checks a return date. It is the day the owner is back, so it must be after today; stalled
 * alerts resume on that day.
 */
export function validateAwayDate(value: string, today: string): AwayError | null {
  const day = parseDay(value);
  const now = parseDay(today);
  if (day === null || now === null) return "invalid_date";
  if (day <= now) return "not_future";
  if (day - now > AWAY_MAX_DAYS * DAY_MS) return "too_far";
  return null;
}

export type SetAwayResult =
  { ok: true; awayUntil: string | null } | { ok: false; error: AwayError };

/** Turns Away mode on until `value` (a "YYYY-MM-DD" return date), or off when it is null. */
export async function setAwayUntil(
  db: Db,
  value: string | null,
  today: string,
): Promise<SetAwayResult> {
  if (value !== null) {
    const error = validateAwayDate(value, today);
    if (error) return { ok: false, error };
  }
  await ensureSettings(db);
  await db.update(settings).set({ awayUntil: value }).where(eq(settings.id, 1));
  return { ok: true, awayUntil: value };
}

/** The return date while Away mode is on, or null once it has passed or was never set. */
export function activeAwayUntil(awayUntil: string | null, today: string): string | null {
  return awayUntil && awayUntil > today ? awayUntil : null;
}
