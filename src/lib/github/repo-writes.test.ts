import { describe, expect, it, vi } from "vitest";
import { SignInRequiredError } from "../data/github";
import { translateGithubError } from "./errors";
import { createRepoWriter, issueBody, readIssue, readMilestone } from "./repo-writes";

const TOKEN = "ghp_secret-token-value";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function fake(...replies: Response[]) {
  const queue = [...replies];
  const mock = vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("No reply queued");
    return next;
  });
  const writer = createRepoWriter(TOKEN, { fetch: mock as unknown as typeof fetch });
  const call = (n: number) => {
    const [url, init] = mock.mock.calls[n];
    return { url: String(url), init: init as RequestInit };
  };
  return { writer, mock, call };
}

const issueNode = (n: number, over: Record<string, unknown> = {}) => ({
  number: n,
  node_id: `I_${n}`,
  title: `Task ${n}`,
  state: "open",
  body: `text\n<!-- tasks-md-key:abc123def456 -->\n`,
  milestone: { number: 4 },
  ...over,
});

describe("readIssue and readMilestone", () => {
  it("read the hidden key, the milestone and the state", () => {
    expect(readIssue(issueNode(7, { state: "closed" }))).toEqual({
      number: 7,
      nodeId: "I_7",
      title: "Task 7",
      state: "closed",
      milestone: 4,
      key: "abc123def456",
    });
    expect(readIssue(issueNode(8, { body: null, milestone: null }))).toMatchObject({
      key: null,
      milestone: null,
    });
  });

  it("skip pull requests and anything unreadable", () => {
    expect(readIssue(issueNode(9, { pull_request: {} }))).toBeNull();
    expect(readIssue({ number: 1 })).toBeNull();
    expect(readMilestone({ number: 2, title: "M", state: "closed" })).toEqual({
      number: 2,
      title: "M",
      state: "closed",
    });
    expect(readMilestone({ title: "no number" })).toBeNull();
  });
});

describe("issueBody", () => {
  it("ends with the same hidden key the sync script uses", () => {
    expect(issueBody("Short", "Short", "Milestone 1", "abc123def456")).toBe(
      "From `TASKS.md` · Milestone 1\n<!-- tasks-md-key:abc123def456 -->\n",
    );
  });

  it("keeps the full text when the title was shortened, and names the loose section", () => {
    const body = issueBody("A long text", "A long…", null, "abc123def456");
    expect(body.startsWith("A long text\n\n---\n")).toBe(true);
    expect(body).toContain("Discovered during work");
  });
});

describe("createRepoWriter", () => {
  it("sends the token only in the Authorization header", async () => {
    const { writer, call } = fake(reply([{ number: 1, title: "M1", state: "open" }]));
    expect(await writer.listMilestones("me/repo")).toEqual([
      { number: 1, title: "M1", state: "open" },
    ]);
    const { url, init } = call(0);
    expect(url).toBe(
      "https://api.github.com/repos/me/repo/milestones?state=all&per_page=100&page=1",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(url).not.toContain(TOKEN);
  });

  it("reads every page of issues", async () => {
    const full = Array.from({ length: 100 }, (_, i) => issueNode(i + 1));
    const { writer, mock } = fake(reply(full), reply([issueNode(101)]));
    const issues = await writer.listIssues("me/repo");
    expect(issues).toHaveLength(101);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("creates a milestone, with the description cut to GitHub's limit", async () => {
    const { writer, call } = fake(reply({ number: 5, title: "M5", state: "open" }));
    const made = await writer.createMilestone("me/repo", {
      title: " M5 ",
      description: "d".repeat(2000),
    });
    expect(made.number).toBe(5);
    const body = JSON.parse(String(call(0).init.body)) as { title: string; description: string };
    expect(body.title).toBe("M5");
    expect(body.description).toHaveLength(900);
  });

  it("sends a due date at noon UTC, and none when there is none", async () => {
    const { writer, call } = fake(
      reply({ number: 6, title: "M6", state: "open" }),
      reply({ number: 7, title: "M7", state: "open" }),
    );
    await writer.createMilestone("me/repo", { title: "M6", description: "", dueOn: "2026-11-30" });
    await writer.createMilestone("me/repo", { title: "M7", description: "" });
    expect(JSON.parse(String(call(0).init.body))).toMatchObject({ due_on: "2026-11-30T12:00:00Z" });
    expect(JSON.parse(String(call(1).init.body))).not.toHaveProperty("due_on");
  });

  it("creates an issue, leaving the milestone out when there is none", async () => {
    const { writer, call } = fake(reply(issueNode(12)), reply(issueNode(13)));
    await writer.createIssue("me/repo", { title: "A", body: "b", milestone: 4 });
    await writer.createIssue("me/repo", { title: "B", body: "b", milestone: null });
    expect(JSON.parse(String(call(0).init.body))).toMatchObject({ milestone: 4 });
    expect(JSON.parse(String(call(1).init.body))).not.toHaveProperty("milestone");
  });

  it("closes an issue as completed, and never offers a way to reopen", async () => {
    const { writer, call } = fake(reply({}));
    await writer.closeIssue("me/repo", 12);
    expect(call(0).init.method).toBe("PATCH");
    expect(JSON.parse(String(call(0).init.body))).toEqual({
      state: "closed",
      state_reason: "completed",
    });
    expect(Object.keys(writer)).not.toContain("reopenIssue");
    expect(Object.keys(writer)).not.toContain("deleteIssue");
  });

  it("refuses bad input before asking GitHub", async () => {
    const { writer, mock } = fake();
    await expect(writer.listIssues("not a repo")).rejects.toThrow(/owner\/name/);
    await expect(
      writer.createIssue("me/repo", { title: "  ", body: "", milestone: null }),
    ).rejects.toThrow(/title/);
    await expect(
      writer.createMilestone("me/repo", { title: "x".repeat(251), description: "" }),
    ).rejects.toThrow(/title/);
    await expect(writer.closeIssue("me/repo", 0)).rejects.toThrow(/issue number/);
    expect(mock).not.toHaveBeenCalled();
  });

  it("lets translateGithubError turn a rejected login into a sign-in request", async () => {
    const { writer } = fake(reply({ message: "Bad credentials" }, 401));
    const failure = await writer.listMilestones("me/repo").catch((e: unknown) => e);
    expect(translateGithubError(failure)).toBeInstanceOf(SignInRequiredError);
  });
});
