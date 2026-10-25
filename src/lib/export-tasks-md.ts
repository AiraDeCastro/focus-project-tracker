import { DISCOVERED_HEADING } from "./tasks-md";
import type { GeneratedPlan, GeneratedTask } from "./truth";

/**
 * Writes a repo's `TASKS.md` from what the GitHub Project says (Phase 5): the exporter half of the
 * mirror. Pure code. The milestone sections come out in the format `parseTasksMd` reads, so the
 * file can be parsed again and gives the same tasks back. Every other section (Ongoing, "Before
 * each commit", notes) is kept exactly as it was, and a short notice at the top says the file is
 * generated and how to add a task.
 */

const NOTICE_START = "<!-- focus-trail:generated:start -->";
const NOTICE_END = "<!-- focus-trail:generated:end -->";

/** The notice at the top of a generated file. */
export const GENERATED_NOTICE = [
  NOTICE_START,
  "> **Generated from this repo's GitHub Project.** To add a task, use the Focus Trail app, `gh`, or",
  `> add a new \`- [ ]\` line under "${DISCOVERED_HEADING}". Ticks, renames and removals made in this file`,
  "> are ignored and put back. To finish a task, close its issue or move it to Done in the Project.",
  NOTICE_END,
].join("\n");

const MILESTONE_HEADING = /^(milestone\s+\d+|m\d+)\b/i;
const DISCOVERED_SECTION = /^discovered\b/i;

/** Same cleanup the parser does to a heading, so the two agree on what a milestone heading is. */
function plainHeading(heading: string): string {
  return heading
    .replace(/\*\*|__/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function taskLine(task: GeneratedTask): string {
  return `- [${task.done ? "x" : " "}] ${oneLine(task.text)}`;
}

function milestoneSection(m: GeneratedPlan["milestones"][number]): string {
  const lines = [`## ${oneLine(m.title)}`, ""];
  const description = oneLine(m.description);
  if (description) lines.push(`**Done when:** ${description}`, "");
  for (const task of m.tasks) lines.push(taskLine(task));
  return trimEnd(lines).join("\n");
}

function discoveredSection(heading: string, tasks: GeneratedTask[]): string {
  return [`## ${heading}`, "", ...tasks.map(taskLine)].join("\n");
}

function trimEnd(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out;
}

interface Section {
  heading: string;
  lines: string[];
}

/** Splits a file into what comes before the first `## ` heading and the `## ` sections. */
function split(markdown: string): { preamble: string[]; sections: Section[] } {
  const preamble: string[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const match = /^##\s+(.*)$/.exec(line);
    if (match) {
      current = { heading: match[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  return { preamble, sections };
}

/** Puts the notice after the title line, replacing an earlier copy instead of adding another. */
function withNotice(preamble: string[]): string[] {
  const text = preamble.join("\n");
  const start = text.indexOf(NOTICE_START);
  const end = text.indexOf(NOTICE_END);
  if (start !== -1 && end > start) {
    return `${text.slice(0, start)}${GENERATED_NOTICE}${text.slice(end + NOTICE_END.length)}`.split(
      "\n",
    );
  }
  const lines = [...preamble];
  const title = lines.findIndex((l) => /^#\s/.test(l));
  const at = title === -1 ? 0 : title + 1;
  lines.splice(at, 0, ...(title === -1 ? [] : [""]), ...GENERATED_NOTICE.split("\n"));
  return lines;
}

/**
 * Renders the file. `existing` is the current `TASKS.md` (or null when the repo has none yet); its
 * non-milestone sections are carried over verbatim. Milestones come out in the Project's order, at
 * the place the first milestone section was; the "Discovered during work" section is rebuilt from
 * the Project's tasks that belong to no milestone.
 */
export function renderTasksMd(plan: GeneratedPlan, existing: string | null): string {
  const { preamble, sections } = split(existing ?? "# Tasks\n");
  const out: string[] = [trimEnd(withNotice(preamble)).join("\n")];

  const milestones = plan.milestones.map(milestoneSection);
  const discoveredHeading =
    sections.find((s) => DISCOVERED_SECTION.test(plainHeading(s.heading)))?.heading ??
    DISCOVERED_HEADING;
  const hasMilestoneSection = sections.some((s) => MILESTONE_HEADING.test(plainHeading(s.heading)));
  let milestonesPlaced = false;
  let discoveredPlaced = false;

  const placeMilestones = () => {
    if (milestonesPlaced) return;
    milestonesPlaced = true;
    out.push(...milestones);
  };

  for (const s of sections) {
    const plain = plainHeading(s.heading);
    if (MILESTONE_HEADING.test(plain)) {
      placeMilestones();
    } else if (DISCOVERED_SECTION.test(plain)) {
      if (!discoveredPlaced && plan.discovered.length > 0) {
        out.push(discoveredSection(s.heading, plan.discovered));
      }
      discoveredPlaced = true;
    } else {
      // With no milestone section to replace, milestones go before the first other section.
      if (!hasMilestoneSection) placeMilestones();
      out.push([`## ${s.heading}`, ...trimEnd(s.lines)].join("\n"));
    }
  }
  placeMilestones();
  if (!discoveredPlaced && plan.discovered.length > 0) {
    out.push(discoveredSection(discoveredHeading, plan.discovered));
  }

  return `${out.filter((block) => block.length > 0).join("\n\n")}\n`;
}
