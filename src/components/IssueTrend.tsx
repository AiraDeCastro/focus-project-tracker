import { buildIssueTrend, describeIssueChange } from "@/lib/issue-trend";
import styles from "./Dashboard.module.css";

const WIDTH = 100;
const HEIGHT = 30;
const PAD_X = 4;
const TOP = 6;
const BASE = 26;

interface IssueTrendProps {
  /** What is counted, for example "Total issues". */
  name: string;
  /** Weekly counts, oldest first; null for weeks with no snapshot. The last is replaced by `now`. */
  values: (number | null)[];
  /** Label of each week, for example "Aug 13". */
  labels: string[];
  /** The number shown above the trend. */
  now: number;
}

/**
 * The trend under an issue count: a thin line over the weeks that have a snapshot, the current
 * week marked, and one plain sentence about the change. The baseline is zero, so the line's
 * height is honest. Each point has a native tooltip, and the whole chart has a text summary.
 */
export function IssueTrend({ name, values, labels, now }: IssueTrendProps) {
  const trend = buildIssueTrend(values, labels, now);
  const sentence = describeIssueChange(trend);
  const known = trend.values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  const max = Math.max(1, ...known.map((p) => p.v));
  const count = trend.values.length;
  const x = (i: number) => PAD_X + (i * (WIDTH - 2 * PAD_X)) / Math.max(1, count - 1);
  const y = (v: number) => BASE - (v / max) * (BASE - TOP);
  const path = known.map(
    (p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`,
  );
  const last = known.at(-1);

  return (
    <div className={styles.trend}>
      {known.length >= 2 && last && (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${name} over the last weeks. ${sentence}.`}
        >
          <line className={styles.trendBase} x1={PAD_X} x2={WIDTH - PAD_X} y1={BASE} y2={BASE} />
          <path className={styles.trendLine} d={path.join(" ")} />
          {known.map((p) => (
            <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={5} className={styles.trendHit}>
              <title>{`${labels[p.i] ?? "Now"}: ${p.v}`}</title>
            </circle>
          ))}
          <circle cx={x(last.i)} cy={y(last.v)} r={4} className={styles.trendNow} />
        </svg>
      )}
      <div className={styles.statDelta}>{sentence}</div>
    </div>
  );
}
