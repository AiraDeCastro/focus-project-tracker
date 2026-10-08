import { describe, expect, it } from "vitest";
import { githubCredentials } from "./auth-config";

describe("githubCredentials", () => {
  it("reads the documented names", () => {
    expect(githubCredentials({ GITHUB_CLIENT_ID: "abc", GITHUB_CLIENT_SECRET: "shh" })).toEqual({
      clientId: "abc",
      clientSecret: "shh",
    });
  });

  it("also accepts the Auth.js names", () => {
    expect(githubCredentials({ AUTH_GITHUB_ID: "abc", AUTH_GITHUB_SECRET: "shh" })).toEqual({
      clientId: "abc",
      clientSecret: "shh",
    });
  });

  it("prefers the documented names when both are set", () => {
    expect(githubCredentials({ GITHUB_CLIENT_ID: "doc", AUTH_GITHUB_ID: "authjs" }).clientId).toBe(
      "doc",
    );
  });

  it("trims stray spaces and newlines from pasted values", () => {
    expect(
      githubCredentials({ GITHUB_CLIENT_ID: "  abc\n", GITHUB_CLIENT_SECRET: "shh " }),
    ).toEqual({ clientId: "abc", clientSecret: "shh" });
  });

  it("leaves missing values out instead of returning the text undefined", () => {
    expect(githubCredentials({})).toEqual({});
    expect(githubCredentials({ GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "   " })).toEqual({});
  });
});
