/** Cookie the browser writes with the owner's timezone, so the server can work out "today". */
export const TZ_COOKIE = "ft_tz";

/** True for an IANA timezone name the runtime knows, for example "America/Toronto". */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The first valid timezone of the candidates, or "UTC" when none is. */
export function resolveTimeZone(...candidates: (string | null | undefined)[]): string {
  return candidates.find(isValidTimeZone) ?? "UTC";
}

function pad(n: number | string, length = 2): string {
  return String(n).padStart(length, "0");
}

/** Wall-clock parts of an instant in a timezone. */
function wallClock(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** The calendar date ("YYYY-MM-DD") it is in `zone` at the instant `date`. */
export function localDate(date: Date, zone: string): string {
  const w = wallClock(date, zone);
  return `${pad(w.year, 4)}-${w.month}-${w.day}`;
}

/**
 * Shifts an ISO timestamp so its date part is the date in `zone`. The result looks like UTC but
 * holds the wall-clock time in `zone`, which lets the app's day-bucketing code (the streak, the
 * weekly bars, "days quiet") keep slicing the first ten characters and still get the owner's day.
 * Use it only for day bucketing, never for comparing against a real instant. Anything that is
 * not a valid timestamp comes back unchanged.
 */
export function toLocalStamp(stamp: string, zone: string): string;
export function toLocalStamp(stamp: string | null, zone: string): string | null;
export function toLocalStamp(stamp: string | null, zone: string): string | null {
  if (!stamp) return stamp;
  const ms = Date.parse(stamp);
  if (Number.isNaN(ms)) return stamp;
  const w = wallClock(new Date(ms), zone);
  return `${pad(w.year, 4)}-${w.month}-${w.day}T${w.hour}:${w.minute}:${w.second}.000Z`;
}
