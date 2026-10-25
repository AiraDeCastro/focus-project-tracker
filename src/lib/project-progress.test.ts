import { describe, expect, it } from "vitest";
import type { GithubMilestone } from "./github/api";
import { IMPLICIT_MILESTONE_NUMBER } from "./github/mapping";
import { GithubGraphqlError, ProjectScopeError, type ProjectItem } from "./github/projects";
import {
  describeProjectCheck,
  describeProjectReadError,
  openTasksFromProject,
  progressFromProject,
} from "./project-progress";

const ms = (
  number: number,
  title: string,
  dueOn: string | null = null,
  open = 99,
  closed = 99,
): GithubMilestone => ({ number, title, dueOn, openIssues: open, closedIssues: closed });

const item = (n: number, over: Partial<ProjectItem> = {}): ProjectItem => ({
  itemId: `PVTI_${n}`,
  issueId: `I_${n}`,
  number: n,
  title: `Task ${n}`,
  url: `https://github.com/me/r/issues/${n}`,
  state: "open",
  milestone: { number: 1, title: "M1" },
  status: null,
  ...over,
});

describe("progressFromProject", () => {
  it("counts only the Project's tasks, ignoring the repo's own issue counts", () => {
    const result = progressFromProject(
      [ms(1, "M1", "2026-10-22T07:00:00Z", 50, 50)],
      [item(1, { state: "closed" }), item(2), item(3)],
    );
    expect(result).toEqual([
      { number: 1, name: "M1", closed: 1, total: 3, due: "Oct 22", dueDate: "2026-10-22" },
    ]);
  });

  it("counts a Status of Done as done even when the issue is still open", () => {
    const result = progressFromProject([ms(1, "M1")], [item(1, { status: "Done" }), item(2)]);
    expect(result[0]).toMatchObject({ closed: 1, total: 2 });
  });

  it("keeps the repo's order by due date and drops milestones with no Project task", () => {
    const result = progressFromProject(
      [
        ms(3, "Later", "2026-12-01T07:00:00Z"),
        ms(2, "Sooner", "2026-11-01T07:00:00Z"),
        ms(9, "Empty"),
      ],
      [
        item(1, { milestone: { number: 3, title: "Later" } }),
        item(2, { milestone: { number: 2, title: "Sooner" } }),
      ],
    );
    expect(result.map((m) => m.name)).toEqual(["Sooner", "Later"]);
  });

  it("uses one implicit milestone when no milestone holds a task", () => {
    const result = progressFromProject(
      [ms(1, "M1")],
      [item(1, { milestone: null, state: "closed" }), item(2, { milestone: null })],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      number: IMPLICIT_MILESTONE_NUMBER,
      name: "All issues",
      closed: 1,
      total: 2,
    });
  });

  it("shows nothing for an empty Project", () => {
    expect(progressFromProject([ms(1, "M1")], [])).toEqual([]);
  });
});

describe("openTasksFromProject", () => {
  const items = [
    item(1, { state: "closed" }),
    item(2),
    item(3, { status: "Done" }),
    item(4),
    item(5, { milestone: { number: 2, title: "M2" } }),
    item(6),
  ];

  it("lists the open tasks of the milestone in the Project's order, up to the limit", () => {
    expect(openTasksFromProject(items, 1, 2)).toEqual([
      { number: 2, title: "Task 2", htmlUrl: "https://github.com/me/r/issues/2" },
      { number: 4, title: "Task 4", htmlUrl: "https://github.com/me/r/issues/4" },
    ]);
  });

  it("takes every open task for the implicit milestone", () => {
    expect(openTasksFromProject(items, IMPLICIT_MILESTONE_NUMBER, 10).map((t) => t.number)).toEqual(
      [2, 4, 5, 6],
    );
  });

  it("returns nothing when the milestone has no open task", () => {
    expect(openTasksFromProject(items, 7, 3)).toEqual([]);
  });
});

describe("describeProjectReadError", () => {
  it("explains the cases a person can act on, and never shows a raw message", () => {
    expect(describeProjectReadError(new ProjectScopeError(false))).toMatch(/permission to read/);
    expect(describeProjectReadError(new GithubGraphqlError("x", 401))).toMatch(/Sign in again/);
    expect(describeProjectReadError(new GithubGraphqlError("x", 429))).toMatch(/limiting/);
    expect(describeProjectReadError(new GithubGraphqlError("x", 404))).toMatch(/not found/);
    expect(describeProjectReadError(new Error("ghp_secret"))).toBe("could not be read.");
  });
});

describe("describeProjectCheck", () => {
  it("is empty when no repo has a Project", () => {
    expect(describeProjectCheck({ fromProject: 0, problems: [] })).toBeNull();
  });

  it("says how many repos read from Projects, and which fell back and why", () => {
    expect(describeProjectCheck({ fromProject: 1, problems: [] })).toBe(
      "Progress for 1 repo is read from GitHub Projects.",
    );
    expect(describeProjectCheck({ fromProject: 2, problems: ["crm: could not be read."] })).toBe(
      "Progress for 2 repos are read from GitHub Projects. Read from issues instead: crm: could not be read.",
    );
  });
});
