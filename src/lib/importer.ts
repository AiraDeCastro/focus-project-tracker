import type { ProjectRef, ProjectsApi, StatusField } from "./github/projects";
import { issueBody, type RepoIssue, type RepoWriter } from "./github/repo-writes";
import { matchOrphanIssues } from "./adopt";
import type { Reconciliation } from "./truth";

/**
 * Carries out the import half of a reconciliation (Phase 5): creates the milestones and issues the
 * plan asks for, adds each issue to the repo's Project and sets its Status. It only adds and
 * closes; it never deletes, never reopens, and never changes the Status of an item that already has
 * one, so a human edit on GitHub is left alone.
 *
 * Safe to run again, and safe to stop halfway: an issue is found by the hidden key in its body (so
 * issues made earlier by `npm run tasks:sync` are reused, not duplicated), a Project item is found
 * by its issue, and only the missing steps are done. `maxWrites` caps one run, so a long import
 * can be carried on in several short ones.
 */

export type ImportPlan = Pick<Reconciliation, "imports" | "newMilestones">;

export interface ImportDeps {
  writer: RepoWriter;
  projects: ProjectsApi;
  fullName: string;
  project: ProjectRef;
  plan: ImportPlan;
  /** False (the default) reports what would be done and writes nothing. */
  apply?: boolean;
  /** The most GitHub writes one run may make. Omit for no cap. */
  maxWrites?: number;
  /** Called after every write, so a caller can wait out GitHub's limit on creating content. */
  pause?: () => Promise<void>;
}

export interface ImportReport {
  dryRun: boolean;
  /** Writes made, or in a dry run, writes that would be made. */
  writes: number;
  milestonesCreated: number;
  issuesCreated: number;
  /** Issues that already existed (found by their key) and were only added to the Project. */
  issuesReused: number;
  /** Of those, issues made for an earlier wording of the task, adopted instead of duplicated. */
  issuesAdopted: number;
  issuesClosed: number;
  itemsAdded: number;
  statusesSet: number;
  /** Imports not finished because `maxWrites` was reached. Run again to carry on. */
  remaining: number;
}

export class StatusFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatusFieldError";
  }
}

function option(field: StatusField, name: string): string {
  const found = field.options.find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (!found) {
    throw new StatusFieldError(
      `The Project's Status field has no "${name}" option, so tasks cannot be marked ${name}.`,
    );
  }
  return found.id;
}

export async function runImport(deps: ImportDeps): Promise<ImportReport> {
  const { writer, projects, fullName, project, plan } = deps;
  const apply = deps.apply === true;
  const cap = deps.maxWrites ?? Number.POSITIVE_INFINITY;

  const report: ImportReport = {
    dryRun: !apply,
    writes: 0,
    milestonesCreated: 0,
    issuesCreated: 0,
    issuesReused: 0,
    issuesAdopted: 0,
    issuesClosed: 0,
    itemsAdded: 0,
    statusesSet: 0,
    remaining: 0,
  };
  if (plan.imports.length === 0 && plan.newMilestones.length === 0) return report;

  const [milestones, issues, listed, statusField] = await Promise.all([
    writer.listMilestones(fullName),
    writer.listIssues(fullName),
    projects.listItems(project.id),
    projects.statusField(project.id),
  ]);
  if (!statusField) throw new StatusFieldError("The Project has no Status field.");
  const todo = option(statusField, "Todo");
  const done = option(statusField, "Done");

  const milestoneNumbers = new Map(milestones.map((m) => [m.title, m.number]));
  const issueByKey = new Map<string, RepoIssue>();
  for (const issue of issues) if (issue.key) issueByKey.set(issue.key, issue);
  const itemByIssue = new Map(listed.items.map((i) => [i.issueId, i]));
  // Lines reworded since an earlier sync adopt that sync's issue instead of getting a second one.
  const adopted = matchOrphanIssues({
    imports: plan.imports,
    issues,
    milestoneNumbers,
    inProject: new Set(listed.items.map((i) => i.issueId)),
  });

  let blocked = false;
  /** Spends one write, or says the cap is reached. */
  async function write(action: () => Promise<void>): Promise<boolean> {
    if (blocked || report.writes >= cap) {
      blocked = true;
      return false;
    }
    report.writes += 1;
    if (apply) {
      await action();
      if (deps.pause) await deps.pause();
    }
    return true;
  }

  for (const m of plan.newMilestones) {
    if (milestoneNumbers.has(m.title)) continue;
    const spent = await write(async () => {
      const made = await writer.createMilestone(fullName, {
        title: m.title,
        description: m.description,
      });
      milestoneNumbers.set(m.title, made.number);
    });
    if (!spent) break;
    // A dry run has no number to remember, but the milestone counts as made.
    if (!apply) milestoneNumbers.set(m.title, -1);
    report.milestonesCreated += 1;
  }

  for (const task of plan.imports) {
    if (blocked) {
      report.remaining += 1;
      continue;
    }
    const adoptedIssue = adopted.get(task.key) ?? null;
    let issue = issueByKey.get(task.key) ?? adoptedIssue;
    let finished = true;

    if (issue) {
      report.issuesReused += 1;
      if (issue === adoptedIssue) report.issuesAdopted += 1;
    } else {
      const milestone =
        task.milestone === null ? null : (milestoneNumbers.get(task.milestone) ?? null);
      if (task.milestone !== null && milestone === null) {
        finished = false; // its milestone was not made before the cap
      } else {
        const spent = await write(async () => {
          issue = await writer.createIssue(fullName, {
            title: task.title,
            body: issueBody(task.text, task.title, task.milestone, task.key),
            milestone: milestone !== null && milestone > 0 ? milestone : null,
          });
        });
        if (spent) report.issuesCreated += 1;
        else finished = false;
      }
    }

    const target = issue as RepoIssue | null;
    if (finished && task.done && (!target || target.state === "open")) {
      const spent = await write(async () => {
        if (target) await writer.closeIssue(fullName, target.number);
      });
      if (spent) report.issuesClosed += 1;
      else finished = false;
    }

    if (finished) {
      const known = target ? itemByIssue.get(target.nodeId) : undefined;
      let itemId = known?.itemId ?? null;
      const needsStatus = known ? known.status === null : true;
      const closed = task.done || target?.state === "closed";
      if (!known) {
        const spent = await write(async () => {
          if (target) itemId = await projects.addIssue(project.id, target.nodeId);
        });
        if (spent) report.itemsAdded += 1;
        else finished = false;
      }
      if (finished && needsStatus) {
        const spent = await write(async () => {
          if (itemId) {
            await projects.setStatus({
              projectId: project.id,
              itemId,
              fieldId: statusField.fieldId,
              optionId: closed ? done : todo,
            });
          }
        });
        if (spent) report.statusesSet += 1;
        else finished = false;
      }
    }

    if (!finished) report.remaining += 1;
  }
  return report;
}
