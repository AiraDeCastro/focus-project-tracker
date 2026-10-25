import { describe, expect, it, vi } from "vitest";
import { SignInRequiredError } from "../data/github";
import { startSyncWorkflow, SYNC_WORKFLOW_FILE } from "./dispatch";
import { translateGithubError } from "./errors";

const TOKEN = "ghp_secret-token-value";

function fakeFetch(status: number, headers: Record<string, string> = {}) {
  return vi.fn<typeof fetch>(async () => new Response(null, { status, headers }));
}

describe("startSyncWorkflow", () => {
  it("asks GitHub to run the workflow on the branch, with the token only in the header", async () => {
    const mock = fakeFetch(204);
    await startSyncWorkflow(TOKEN, "me/repo", { fetch: mock as unknown as typeof fetch });
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe(
      `https://api.github.com/repos/me/repo/actions/workflows/${SYNC_WORKFLOW_FILE}/dispatches`,
    );
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ ref: "main" });
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(String(url)).not.toContain(TOKEN);
  });

  it("accepts another workflow file and branch", async () => {
    const mock = fakeFetch(204);
    await startSyncWorkflow(TOKEN, "me/repo", {
      workflow: "sync.yaml",
      ref: "release/1.0",
      fetch: mock as unknown as typeof fetch,
    });
    expect(String(mock.mock.calls[0][0])).toContain("/workflows/sync.yaml/dispatches");
    expect(JSON.parse(String((mock.mock.calls[0][1] as RequestInit).body))).toEqual({
      ref: "release/1.0",
    });
  });

  it("says the workflow is missing on a 404", async () => {
    const mock = fakeFetch(404);
    await expect(
      startSyncWorkflow(TOKEN, "me/repo", { fetch: mock as unknown as typeof fetch }),
    ).rejects.toThrow(/was not found in me\/repo/);
  });

  it("lets translateGithubError handle a rejected login and a rate limit", async () => {
    const rejected = await startSyncWorkflow(TOKEN, "me/repo", {
      fetch: fakeFetch(401) as unknown as typeof fetch,
    }).catch((e: unknown) => e);
    expect(translateGithubError(rejected)).toBeInstanceOf(SignInRequiredError);

    const limited = await startSyncWorkflow(TOKEN, "me/repo", {
      fetch: fakeFetch(429, { "retry-after": "60" }) as unknown as typeof fetch,
    }).catch((e: unknown) => e);
    expect((translateGithubError(limited) as Error).name).toBe("GithubRateLimitError");
  });

  it("refuses odd names before asking GitHub", async () => {
    const mock = fakeFetch(204);
    const f = mock as unknown as typeof fetch;
    await expect(startSyncWorkflow(TOKEN, "not a repo", { fetch: f })).rejects.toThrow(
      /owner\/name/,
    );
    await expect(
      startSyncWorkflow(TOKEN, "me/repo", { workflow: "../x.yml", fetch: f }),
    ).rejects.toThrow(/workflow file/);
    await expect(startSyncWorkflow(TOKEN, "me/repo", { ref: "a..b", fetch: f })).rejects.toThrow(
      /branch/,
    );
    expect(mock).not.toHaveBeenCalled();
  });
});
