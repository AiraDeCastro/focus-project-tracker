/**
 * The trend shown under an issue count: the weekly values with today's number as the last
 * point, and a plain sentence about the change. Weeks with no snapshot are null and are skipped.
 */
export interface IssueTrend {
  /** One entry per week, oldest first; null where no snapshot existed. The last is today's value. */
  values: (number | null)[];
  /** The first week that has a value, as its label (for example "Aug 13"), or null. */
  since: string | null;
  /** Change from that week to now: positive, negative or zero. Null with fewer than two points. */
  change: number | null;
  /** How many weeks have a value. */
  known: number;
}

/**
 * `values` are the weekly counts (the last one is replaced by `now` so the trend always ends on
 * the number shown above it) and `labels` name those weeks.
 */
export function buildIssueTrend(
  values: (number | null)[],
  labels: string[],
  now: number,
): IssueTrend {
  const series = values.length > 0 ? [...values.slice(0, -1), now] : [now];
  const firstIndex = series.findIndex((v) => v !== null);
  const known = series.filter((v) => v !== null).length;
  const first = firstIndex === -1 ? null : series[firstIndex];
  const change = known >= 2 && first !== null ? now - first : null;
  return {
    values: series,
    since: known >= 2 && firstIndex !== -1 ? (labels[firstIndex] ?? null) : null,
    change,
    known,
  };
}

/** The sentence under the number, for example "Up 16 since Aug 13", or a note when there is no trend. */
export function describeIssueChange(trend: IssueTrend): string {
  if (trend.change === null || !trend.since) return "Trend starts after a few weekly snapshots";
  if (trend.change === 0) return `No change since ${trend.since}`;
  return `${trend.change > 0 ? "Up" : "Down"} ${Math.abs(trend.change)} since ${trend.since}`;
}
