/**
 * Rules for finishing a project, shared by the server (which enforces them) and the browser
 * (which previews them). Keep this file free of database imports so it is safe in client code.
 */

import { localDate } from "./timezone";

export type DoneKind = "finished" | "deployed";

export type FinishedDateError = "invalid_date" | "future_date" | "too_old";

export const FINISHED_DATE_MESSAGES: Record<FinishedDateError, string> = {
  invalid_date: "That is not a real date.",
  future_date: "The finished date cannot be in the future.",
  too_old: "That date is too far back. Check the year.",
};

/** The earliest finished date accepted; anything older is almost certainly a typo. */
export const EARLIEST_FINISHED_DATE = "2000-01-01";

/**
 * Checks a finished date ("YYYY-MM-DD") typed or picked by the owner. It must be a real calendar
 * date (2026-02-31 is not), not after `today` (the owner's date), and not absurdly old.
 */
export function checkFinishedDate(value: unknown, today: string): FinishedDateError | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid_date";
  const ms = Date.parse(`${value}T00:00:00Z`);
  // Date.parse rolls "2026-02-31" over into March; reject dates that do not round-trip.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return "invalid_date";
  if (value > today) return "future_date";
  if (value < EARLIEST_FINISHED_DATE) return "too_old";
  return null;
}

/**
 * The day a project was finished, as the owner's date. A date the owner chose is stored as
 * "YYYY-MM-DD" and used as it is; one stamped by the app is an instant, converted to the owner's
 * timezone. Null when there is none.
 */
export function finishedDay(value: string | null | undefined, zone: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : localDate(new Date(ms), zone);
}

const MAX_URL_LENGTH = 300;

/**
 * Turns what the owner typed into a safe web address, or null when it is not one.
 * - A missing scheme gets `https://` ("my-site.vercel.app" works).
 * - Only http and https are allowed, so a link can never run script.
 * - The host needs a dot, and logins in the address ("user:pass@") are refused.
 */
export function normalizeLiveUrl(input: string | null | undefined): string | null {
  const text = (input ?? "").trim();
  if (!text || text.length > MAX_URL_LENGTH) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;
  if (url.username || url.password) return null;
  return url.href;
}
