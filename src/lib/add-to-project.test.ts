import { describe, expect, it } from "vitest";
import { addMilestone, addTask } from "./add-to-project";
import { taskKey } from "./tasks-md";
import type { ProjectRef, ProjectsApi, StatusField } from "./github/projects";
import type { RepoIssue, RepoMilestone, RepoWriter } from "./github/repo-writes";

const REPO = "me/repo";
const PROJECT: ProjectRef = { id: "PVT_1", number: 1, title: "repo", url: "", linked: true };
const STATUS: StatusField = {
  fieldId: "F_1",
  options: [
    { id: "o_todo", name: "Todo" },
    { id: "o_done", name: "Done" },
  ],
};

function fakes(
  opts: {
    project?: ProjectRef | null;
    milestones?: RepoMilestone[];
    issues?: RepoIssue[];
    status?: StatusField | null;
  } = {},
) {
  const milestones = opts.milestones ?? [
    { number: 4, title: "Milestone 1: Core", state: "open", description: "" },
  ];
  const issues = [...(opts.issues ?? [])];
  const log: string[] = [];
  const bodies: string[] = [];
  const writer: RepoWriter = {
    listMilestones: async () => milestones,
    listIssues: async () => issues,
    createMilestone: async (_r, input) => {
      log.push(`milestone:${input.title}:${input.dueOn ?? ""}`);
      return { number: 9, title: input.title, state: "open", description: "" };
    },
    createIssue: async (_r, input) => {
      log.push(`issue:${input.title}:${input.milestone}`);
      bodies.push(input.body);
      const made: RepoIssue = {
        number: 50,
        nodeId: "I_50",
        title: input.title,
        text: input.title,
        state: "open",
        milestone: input.milestone,
        key: /tasks-md-key:([0-9a-f]+)/.exec(input.body)?.[1] ?? null,
      };
      issues.push(made);
      return made;
    },
    closeIssue: async () => {
      log.push("close");
    },
  };
  const projects = {
    findProject: async () => (opts.project === undefined ? PROJECT : opts.project),
    statusField: async () => (opts.status === undefined ? STATUS : opts.status),
    addIssue: async (_p: string, issueId: string) => {
      log.push(`add:${issueId}`);
      return "PVTI_50";
    },
    setStatus: async (input: { optionId: string }) => {
      log.push(`status:${input.optionId}`);
    },
  } as unknown as ProjectsApi;
  return { deps: { writer, projects, fullName: REPO }, log, bodies };
}

describe("addTask", () => {
  it("shows a preview and writes nothing until confirmed", async () => {
    const { deps, log } = fakes();
    const result = await addTask(deps, {
      title: "Print stylesheet",
      milestone: "Milestone 1: Core",
    });
    expect(result).toMatchObject({
      ok: true,
      created: false,
      preview: { title: "Print stylesheet", milestone: "Milestone 1: Core" },
    });
    expect(log).toEqual([]);
  });

  it("creates the issue in the milestone, adds it to the Project and sets Todo", async () => {
    const { deps, log, bodies } = fakes();
    const result = await addTask(
      deps,
      { title: "Print stylesheet", milestone: "milestone 1: core" },
      true,
    );
    expect(result).toMatchObject({ ok: true, created: true, issueNumber: 50 });
    expect(log).toEqual(["issue:Print stylesheet:4", "add:I_50", "status:o_todo"]);
    expect(bodies[0]).toMatch(/<!-- tasks-md-key:[0-9a-f]{12} -->/);
    expect(bodies[0]).toContain("Milestone 1: Core");
  });

  it("keeps the note in the issue body, above the footer with the hidden key", async () => {
    const { deps, bodies } = fakes();
    const result = await addTask(
      deps,
      { title: "Fix the cache", note: "It shows stale data." },
      true,
    );
    expect(result).toMatchObject({ ok: true, created: true, preview: { title: "Fix the cache" } });
    expect(bodies[0].startsWith("It shows stale data.\n\n")).toBe(true);
    expect(bodies[0]).toMatch(/<!-- tasks-md-key:[0-9a-f]{12} -->\n$/);
  });

  it("gives the task the same key the TASKS.md line would have, so the next sync agrees", async () => {
    const { deps } = fakes();
    const result = await addTask(deps, {
      title: "Print stylesheet",
      milestone: "Milestone 1: Core",
    });
    expect(result.ok && result.preview.key).toBe(taskKey("Milestone 1: Core", "Print stylesheet"));
  });

  it("can add a task that belongs to no milestone", async () => {
    const { deps, log } = fakes();
    await addTask(deps, { title: "Loose idea" }, true);
    expect(log[0]).toBe("issue:Loose idea:null");
  });

  it("refuses a second click on the same task", async () => {
    const { deps, log } = fakes();
    await addTask(deps, { title: "Print stylesheet" }, true);
    const again = await addTask(deps, { title: "Print stylesheet" }, true);
    expect(again).toMatchObject({ ok: false, error: "duplicate_task" });
    expect(log.filter((l) => l.startsWith("issue:"))).toHaveLength(1);
  });

  it("refuses an unknown milestone, a missing Project and a missing Todo option", async () => {
    expect(await addTask(fakes().deps, { title: "x", milestone: "Nope" }, true)).toMatchObject({
      ok: false,
      error: "unknown_milestone",
    });
    expect(await addTask(fakes({ project: null }).deps, { title: "x" }, true)).toMatchObject({
      ok: false,
      error: "no_project",
    });
    const noTodo = fakes({ status: { fieldId: "F", options: [{ id: "d", name: "Done" }] } });
    expect(await addTask(noTodo.deps, { title: "x" }, true)).toMatchObject({
      ok: false,
      error: "status_missing",
    });
    expect(noTodo.log).toEqual([]);
  });

  it("refuses bad input before asking GitHub for anything", async () => {
    const { deps, log } = fakes();
    expect(await addTask(deps, { title: "   " }, true)).toMatchObject({
      ok: false,
      error: "invalid_title",
    });
    expect(log).toEqual([]);
  });

  it("offers no way to edit, reorder or delete", () => {
    expect(Object.keys({ addTask, addMilestone })).toEqual(["addTask", "addMilestone"]);
  });
});

describe("addMilestone", () => {
  it("previews first, then creates it with its due date", async () => {
    const { deps, log } = fakes();
    const preview = await addMilestone(deps, {
      title: "Launch",
      dueDate: "2026-11-30",
      description: "Live.",
    });
    expect(preview).toMatchObject({
      ok: true,
      created: false,
      preview: { title: "Launch", dueDate: "2026-11-30", description: "Live." },
    });
    expect(log).toEqual([]);

    const made = await addMilestone(deps, { title: "Launch", dueDate: "2026-11-30" }, true);
    expect(made).toMatchObject({ ok: true, created: true, number: 9 });
    expect(log).toEqual(["milestone:Launch:2026-11-30"]);
  });

  it("allows no due date", async () => {
    const { deps, log } = fakes();
    await addMilestone(deps, { title: "Someday" }, true);
    expect(log).toEqual(["milestone:Someday:"]);
  });

  it("refuses a milestone that exists, ignoring capital letters, and bad input", async () => {
    const { deps, log } = fakes();
    expect(await addMilestone(deps, { title: "milestone 1: CORE" }, true)).toMatchObject({
      ok: false,
      error: "milestone_exists",
    });
    expect(await addMilestone(deps, { title: "x", dueDate: "soon" }, true)).toMatchObject({
      ok: false,
      error: "invalid_due_date",
    });
    expect(log).toEqual([]);
  });
});
