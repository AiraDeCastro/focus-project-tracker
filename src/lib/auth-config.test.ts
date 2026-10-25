import { describe, expect, it } from "vitest";
import { DEFAULT_GITHUB_SCOPE, githubCredentials, githubScope } from "./auth-config";

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

describe("githubScope", () => {
  it("asks for your identity, your repos and your Projects by default", () => {
    expect(DEFAULT_GITHUB_SCOPE).toBe("read:user repo project");
    expect(githubScope({})).toBe("read:user repo project");
    expect(githubScope({ GITHUB_SCOPE: "" })).toBe("read:user repo project");
    expect(githubScope({ GITHUB_SCOPE: "   " })).toBe("read:user repo project");
  });

  it("lets GITHUB_SCOPE replace the whole list, tidying the spaces", () => {
    expect(githubScope({ GITHUB_SCOPE: "read:user  public_repo " })).toBe("read:user public_repo");
  });
});
