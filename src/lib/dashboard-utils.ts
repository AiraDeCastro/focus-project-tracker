/** Pure helpers that turn raw dates and counts into the numbers the dashboard draws. All dates are UTC. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Weeks of history on the graph, including today's point. */
export const PAST_POINTS = 11;
/** Weeks after today on the graph, so the ideal-pace line has room to reach 100%. */
export const FUTURE_POINTS = 2;
/** Index of today in the weekly points. */
export const TODAY_INDEX = PAST_POINTS - 1;

function toDay(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

function fromDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "2026-10-08" becomes "Oct 8". */
export function dayLabel(iso: string): string {
  return `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
}

/** The ISO date (YYYY-MM-DD) of a timestamp, in UTC. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The graph's weekly points: ten weeks back to today (index 10), then two weeks ahead.
 * Today is always a point, so the right end of the real line is today's live number.
 */
export function weekWindow(today: string): { dates: string[]; labels: string[] } {
  const end = toDay(today);
  const dates: string[] = [];
  for (let i = -(PAST_POINTS - 1); i <= FUTURE_POINTS; i++)
    dates.push(fromDay(end + i * 7 * DAY_MS));
  return { dates, labels: dates.map(dayLabel) };
}

/** Where the ideal-pace line should reach 100%: the last milestone's due date, kept on the chart. */
export function idealEndIndex(lastDue: string | undefined, dates: string[]): number {
  const last = dates.length - 1;
  if (!lastDue) return last;
  const weeks = Math.round((toDay(lastDue) - toDay(dates[0])) / (7 * DAY_MS));
  return Math.min(Math.max(weeks, TODAY_INDEX), last);
}

/**
 * Horizontal position of a date on the graph, in weekly steps from the first point.
 * Returns null when the date falls outside the chart.
 */
export function positionOnGraph(iso: string, dates: string[]): number | null {
  const steps = (toDay(iso) - toDay(dates[0])) / (7 * DAY_MS);
  return steps < 0 || steps > dates.length - 1 ? null : steps;
}

export interface HistoryPoint {
  date: string;
  percent: number;
}

/**
 * Percent complete for each past weekly point. A week uses the latest snapshot taken on or
 * before it, and is null when no snapshot exists yet. Today's point is the live percent.
 */
export function seriesFromHistory(
  history: HistoryPoint[],
  dates: string[],
  livePercent: number,
): (number | null)[] {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  return dates.slice(0, PAST_POINTS).map((date, i) => {
    if (i === TODAY_INDEX) return livePercent;
    let found: number | null = null;
    for (const h of sorted) {
      if (h.date <= date) found = h.percent;
      else break;
    }
    return found;
  });
}

/** Monday of the week containing `iso`, as an ISO date. */
export function weekStart(iso: string): string {
  const day = new Date(toDay(iso)).getUTCDay(); // Sunday = 0
  return fromDay(toDay(iso) - ((day + 6) % 7) * DAY_MS);
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * Closing activity for the calendar and the weekly bars. `closedAt` holds ISO timestamps of
 * closed issues; only those in the current month (for the calendar) and week (for the bars) count.
 */
export function closedActivity(
  closedAt: string[],
  today: string,
): { closedPerDay: number[]; closedDays: number[] } {
  const monday = toDay(weekStart(today));
  const monthPrefix = today.slice(0, 7);
  const perDay = [0, 0, 0, 0, 0, 0, 0];
  const days = new Set<number>();
  for (const stamp of closedAt) {
    const day = stamp.slice(0, 10);
    if (day.startsWith(monthPrefix)) days.add(+day.slice(8, 10));
    const offset = Math.round((toDay(day) - monday) / DAY_MS);
    if (offset >= 0 && offset < 7) perDay[offset]++;
  }
  return { closedPerDay: perDay, closedDays: [...days].sort((a, b) => a - b) };
}

/** Day numbers in the current month that have a milestone due date. */
export function dueDaysInMonth(dueDates: (string | undefined)[], today: string): number[] {
  const prefix = today.slice(0, 7);
  const days = dueDates
    .filter((d): d is string => !!d && d.startsWith(prefix))
    .map((d) => +d.slice(8, 10));
  return [...new Set(days)].sort((a, b) => a - b);
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", or "a long time ago". */
export function relativeDay(iso: string | null | undefined, today: string): string {
  if (!iso) return "never";
  const days = Math.round((toDay(today) - toDay(iso.slice(0, 10))) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return dayLabel(iso.slice(0, 10));
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping the result order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
