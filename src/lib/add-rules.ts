/**
 * What the owner may type when adding a task or a milestone to a repo's GitHub Project. Client-safe
 * (no server code), so the form and the server check the same limits. Server actions are public
 * endpoints, so the server checks again.
 */

export const TASK_TITLE_MAX = 200;
export const TASK_NOTE_MAX = 2000;
export const MILESTONE_TITLE_MAX = 250;
export const MILESTONE_DESCRIPTION_MAX = 900;

export type AddError =
  | "invalid_title"
  | "invalid_note"
  | "invalid_description"
  | "invalid_due_date"
  | "no_project"
  | "unknown_milestone"
  | "milestone_exists"
  | "duplicate_task"
  | "status_missing";

export const ADD_ERROR_MESSAGES: Record<AddError, string> = {
  invalid_title: "Give it a title, and keep it to one short line.",
  invalid_note: `The note can be up to ${TASK_NOTE_MAX} characters.`,
  invalid_description: `The description can be up to ${MILESTONE_DESCRIPTION_MAX} characters.`,
  invalid_due_date: "The due date must be a real day, written like 2026-11-30.",
  no_project: "This repo has no GitHub Project yet. Onboard it first.",
  unknown_milestone: "That milestone does not exist in this repo. Add the milestone first.",
  milestone_exists: "That milestone already exists.",
  duplicate_task: "That task is already in this milestone.",
  status_missing: "The Project's Status field has no Todo option, so the task cannot be added.",
};

/** One line of plain text: collapses runs of spaces and newlines, and trims the ends. */
export function oneLine(text: unknown): string {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

export interface TaskInput {
  title: string;
  /** The milestone's title, or null for a task that belongs to none. */
  milestone: string | null;
  note: string;
}

export interface MilestoneInput {
  title: string;
  /** "YYYY-MM-DD", or empty for no due date. */
  dueDate: string;
  description: string;
}

/** True for a real calendar day written "YYYY-MM-DD". */
export function isRealDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Cleans a task form's input, or says what is wrong with it. */
export function checkTaskInput(
  input: unknown,
): { ok: true; value: TaskInput } | { ok: false; error: AddError } {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const title = oneLine(raw.title);
  if (title.length === 0 || title.length > TASK_TITLE_MAX)
    return { ok: false, error: "invalid_title" };
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > TASK_NOTE_MAX) return { ok: false, error: "invalid_note" };
  const milestone =
    raw.milestone === null || raw.milestone === undefined ? null : oneLine(raw.milestone);
  if (milestone !== null && (milestone.length === 0 || milestone.length > MILESTONE_TITLE_MAX)) {
    return { ok: false, error: "unknown_milestone" };
  }
  return { ok: true, value: { title, milestone, note } };
}

/** Cleans a milestone form's input, or says what is wrong with it. */
export function checkMilestoneInput(
  input: unknown,
): { ok: true; value: MilestoneInput } | { ok: false; error: AddError } {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const title = oneLine(raw.title);
  if (title.length === 0 || title.length > MILESTONE_TITLE_MAX) {
    return { ok: false, error: "invalid_title" };
  }
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (description.length > MILESTONE_DESCRIPTION_MAX)
    return { ok: false, error: "invalid_description" };
  const dueDate = typeof raw.dueDate === "string" ? raw.dueDate.trim() : "";
  if (dueDate !== "" && !isRealDay(dueDate)) return { ok: false, error: "invalid_due_date" };
  return { ok: true, value: { title, dueDate, description } };
}
