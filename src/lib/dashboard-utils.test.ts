import { describe, expect, it } from "vitest";
import {
  closedActivity,
  dayLabel,
  dueDaysInMonth,
  idealEndIndex,
  mapLimit,
  positionOnGraph,
  relativeDay,
  seriesFromHistory,
  weekStart,
  weekWindow,
} from "./dashboard-utils";

describe("weekWindow", () => {
  it("has ten weeks back, today at index 10, and two weeks ahead", () => {
    const { dates, labels } = weekWindow("2026-10-08");
    expect(dates).toHaveLength(13);
    expect(dates[0]).toBe("2026-07-30");
    expect(dates[10]).toBe("2026-10-08");
    expect(dates[12]).toBe("2026-10-22");
    expect(labels[10]).toBe("Oct 8");
  });

  it("matches the fixture window", () => {
    expect(weekWindow("2026-10-08").labels[2]).toBe("Aug 13");
  });
});

describe("dayLabel", () => {
  it("formats without a leading zero", () => {
    expect(dayLabel("2026-01-05")).toBe("Jan 5");
  });
});

describe("idealEndIndex", () => {
  const { dates } = weekWindow("2026-10-08");
  it("lands on the last milestone's due week", () => {
    expect(idealEndIndex("2026-10-22", dates)).toBe(12);
    expect(idealEndIndex("2026-10-15", dates)).toBe(11);
  });
  it("never goes before today or past the chart", () => {
    expect(idealEndIndex("2026-08-01", dates)).toBe(10);
    expect(idealEndIndex("2027-03-01", dates)).toBe(12);
  });
  it("uses the end of the chart without a due date", () => {
    expect(idealEndIndex(undefined, dates)).toBe(12);
  });
});

describe("positionOnGraph", () => {
  const { dates } = weekWindow("2026-10-08");
  it("returns whole steps for week dates and fractions in between", () => {
    expect(positionOnGraph("2026-08-13", dates)).toBe(2);
    expect(positionOnGraph("2026-08-16", dates)).toBeCloseTo(2 + 3 / 7);
  });
  it("is null outside the chart", () => {
    expect(positionOnGraph("2026-01-01", dates)).toBeNull();
    expect(positionOnGraph("2026-12-01", dates)).toBeNull();
  });
});

describe("seriesFromHistory", () => {
  const { dates } = weekWindow("2026-10-08");

  it("is null before the first snapshot and live at today", () => {
    const series = seriesFromHistory([{ date: "2026-10-08", percent: 40 }], dates, 42);
    expect(series).toHaveLength(11);
    expect(series.slice(0, 10)).toEqual(Array(10).fill(null));
    expect(series[10]).toBe(42);
  });

  it("uses the latest snapshot on or before each week", () => {
    const series = seriesFromHistory(
      [
        { date: "2026-09-12", percent: 20 },
        { date: "2026-09-30", percent: 30 },
      ],
      dates,
      35,
    );
    expect(series[5]).toBeNull(); // Sep 3, before any snapshot
    expect(series[6]).toBeNull(); // Sep 10
    expect(series[7]).toBe(20); // Sep 17
    expect(series[8]).toBe(20); // Sep 24
    expect(series[9]).toBe(30); // Oct 1
    expect(series[10]).toBe(35);
  });

  it("does not depend on input order", () => {
    const a = seriesFromHistory(
      [
        { date: "2026-09-30", percent: 30 },
        { date: "2026-09-12", percent: 20 },
      ],
      dates,
      35,
    );
    expect(a[7]).toBe(20);
  });
});

describe("weekStart", () => {
  it("finds Monday", () => {
    expect(weekStart("2026-10-08")).toBe("2026-10-05"); // Thursday
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday
  });
});

describe("closedActivity", () => {
  it("counts this week per weekday and this month per day, ignoring other periods", () => {
    const result = closedActivity(
      [
        "2026-10-05T09:00:00Z", // Monday
        "2026-10-05T18:00:00Z",
        "2026-10-07T12:00:00Z", // Wednesday
        "2026-10-02T12:00:00Z", // last week, same month
        "2026-09-30T12:00:00Z", // last month
      ],
      "2026-10-08",
    );
    expect(result.closedPerDay).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(result.closedDays).toEqual([2, 5, 7]);
  });

  it("handles no activity", () => {
    expect(closedActivity([], "2026-10-08")).toEqual({
      closedPerDay: [0, 0, 0, 0, 0, 0, 0],
      closedDays: [],
    });
  });
});

describe("dueDaysInMonth", () => {
  it("keeps only this month's due dates, unique and sorted", () => {
    expect(
      dueDaysInMonth(
        ["2026-10-22", "2026-10-03", "2026-10-22", "2026-11-05", undefined],
        "2026-10-08",
      ),
    ).toEqual([3, 22]);
  });
});

describe("relativeDay", () => {
  it("describes recent and old dates", () => {
    const today = "2026-10-08";
    expect(relativeDay("2026-10-08T01:00:00Z", today)).toBe("today");
    expect(relativeDay("2026-10-07T23:00:00Z", today)).toBe("yesterday");
    expect(relativeDay("2026-10-02T00:00:00Z", today)).toBe("6 days ago");
    expect(relativeDay("2026-09-17T00:00:00Z", today)).toBe("3 weeks ago");
    expect(relativeDay("2026-05-01T00:00:00Z", today)).toBe("May 1");
    expect(relativeDay(null, today)).toBe("never");
  });
});

describe("mapLimit", () => {
  it("keeps result order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([30, 10, 20, 5, 15], 2, async (ms) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return ms * 2;
    });
    expect(out).toEqual([60, 20, 40, 10, 30]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("handles an empty list", async () => {
    expect(await mapLimit([], 3, async (x) => x)).toEqual([]);
  });
});
