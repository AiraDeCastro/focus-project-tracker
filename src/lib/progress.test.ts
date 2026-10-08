import { describe, expect, it } from "vitest";
import { currentMilestoneIndex, milestoneClosed, percentComplete, totals } from "./progress";
import type { Project } from "./types";

function project(milestones: [number, number][]): Project {
  return {
    id: "demo",
    status: "focus",
    lastActivity: "today",
    series: [],
    todayTasks: [],
    milestones: milestones.map(([closed, total], i) => ({
      name: `M${i + 1}`,
      closed,
      total,
      due: "Oct 22",
    })),
  };
}

describe("progress", () => {
  it("sums closed and open issues across milestones", () => {
    expect(
      totals(
        project([
          [8, 8],
          [5, 9],
          [0, 5],
        ]),
      ),
    ).toEqual({ closed: 13, total: 22, open: 9 });
  });

  it("rounds percent complete", () => {
    expect(
      percentComplete(
        project([
          [8, 8],
          [14, 14],
          [5, 9],
          [0, 5],
        ]),
      ),
    ).toBe(75);
    expect(percentComplete(project([[1, 3]]))).toBe(33);
  });

  it("is 0 percent for a project with no issues", () => {
    expect(percentComplete(project([]))).toBe(0);
    expect(percentComplete(project([[0, 0]]))).toBe(0);
  });

  it("picks the first milestone with open issues as current", () => {
    expect(
      currentMilestoneIndex(
        project([
          [8, 8],
          [5, 9],
          [0, 5],
        ]),
      ),
    ).toBe(1);
  });

  it("falls back to the last milestone when everything is closed", () => {
    expect(
      currentMilestoneIndex(
        project([
          [8, 8],
          [4, 4],
        ]),
      ),
    ).toBe(1);
  });

  it("applies newly closed issues to the first open milestone, then the next", () => {
    const p = project([
      [8, 8],
      [5, 9],
      [0, 5],
    ]);
    expect(milestoneClosed(p, 1, 2)).toBe(7);
    expect(totals(p, 2).open).toBe(7);
    expect(currentMilestoneIndex(p, 4)).toBe(2);
    expect(milestoneClosed(p, 2, 5)).toBe(1);
  });

  it("never closes more issues than are open", () => {
    const p = project([[1, 2]]);
    expect(totals(p, 10)).toEqual({ closed: 2, total: 2, open: 0 });
  });
});
