import { describe, expect, it } from "vitest";
import { isValidTimeZone, localDate, localHour, resolveTimeZone, toLocalStamp } from "./timezone";

describe("isValidTimeZone", () => {
  it("accepts real IANA names and rejects everything else", () => {
    expect(isValidTimeZone("America/Toronto")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(isValidTimeZone("x".repeat(65))).toBe(false);
  });
});

describe("resolveTimeZone", () => {
  it("takes the first valid candidate, else UTC", () => {
    expect(resolveTimeZone("nope", undefined, "Asia/Manila", "America/Toronto")).toBe(
      "Asia/Manila",
    );
    expect(resolveTimeZone(null, "")).toBe("UTC");
    expect(resolveTimeZone()).toBe("UTC");
  });
});

describe("localHour", () => {
  it("gives the hour in the zone, not in UTC", () => {
    const instant = new Date("2026-10-20T02:30:00Z");
    expect(localHour(instant, "UTC")).toBe(2);
    expect(localHour(instant, "America/Toronto")).toBe(22);
  });
  it("gives 0, not 24, at midnight", () => {
    expect(localHour(new Date("2026-10-20T04:00:00Z"), "America/Toronto")).toBe(0);
  });
});

describe("localDate", () => {
  // 2026-10-14 02:00 UTC is still the evening of the 13th in Toronto and already the 14th in Manila.
  const instant = new Date("2026-10-14T02:00:00Z");

  it("gives the date in the owner's timezone", () => {
    expect(localDate(instant, "UTC")).toBe("2026-10-14");
    expect(localDate(instant, "America/Toronto")).toBe("2026-10-13");
    expect(localDate(instant, "Asia/Manila")).toBe("2026-10-14");
    expect(localDate(instant, "Pacific/Auckland")).toBe("2026-10-14");
  });

  it("follows daylight saving time", () => {
    // Toronto is UTC-5 in winter, UTC-4 in summer: 04:30 UTC is the day before in winter only.
    expect(localDate(new Date("2026-01-15T04:30:00Z"), "America/Toronto")).toBe("2026-01-14");
    expect(localDate(new Date("2026-07-15T04:30:00Z"), "America/Toronto")).toBe("2026-07-15");
  });

  it("does not turn midnight into hour 24", () => {
    expect(localDate(new Date("2026-10-14T00:00:00Z"), "UTC")).toBe("2026-10-14");
    expect(toLocalStamp("2026-10-14T00:00:00Z", "UTC")).toBe("2026-10-14T00:00:00.000Z");
  });
});

describe("toLocalStamp", () => {
  it("moves the date part to the owner's day and keeps the wall-clock time", () => {
    expect(toLocalStamp("2026-10-14T02:00:00Z", "America/Toronto")).toBe(
      "2026-10-13T22:00:00.000Z",
    );
    expect(toLocalStamp("2026-10-13T20:30:00Z", "Asia/Manila")).toBe("2026-10-14T04:30:00.000Z");
  });

  it("leaves empty and broken values alone", () => {
    expect(toLocalStamp(null, "UTC")).toBeNull();
    expect(toLocalStamp("", "UTC")).toBe("");
    expect(toLocalStamp("not a date", "UTC")).toBe("not a date");
  });
});
