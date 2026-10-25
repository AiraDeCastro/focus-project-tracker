import { describe, expect, it } from "vitest";
import type { ProjectItem, ProjectRef, ProjectsApi, StatusField } from "./github/projects";
import type { RepoIssue, RepoMilestone, RepoWriter } from "./github/repo-writes";
import { buildProjectState, syncRepo } from "./sync-repo";
import { taskKey } from "./tasks-md";

const REPO = "me/repo";
const STATUS: StatusField = {
  fieldId: "F_1",
  options: [
    { id: "o_todo", name: "Todo" },
    { id: "o_prog", name: "In Progress" },
    { id: "o_done", name: "Done" },
  ],
};
const M1 = "Milestone 1: Core";

/** An in-memory GitHub: a repo, its issues and milestones, and at most one Project. */
function world(
  initial: { milestones?: RepoMilestone[]; issues?: RepoIssue[]; project?: boolean } = {},
) {
  const milestones: RepoMilestone[] = [...(initial.milestones ?? [])];
  const issues: RepoIssue[] = [...(initial.issues ?? [])];
  const items: ProjectItem[] = [];
  let project: ProjectRef | null = initial.project
    ? { id: "PVT_1", number: 1, title: "repo", url: "", linked: true }
    : null;
  let nextIssue = 100;
  const log: string[] = [];

  const writer: RepoWriter = {
    listMilestones: async () => milestones.map((m) => ({ ...m })),
    listIssues: async () => issues.map((i) => ({ ...i })),
    createMilestone: async (_r, input) => {
      log.push(`milestone:${input.title}`);
      const made: RepoMilestone = {
        number: milestones.length + 1,
        title: input.title,
        state: "open",
        description: input.description,
      };
      milestones.push(made);
      return made;
    },
    createIssue: async (_r, input) => {
      log.push(`issue:${input.title}`);
      nextIssue += 1;
      const made: RepoIssue = {
        number: nextIssue,
        nodeId: `I_${nextIssue}`,
        title: input.title,
        text: input.title,
        state: "open",
        milestone: input.milestone,
        key: /tasks-md-key:([0-9a-f]+)/.exec(input.body)?.[1] ?? null,
      };
      issues.push(made);
      return made;
    },
    closeIssue: async (_r, number) => {
      log.push(`close:${number}`);
      const issue = issues.find((i) => i.number === number);
      if (issue) issue.state = "closed";
    },
  };

  const projects = {
    findProject: async () => project,
    viewer: async () => ({ id: "U_1", login: "me" }),
    repositoryId: async () => "R_1",
    createProject: async (input: { title: string }) => {
      log.push(`project:${input.title}`);
      project = { id: "PVT_1", number: 1, title: input.title, url: "", linked: true };
      return project;
    },
    linkProject: async () => {},
    statusField: async () => STATUS,
    listItems: async () => ({ items: items.map((i) => ({ ...i })), skipped: 0 }),
    addIssue: async (_p: string, issueId: string) => {
      const issue = issues.find((i) => i.nodeId === issueId)!;
      log.push(`add:${issue.number}`);
      items.push({
        itemId: `PVTI_${issue.number}`,
        issueId,
        number: issue.number,
        title: issue.title,
        url: "",
        state: issue.state,
        milestone: null,
        status: null,
      });
      return `PVTI_${issue.number}`;
    },
    setStatus: async (input: { itemId: string; optionId: string }) => {
      const name = STATUS.options.find((o) => o.id === input.optionId)!.name;
      log.push(`status:${input.itemId}:${name}`);
      items.find((i) => i.itemId === input.itemId)!.status = name;
    },
  } as unknown as ProjectsApi;

  return { writer, projects, log, issues, items, milestones, hasProject: () => project !== null };
}

const FILE = `# Tasks

## ${M1}

**Done when:** It works.

- [x] Build the graph
- [ ] Add the picker

## Ongoing

- [ ] Keep the docs current
`;

describe("syncRepo: onboarding a repo", () => {
  it("in a dry run, reports what it would do and writes nothing", async () => {
    const w = world();
    const result = await syncRepo({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: FILE,
    });
    expect(result.project.action).toBe("would_create");
    expect(result.mode).toBe("onboard");
    expect(result.plan.imports).toHaveLength(2);
    expect(result.imported).toBeNull();
    expect(w.log).toEqual([]);
    expect(w.hasProject()).toBe(false);
  });

  it("creates the Project, the milestone, the issues and the items, and closes the ticked one", async () => {
    const w = world();
    const result = await syncRepo({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: FILE,
      apply: true,
    });
    expect(result.project.action).toBe("created");
    expect(result.imported).toMatchObject({
      milestonesCreated: 1,
      issuesCreated: 2,
      issuesClosed: 1,
    });
    expect(w.issues.map((i) => [i.title, i.state])).toEqual([
      ["Build the graph", "closed"],
      ["Add the picker", "open"],
    ]);
    expect(w.items.map((i) => i.status)).toEqual(["Done", "Todo"]);
  });

  it("reuses issues an earlier tasks:sync made, and only fills the Project", async () => {
    const earlier: RepoIssue[] = [
      {
        number: 7,
        nodeId: "I_7",
        title: "Build the graph",
        text: "Build the graph",
        state: "closed",
        milestone: 1,
        key: taskKey(M1, "Build the graph"),
      },
      {
        number: 8,
        nodeId: "I_8",
        title: "Add the picker",
        text: "Add the picker",
        state: "open",
        milestone: 1,
        key: taskKey(M1, "Add the picker"),
      },
    ];
    const w = world({
      milestones: [{ number: 1, title: M1, state: "open", description: "It works." }],
      issues: earlier,
    });
    const result = await syncRepo({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: FILE,
      apply: true,
    });
    expect(result.imported).toMatchObject({ issuesCreated: 0, issuesReused: 2, itemsAdded: 2 });
    expect(w.log.some((l) => l.startsWith("issue:"))).toBe(false);
  });

  it("is safe to run again: the second pass changes nothing", async () => {
    const w = world();
    const input = {
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: FILE,
      apply: true,
    };
    await syncRepo(input);
    const after = w.log.length;
    const second = await syncRepo(input);
    expect(w.log.length).toBe(after);
    expect(second.mode).toBe("sync");
    expect(second.plan.drift).toEqual([]);
    expect(second.imported?.writes).toBe(0);
  });
});

describe("syncRepo: keeping TASKS.md in step", () => {
  async function onboarded() {
    const w = world();
    await syncRepo({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: FILE,
      apply: true,
    });
    return w;
  }

  it("generates a file that parses back to the same tasks, and keeps other sections", async () => {
    const w = await onboarded();
    const result = await syncRepo({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: FILE,
    });
    expect(result.tasksMd).toContain("- [x] Build the graph");
    expect(result.tasksMd).toContain("- [ ] Add the picker");
    expect(result.tasksMd).toContain("## Ongoing\n\n- [ ] Keep the docs current");
    expect(result.tasksMd).toContain("**Done when:** It works.");
  });

  it("imports a line added to the file and shows it in the next generated file", async () => {
    const w = await onboarded();
    const edited = FILE.replace(
      "- [ ] Add the picker",
      "- [ ] Add the picker\n- [ ] Print stylesheet",
    );
    const result = await syncRepo({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: edited,
      apply: true,
    });
    expect(result.plan.imports.map((i) => i.text)).toEqual(["Print stylesheet"]);
    expect(w.issues.map((i) => i.title)).toContain("Print stylesheet");
    expect(result.tasksMd).toContain("- [ ] Print stylesheet");
  });

  it("ignores a tick made in the file, reports it, and writes the Project's version back", async () => {
    const w = await onboarded();
    const ticked = FILE.replace("- [ ] Add the picker", "- [x] Add the picker");
    const result = await syncRepo({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: ticked,
      apply: true,
    });
    expect(result.plan.drift.map((d) => d.kind)).toEqual(["ticked_in_file"]);
    expect(result.tasksMd).toContain("- [ ] Add the picker");
    expect(result.tasksMdChanged).toBe(true);
    expect(w.issues.find((i) => i.title === "Add the picker")?.state).toBe("open");
  });

  it("follows an issue closed on GitHub: the next file ticks it", async () => {
    const w = await onboarded();
    w.issues.find((i) => i.title === "Add the picker")!.state = "closed";
    const result = await syncRepo({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: FILE,
    });
    expect(result.tasksMd).toContain("- [x] Add the picker");
  });

  it("stops at the write cap and carries on in the next run", async () => {
    const w = world();
    const input = {
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      markdown: FILE,
      apply: true,
    };
    const first = await syncRepo({ ...input, maxWrites: 3 });
    expect(first.imported?.remaining).toBeGreaterThan(0);
    const second = await syncRepo(input);
    expect(second.imported?.remaining).toBe(0);
    expect(w.issues).toHaveLength(2);
  });
});

describe("buildProjectState", () => {
  const ms: RepoMilestone[] = [
    { number: 1, title: "M1", state: "open", description: "d1" },
    { number: 2, title: "M2", state: "open", description: "" },
    { number: 3, title: "M3 (no tasks)", state: "open", description: "" },
  ];
  const issue = (n: number, over: Partial<RepoIssue> = {}): RepoIssue => ({
    number: n,
    nodeId: `I_${n}`,
    title: `T${n}`,
    text: `Text ${n}`,
    state: "open",
    milestone: 1,
    key: `key${n}`,
    ...over,
  });
  const item = (n: number, over: Partial<ProjectItem> = {}): ProjectItem => ({
    itemId: `PVTI_${n}`,
    issueId: `I_${n}`,
    number: n,
    title: `T${n}`,
    url: "",
    state: "open",
    milestone: null,
    status: null,
    ...over,
  });

  it("groups tasks by the repo's milestones, keeps the Project's order and skips empty milestones", () => {
    const state = buildProjectState(
      ms,
      [issue(1), issue(2, { milestone: 2 }), issue(3)],
      [item(3), item(2), item(1)],
    );
    expect(
      state.milestones.map((m) => [m.title, m.description, m.tasks.map((t) => t.title)]),
    ).toEqual([
      ["M1", "d1", ["T3", "T1"]],
      ["M2", "", ["T2"]],
    ]);
  });

  it("puts tasks with no milestone in loose, and uses the full text and the hidden key", () => {
    const state = buildProjectState(ms, [issue(1, { milestone: null })], [item(1)]);
    expect(state.loose).toEqual([{ key: "key1", title: "T1", text: "Text 1", done: false }]);
  });

  it("counts a closed issue or a Done Status as done", () => {
    const state = buildProjectState(
      ms,
      [issue(1, { state: "closed" }), issue(2)],
      [item(1), item(2, { status: "Done" })],
    );
    expect(state.milestones[0].tasks.map((t) => t.done)).toEqual([true, true]);
  });

  it("ignores Project items that are not issues of this repo, and keys an unkeyed issue like the file would", () => {
    const state = buildProjectState(
      ms,
      [issue(1, { key: null, text: "Plain task" })],
      [item(9), item(1)],
    );
    expect(state.milestones[0].tasks).toHaveLength(1);
    expect(state.milestones[0].tasks[0].key).toBe(taskKey("M1", "Plain task"));
  });
});
