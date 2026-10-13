import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "./index";

afterEach(() => vi.unstubAllEnvs());

describe("example data modes", () => {
  it("fixture-empty is an account with no repos and nothing to report", async () => {
    vi.stubEnv("DATA_SOURCE", "fixture-empty");
    const data = await getDataSource().getDashboard();
    expect(data.projects).toEqual([]);
    expect(data.streak).toBeNull();
    expect(data.weeklyReview).toBeNull();
    expect(data.sinceLastVisit).toBeNull();
    expect(data.alerts).toEqual([]);
  });

  it("fixture-first-run has projects but no focus project", async () => {
    vi.stubEnv("DATA_SOURCE", "fixture-first-run");
    const data = await getDataSource().getDashboard();
    expect(data.projects.length).toBeGreaterThan(0);
    expect(data.projects.some((p) => p.status === "focus")).toBe(false);
  });

  it("rejects an unknown mode and names the valid ones", () => {
    vi.stubEnv("DATA_SOURCE", "nope");
    expect(() => getDataSource()).toThrow(/fixture-empty/);
  });
});
