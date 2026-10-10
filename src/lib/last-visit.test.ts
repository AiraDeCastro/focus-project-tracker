import { describe, expect, it } from "vitest";
import {
  advanceVisit,
  buildSinceVisit,
  daysAway,
  describeSinceVisit,
  parseVisit,
  percentAt,
  serializeVisit,
  VISIT_GAP_MS,
} from "./last-visit";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("parseVisit", () => {
  it("reads both stamps, or either alone", () => {
    const a = ago(2 * DAY);
    const b = ago(HOUR);
    expect(parseVisit(`${a}_${b}`, NOW)).toEqual({ prev: a, curr: b });
    expect(parseVisit(`_${b}`, NOW)).toEqual({ prev: null, curr: b });
  });

  it("treats missing, garbled, future and ancient values as empty", () => {
    const empty = { prev: null, curr: null };
    expect(parseVisit(undefined, NOW)).toEqual(empty);
    expect(parseVisit("", NOW)).toEqual(empty);
    expect(parseVisit("not-a-date_nope", NOW)).toEqual(empty);
    expect(parseVisit("2026-02-31T00:00:00Z_2026-13-01T00:00:00Z", NOW)).toEqual(empty);
    const future = new Date(NOW.getTime() + DAY).toISOString();
    expect(parseVisit(`_${future}`, NOW)).toEqual(empty);
    expect(parseVisit(`_${ago(800 * DAY)}`, NOW)).toEqual(empty);
  });
});

describe("advanceVisit", () => {
  it("starts with no previous visit the first time", () => {
    expect(advanceVisit({ prev: null, curr: null }, NOW)).toEqual({
      prev: null,
      curr: NOW.toISOString(),
    });
  });

  it("keeps the previous visit while reopening within the gap", () => {
    const prev = ago(3 * DAY);
    const curr = ago(VISIT_GAP_MS - 1000);
    expect(advanceVisit({ prev, curr }, NOW)).toEqual({ prev, curr: NOW.toISOString() });
  });

  it("starts a new visit after the gap, making the last open the previous visit", () => {
    const curr = ago(VISIT_GAP_MS);
    expect(advanceVisit({ prev: ago(9 * DAY), curr }, NOW)).toEqual({
      prev: curr,
      curr: NOW.toISOString(),
    });
  });

  it("round-trips through the cookie text", () => {
    const state = advanceVisit({ prev: null, curr: ago(DAY) }, NOW);
    expect(parseVisit(serializeVisit(state), NOW)).toEqual(state);
    expect(serializeVisit({ prev: null, curr: NOW.toISOString() })).toBe(`_${NOW.toISOString()}`);
  });
});

describe("daysAway and percentAt", () => {
  it("counts whole days between dates", () => {
    expect(daysAway("2026-10-05T23:59:00Z", "2026-10-10")).toBe(5);
    expect(daysAway("2026-10-10T01:00:00Z", "2026-10-10")).toBe(0);
  });

  it("takes the latest snapshot on or before the last visit", () => {
    const history = [
      { date: "2026-09-20", percent: 10 },
      { date: "2026-10-03", percent: 40 },
      { date: "2026-10-08", percent: 55 },
    ];
    expect(percentAt(history, "2026-10-05T10:00:00Z")).toBe(40);
    expect(percentAt(history, "2026-10-03T10:00:00Z")).toBe(40);
    expect(percentAt(history, "2026-09-01T10:00:00Z")).toBeNull();
  });
});

describe("buildSinceVisit", () => {
  const base = {
    today: "2026-10-10",
    project: "recipe-box",
    closedCount: 4,
    percentNow: 60,
    history: [{ date: "2026-10-04", percent: 52 }],
  };

  it("summarises a return after several days", () => {
    expect(buildSinceVisit({ ...base, lastVisit: "2026-10-05T09:00:00Z" })).toEqual({
      project: "recipe-box",
      lastVisit: "2026-10-05",
      daysAway: 5,
      closed: 4,
      percentChange: 8,
    });
  });

  it("shows nothing on a first visit or the same day", () => {
    expect(buildSinceVisit({ ...base, lastVisit: null })).toBeNull();
    expect(buildSinceVisit({ ...base, lastVisit: "2026-10-10T01:00:00Z" })).toBeNull();
  });

  it("leaves the progress change out when there is no older number", () => {
    const s = buildSinceVisit({ ...base, history: [], lastVisit: "2026-10-05T09:00:00Z" });
    expect(s?.percentChange).toBeNull();
  });
});

describe("describeSinceVisit", () => {
  const s = {
    project: "recipe-box",
    lastVisit: "2026-10-05",
    daysAway: 5,
    closed: 4,
    percentChange: 8,
  };

  it("writes the news plainly", () => {
    expect(describeSinceVisit(s)).toEqual({
      heading: "Welcome back. You were last here 5 days ago.",
      lines: ["4 issues closed in recipe-box.", "Progress is up 8 points."],
    });
  });

  it("handles yesterday, one issue, no change, a drop and no comparison", () => {
    expect(describeSinceVisit({ ...s, daysAway: 1, closed: 1, percentChange: 1 })).toEqual({
      heading: "Welcome back. You were last here yesterday.",
      lines: ["1 issue closed in recipe-box.", "Progress is up 1 point."],
    });
    expect(describeSinceVisit({ ...s, closed: 0, percentChange: 0 }).lines).toEqual([
      "No issues closed in recipe-box.",
      "Progress is unchanged.",
    ]);
    expect(describeSinceVisit({ ...s, percentChange: -3 }).lines[1]).toBe(
      "Progress is down 3 points, because issues were added.",
    );
    expect(describeSinceVisit({ ...s, percentChange: null }).lines).toHaveLength(1);
  });
});
