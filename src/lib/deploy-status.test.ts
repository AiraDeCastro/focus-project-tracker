import { describe, expect, it } from "vitest";
import {
  deployStatusFor,
  describeDeployCheck,
  describeDeployStatus,
  hostOf,
  safeVercelMessage,
  stateFromVercel,
  type VercelProject,
} from "./deploy-status";

const project = (extra: Partial<VercelProject> = {}): VercelProject => ({
  name: "site",
  domains: ["site.vercel.app", "example.com"],
  state: "ready",
  at: "2026-10-12T10:00:00.000Z",
  ...extra,
});

describe("hostOf", () => {
  it("reads the hostname, lower case, without www", () => {
    expect(hostOf("https://WWW.Example.com/path?x=1")).toBe("example.com");
    expect(hostOf("http://site.vercel.app")).toBe("site.vercel.app");
  });

  it("is null for empty, broken and non-web addresses", () => {
    expect(hostOf(null)).toBeNull();
    expect(hostOf("")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
    expect(hostOf("javascript:alert(1)")).toBeNull();
    expect(hostOf("ftp://example.com")).toBeNull();
  });
});

describe("stateFromVercel", () => {
  it("maps Vercel's states", () => {
    expect(stateFromVercel("READY")).toBe("ready");
    expect(stateFromVercel("ready")).toBe("ready");
    expect(stateFromVercel("ERROR")).toBe("failed");
    expect(stateFromVercel("BUILDING")).toBe("building");
    expect(stateFromVercel("INITIALIZING")).toBe("building");
    expect(stateFromVercel("QUEUED")).toBe("queued");
    expect(stateFromVercel("CANCELED")).toBe("canceled");
  });

  it("is null for anything it does not know", () => {
    expect(stateFromVercel("DELETED")).toBeNull();
    expect(stateFromVercel(undefined)).toBeNull();
    expect(stateFromVercel(42)).toBeNull();
  });
});

describe("deployStatusFor", () => {
  it("matches the repo homepage to a production hostname", () => {
    expect(deployStatusFor(["https://www.example.com/"], [project()])).toEqual({
      state: "ready",
      at: "2026-10-12T10:00:00.000Z",
    });
  });

  it("falls back to the live address when the homepage matches nothing", () => {
    const status = deployStatusFor(
      ["https://other.dev", "https://site.vercel.app"],
      [project({ state: "failed" })],
    );
    expect(status?.state).toBe("failed");
  });

  it("gives no status without an address, or with no matching project", () => {
    expect(deployStatusFor([null, undefined], [project()])).toBeNull();
    expect(deployStatusFor(["https://nothing.dev"], [project()])).toBeNull();
    expect(deployStatusFor(["https://example.com"], [])).toBeNull();
  });

  it("does not match a different site on the same parent domain", () => {
    expect(deployStatusFor(["https://evil-example.com"], [project()])).toBeNull();
    expect(deployStatusFor(["https://a.example.com"], [project()])).toBeNull();
  });
});

describe("describeDeployStatus", () => {
  it("words each state", () => {
    expect(describeDeployStatus({ state: "ready", at: null })).toEqual({
      label: "Live on Vercel",
      tone: "good",
    });
    expect(describeDeployStatus({ state: "failed", at: null }).tone).toBe("bad");
    expect(describeDeployStatus({ state: "building", at: null }).label).toBe("Deploying...");
    expect(describeDeployStatus({ state: "queued", at: null }).tone).toBe("quiet");
    expect(describeDeployStatus({ state: "canceled", at: null }).tone).toBe("quiet");
  });
});

describe("describeDeployCheck", () => {
  const base = { status: "ok" as const, projects: 3, skipped: 0, matched: 1, sample: [] };

  it("says what was read and matched", () => {
    expect(describeDeployCheck(base)).toBe("Vercel: read 3 projects, 1 repo matched a homepage.");
    expect(describeDeployCheck({ ...base, projects: 1, skipped: 2 })).toBe(
      "Vercel: read 1 project (could not read 2 more), 1 repo matched a homepage.",
    );
  });

  it("shows Vercel's addresses only when nothing matched", () => {
    const none = { ...base, matched: 0, sample: ["site: site.vercel.app", "blog: blog.dev"] };
    expect(describeDeployCheck(none)).toContain("site: site.vercel.app; blog: blog.dev");
    expect(describeDeployCheck({ ...none, matched: 2 })).not.toContain("site.vercel.app");
  });

  it("says why Vercel could not be read", () => {
    expect(
      describeDeployCheck({ ...base, status: "failed", message: "Vercel answered 401." }),
    ).toBe("Vercel: Vercel answered 401.");
  });
});

describe("safeVercelMessage", () => {
  it("passes our status message and hides anything else", () => {
    expect(safeVercelMessage(new Error("Vercel answered 403."))).toBe("Vercel answered 403.");
    expect(safeVercelMessage(new Error("fetch failed: Bearer abc"))).toBe(
      "Could not reach Vercel.",
    );
    expect(safeVercelMessage("nope")).toBe("Could not reach Vercel.");
  });
});
