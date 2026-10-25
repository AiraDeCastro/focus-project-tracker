import { describe, expect, it } from "vitest";
import type { ProjectRef, ProjectsApi, StatusField } from "./github/projects";
import { checkStatus, ensureProject } from "./project-ensure";

const DEFAULT_STATUS: StatusField = {
  fieldId: "F_1",
  options: [
    { id: "a", name: "Todo" },
    { id: "b", name: "In Progress" },
    { id: "c", name: "Done" },
  ],
};

/** An in-memory GitHub that keeps the Projects it was asked to make. */
function fake(initial: ProjectRef[] = [], status: StatusField | null = DEFAULT_STATUS) {
  const projects: ProjectRef[] = [...initial];
  const log: string[] = [];
  const api = {
    findProject: async (fullName: string) => {
      const name = fullName.split("/")[1].toLowerCase();
      return projects.find((p) => p.title.toLowerCase() === name) ?? null;
    },
    viewer: async () => ({ id: "U_1", login: "me" }),
    repositoryId: async () => "R_1",
    createProject: async (input: { ownerId: string; repositoryId: string; title: string }) => {
      log.push(`create:${input.ownerId}:${input.repositoryId}:${input.title}`);
      const made: ProjectRef = {
        id: `PVT_${projects.length + 1}`,
        number: projects.length + 1,
        title: input.title,
        url: "",
        linked: true,
      };
      projects.push(made);
      return made;
    },
    linkProject: async (projectId: string, repositoryId: string) => {
      log.push(`link:${projectId}:${repositoryId}`);
      const found = projects.find((p) => p.id === projectId);
      if (found) found.linked = true;
    },
    statusField: async () => status,
  } as unknown as ProjectsApi;
  return { api, projects, log };
}

const owned = (over: Partial<ProjectRef> = {}): ProjectRef => ({
  id: "PVT_9",
  number: 9,
  title: "my-repo",
  url: "https://github.com/users/me/projects/9",
  linked: true,
  ...over,
});

describe("ensureProject", () => {
  it("creates a Project named after the repo, owned by the user and linked to the repo", async () => {
    const { api, log } = fake();
    const result = await ensureProject({ projects: api, fullName: "me/my-repo", apply: true });
    expect(result).toMatchObject({
      action: "created",
      project: { title: "my-repo", linked: true },
      status: { ok: true },
    });
    expect(log).toEqual(["create:U_1:R_1:my-repo"]);
  });

  it("uses the Project that is already linked, and creates nothing", async () => {
    const { api, log } = fake([owned()]);
    const result = await ensureProject({ projects: api, fullName: "me/my-repo", apply: true });
    expect(result).toMatchObject({ action: "found", linked: true, status: { ok: true } });
    expect(log).toEqual([]);
  });

  it("links a Project it found only by title, which only adds a link", async () => {
    const { api, log, projects } = fake([owned({ linked: false })]);
    const result = await ensureProject({ projects: api, fullName: "me/my-repo", apply: true });
    expect(result).toMatchObject({ action: "found", linked: true });
    expect(log).toEqual(["link:PVT_9:R_1"]);
    expect(projects[0].linked).toBe(true);
  });

  it("never makes two Projects, however many times it runs", async () => {
    const { api, projects } = fake();
    await ensureProject({ projects: api, fullName: "me/my-repo", apply: true });
    await ensureProject({ projects: api, fullName: "me/my-repo", apply: true });
    await ensureProject({ projects: api, fullName: "me/my-repo", apply: true });
    expect(projects).toHaveLength(1);
  });

  it("writes nothing in a dry run, and says what it would do", async () => {
    const empty = fake();
    expect(await ensureProject({ projects: empty.api, fullName: "me/my-repo" })).toEqual({
      action: "would_create",
      title: "my-repo",
    });
    expect(empty.log).toEqual([]);

    const unlinked = fake([owned({ linked: false })]);
    const result = await ensureProject({ projects: unlinked.api, fullName: "me/my-repo" });
    expect(result).toMatchObject({ action: "found", linked: false });
    expect(unlinked.log).toEqual([]);
  });

  it("tells the caller which Status options are missing instead of editing the board", async () => {
    const { api, log } = fake([owned()], {
      fieldId: "F",
      options: [{ id: "a", name: "Backlog" }],
    });
    const result = await ensureProject({ projects: api, fullName: "me/my-repo", apply: true });
    expect(result).toMatchObject({
      action: "found",
      status: { ok: false, missing: ["Todo", "Done"] },
    });
    expect(log).toEqual([]);
  });

  it("refuses a name that is not owner/name", async () => {
    const { api } = fake();
    await expect(ensureProject({ projects: api, fullName: "nope" })).rejects.toThrow(/owner\/name/);
  });
});

describe("checkStatus", () => {
  it("accepts GitHub's default options, ignoring capital letters", async () => {
    expect(await checkStatus(fake().api, "PVT_1")).toEqual({ ok: true });
  });

  it("does not require In progress", async () => {
    const field: StatusField = {
      fieldId: "F",
      options: [
        { id: "a", name: "todo" },
        { id: "c", name: "DONE" },
      ],
    };
    expect(await checkStatus(fake([], field).api, "PVT_1")).toEqual({ ok: true });
  });

  it("reports a Project with no Status field", async () => {
    expect(await checkStatus(fake([], null).api, "PVT_1")).toEqual({
      ok: false,
      missing: ["a Status field"],
    });
  });
});
