import { createHash } from "node:crypto";

/**
 * Reads a project's TASKS.md and turns its milestone sections into milestones and tasks, so they
 * can become GitHub milestones and issues. Only `## Milestone N ...` and `## M<N> ...` headings
 * count as milestones. Other sections (Ongoing, Backlog, checklists such as "Before each commit")
 * are reported as skipped, because their tasks never finish and would hold progress down.
 */

export interface ParsedTask {
  /** Short, one-line issue title. */
  title: string;
  /** The task's full text on one line (wrapped lines joined). */
  text: string;
  done: boolean;
  /** Stable id from the milestone and the text; stored in the issue so re-runs find it again. */
  key: string;
}

export interface ParsedMilestone {
  title: string;
  /** "Exit" or "Done when" line under the heading, if there is one. */
  description: string;
  tasks: ParsedTask[];
  /** True when the milestone has tasks and every one is checked. */
  allDone: boolean;
}

export interface ParsedTasks {
  milestones: ParsedMilestone[];
  skipped: { heading: string; tasks: number }[];
}

const MILESTONE_HEADING = /^(milestone\s+\d+|m\d+)\b/i;
const MAX_TITLE = 110;
const MAX_MILESTONE_TITLE = 250;

/** "**Bold** text" becomes "Bold text"; extra spaces are collapsed. */
function clean(text: string): string {
  return text
    .replace(/\*\*|__/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Milestone title from a heading: markdown emphasis is dropped, and a trailing status note such
 * as "*(done)*" is removed, because GitHub shows that state itself.
 */
export function milestoneTitle(heading: string): string {
  const withoutStatus = heading.replace(/\s*\*\([^)]*\)\*\s*$/, "").replace(/\s*\(done\)\s*$/i, "");
  return clean(withoutStatus).slice(0, MAX_MILESTONE_TITLE);
}

/** A one-line title no longer than `MAX_TITLE`, cut at a word and ended with an ellipsis. */
export function shortTitle(text: string): string {
  if (text.length <= MAX_TITLE) return text;
  const cut = text.slice(0, MAX_TITLE - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,;:(\-—]+$/, "")}…`;
}

export function taskKey(milestone: string, text: string): string {
  return createHash("sha1").update(`${milestone}\n${text}`).digest("hex").slice(0, 12);
}

export function parseTasksMd(markdown: string): ParsedTasks {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  interface Section {
    heading: string;
    isMilestone: boolean;
    description: string;
    tasks: { done: boolean; lines: string[] }[];
  }
  const sections: Section[] = [];
  let section: Section | null = null;
  let current: { done: boolean; lines: string[] } | null = null;

  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[1].trim();
      section = {
        heading: text,
        isMilestone: MILESTONE_HEADING.test(clean(text)),
        description: "",
        tasks: [],
      };
      sections.push(section);
      current = null;
      continue;
    }
    if (/^#\s/.test(line)) {
      section = null;
      current = null;
      continue;
    }
    if (!section) continue;

    const box = /^- \[( |x|X)\]\s*(.*)$/.exec(line);
    if (box) {
      current = { done: box[1] !== " ", lines: [box[2]] };
      section.tasks.push(current);
      continue;
    }
    if (current && /^\s+\S/.test(line)) {
      current.lines.push(line.trim()); // a wrapped line of the same task
      continue;
    }
    if (line.trim() === "") continue; // blank lines do not end a task by themselves

    current = null;
    const note = /^\*{0,2}(exit|done when)\*{0,2}\s*:?\s*\*{0,2}\s*(.+)$/i.exec(line.trim());
    if (note && !section.description) section.description = clean(note[2]);
  }

  const milestones: ParsedMilestone[] = [];
  const skipped: ParsedTasks["skipped"] = [];
  const seenTitles = new Map<string, number>();

  for (const s of sections) {
    if (!s.isMilestone) {
      if (s.tasks.length > 0) skipped.push({ heading: clean(s.heading), tasks: s.tasks.length });
      continue;
    }
    let title = milestoneTitle(s.heading);
    const seen = (seenTitles.get(title) ?? 0) + 1;
    seenTitles.set(title, seen);
    if (seen > 1) title = `${title} (${seen})`;

    const tasks = s.tasks
      .map((t) => ({ done: t.done, text: clean(t.lines.join(" ")) }))
      .filter((t) => t.text.length > 0)
      .map((t): ParsedTask => ({
        title: shortTitle(t.text),
        text: t.text,
        done: t.done,
        key: taskKey(title, t.text),
      }));
    milestones.push({
      title,
      description: s.description,
      tasks,
      allDone: tasks.length > 0 && tasks.every((t) => t.done),
    });
  }
  return { milestones, skipped };
}
