import { describe, expect, it } from "vitest";
import { shippedPrompt } from "./shipped";

describe("shippedPrompt", () => {
  it("celebrates a deployed project and names the suggested next one", () => {
    expect(shippedPrompt({ name: "recipe-box", kind: "deployed" }, "portfolio-site")).toEqual({
      pill: "recipe-box is live",
      heading: "Nice work. Next up: portfolio-site",
    });
  });

  it("says finished for a project with nothing to deploy", () => {
    expect(shippedPrompt({ name: "my-cli", kind: "finished" }, "portfolio-site").pill).toBe(
      "my-cli is finished",
    );
  });

  it("asks the owner to pick when nothing is suggested", () => {
    expect(shippedPrompt({ name: "recipe-box", kind: "deployed" }, undefined).heading).toBe(
      "Nice work. Pick your next project",
    );
  });
});
