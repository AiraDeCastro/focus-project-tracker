import {
  ADD_ERROR_MESSAGES,
  checkMilestoneInput,
  checkTaskInput,
  type AddError,
} from "./add-rules";
import type { ProjectsApi } from "./github/projects";
import { issueBody, type RepoWriter } from "./github/repo-writes";
import { shortTitle } from "./tasks-md";
import { keyForNewTask } from "./truth";

/**
 * Adds a task or a milestone to a repo's GitHub Project (Phase 5). The only things the app writes
 * for tasks: it cannot edit, reorder or delete one, and it keeps no copy. Each call returns a
 * preview of exactly what will be created; nothing is written until `confirm` is true.
 */

export interface AddDeps {
  writer: RepoWriter;
  projects: ProjectsApi;
  fullName: string;
}

export type AddFailure = { ok: false; error: AddError; message: string };

const fail = (error: AddError): AddFailure => ({
  ok: false,
  error,
  message: ADD_ERROR_MESSAGES[error],
});

export interface TaskPreview {
  title: string;
  milestone: string | null;
  body: string;
  key: string;
}

export type AddTaskResult =
  | { ok: true; created: false; preview: TaskPreview }
  | { ok: true; created: true; preview: TaskPreview; issueNumber: number }
  | AddFailure;

export async function addTask(
  deps: AddDeps,
  input: unknown,
  confirm = false,
): Promise<AddTaskResult> {
  const checked = checkTaskInput(input);
  if (!checked.ok) return fail(checked.error);
  const { title, milestone, note } = checked.value;
  const { writer, projects, fullName } = deps;

  const project = await projects.findProject(fullName);
  if (!project) return fail("no_project");

  const milestones = await writer.listMilestones(fullName);
  let milestoneNumber: number | null = null;
  let milestoneTitle: string | null = null;
  if (milestone !== null) {
    const found = milestones.find((m) => m.title.toLowerCase() === milestone.toLowerCase());
    if (!found) return fail("unknown_milestone");
    milestoneNumber = found.number;
    milestoneTitle = found.title;
  }

  // The TASKS.md line is the title; the optional note goes in the issue's body, above the footer
  // that carries the hidden key, so the next export and import recognise the task.
  const key = keyForNewTask(milestoneTitle, title);
  const issueTitle = shortTitle(title);
  const preview: TaskPreview = {
    title: issueTitle,
    milestone: milestoneTitle,
    body: `${note ? `${note}\n\n` : ""}${issueBody(title, issueTitle, milestoneTitle, key)}`,
    key,
  };

  const issues = await writer.listIssues(fullName);
  if (issues.some((i) => i.key === key)) return fail("duplicate_task");
  if (!confirm) return { ok: true, created: false, preview };

  const status = await projects.statusField(project.id);
  const todo = status?.options.find((o) => o.name.toLowerCase() === "todo");
  if (!status || !todo) return fail("status_missing");

  const issue = await writer.createIssue(fullName, {
    title: preview.title,
    body: preview.body,
    milestone: milestoneNumber,
  });
  const itemId = await projects.addIssue(project.id, issue.nodeId);
  await projects.setStatus({
    projectId: project.id,
    itemId,
    fieldId: status.fieldId,
    optionId: todo.id,
  });
  return { ok: true, created: true, preview, issueNumber: issue.number };
}

export interface MilestonePreview {
  title: string;
  dueDate: string | null;
  description: string;
}

export type AddMilestoneResult =
  | { ok: true; created: false; preview: MilestonePreview }
  | { ok: true; created: true; preview: MilestonePreview; number: number }
  | AddFailure;

export async function addMilestone(
  deps: Pick<AddDeps, "writer" | "fullName">,
  input: unknown,
  confirm = false,
): Promise<AddMilestoneResult> {
  const checked = checkMilestoneInput(input);
  if (!checked.ok) return fail(checked.error);
  const { title, dueDate, description } = checked.value;
  const { writer, fullName } = deps;

  const existing = await writer.listMilestones(fullName);
  if (existing.some((m) => m.title.toLowerCase() === title.toLowerCase())) {
    return fail("milestone_exists");
  }
  const preview: MilestonePreview = { title, dueDate: dueDate || null, description };
  if (!confirm) return { ok: true, created: false, preview };

  const made = await writer.createMilestone(fullName, {
    title,
    description,
    dueOn: dueDate || null,
  });
  return { ok: true, created: true, preview, number: made.number };
}
