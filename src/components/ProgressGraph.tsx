import { useId } from "react";

type Point = [number, number];

/** Smooth path through points using Catmull-Rom to Bezier conversion. */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

interface DueMarker {
  index: number;
  label: string;
}

interface ProgressGraphProps {
  repo: string;
  weekLabels: string[];
  /** Percent complete per week; the last value is today's live number. */
  series: number[];
  /** Vertical due-date markers and the ideal-pace line; only for the focus project. */
  dueMarkers?: DueMarker[];
  showIdeal?: boolean;
  idealEndIndex: number;
}

const W = 720;
const H = 300;
const PAD = { left: 40, right: 22, top: 30, bottom: 34 };

export function ProgressGraph({
  repo,
  weekLabels,
  series,
  dueMarkers = [],
  showIdeal = false,
  idealEndIndex,
}: ProgressGraphProps) {
  const areaId = useId();
  const steps = weekLabels.length - 1;
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / steps;
  const y = (v: number) => PAD.top + ((100 - v) / 100) * (H - PAD.top - PAD.bottom);
  const points: Point[] = series.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(points);
  const last = points[points.length - 1];
  const lastValue = series[series.length - 1];
  const tagX = last[0] - 8;
  const tagY = Math.max(last[1] - 34, 6);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Percent of milestone work complete over time for ${repo}. Now ${lastValue} percent.`}
    >
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sage)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--sage)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--line)"
            strokeDasharray="3 5"
          />
          <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
            {v}%
          </text>
        </g>
      ))}

      {weekLabels.map((label, i) =>
        i % 2 === 0 ? (
          <text
            key={label}
            x={x(i)}
            y={H - 10}
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted)"
          >
            {label}
          </text>
        ) : null,
      )}

      {dueMarkers.map((m) => (
        <g key={m.label}>
          <line
            x1={x(m.index)}
            x2={x(m.index)}
            y1={PAD.top - 4}
            y2={H - PAD.bottom}
            stroke="var(--teal)"
            strokeDasharray="4 4"
            strokeOpacity="0.7"
          />
          <text
            x={x(m.index)}
            y={PAD.top - 10}
            textAnchor={m.index === steps ? "end" : "middle"}
            fontSize="10.5"
            fontWeight="700"
            fill="var(--teal)"
          >
            {m.label}
          </text>
        </g>
      ))}

      {showIdeal && (
        <path
          d={`M${x(0)},${y(0)}L${x(idealEndIndex)},${y(100)}`}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="2"
          strokeDasharray="2 6"
          strokeLinecap="round"
        />
      )}

      <path d={`${line}L${last[0]},${y(0)}L${points[0][0]},${y(0)}Z`} fill={`url(#${areaId})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--deep)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.map((p, i) => {
        const isLast = i === points.length - 1;
        return (
          <circle
            key={weekLabels[i]}
            cx={p[0]}
            cy={p[1]}
            r={isLast ? 7 : 4}
            fill={isLast ? "var(--yellow)" : "var(--card)"}
            stroke="var(--deep)"
            strokeWidth={isLast ? 3 : 2}
          >
            <title>{`${weekLabels[i]}: ${series[i]}% complete`}</title>
          </circle>
        );
      })}

      <rect x={tagX - 24} y={tagY} width="48" height="22" rx="7" fill="var(--yellow)" />
      <text
        x={tagX}
        y={tagY + 15}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="var(--yellow-fg)"
      >
        {lastValue}%
      </text>
    </svg>
  );
}
