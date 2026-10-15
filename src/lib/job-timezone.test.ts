import { afterEach, describe, expect, it, vi } from "vitest";
import { jobTimeZone } from "./job-timezone";

afterEach(() => vi.unstubAllEnvs());

describe("jobTimeZone", () => {
  it("uses APP_TIMEZONE when it is a real timezone", () => {
    vi.stubEnv("APP_TIMEZONE", "America/Toronto");
    expect(jobTimeZone()).toBe("America/Toronto");
  });

  it("falls back to UTC when it is missing or wrong", () => {
    vi.stubEnv("APP_TIMEZONE", "");
    expect(jobTimeZone()).toBe("UTC");
    vi.stubEnv("APP_TIMEZONE", "Mars/Olympus");
    expect(jobTimeZone()).toBe("UTC");
  });
});
