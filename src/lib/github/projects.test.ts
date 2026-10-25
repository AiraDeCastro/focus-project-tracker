import { describe, expect, it, vi } from "vitest";
import { SignInRequiredError } from "../data/github";
import { GithubRateLimitError, translateGithubError } from "./errors";
import {
  GithubGraphqlError,
  ProjectScopeError,
  createProjectsApi,
  readItem,
  readProject,
} from "./projects";

const TOKEN = "ghp_secret-token-value";

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A fake GitHub that answers the queued replies in order and remembers what it was asked. */
function fake(...replies: Response[]) {
  const queue = [...replies];
  const mock = vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("No reply queued");
    return next;
  });
  const api = createProjectsApi(TOKEN, { fetch: mock as unknown as typeof fetch });
  const sent = (n: number) => {
    const init = mock.mock.calls[n][1] as RequestInit;
    return JSON.parse(String(init.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
  };
  return { api, mock, sent };
}

const projectNode = (over: Record<string, unknown> = {}) => ({
  id: "PVT_1",
  number: 3,
  title: "focus-project-tracker",
  url: "https://github.com/users/me/projects/3",
  closed: false,
  ...over,
});

const issueItem = (n: number, over: Record<string, unknown> = {}) => ({
  id: `PVTI_${n}`,
  content: {
    __typename: "Issue",
    id: `I_${n}`,
    number: n,
    title: `Task ${n}`,
    url: `https://github.com/me/r/issues/${n}`,
    state: "OPEN",
    milestone: { number: 1, title: "Milestone 1" },
  },
  status: { name: "Todo" },
  ...over,
});

describe("readProject and readItem", () => {
  it("read a well-formed Project and refuse one with no id, title or number", () => {
    expect(readProject(projectNode(), true)).toEqual({
      id: "PVT_1",
      number: 3,
      title: "focus-project-tracker",
      url: "https://github.com/users/me/projects/3",
      linked: true,
    });
    expect(readProject(projectNode({ id: "" }), true)).toBeNull();
    expect(readProject(projectNode({ number: "3" }), true)).toBeNull();
    expect(readProject("nope", true)).toBeNull();
  });

  it("read an issue item with its milestone and Status", () => {
    expect(readItem(issueItem(7))).toEqual({
      itemId: "PVTI_7",
      issueId: "I_7",
      number: 7,
      title: "Task 7",
      url: "https://github.com/me/r/issues/7",
      state: "open",
      milestone: { number: 1, title: "Milestone 1" },
      status: "Todo",
    });
  });

  it("allow a missing milestone and Status, and skip pull requests, drafts and redacted items", () => {
    const bare = readItem(issueItem(8, { status: null }));
    expect(bare?.status).toBeNull();
    const noMilestone = issueItem(9);
    (noMilestone.content as Record<string, unknown>).milestone = null;
    expect(readItem(noMilestone)?.milestone).toBeNull();
    expect(readItem({ id: "PVTI_x", content: { __typename: "PullRequest" } })).toBeNull();
    expect(readItem({ id: "PVTI_y", content: null })).toBeNull();
    expect(readItem({ id: "PVTI_z" })).toBeNull();
  });
});

describe("requests", () => {
  it("send the token only in the Authorization header, never in the body", async () => {
    const { api, mock, sent } = fake(reply({ data: { viewer: { id: "U_1", login: "me" } } }));
    expect(await api.viewer()).toEqual({ id: "U_1", login: "me" });
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/graphql");
    expect((init as RequestInit).method).toBe("POST");
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(JSON.stringify(sent(0))).not.toContain(TOKEN);
  });
});

describe("findProject", () => {
  it("prefers a Project linked to the repo, matched by title ignoring case", async () => {
    const { api, mock } = fake(
      reply({
        data: {
          repository: {
            projectsV2: {
              nodes: [
                projectNode({ id: "PVT_other", title: "something else" }),
                projectNode({ title: "Focus-Project-Tracker" }),
              ],
            },
          },
        },
      }),
    );
    const found = await api.findProject("me/focus-project-tracker");
    expect(found).toMatchObject({ id: "PVT_1", linked: true });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the owner's own Projects, unlinked, and skips closed ones", async () => {
    const { api, sent } = fake(
      reply({ data: { repository: { projectsV2: { nodes: [] } } } }),
      reply({
        data: {
          user: {
            projectsV2: {
              nodes: [
                projectNode({ id: "PVT_closed", closed: true }),
                projectNode({ id: "PVT_2" }),
              ],
            },
          },
        },
      }),
    );
    const found = await api.findProject("me/focus-project-tracker");
    expect(found).toMatchObject({ id: "PVT_2", linked: false });
    expect(sent(1).variables).toEqual({ login: "me" });
  });

  it("returns null when there is none, so the caller can create it", async () => {
    const { api } = fake(
      reply({ data: { repository: { projectsV2: { nodes: [] } } } }),
      reply({ data: { user: null } }),
    );
    expect(await api.findProject("me/new-repo")).toBeNull();
  });

  it("refuses a name that is not owner/name", async () => {
    const { api } = fake();
    await expect(api.findProject("justaname")).rejects.toThrow(/owner\/name/);
  });
});

describe("listItems", () => {
  it("reads every page and counts what it could not use", async () => {
    const page = (nodes: unknown[], hasNextPage: boolean, endCursor: string | null) =>
      reply({ data: { node: { items: { pageInfo: { hasNextPage, endCursor }, nodes } } } });
    const { api, sent } = fake(
      page([issueItem(1), { id: "PVTI_pr", content: { __typename: "PullRequest" } }], true, "c1"),
      page([issueItem(2, { status: { name: "Done" } })], false, null),
    );
    const result = await api.listItems("PVT_1");
    expect(result.items.map((i) => [i.number, i.status])).toEqual([
      [1, "Todo"],
      [2, "Done"],
    ]);
    expect(result.skipped).toBe(1);
    expect(sent(0).variables).toEqual({ id: "PVT_1", after: null });
    expect(sent(1).variables).toEqual({ id: "PVT_1", after: "c1" });
  });

  it("stops after a page limit instead of looping forever", async () => {
    const forever = () =>
      reply({
        data: { node: { items: { pageInfo: { hasNextPage: true, endCursor: "c" }, nodes: [] } } },
      });
    const { api, mock } = fake(...Array.from({ length: 30 }, forever));
    await api.listItems("PVT_1");
    expect(mock).toHaveBeenCalledTimes(20);
  });
});

describe("statusField", () => {
  it("returns the field and its options, ignoring malformed options", async () => {
    const { api } = fake(
      reply({
        data: {
          node: {
            field: {
              id: "F_1",
              options: [
                { id: "o1", name: "Todo" },
                { id: "o2", name: "In progress" },
                { id: "o3", name: "Done" },
                { id: "", name: "broken" },
              ],
            },
          },
        },
      }),
    );
    const field = await api.statusField("PVT_1");
    expect(field?.fieldId).toBe("F_1");
    expect(field?.options.map((o) => o.name)).toEqual(["Todo", "In progress", "Done"]);
  });

  it("returns null when the Project has no Status field", async () => {
    const { api } = fake(reply({ data: { node: { field: null } } }));
    expect(await api.statusField("PVT_1")).toBeNull();
  });
});

describe("writes", () => {
  it("create a Project linked to the repo, with a trimmed title", async () => {
    const { api, sent } = fake(
      reply({ data: { createProjectV2: { projectV2: projectNode({ title: "my-repo" }) } } }),
    );
    const created = await api.createProject({
      ownerId: "U_1",
      repositoryId: "R_1",
      title: "  my-repo  ",
    });
    expect(created).toMatchObject({ id: "PVT_1", linked: true });
    expect(sent(0).variables).toEqual({
      input: { ownerId: "U_1", repositoryId: "R_1", title: "my-repo" },
    });
  });

  it("refuse an empty or overlong title and missing ids before asking GitHub", async () => {
    const { api, mock } = fake();
    await expect(
      api.createProject({ ownerId: "U_1", repositoryId: "R_1", title: "   " }),
    ).rejects.toThrow(/title/);
    await expect(
      api.createProject({ ownerId: "U_1", repositoryId: "R_1", title: "x".repeat(257) }),
    ).rejects.toThrow(/title/);
    await expect(
      api.createProject({ ownerId: "", repositoryId: "R_1", title: "ok" }),
    ).rejects.toThrow(/owner id/);
    await expect(api.addIssue("", "I_1")).rejects.toThrow(/Project id/);
    await expect(
      api.setStatus({ projectId: "P", itemId: "I", fieldId: "F", optionId: "" }),
    ).rejects.toThrow(/option id/);
    expect(mock).not.toHaveBeenCalled();
  });

  it("link an existing Project to a repo", async () => {
    const { api, sent } = fake(
      reply({ data: { linkProjectV2ToRepository: { repository: { id: "R_1" } } } }),
    );
    await api.linkProject("PVT_1", "R_1");
    expect(sent(0).variables).toEqual({ input: { projectId: "PVT_1", repositoryId: "R_1" } });
    await expect(api.linkProject("", "R_1")).rejects.toThrow(/Project id/);
  });

  it("add an issue to a Project and return the item id", async () => {
    const { api, sent } = fake(
      reply({ data: { addProjectV2ItemById: { item: { id: "PVTI_9" } } } }),
    );
    expect(await api.addIssue("PVT_1", "I_9")).toBe("PVTI_9");
    expect(sent(0).variables).toEqual({ input: { projectId: "PVT_1", contentId: "I_9" } });
  });

  it("set an item's Status through a single-select option", async () => {
    const { api, sent } = fake(
      reply({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_9" } } } }),
    );
    await api.setStatus({ projectId: "PVT_1", itemId: "PVTI_9", fieldId: "F_1", optionId: "o3" });
    expect(sent(0).variables).toEqual({
      input: {
        projectId: "PVT_1",
        itemId: "PVTI_9",
        fieldId: "F_1",
        value: { singleSelectOptionId: "o3" },
      },
    });
  });
});

describe("errors", () => {
  it("turn a missing scope into ProjectScopeError, saying read or write", async () => {
    const scopeError = {
      errors: [
        {
          type: "INSUFFICIENT_SCOPES",
          message: "Your token has not been granted the required scopes",
        },
      ],
    };
    const read = fake(reply(scopeError));
    await expect(read.api.viewer()).rejects.toMatchObject({
      name: "ProjectScopeError",
      needsWrite: false,
    });
    const write = fake(reply(scopeError));
    const failure = await write.api.addIssue("PVT_1", "I_1").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProjectScopeError);
    expect((failure as ProjectScopeError).needsWrite).toBe(true);
  });

  it("let translateGithubError handle a rejected login and a rate limit", async () => {
    const rejected = await fake(reply({ message: "Bad credentials" }, 401))
      .api.viewer()
      .catch((e: unknown) => e);
    expect(translateGithubError(rejected)).toBeInstanceOf(SignInRequiredError);

    const limitedHttp = await fake(
      reply({}, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" }),
    )
      .api.viewer()
      .catch((e: unknown) => e);
    expect(translateGithubError(limitedHttp)).toBeInstanceOf(GithubRateLimitError);

    const limitedGraphql = await fake(
      reply({ errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }),
    )
      .api.viewer()
      .catch((e: unknown) => e);
    expect(translateGithubError(limitedGraphql)).toBeInstanceOf(GithubRateLimitError);
  });

  it("report other GraphQL errors with GitHub's message, and never include the token", async () => {
    const { api } = fake(
      reply({ errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }] }),
    );
    const failure = (await api.repositoryId("me/gone").catch((e: unknown) => e)) as Error;
    expect(failure).toBeInstanceOf(GithubGraphqlError);
    expect(failure.message).toContain("Could not resolve to a Repository");
    expect(failure.message).not.toContain(TOKEN);
  });

  it("cope with an unreadable answer", async () => {
    const { api } = fake(new Response("not json at all", { status: 200 }));
    await expect(api.viewer()).rejects.toThrow();
  });
});
