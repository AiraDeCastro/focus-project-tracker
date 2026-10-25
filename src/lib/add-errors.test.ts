import { describe, expect, it } from "vitest";
import { explainAddError } from "./add-errors";
import { GithubGraphqlError, ProjectScopeError } from "./github/projects";
import { StatusFieldError } from "./importer";

const NOW = new Date("2026-10-25T12:00:00Z");

describe("explainAddError", () => {
  it("asks for a new sign-in when GitHub rejects the token", () => {
    expect(explainAddError(new GithubGraphqlError("x", 401), NOW)).toMatch(/Sign in again/);
  });

  it("explains a rate limit with the wait", () => {
    const error = new GithubGraphqlError("x", 429, { "retry-after": "120" });
    expect(explainAddError(error, NOW)).toMatch(/about 2 minutes/);
  });

  it("says when the Projects permission is missing", () => {
    expect(explainAddError(new ProjectScopeError(true), NOW)).toMatch(
      /permission to change your Projects/,
    );
    expect(explainAddError(new ProjectScopeError(false), NOW)).toMatch(
      /permission to read your Projects/,
    );
  });

  it("passes a Status field problem through", () => {
    expect(explainAddError(new StatusFieldError('no "Done" option'), NOW)).toBe('no "Done" option');
  });

  it("gives other GitHub refusals a calm sentence and never the raw message", () => {
    const text = explainAddError(new GithubGraphqlError("secret detail ghp_abc", 422), NOW);
    expect(text).toBe("GitHub did not accept that. Nothing was changed.");
    expect(text).not.toContain("ghp_");
  });

  it("returns null for errors it does not know", () => {
    expect(explainAddError(new Error("boom"), NOW)).toBeNull();
    expect(explainAddError("nope", NOW)).toBeNull();
  });
});
