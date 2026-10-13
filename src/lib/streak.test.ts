import { describe, expect, it } from "vitest";
import { STREAK_LOOKBACK_WEEKS, buildStreak, describeStreak, streakSince } from "./streak";

// Saturday 10 Oct 2026. Weeks run Monday to Sunday: this week started Mon 5 Oct.
const TODAY = "2026-10-10";
const at = (day: string) => `${day}T12:00:00Z`;

describe("buildStreak", () => {
  it("counts consecutive weeks with a close, ending with this week", () => {
    const streak = buildStreak(
      [at("2026-10-06"), at("2026-10-07"), at("2026-09-30"), at("2026-09-22")],
      TODAY,
      false,
    );
    expect(streak).toEqual({ weeks: 3, paused: false, thisWeek: 2 });
  });

  it("does not hold an empty current week against the owner", () => {
    const streak = buildStreak([at("2026-10-01"), at("2026-09-25")], TODAY, false);
    expect(streak).toEqual({ weeks: 2, paused: false, thisWeek: 0 });
  });

  it("breaks on a week with no closes", () => {
    const streak = buildStreak([at("2026-10-06"), at("2026-09-22")], TODAY, false);
    expect(streak?.weeks).toBe(1);
  });

  it("is gone, not zero, when neither this week nor last week had a close", () => {
    expect(buildStreak([at("2026-09-22"), at("2026-09-15")], TODAY, false)).toBeNull();
    expect(buildStreak([], TODAY, false)).toBeNull();
  });

  it("puts Sunday in the old week and Monday in the new one", () => {
    // Sun 4 Oct is in the week of 28 Sep; Mon 5 Oct starts this week.
    expect(buildStreak([at("2026-10-04")], TODAY, false)).toEqual({
      weeks: 1,
      paused: false,
      thisWeek: 0,
    });
    expect(buildStreak([at("2026-10-05"), at("2026-10-04")], TODAY, false)?.weeks).toBe(2);
  });

  it("counts many closes in one week as one week", () => {
    const many = Array.from({ length: 30 }, () => at("2026-10-06"));
    expect(buildStreak(many, TODAY, false)).toEqual({ weeks: 1, paused: false, thisWeek: 30 });
  });

  it("ignores closes dated after today", () => {
    expect(buildStreak([at("2026-10-12"), at("2026-10-20")], TODAY, false)).toBeNull();
  });

  it("pauses instead of breaking while Away mode is on", () => {
    // The last close was six weeks ago; being away keeps that streak alive.
    const streak = buildStreak([at("2026-08-27"), at("2026-08-20"), at("2026-08-12")], TODAY, true);
    expect(streak).toEqual({ weeks: 3, paused: true, thisWeek: 0 });
  });

  it("is not paused when Away mode is on but there is a recent close", () => {
    expect(buildStreak([at("2026-10-06")], TODAY, true)).toEqual({
      weeks: 1,
      paused: false,
      thisWeek: 1,
    });
    expect(buildStreak([at("2026-10-01")], TODAY, true)?.paused).toBe(false);
  });

  it("shows nothing while away with no closes at all", () => {
    expect(buildStreak([], TODAY, true)).toBeNull();
  });

  it("stops at the lookback limit", () => {
    const stamps = Array.from({ length: STREAK_LOOKBACK_WEEKS + 10 }, (_, i) => {
      const d = new Date(Date.parse("2026-10-06T12:00:00Z") - i * 7 * 24 * 60 * 60 * 1000);
      return d.toISOString();
    });
    expect(buildStreak(stamps, TODAY, false)?.weeks).toBe(STREAK_LOOKBACK_WEEKS);
  });
});

describe("streakSince", () => {
  it("is the Monday a full lookback ago", () => {
    expect(streakSince(TODAY)).toBe("2025-10-06");
  });
});

describe("describeStreak", () => {
  it("reads as a short phrase", () => {
    expect(describeStreak({ weeks: 3, paused: false, thisWeek: 1 })).toBe("3-week streak");
    expect(describeStreak({ weeks: 1, paused: false, thisWeek: 0 })).toBe("1-week streak");
    expect(describeStreak({ weeks: 5, paused: true, thisWeek: 0 })).toBe(
      "5-week streak, paused while you are away",
    );
  });
});
