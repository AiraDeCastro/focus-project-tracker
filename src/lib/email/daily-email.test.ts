import { describe, expect, it } from "vitest";
import type { Dashboard, Project } from "../types";
import { buildDailyEmail, escapeHtml, reminderSkipReason } from "./daily-email";

function project(extra: Partial<Project> = {}): Project {
  return {
    id: "recipe-box",
    status: "focus",
    kind: "project",
    highPriority: false,
    lastActivity: "yesterday",
    series: [],
    milestones: [{ name: "MVP", closed: 3, total: 4, due: "No due date" }],
    todayTasks: [
      { number: 41, title: "Empty state", url: "https://github.com/me/recipe-box/issues/41" },
      { number: 44, title: "Fix upload", url: "https://github.com/me/recipe-box/issues/44" },
    ],
    checklist: [],
    ...extra,
  };
}

function dashboard(extra: Partial<Dashboard> = {}, focus: Partial<Project> = {}): Dashboard {
  return {
    isExample: false,
    ownerName: "Aira",
    today: "2026-10-10",
    weekDates: [],
    weekLabels: [],
    idealEndIndex: 0,
    closedPerDay: [0, 0, 0, 0, 0, 0, 0],
    closedDays: [],
    dueDays: [],
    awayUntil: null,
    sinceLastVisit: null,
    streak: null,
    alerts: [],
    projects: [project(focus)],
    ...extra,
  };
}

const URL = "https://focus-project-tracker.vercel.app";

describe("buildDailyEmail", () => {
  it("lists the next tasks with links, the progress, and a link to the dashboard", () => {
    const email = buildDailyEmail(dashboard(), URL)!;
    expect(email.subject).toBe("Today in recipe-box");
    expect(email.text).toContain("Good morning, Aira.");
    expect(email.text).toContain("Today in recipe-box (75% done):");
    expect(email.text).toContain(
      "1. #41 Empty state\n   https://github.com/me/recipe-box/issues/41",
    );
    expect(email.text).toContain("2. #44 Fix upload");
    expect(email.text).toContain(`Open your dashboard: ${URL}`);
    expect(email.html).toContain('href="https://github.com/me/recipe-box/issues/41"');
  });

  it("says plainly that it is a nudge and how to turn it off", () => {
    const { text, html } = buildDailyEmail(dashboard(), URL)!;
    for (const body of [text, html]) {
      expect(body).toContain("a nudge, not a to-do");
      expect(body).toContain("Skipping a day is fine");
      expect(body).toContain("Settings");
    }
  });

  it("escapes HTML in names and titles", () => {
    const email = buildDailyEmail(
      dashboard({}, { todayTasks: [{ number: 1, title: '<script>alert("x")</script> & more' }] }),
      URL,
    )!;
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more");
    expect(escapeHtml(`a<b>"c"'d'&`)).toBe("a&lt;b&gt;&quot;c&quot;&#39;d&#39;&amp;");
  });

  it("links only https addresses", () => {
    const email = buildDailyEmail(
      dashboard(
        {},
        {
          todayTasks: [
            { number: 1, title: "Script link", url: "javascript:alert(1)" },
            { number: 2, title: "Plain http", url: "http://example.com/2" },
            { number: 3, title: "No link" },
          ],
        },
      ),
      "javascript:alert(2)",
    )!;
    expect(email.html).not.toContain("javascript:");
    expect(email.html).not.toContain("http://example.com");
    expect(email.text).not.toContain("javascript:");
    expect(email.text).not.toContain("Open your dashboard");
    expect(email.text).toContain("1. #1 Script link");
  });

  it("explains when there are no open tasks", () => {
    const email = buildDailyEmail(dashboard({}, { todayTasks: [] }), URL)!;
    expect(email.text).toContain("No open tasks right now.");
    expect(email.html).toContain("No open tasks right now.");
  });

  it("includes warnings but leaves out the calm notes", () => {
    const email = buildDailyEmail(
      dashboard({
        alerts: [
          { kind: "stalled", title: "Stalled.", text: "No issue closed in 9 days." },
          { kind: "overdue", title: "Overdue.", text: "MVP was due Oct 1." },
          { kind: "info", title: "On track.", text: "An issue was closed today." },
        ],
      }),
      URL,
    )!;
    expect(email.text).toContain("Worth a look:");
    expect(email.text).toContain("- Stalled. No issue closed in 9 days.");
    expect(email.text).toContain("- Overdue. MVP was due Oct 1.");
    expect(email.text).not.toContain("On track.");
  });

  it("greets without a name when it is not known", () => {
    expect(buildDailyEmail(dashboard({ ownerName: "there" }), URL)!.text).toMatch(
      /^Good morning\.\n/,
    );
  });

  it("returns nothing when no project has focus", () => {
    expect(buildDailyEmail(dashboard({}, { status: "backlog" }), URL)).toBeNull();
  });
});

describe("reminderSkipReason", () => {
  it("sends when it is on, the owner is not away and a project has focus", () => {
    expect(reminderSkipReason(dashboard(), "email")).toBeNull();
  });

  it("stays quiet when turned off, while away, or with no focus project", () => {
    expect(reminderSkipReason(dashboard(), "none")).toBe("disabled");
    expect(reminderSkipReason(dashboard({ awayUntil: "2026-10-20" }), "email")).toBe("away");
    expect(reminderSkipReason(dashboard({}, { status: "backlog" }), "email")).toBe("no_focus");
  });

  it("checks the setting before anything else", () => {
    expect(reminderSkipReason(dashboard({ awayUntil: "2026-10-20" }), "none")).toBe("disabled");
  });
});
