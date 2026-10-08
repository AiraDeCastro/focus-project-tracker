import { describe, expect, it } from "vitest";
import { isAllowedLogin } from "./allow-list";

describe("isAllowedLogin", () => {
  it("allows the configured login, ignoring case and spaces", () => {
    expect(isAllowedLogin("AiraDeCastro", "airadecastro")).toBe(true);
    expect(isAllowedLogin(" airadecastro ", "AiraDeCastro")).toBe(true);
  });

  it("rejects other logins", () => {
    expect(isAllowedLogin("someone-else", "AiraDeCastro")).toBe(false);
    expect(isAllowedLogin("AiraDeCastro2", "AiraDeCastro")).toBe(false);
  });

  it("fails closed when nothing is configured or no login is given", () => {
    expect(isAllowedLogin("AiraDeCastro", undefined)).toBe(false);
    expect(isAllowedLogin("AiraDeCastro", "")).toBe(false);
    expect(isAllowedLogin(undefined, "AiraDeCastro")).toBe(false);
    expect(isAllowedLogin("", "")).toBe(false);
  });
});
