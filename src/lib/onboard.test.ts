import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects as projectsTable } from "@/db/schema";
import type { ProjectItem, ProjectRef, ProjectsApi, StatusField } from "./github/projects";
import type { RepoIssue, RepoMilestone, RepoWriter } from "./github/repo-writes";
import { applyOnboarding, previewOnboarding, WRITES_PER_CALL } from "./onboard";
import { getProjectLink } from "./project-link";

const REPO = "me/repo";
const STATUS: StatusField = {
  fieldId: "F_1",
  options: [
    { id: "o_todo", name: "Todo" },
    { id: "o_done", name: "Done" },
  ],
};

const FILE = `# Tasks

## Milestone 1: Core

**Done when:** It works.

- [x] Build the graph
- [ ] Add the picker
- [ ] Add the star

## Ongoing

- [ ] Keep the docs current
`;

/** An in-memory GitHub with a repo, its issues, at most one Project, and a TASKS.md. */
function world(files: Record<string, string> = { "TASKS.md": FILE }, withProject = false) {
  const milestones: RepoMilestone[] = [];
  const issues: RepoIssue[] = [];
  const items: ProjectItem[] = [];
  let project: ProjectRef | null = withProject
    ? { id: "PVT_1", number: 4, title: "repo", url: "", linked: true }
    : null;
  let next = 100;
  const log: string[] = [];

  const writer: RepoWriter = {
    readFile: async (_r, path) => files[path] ?? null,
    listMilestones: async () => milestones.map((m) => ({ ...m })),
    listIssues: async () => issues.map((i) => ({ ...i })),
    createMilestone: async (_r, input) => {
      log.push("milestone");
      const made = {
        number: milestones.length + 1,
        title: input.title,
        state: "open" as const,
        description: input.description,
      };
      milestones.push(made);
      return made;
    },
    createIssue: async (_r, input) => {
      log.push("issue");
      next += 1;
      const made: RepoIssue = {
        number: next,
        nodeId: `I_${next}`,
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
      log.push("close");
      const issue = issues.find((i) => i.number === number);
      if (issue) issue.state = "closed";
    },
  };
  const projects = {
    findProject: async () => project,
    viewer: async () => ({ id: "U_1", login: "me" }),
    repositoryId: async () => "R_1",
    createProject: async (input: { title: string }) => {
      log.push("project");
      project = { id: "PVT_1", number: 4, title: input.title, url: "", linked: true };
      return project;
    },
    linkProject: async () => {},
    statusField: async () => STATUS,
    listItems: async () => ({ items: items.map((i) => ({ ...i })), skipped: 0 }),
    addIssue: async (_p: string, issueId: string) => {
      const issue = issues.find((i) => i.nodeId === issueId)!;
      log.push("add");
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
      log.push("status");
      items.find((i) => i.itemId === input.itemId)!.status = STATUS.options.find(
        (o) => o.id === input.optionId,
      )!.name;
    },
  } as unknown as ProjectsApi;
  return { writer, projects, log, issues, hasProject: () => project !== null };
}

let db: Db;
beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(projectsTable).values({
    repoId: 1,
    fullName: REPO,
    name: "repo",
    htmlUrl: "https://github.com/me/repo",
  });
});

describe("previewOnboarding", () => {
  it("says what would happen and writes nothing", async () => {
    const w = world();
    const result = await previewOnboarding({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
    });
    expect(result).toEqual({
      ok: true,
      summary: {
        tasksFile: "TASKS.md",
        project: { action: "would_create", title: "repo", statusMissing: [] },
        tasksToImport: 3,
        tasksAlreadyDone: 1,
        milestonesToCreate: 1,
        ignoredInFile: 0,
        writes: 1 + 3 * 3 + 1 + 1,
      },
    });
    expect(w.log).toEqual([]);
    expect(w.hasProject()).toBe(false);
  });

  it("finds the task list in docs/ when the top folder has none", async () => {
    const w = world({ "docs/TASKS.md": FILE });
    const result = await previewOnboarding({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
    });
    expect(result.ok && result.summary.tasksFile).toBe("docs/TASKS.md");
  });

  it("explains a repo with no task list, or a list with no milestone tasks", async () => {
    const none = world({});
    expect(
      await previewOnboarding({ writer: none.writer, projects: none.projects, fullName: REPO }),
    ).toMatchObject({
      ok: false,
      error: "no_tasks_file",
    });
    const empty = world({ "TASKS.md": "# Tasks\n\n## Ongoing\n\n- [ ] keep\n" });
    expect(
      await previewOnboarding({ writer: empty.writer, projects: empty.projects, fullName: REPO }),
    ).toMatchObject({
      ok: false,
      error: "no_tasks_in_file",
    });
  });

  it("reports a Project that is missing a Status option the importer needs", async () => {
    const w = world(undefined, true);
    (w.projects as unknown as { statusField: () => Promise<StatusField> }).statusField =
      async () => ({
        fieldId: "F",
        options: [{ id: "a", name: "Backlog" }],
      });
    const result = await previewOnboarding({
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
    });
    expect(result).toMatchObject({ ok: false, error: "status_missing" });
    expect(!result.ok && result.message).toMatch(/Status field has no "Todo" option/);
    const applied = await applyOnboarding({
      db,
      repoId: 1,
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
    });
    expect(applied).toMatchObject({ ok: false, error: "status_missing" });
    expect(w.log).toEqual([]);
  });
});

describe("applyOnboarding", () => {
  const run = (w: ReturnType<typeof world>, maxWrites?: number) =>
    applyOnboarding({
      db,
      repoId: 1,
      writer: w.writer,
      projects: w.projects,
      fullName: REPO,
      maxWrites,
    });

  it("creates the Project, imports every task, and remembers the Project", async () => {
    const w = world();
    const result = await run(w);
    expect(result).toMatchObject({ ok: true, complete: true, remaining: 0 });
    expect(w.issues.map((i) => [i.title, i.state])).toEqual([
      ["Build the graph", "closed"],
      ["Add the picker", "open"],
      ["Add the star", "open"],
    ]);
    expect(await getProjectLink(db, 1)).toEqual({ number: 4, nodeId: "PVT_1" });
  });

  it("does not remember the Project until everything is in, then finishes on the next call", async () => {
    const w = world();
    const first = await run(w, 6);
    expect(first).toMatchObject({ ok: true, complete: false });
    expect(first.ok && "remaining" in first && first.remaining).toBeGreaterThan(0);
    expect(await getProjectLink(db, 1)).toBeNull();

    const second = await run(w);
    expect(second).toMatchObject({ ok: true, complete: true, remaining: 0 });
    expect(await getProjectLink(db, 1)).toEqual({ number: 4, nodeId: "PVT_1" });
    expect(w.issues).toHaveLength(3);
  });

  it("is safe to run again once done", async () => {
    const w = world();
    await run(w);
    const before = w.log.length;
    const again = await run(w);
    expect(w.log.length).toBe(before);
    expect(again).toMatchObject({ ok: true, complete: true, written: 0 });
  });

  it("changes nothing in the database when the repo has no task list", async () => {
    const w = world({});
    expect(await run(w)).toMatchObject({ ok: false, error: "no_tasks_file" });
    expect(await getProjectLink(db, 1)).toBeNull();
    const [row] = await db.select().from(projectsTable).where(eq(projectsTable.repoId, 1));
    expect(row.githubProjectId).toBeNull();
  });

  it("caps one call's writes at a size that fits a request", () => {
    expect(WRITES_PER_CALL).toBe(40);
  });
});
