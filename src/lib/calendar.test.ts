import { describe, expect, it } from "vitest";
import { monthGrid } from "./calendar";

describe("monthGrid", () => {
  it("lays out October 2026, which starts on a Thursday", () => {
    expect(monthGrid("2026-10-08")).toEqual({
      title: "October 2026",
      leading: [28, 29, 30],
      daysInMonth: 31,
      todayDay: 8,
    });
  });

  it("has no leading days when the month starts on a Monday", () => {
    expect(monthGrid("2026-06-15").leading).toEqual([]);
  });

  it("handles leap-year February", () => {
    expect(monthGrid("2028-02-10").daysInMonth).toBe(29);
  });
});
