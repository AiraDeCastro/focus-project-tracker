import { describe, expect, it } from "vitest";
import { dueText, NO_DUE_DATE } from "./due-text";

describe("dueText", () => {
  it("words a real date for a sentence and for a label", () => {
    expect(dueText("Oct 22", "sentence")).toBe("due Oct 22");
    expect(dueText("Oct 22", "label")).toBe("Due Oct 22");
  });

  it("words a missing date without repeating 'due'", () => {
    expect(dueText(NO_DUE_DATE, "sentence")).toBe("no due date");
    expect(dueText(NO_DUE_DATE, "label")).toBe("No due date");
  });
});
