import { describe, expect, it, vi } from "vitest";
import { createGithubApi } from "./api";
import { TtlCache } from "./cache";
import { formatDue, orderMilestones } from "./mapping";

describe("TtlCache", () => {
  it("reuses a value until it expires", async () => {
    let now = 0;
    const cache = new TtlCache(1000, () => now);
    const load = vi.fn(async () => "value");
    await cache.get("k", load);
    now = 999;
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(1);
    now = 1001;
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps separate keys apart", async () => {
    const cache = new TtlCache(1000);
    expect(await cache.get("a", async () => 1)).toBe(1);
    expect(await cache.get("b", async () => 2)).toBe(2);
  });
});

describe("formatDue", () => {
  it("formats in UTC", () => {
    expect(formatDue("2026-10-22T00:00:00Z")).toBe("Oct 22");
    expect(formatDue("2026-01-01T23:59:59Z")).toBe("Jan 1");
  });
  it("handles no due date", () => {
    expect(formatDue(null)).toBe("No due date");
  });
});

describe("orderMilestones", () => {
  const ms = (
    number: number,
    title: string,
    dueOn: string | null,
    open: number,
    closed: number,
  ) => ({
    number,
    title,
    dueOn,
    openIssues: open,
    closedIssues: closed,
  });

  it("orders by due date with undated milestones last", () => {
    const result = orderMilestones(
      [
        ms(3, "Later", "2026-12-01T00:00:00Z", 4, 0),
        ms(1, "Undated", null, 1, 1),
        ms(2, "Soon", "2026-10-01T00:00:00Z", 0, 6),
      ],
      { open: 0, closed: 0 },
    );
    expect(result.map((m) => m.name)).toEqual(["Soon", "Later", "Undated"]);
    expect(result[0]).toEqual({
      number: 2,
      name: "Soon",
      closed: 6,
      total: 6,
      due: "Oct 1",
      dueDate: "2026-10-01",
    });
  });

  it("uses one implicit milestone when a repo has none", () => {
    expect(orderMilestones([], { open: 3, closed: 7 })).toEqual([
      { number: 0, name: "All issues", closed: 7, total: 10, due: "No due date" },
    ]);
  });

  it("returns nothing for a repo with no milestones and no issues", () => {
    expect(orderMilestones([], { open: 0, closed: 0 })).toEqual([]);
  });

  it("ignores issue counts when milestones exist", () => {
    const result = orderMilestones([ms(1, "MVP", null, 2, 2)], { open: 99, closed: 99 });
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(4);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("createGithubApi", () => {
  it("lists repos with the fields the app needs and sends the token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse([
        {
          id: 11,
          full_name: "me/recipe-box",
          name: "recipe-box",
          html_url: "https://github.com/me/recipe-box",
          fork: false,
          archived: false,
          pushed_at: "2026-10-07T10:00:00Z",
        },
        {
          id: 12,
          full_name: "me/forked",
          name: "forked",
          html_url: "https://github.com/me/forked",
          fork: true,
          archived: true,
          pushed_at: null,
        },
      ]),
    );
    const api = createGithubApi("secret-token", { fetch: fetchMock as unknown as typeof fetch });
    const repos = await api.listRepos();

    expect(repos).toEqual([
      {
        repoId: 11,
        fullName: "me/recipe-box",
        name: "recipe-box",
        htmlUrl: "https://github.com/me/recipe-box",
        isFork: false,
        isArchived: false,
        pushedAt: "2026-10-07T10:00:00Z",
      },
      {
        repoId: 12,
        fullName: "me/forked",
        name: "forked",
        htmlUrl: "https://github.com/me/forked",
        isFork: true,
        isArchived: true,
        pushedAt: null,
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/user/repos");
    expect(String(url)).toContain("affiliation=owner");
    expect(new Headers(init?.headers).get("authorization")).toBe("token secret-token");
  });

  it("caches repeated calls", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    const api = createGithubApi("t", { fetch: fetchMock as unknown as typeof fetch });
    await api.listRepos();
    await api.listRepos();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps milestones", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        {
          number: 2,
          title: "MVP",
          due_on: "2026-09-10T07:00:00Z",
          open_issues: 0,
          closed_issues: 14,
        },
      ]),
    );
    const api = createGithubApi("t", { fetch: fetchMock as unknown as typeof fetch });
    expect(await api.listMilestones("me/recipe-box")).toEqual([
      { number: 2, title: "MVP", dueOn: "2026-09-10T07:00:00Z", openIssues: 0, closedIssues: 14 },
    ]);
  });

  it("counts issues without pull requests", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        { state: "open" },
        { state: "closed" },
        { state: "closed" },
        { state: "open", pull_request: {} },
        { state: "closed", pull_request: {} },
      ]),
    );
    const api = createGithubApi("t", { fetch: fetchMock as unknown as typeof fetch });
    expect(await api.countIssues("me/recipe-box")).toEqual({ open: 1, closed: 2 });
  });

  it("finds the latest closed issue and skips pull requests", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        { closed_at: "2026-10-01T00:00:00Z" },
        { closed_at: "2026-10-07T12:00:00Z" },
        { closed_at: "2026-10-09T00:00:00Z", pull_request: {} },
      ]),
    );
    const api = createGithubApi("t", { fetch: fetchMock as unknown as typeof fetch });
    expect(await api.lastClosedAt("me/recipe-box")).toBe("2026-10-07T12:00:00Z");
  });

  it("returns null when nothing was closed", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    const api = createGithubApi("t", { fetch: fetchMock as unknown as typeof fetch });
    expect(await api.lastClosedAt("me/new-repo")).toBeNull();
  });

  it("lists open issues for a milestone and skips pull requests", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse([
        { number: 1, title: "A", html_url: "u1" },
        { number: 2, title: "A PR", html_url: "u2", pull_request: {} },
        { number: 3, title: "B", html_url: "u3" },
        { number: 4, title: "C", html_url: "u4" },
      ]),
    );
    const api = createGithubApi("t", { fetch: fetchMock as unknown as typeof fetch });
    const issues = await api.openIssues("me/recipe-box", 7, 2);
    expect(issues).toEqual([
      { number: 1, title: "A", htmlUrl: "u1" },
      { number: 3, title: "B", htmlUrl: "u3" },
    ]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("milestone=7");
    expect(url).toContain("state=open");
  });

  it("asks for issues without a milestone when none is given", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse([]));
    const api = createGithubApi("t", { fetch: fetchMock as unknown as typeof fetch });
    await api.openIssues("me/recipe-box", undefined, 3);
    expect(String(fetchMock.mock.calls[0][0])).toContain("milestone=none");
  });

  it("lists closing times since a date, dropping pull requests and older closes", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse([
        { closed_at: "2026-10-05T09:00:00Z" },
        { closed_at: "2026-09-20T09:00:00Z" }, // updated recently but closed earlier
        { closed_at: "2026-10-06T09:00:00Z", pull_request: {} },
      ]),
    );
    const api = createGithubApi("t", { fetch: fetchMock as unknown as typeof fetch });
    expect(await api.closedSince("me/recipe-box", "2026-10-01T00:00:00Z")).toEqual([
      "2026-10-05T09:00:00Z",
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("since=2026-10-01");
  });

  it("lists every issue with its milestone and dates, dropping pull requests", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse([
        {
          number: 1,
          milestone: { number: 7 },
          created_at: "2026-09-01T10:00:00Z",
          closed_at: "2026-09-03T10:00:00Z",
        },
        { number: 2, milestone: null, created_at: "2026-09-02T10:00:00Z", closed_at: null },
        { number: 3, created_at: "2026-09-02T11:00:00Z", closed_at: null, pull_request: {} },
      ]),
    );
    const api = createGithubApi("t", { fetch: fetchMock as unknown as typeof fetch });
    expect(await api.listIssues("me/recipe-box")).toEqual([
      {
        number: 1,
        milestone: 7,
        createdAt: "2026-09-01T10:00:00Z",
        closedAt: "2026-09-03T10:00:00Z",
      },
      { number: 2, milestone: null, createdAt: "2026-09-02T10:00:00Z", closedAt: null },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("state=all");
  });

  it("rejects a repo name without an owner", async () => {
    const api = createGithubApi("t", { fetch: vi.fn() as unknown as typeof fetch });
    await expect(api.listMilestones("nope")).rejects.toThrow(/owner\/name/);
  });
});
