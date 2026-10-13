import { describe, expect, it, vi } from "vitest";
import { createVercelApi, readProject } from "./vercel";

const NOW = Date.parse("2026-10-12T10:00:00Z");

describe("readProject", () => {
  it("reads the production target", () => {
    expect(
      readProject({
        name: "site",
        targets: {
          production: {
            readyState: "READY",
            createdAt: NOW,
            alias: ["site.vercel.app", "WWW.Example.com"],
          },
        },
      }),
    ).toEqual({
      name: "site",
      domains: ["site.vercel.app", "example.com"],
      state: "ready",
      at: "2026-10-12T10:00:00.000Z",
    });
  });

  it("falls back to the latest production deployment", () => {
    const project = readProject({
      name: "site",
      latestDeployments: [
        { target: "preview", readyState: "ERROR", alias: ["preview.vercel.app"] },
        {
          target: "production",
          readyState: "BUILDING",
          alias: ["site.vercel.app"],
          createdAt: NOW,
        },
      ],
    });
    expect(project?.state).toBe("building");
    expect(project?.domains).toEqual(["site.vercel.app"]);
  });

  it("skips projects with no production build or an unknown state", () => {
    expect(readProject({ name: "empty" })).toBeNull();
    expect(
      readProject({ name: "x", targets: { production: { readyState: "DELETED" } } }),
    ).toBeNull();
    expect(readProject(null)).toBeNull();
    expect(readProject({ targets: {} })).toBeNull();
  });
});

describe("createVercelApi", () => {
  const body = {
    projects: [
      { name: "site", targets: { production: { readyState: "READY", alias: ["a.dev"] } } },
      { name: "junk" },
    ],
  };

  it("sends the token only in the Authorization header and asks for the team when given", async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify(body)));
    const api = createVercelApi("secret-token", {
      fetch: fake as unknown as typeof fetch,
      teamId: "team_1",
    });
    const { projects, skipped } = await api.listProjects();
    expect(projects.map((p) => p.name)).toEqual(["site"]);
    expect(skipped).toBe(1); // the "junk" entry has no production build
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("teamId=team_1");
    expect(url).not.toContain("secret-token");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });

  it("reuses the answer for a few minutes", async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify(body)));
    const api = createVercelApi("t", { fetch: fake as unknown as typeof fetch });
    await api.listProjects();
    await api.listProjects();
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("fails with a message that never contains the token", async () => {
    const fake = vi.fn(async () => new Response("{}", { status: 403 }));
    const api = createVercelApi("secret-token", { fetch: fake as unknown as typeof fetch });
    await expect(api.listProjects()).rejects.toThrow("Vercel answered 403.");
    await expect(api.listProjects()).rejects.not.toThrow(/secret-token/);
  });
});
