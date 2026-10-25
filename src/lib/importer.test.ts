import { describe, expect, it, vi } from "vitest";
import type {
  ProjectItem,
  ProjectItems,
  ProjectRef,
  ProjectsApi,
  StatusField,
} from "./github/projects";
import type { RepoIssue, RepoMilestone, RepoWriter } from "./github/repo-writes";
import { StatusFieldError, runImport, type ImportPlan } from "./importer";
import { keyForNewTask } from "./truth";

const REPO = "me/repo";
const PROJECT: ProjectRef = { id: "PVT_1", number: 3, title: "repo", url: "", linked: true };
const STATUS: StatusField = {
  fieldId: "F_1",
  options: [
    { id: "o_todo", name: "Todo" },
    { id: "o_prog", name: "In progress" },
    { id: "o_done", name: "Done" },
  ],
};

interface World {
  milestones: RepoMilestone[];
  issues: RepoIssue[];
  items: ProjectItem[];
  status: StatusField | null;
}

/** An in-memory GitHub: it remembers every write so tests can look at what changed. */
function fakes(world: Partial<World> = {}) {
  const w: World = {
    milestones: [],
    issues: [],
    items: [],
    status: STATUS,
    ...world,
  };
  const log: string[] = [];
  let nextIssue = 100;
  let nextMilestone = 10;

  const writer: RepoWriter = {
    listMilestones: async () => w.milestones.map((m) => ({ ...m })),
    listIssues: async () => w.issues.map((i) => ({ ...i })),
    createMilestone: async (_repo, input) => {
      log.push(`milestone:${input.title}`);
      const made = { number: (nextMilestone += 1), title: input.title, state: "open" as const };
      w.milestones.push(made);
      return made;
    },
    createIssue: async (_repo, input) => {
      log.push(`issue:${input.title}`);
      const body = input.body;
      const made: RepoIssue = {
        number: (nextIssue += 1),
        nodeId: `I_${nextIssue}`,
        title: input.title,
        state: "open",
        milestone: input.milestone,
        key: /tasks-md-key:([0-9a-f]+)/.exec(body)?.[1] ?? null,
      };
      w.issues.push(made);
      return made;
    },
    closeIssue: async (_repo, number) => {
      log.push(`close:${number}`);
      const issue = w.issues.find((i) => i.number === number);
      if (issue) issue.state = "closed";
    },
  };

  const projects = {
    listItems: async (): Promise<ProjectItems> => ({
      items: w.items.map((i) => ({ ...i })),
      skipped: 0,
    }),
    statusField: async () => w.status,
    addIssue: async (_project: string, issueId: string) => {
      log.push(`add:${issueId}`);
      const issue = w.issues.find((i) => i.nodeId === issueId)!;
      const item: ProjectItem = {
        itemId: `PVTI_${issue.number}`,
        issueId,
        number: issue.number,
        title: issue.title,
        url: "",
        state: issue.state,
        milestone: null,
        status: null,
      };
      w.items.push(item);
      return item.itemId;
    },
    setStatus: async (input: { itemId: string; optionId: string }) => {
      const name = STATUS.options.find((o) => o.id === input.optionId)?.name ?? "?";
      log.push(`status:${input.itemId}:${name}`);
      const item = w.items.find((i) => i.itemId === input.itemId)!;
      item.status = name;
    },
  } as unknown as ProjectsApi;

  return { w, log, writer, projects };
}

const task = (milestone: string | null, text: string, done = false) => ({
  milestone,
  title: text,
  text,
  key: keyForNewTask(milestone, text),
  done,
});

function plan(over: Partial<ImportPlan> = {}): ImportPlan {
  return { imports: [], newMilestones: [], ...over };
}

const M1 = "Milestone 1: Core";

describe("runImport", () => {
  it("does nothing, and reads nothing, for an empty plan", async () => {
    const { writer, projects } = fakes();
    const listIssues = vi.spyOn(writer, "listIssues");
    const report = await runImport({
      writer,
      projects,
      fullName: REPO,
      project: PROJECT,
      plan: plan(),
      apply: true,
    });
    expect(report.writes).toBe(0);
    expect(listIssues).not.toHaveBeenCalled();
  });

  it("creates the milestone, the issues, the Project items and their Status", async () => {
    const { w, log, writer, projects } = fakes();
    const report = await runImport({
      writer,
      projects,
      fullName: REPO,
      project: PROJECT,
      apply: true,
      plan: plan({
        newMilestones: [{ title: M1, description: "It works." }],
        imports: [task(M1, "Build it"), task(M1, "Ship it", true), task(null, "Fix a bug")],
      }),
    });
    expect(log).toEqual([
      `milestone:${M1}`,
      "issue:Build it",
      "add:I_101",
      "status:PVTI_101:Todo",
      "issue:Ship it",
      "close:102",
      "add:I_102",
      "status:PVTI_102:Done",
      "issue:Fix a bug",
      "add:I_103",
      "status:PVTI_103:Todo",
    ]);
    expect(report).toMatchObject({
      dryRun: false,
      milestonesCreated: 1,
      issuesCreated: 3,
      issuesClosed: 1,
      itemsAdded: 3,
      statusesSet: 3,
      remaining: 0,
    });
    expect(w.issues.map((i) => i.milestone)).toEqual([11, 11, null]);
  });

  it("writes nothing in a dry run but reports what it would do", async () => {
    const { log, writer, projects } = fakes();
    const report = await runImport({
      writer,
      projects,
      fullName: REPO,
      project: PROJECT,
      plan: plan({
        newMilestones: [{ title: M1, description: "" }],
        imports: [task(M1, "Build it"), task(M1, "Ship it", true)],
      }),
    });
    expect(log).toEqual([]);
    expect(report).toMatchObject({
      dryRun: true,
      milestonesCreated: 1,
      issuesCreated: 2,
      issuesClosed: 1,
      itemsAdded: 2,
      statusesSet: 2,
      writes: 1 + 2 + 1 + 2 + 2,
    });
  });

  it("reuses an issue the sync made earlier instead of creating a second one", async () => {
    const existing: RepoIssue = {
      number: 5,
      nodeId: "I_5",
      title: "Build it",
      state: "open",
      milestone: 11,
      key: keyForNewTask(M1, "Build it"),
    };
    const { log, writer, projects } = fakes({
      milestones: [{ number: 11, title: M1, state: "open" }],
      issues: [existing],
    });
    const report = await runImport({
      writer,
      projects,
      fullName: REPO,
      project: PROJECT,
      apply: true,
      plan: plan({ imports: [task(M1, "Build it")] }),
    });
    expect(log).toEqual(["add:I_5", "status:PVTI_5:Todo"]);
    expect(report).toMatchObject({ issuesCreated: 0, issuesReused: 1, itemsAdded: 1 });
  });

  it("is safe to run twice: the second run has nothing left to do", async () => {
    const { log, writer, projects } = fakes();
    const input = {
      writer,
      projects,
      fullName: REPO,
      project: PROJECT,
      apply: true,
      plan: plan({
        newMilestones: [{ title: M1, description: "" }],
        imports: [task(M1, "Build it"), task(M1, "Ship it", true)],
      }),
    };
    await runImport(input);
    const first = log.length;
    const second = await runImport(input);
    expect(log.length).toBe(first);
    expect(second.writes).toBe(0);
  });

  it("never changes the Status of an item that already has one", async () => {
    const issue: RepoIssue = {
      number: 5,
      nodeId: "I_5",
      title: "Build it",
      state: "open",
      milestone: null,
      key: keyForNewTask(null, "Build it"),
    };
    const item: ProjectItem = {
      itemId: "PVTI_5",
      issueId: "I_5",
      number: 5,
      title: "Build it",
      url: "",
      state: "open",
      milestone: null,
      status: "In progress",
    };
    const { log, writer, projects } = fakes({ issues: [issue], items: [item] });
    const report = await runImport({
      writer,
      projects,
      fullName: REPO,
      project: PROJECT,
      apply: true,
      plan: plan({ imports: [task(null, "Build it")] }),
    });
    expect(log).toEqual([]);
    expect(report.writes).toBe(0);
  });

  it("does not reopen or re-close an issue that is already closed, and marks it Done", async () => {
    const issue: RepoIssue = {
      number: 5,
      nodeId: "I_5",
      title: "Ship it",
      state: "closed",
      milestone: null,
      key: keyForNewTask(null, "Ship it"),
    };
    const { log, writer, projects } = fakes({ issues: [issue] });
    await runImport({
      writer,
      projects,
      fullName: REPO,
      project: PROJECT,
      apply: true,
      plan: plan({ imports: [task(null, "Ship it", true)] }),
    });
    expect(log).toEqual(["add:I_5", "status:PVTI_5:Done"]);
  });

  it("stops at the write cap, reports what is left, and a second run finishes the job", async () => {
    const { w, writer, projects } = fakes();
    const input = {
      writer,
      projects,
      fullName: REPO,
      project: PROJECT,
      apply: true,
      plan: plan({
        imports: [task(null, "One"), task(null, "Two"), task(null, "Three")],
      }),
    };
    const first = await runImport({ ...input, maxWrites: 4 });
    expect(first.writes).toBe(4);
    expect(first.remaining).toBeGreaterThan(0);
    expect(w.issues.length).toBeLessThan(3);

    const second = await runImport(input);
    expect(second.remaining).toBe(0);
    expect(w.issues.map((i) => i.title)).toEqual(["One", "Two", "Three"]);
    expect(w.items.map((i) => i.status)).toEqual(["Todo", "Todo", "Todo"]);
  });

  it("waits after every write when asked to", async () => {
    const { writer, projects } = fakes();
    const pause = vi.fn(async () => {});
    const report = await runImport({
      writer,
      projects,
      fullName: REPO,
      project: PROJECT,
      apply: true,
      pause,
      plan: plan({ imports: [task(null, "One")] }),
    });
    expect(pause).toHaveBeenCalledTimes(report.writes);
  });

  it("explains a Project whose Status field is missing or has no Done option", async () => {
    const missing = fakes({ status: null });
    await expect(
      runImport({
        writer: missing.writer,
        projects: missing.projects,
        fullName: REPO,
        project: PROJECT,
        apply: true,
        plan: plan({ imports: [task(null, "One")] }),
      }),
    ).rejects.toBeInstanceOf(StatusFieldError);

    const noDone = fakes({ status: { fieldId: "F", options: [{ id: "a", name: "Todo" }] } });
    await expect(
      runImport({
        writer: noDone.writer,
        projects: noDone.projects,
        fullName: REPO,
        project: PROJECT,
        apply: true,
        plan: plan({ imports: [task(null, "One")] }),
      }),
    ).rejects.toThrow(/"Done"/);
    expect(noDone.log).toEqual([]);
  });
});
