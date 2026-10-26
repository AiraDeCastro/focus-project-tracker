import { describe, expect, it, vi } from "vitest";
import type { ProjectsApi } from "./github/projects";
import type { RepoIssue, RepoWriter } from "./github/repo-writes";
import { closeDuplicates, findDuplicates, previewDuplicates, MAX_CLOSES } from "./duplicates";

const OLD = "Add the star button to every project card";
const NEW = "Add the star button to every project card on the dashboard";

function issue(n: number, text: string, over: Partial<RepoIssue> = {}): RepoIssue {
  return {
    number: n,
    nodeId: `I_${n}`,
    title: text,
    text,
    state: "open",
    milestone: 1,
    key: `key${n}`,
    ...over,
  };
}

describe("findDuplicates", () => {
  it("finds an open keyed issue outside the Project that repeats one inside it", () => {
    const kept = issue(150, NEW);
    const stale = issue(12, OLD);
    const pairs = findDuplicates({ issues: [stale, kept], inProject: new Set(["I_150"]) });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].duplicate.number).toBe(12);
    expect(pairs[0].of.number).toBe(150);
  });

  it("counts an identical copy made by a repeated run", () => {
    const pairs = findDuplicates({
      issues: [issue(12, OLD), issue(13, OLD)],
      inProject: new Set(["I_13"]),
    });
    expect(pairs.map((p) => p.duplicate.number)).toEqual([12]);
  });

  it("leaves alone issues in the Project, closed, unkeyed, unlike, or in another milestone", () => {
    const kept = issue(150, NEW);
    const inProject = new Set(["I_150"]);
    const run = (stale: RepoIssue) => findDuplicates({ issues: [stale, kept], inProject });
    expect(run(issue(12, OLD, { state: "closed" }))).toEqual([]);
    expect(run(issue(12, OLD, { key: null }))).toEqual([]);
    expect(run(issue(12, "Write the weekly review email"))).toEqual([]);
    expect(run(issue(12, OLD, { milestone: 2 }))).toEqual([]);
    // An issue that is itself in the Project is never a duplicate.
    expect(
      findDuplicates({ issues: [kept, issue(12, OLD)], inProject: new Set(["I_150", "I_12"]) }),
    ).toEqual([]);
  });

  it("picks the best match when several fit, and lists by issue number", () => {
    const near = issue(150, NEW);
    const far = issue(151, "Add the star button to project cards");
    const pairs = findDuplicates({
      issues: [issue(20, OLD), issue(10, OLD), near, far],
      inProject: new Set(["I_150", "I_151"]),
    });
    expect(pairs.map((p) => [p.duplicate.number, p.of.number])).toEqual([
      [10, 150],
      [20, 150],
    ]);
  });
});

function fakes(issues: RepoIssue[], inProject: string[]) {
  const closed: [number, string | undefined][] = [];
  const writer = {
    listIssues: async () => issues.map((i) => ({ ...i })),
    closeIssue: vi.fn(async (_r: string, n: number, reason?: string) => {
      closed.push([n, reason]);
    }),
  } as unknown as RepoWriter;
  const projects = {
    listItems: async () => ({
      items: inProject.map((issueId) => ({ issueId })),
      skipped: 0,
    }),
  } as unknown as ProjectsApi;
  return { deps: { writer, projects, fullName: "me/repo", projectId: "PVT_1" }, closed };
}

describe("previewDuplicates and closeDuplicates", () => {
  it("previews without writing", async () => {
    const w = fakes([issue(12, OLD), issue(150, NEW)], ["I_150"]);
    expect((await previewDuplicates(w.deps)).map((p) => p.duplicate.number)).toEqual([12]);
    expect(w.closed).toEqual([]);
  });

  it("closes only confirmed numbers that are still duplicates, as not planned", async () => {
    const w = fakes([issue(12, OLD), issue(150, NEW), issue(99, "Something unrelated")], ["I_150"]);
    const result = await closeDuplicates(w.deps, [12, 99, 150, 7, 12, -1, 1.5]);
    expect(result).toEqual({ closed: [12], skipped: [99, 150, 7], remaining: 0 });
    expect(w.closed).toEqual([[12, "not_planned"]]);
  });

  it("closes at most the cap in one call and says what is left", async () => {
    const issues = [issue(1000, NEW)];
    const numbers: number[] = [];
    for (let n = 1; n <= MAX_CLOSES + 3; n += 1) {
      issues.push(issue(n, OLD));
      numbers.push(n);
    }
    const w = fakes(issues, ["I_1000"]);
    const result = await closeDuplicates(w.deps, numbers);
    expect(result.closed).toHaveLength(MAX_CLOSES);
    expect(result.remaining).toBe(3);
  });
});
