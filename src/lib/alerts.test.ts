import { describe, expect, it } from "vitest";
import { overdueMilestones, stallState, type StallInput } from "./alerts";
import type { MilestoneProgress } from "./types";

const TODAY = "2026-10-10";

function stall(overrides: Partial<StallInput> = {}) {
  return stallState({
    lastClosedAt: "2026-10-08T15:00:00Z",
    focusStartedAt: "2026-09-01",
    today: TODAY,
    thresholdDays: 7,
    awayUntil: null,
    ...overrides,
  });
}

describe("stallState", () => {
  it("is ok when an issue was closed within the threshold", () => {
    expect(stall()).toEqual({ status: "ok", daysQuiet: 2 });
    expect(stall({ lastClosedAt: "2026-10-10T01:00:00Z" })).toEqual({ status: "ok", daysQuiet: 0 });
  });

  it("is stalled once the quiet days reach the threshold, and not a day sooner", () => {
    expect(stall({ lastClosedAt: "2026-10-04T12:00:00Z" })).toEqual({ status: "ok", daysQuiet: 6 });
    expect(stall({ lastClosedAt: "2026-10-03T12:00:00Z" })).toEqual({
      status: "stalled",
      daysQuiet: 7,
    });
  });

  it("uses the configured threshold", () => {
    const lastClosedAt = "2026-10-05T12:00:00Z";
    expect(stall({ lastClosedAt, thresholdDays: 3 }).status).toBe("stalled");
    expect(stall({ lastClosedAt, thresholdDays: 14 }).status).toBe("ok");
  });

  it("treats a threshold below one day as one day", () => {
    expect(stall({ lastClosedAt: "2026-10-09T12:00:00Z", thresholdDays: 0 }).status).toBe(
      "stalled",
    );
  });

  it("measures a project that never closed an issue from when it took focus", () => {
    expect(stall({ lastClosedAt: null, focusStartedAt: "2026-10-01" })).toEqual({
      status: "stalled",
      daysQuiet: 9,
    });
    expect(stall({ lastClosedAt: null, focusStartedAt: "2026-10-08" }).status).toBe("ok");
  });

  it("is unknown when there is nothing to measure from", () => {
    expect(stall({ lastClosedAt: null, focusStartedAt: null })).toEqual({ status: "unknown" });
  });

  it("pauses while Away mode is on, even for a long-quiet project", () => {
    expect(stall({ lastClosedAt: "2026-08-01T00:00:00Z", awayUntil: "2026-10-15" })).toEqual({
      status: "away",
      until: "2026-10-15",
    });
  });

  it("resumes on the return date, counting quiet days from then", () => {
    const base = { lastClosedAt: "2026-08-01T00:00:00Z" };
    expect(stall({ ...base, awayUntil: "2026-10-10" })).toEqual({ status: "ok", daysQuiet: 0 });
    expect(stall({ ...base, awayUntil: "2026-10-06" })).toEqual({ status: "ok", daysQuiet: 4 });
    expect(stall({ ...base, awayUntil: "2026-10-02" })).toEqual({
      status: "stalled",
      daysQuiet: 8,
    });
  });

  it("keeps the later of last closed issue and return date", () => {
    expect(stall({ lastClosedAt: "2026-10-09T12:00:00Z", awayUntil: "2026-10-01" })).toEqual({
      status: "ok",
      daysQuiet: 1,
    });
  });

  it("falls back to the return date when there is no close date or start date", () => {
    expect(stall({ lastClosedAt: null, focusStartedAt: null, awayUntil: "2026-10-08" })).toEqual({
      status: "ok",
      daysQuiet: 2,
    });
  });
});

function ms(name: string, closed: number, total: number, dueDate?: string): MilestoneProgress {
  return { name, closed, total, due: dueDate ?? "No due date", ...(dueDate ? { dueDate } : {}) };
}

describe("overdueMilestones", () => {
  it("lists unfinished milestones past their due date, most overdue first", () => {
    const result = overdueMilestones(
      [
        ms("Polish", 5, 9, "2026-10-05"),
        ms("MVP", 10, 14, "2026-09-10"),
        ms("Deploy", 0, 5, "2026-11-05"),
      ],
      TODAY,
    );
    expect(result).toEqual([
      { name: "MVP", dueDate: "2026-09-10", daysOverdue: 30, remaining: 4 },
      { name: "Polish", dueDate: "2026-10-05", daysOverdue: 5, remaining: 4 },
    ]);
  });

  it("does not flag a milestone due today, a finished one, or one without a date", () => {
    expect(
      overdueMilestones(
        [
          ms("Today", 1, 5, TODAY),
          ms("Done", 5, 5, "2026-09-01"),
          ms("Empty", 0, 0, "2026-09-01"),
          ms("Undated", 1, 5),
        ],
        TODAY,
      ),
    ).toEqual([]);
  });

  it("accepts a due date with a time part and breaks ties by name", () => {
    const result = overdueMilestones(
      [ms("B", 0, 1, "2026-10-01T07:00:00Z"), ms("A", 0, 1, "2026-10-01")],
      TODAY,
    );
    expect(result.map((r) => [r.name, r.daysOverdue])).toEqual([
      ["A", 9],
      ["B", 9],
    ]);
  });

  it("returns nothing for no milestones", () => {
    expect(overdueMilestones([], TODAY)).toEqual([]);
  });
});
