import { describe, expect, it, vi } from "vitest";
import { createRepoPrApi } from "./repo-pr";

const TOKEN = "ghp_secret_token_value";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createRepoPrApi", () => {
  it("reads the default branch and its commit", async () => {
    const f = vi.fn(async (url: string) =>
      String(url).endsWith("/git/ref/heads/main")
        ? json({ object: { sha: "c".repeat(40) } })
        : json({ default_branch: "main" }),
    );
    const api = createRepoPrApi(TOKEN, { fetch: f as unknown as typeof fetch });
    expect(await api.defaultBranch("me/repo")).toEqual({ name: "main", sha: "c".repeat(40) });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it("writes a file as base64 on a branch and sends the sha when updating", async () => {
    const f = vi.fn(async () => json({}));
    const api = createRepoPrApi(TOKEN, { fetch: f as unknown as typeof fetch });
    await api.writeFile("me/repo", {
      path: "docs/CLAUDE.md",
      branch: "chore/x",
      text: "hi",
      message: "m",
      sha: "s1",
    });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/me/repo/contents/docs/CLAUDE.md");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      message: "m",
      content: Buffer.from("hi").toString("base64"),
      branch: "chore/x",
      sha: "s1",
    });
  });

  it("reads a missing file as null and a present one as text and sha", async () => {
    let status = 404;
    const f = vi.fn(async () =>
      status === 404
        ? json({}, 404)
        : json({ sha: "s2", content: Buffer.from("hello").toString("base64") }),
    );
    const api = createRepoPrApi(TOKEN, { fetch: f as unknown as typeof fetch });
    expect(await api.readFile("me/repo", "CLAUDE.md", "main")).toBeNull();
    status = 200;
    expect(await api.readFile("me/repo", "CLAUDE.md", "main")).toEqual({
      text: "hello",
      sha: "s2",
    });
  });

  it("never puts the token in an error and rejects odd names", async () => {
    const f = vi.fn(async () => json({}, 403));
    const api = createRepoPrApi(TOKEN, { fetch: f as unknown as typeof fetch });
    const error = await api
      .createBranch("me/repo", "chore/x", "d".repeat(40))
      .catch((e: Error) => e);
    expect(String((error as Error).message)).not.toContain(TOKEN);
    expect(String((error as Error).message)).toContain("403");
    await expect(api.branchExists("not a repo", "x")).rejects.toThrow();
    await expect(api.branchExists("me/repo", "a..b")).rejects.toThrow();
    await expect(api.readFile("me/repo", "../x", "main")).rejects.toThrow();
  });

  it("finds an open pull request from a branch", async () => {
    const f = vi.fn(async () => json([{ html_url: "https://github.com/me/repo/pull/3" }]));
    const api = createRepoPrApi(TOKEN, { fetch: f as unknown as typeof fetch });
    expect(await api.openPullRequest("me/repo", "chore/x")).toBe(
      "https://github.com/me/repo/pull/3",
    );
  });
});
