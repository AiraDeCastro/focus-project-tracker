import { describe, expect, it } from "vitest";
import { buildIssueTrend, describeIssueChange } from "./issue-trend";

const labels = ["Aug 4", "Aug 11", "Aug 18", "Aug 25"];

describe("buildIssueTrend", () => {
  it("ends on today's number and measures from the first week that has a value", () => {
    const trend = buildIssueTrend([null, 20, 24, 99], labels, 30);
    expect(trend.values).toEqual([null, 20, 24, 30]);
    expect(trend.since).toBe("Aug 11");
    expect(trend.change).toBe(10);
    expect(trend.known).toBe(3);
  });

  it("has no trend with only today's number, or with nothing at all", () => {
    expect(buildIssueTrend([null, null, null, 5], labels, 30)).toMatchObject({
      change: null,
      since: null,
      known: 1,
    });
    expect(buildIssueTrend([], labels, 7)).toMatchObject({ values: [7], change: null, known: 1 });
  });

  it("reports a fall as a negative change", () => {
    expect(buildIssueTrend([12, 9, 7, 0], labels, 3).change).toBe(-9);
  });
});

describe("describeIssueChange", () => {
  it("words a rise, a fall, no change and a missing trend", () => {
    expect(describeIssueChange(buildIssueTrend([20, 22, 24, 0], labels, 36))).toBe(
      "Up 16 since Aug 4",
    );
    expect(describeIssueChange(buildIssueTrend([20, 18, 15, 0], labels, 9))).toBe(
      "Down 11 since Aug 4",
    );
    expect(describeIssueChange(buildIssueTrend([5, 5, 5, 0], labels, 5))).toBe(
      "No change since Aug 4",
    );
    expect(describeIssueChange(buildIssueTrend([], labels, 5))).toBe(
      "Trend starts after a few weekly snapshots",
    );
  });
});
