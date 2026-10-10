import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const request = (authorization?: string) =>
  new Request("https://example.test/api/cron/daily-email", {
    headers: authorization ? { authorization } : {},
  });

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/daily-email", () => {
  it("refuses a request without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer nope"))).status).toBe(401);
  });

  it("refuses everyone when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
  });

  it("names the settings that are missing, and nothing else", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("GITHUB_CRON_TOKEN", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const response = await GET(request("Bearer s3cret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Not set: GITHUB_CRON_TOKEN, RESEND_API_KEY" });
  });
});
