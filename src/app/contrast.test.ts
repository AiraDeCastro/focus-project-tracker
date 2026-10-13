import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

/** Tokens of one theme, read from the block that starts at `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes = {
  light: { ...tokens(":root {") },
  dark: { ...tokens(':root[data-theme="dark"]') },
};

describe.each(Object.entries(themes))("%s theme contrast", (_name, theme) => {
  it("reads its tokens", () => expect(Object.keys(theme).length).toBeGreaterThan(10));

  const t = { ...themes.light, ...theme };
  const surfaces = ["canvas", "frame", "card"];

  it("keeps body and muted text readable (4.5:1) on every surface", () => {
    for (const surface of surfaces) {
      expect(ratio(t.text, t[surface]), `text on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.muted, t[surface]), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.deep, t[surface]), `deep on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the focus ring visible (3:1) on every surface", () => {
    for (const surface of surfaces) {
      expect(ratio(t.deep, t[surface]), `ring on ${surface}`).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(t["sidebar-fg"], t.sidebar), "ring on sidebar").toBeGreaterThanOrEqual(3);
  });

  it("keeps dark text readable on the accent fills", () => {
    for (const fill of ["yellow", "sage", "teal"]) {
      expect(ratio(t["yellow-fg"], t[fill]), `on ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
