import { describe, expect, it } from "vitest";
import { buildWeeklyReview, describeWeeklyReview } from "./weekly-review";

// Saturday 10 Oct 2026: the last full week is Mon 28 Sep to Sun 4 Oct.
const TODAY = "2026-10-10";
const at = (day: string) => `${day}T12:00:00Z`;

describe("buildWeeklyReview", () => {
  it("covers Monday to Sunday of the last full week", () => {
    const review = buildWeeklyReview([{ name: "a", closedAt: [] }], TODAY);
    expect(review.start).toBe("2026-09-28");
    expect(review.end).toBe("2026-10-04");
  });

  it("counts the boundary days in the right week", () => {
    const review = buildWeeklyReview(
      [
        {
          name: "a",
          closedAt: [
            at("2026-09-28"), // Monday, last week
            at("2026-10-04"), // Sunday, last week
            at("2026-10-05"), // Monday, this week: not counted
            at("2026-09-27"), // Sunday, the week before
          ],
        },
      ],
      TODAY,
    );
    expect(review.closed).toBe(2);
    expect(review.previousClosed).toBe(1);
  });

  it("ranks projects by closes, then name, and leaves out quiet ones", () => {
    const review = buildWeeklyReview(
      [
        { name: "b", closedAt: [at("2026-10-01")] },
        { name: "quiet", closedAt: [at("2026-09-01")] },
        { name: "a", closedAt: [at("2026-10-01")] },
        { name: "top", closedAt: [at("2026-10-01"), at("2026-10-02")] },
      ],
      TODAY,
    );
    expect(review.projects.map((p) => p.name)).toEqual(["top", "a", "b"]);
    expect(review.closed).toBe(4);
  });

  it("ignores anything older than the week before", () => {
    const review = buildWeeklyReview([{ name: "a", closedAt: [at("2026-09-20")] }], TODAY);
    expect(review.closed).toBe(0);
    expect(review.previousClosed).toBe(0);
  });
});

describe("describeWeeklyReview", () => {
  const base = { start: "2026-09-28", end: "2026-10-04" };

  it("words a quiet week gently", () => {
    const text = describeWeeklyReview({ ...base, closed: 0, previousClosed: 3, projects: [] });
    expect(text.heading).toBe("A quiet week");
    expect(text.range).toBe("Sep 28 to Oct 4");
  });

  it("compares with the week before", () => {
    const more = describeWeeklyReview({
      ...base,
      closed: 5,
      previousClosed: 2,
      projects: [{ name: "a", closed: 5 }],
    });
    expect(more.heading).toBe("5 issues closed");
    expect(more.lines).toEqual(["a: 5 issues closed", "3 issues more than the week before."]);

    const fewer = describeWeeklyReview({
      ...base,
      closed: 1,
      previousClosed: 2,
      projects: [{ name: "a", closed: 1 }],
    });
    expect(fewer.heading).toBe("1 issue closed");
    expect(fewer.lines.at(-1)).toBe("1 issue fewer than the week before.");
  });

  it("handles an empty week before and an equal week", () => {
    const first = describeWeeklyReview({
      ...base,
      closed: 2,
      previousClosed: 0,
      projects: [{ name: "a", closed: 2 }],
    });
    expect(first.lines.at(-1)).toBe("Nothing was closed the week before.");
    const same = describeWeeklyReview({
      ...base,
      closed: 2,
      previousClosed: 2,
      projects: [{ name: "a", closed: 2 }],
    });
    expect(same.lines.at(-1)).toBe("The same as the week before.");
  });
});
