"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { AWAY_ERROR_MESSAGES, setAwayUntil } from "@/lib/away";
import { requestTimeZone } from "@/lib/request-timezone";
import { localDate } from "@/lib/timezone";
import {
  addChecklistItem,
  addSuggestedChecklist,
  removeChecklistItem,
  setChecklistChecked,
} from "@/lib/checklist";
import { CHECKLIST_ERROR_MESSAGES } from "@/lib/checklist-rules";
import type { ChecklistItem } from "@/lib/types";
import { DONE_ERROR_MESSAGES, markDone, reopenProject, setFinishedDate } from "@/lib/done";
import { FOCUS_ERROR_MESSAGES, setFocus } from "@/lib/focus";
import { KIND_ERROR_MESSAGES, setKind } from "@/lib/kind";
import { moveHighPriority, setHighPriority } from "@/lib/priority";
import { saveSettings } from "@/lib/settings";
import { SETTINGS_ERROR_MESSAGES } from "@/lib/settings-rules";
import { isProjectKind } from "@/lib/project-kind";
import { explainAddError } from "@/lib/add-errors";
import {
  addMilestone,
  addTask,
  type AddMilestoneResult,
  type AddTaskResult,
} from "@/lib/add-to-project";
import { createProjectsApi } from "@/lib/github/projects";
import { createRepoWriter } from "@/lib/github/repo-writes";
import { getAccessToken } from "@/lib/session";
import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Marks or unmarks a project as high priority. Only the signed-in owner can call it: the
 * session exists only for the allowed GitHub login. Inputs are checked because server actions
 * are public endpoints.
 */
export async function setHighPriorityAction(name: string, value: boolean): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change priorities." };
  if (typeof name !== "string" || name.length === 0 || name.length > 100) {
    return { ok: false, error: "Unknown project." };
  }
  if (typeof value !== "boolean") return { ok: false, error: "Invalid value." };

  const found = await setHighPriority(getDb(), name, value);
  return found ? { ok: true } : { ok: false, error: "That project was not found." };
}

/**
 * Moves a starred project up or down in the owner's ranking. Only the signed-in owner can call
 * it; the inputs are checked because server actions are public endpoints.
 */
export async function moveHighPriorityAction(
  name: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change priorities." };
  if (typeof name !== "string" || name.length === 0 || name.length > 100) {
    return { ok: false, error: "Unknown project." };
  }
  if (direction !== "up" && direction !== "down") return { ok: false, error: "Invalid value." };

  const result = await moveHighPriority(getDb(), name, direction);
  if (result.ok) return { ok: true };
  return {
    ok: false,
    error:
      result.error === "not_starred"
        ? "Star the project first to rank it."
        : "That project was not found.",
  };
}

/**
 * Makes a project the Focus Project. Switching away from the current one needs a typed reason,
 * which is logged. Only the signed-in owner can call it.
 */
export async function setFocusAction(name: string, reason: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change your focus." };
  if (typeof name !== "string" || name.length === 0 || name.length > 100) {
    return { ok: false, error: "Unknown project." };
  }
  if (typeof reason !== "string") return { ok: false, error: "Invalid reason." };

  const result = await setFocus(getDb(), name, reason);
  return result.ok ? { ok: true } : { ok: false, error: FOCUS_ERROR_MESSAGES[result.error] };
}

/**
 * Marks a project finished (nothing to deploy) or deployed (live at an address). If it was the
 * focus project, focus is freed. Only the signed-in owner can call it.
 */
export async function markDoneAction(
  name: string,
  kind: string,
  liveUrl: string,
  finishedOn?: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change a project." };
  if (typeof name !== "string" || name.length === 0 || name.length > 100) {
    return { ok: false, error: "Unknown project." };
  }
  if (kind !== "finished" && kind !== "deployed") return { ok: false, error: "Invalid choice." };
  if (typeof liveUrl !== "string" || liveUrl.length > 300) {
    return { ok: false, error: "That address is too long." };
  }

  if (finishedOn !== undefined && (typeof finishedOn !== "string" || finishedOn.length > 10)) {
    return { ok: false, error: DONE_ERROR_MESSAGES.invalid_date };
  }

  // "Today" is the owner's date, so a project finished this evening is not "in the future".
  const today = localDate(new Date(), await requestTimeZone());
  const result = await markDone(getDb(), name, kind, liveUrl, new Date(), { finishedOn, today });
  return result.ok ? { ok: true } : { ok: false, error: DONE_ERROR_MESSAGES[result.error] };
}

/**
 * Changes the day a finished or deployed project is recorded as done. Only the signed-in owner
 * can call it.
 */
export async function setFinishedDateAction(name: string, date: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change a project." };
  if (typeof name !== "string" || name.length === 0 || name.length > 100) {
    return { ok: false, error: "Unknown project." };
  }
  if (typeof date !== "string" || date.length > 10) {
    return { ok: false, error: DONE_ERROR_MESSAGES.invalid_date };
  }
  const today = localDate(new Date(), await requestTimeZone());
  const result = await setFinishedDate(getDb(), name, date, today);
  return result.ok ? { ok: true } : { ok: false, error: DONE_ERROR_MESSAGES[result.error] };
}

/** Puts a finished or deployed project back in the backlog. Only the signed-in owner can call it. */
export async function reopenAction(name: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change a project." };
  if (typeof name !== "string" || name.length === 0 || name.length > 100) {
    return { ok: false, error: "Unknown project." };
  }
  const result = await reopenProject(getDb(), name);
  return result.ok ? { ok: true } : { ok: false, error: DONE_ERROR_MESSAGES[result.error] };
}

/**
 * Sets whether a repo is a project, practice code or school work. Only projects can take focus.
 * Only the signed-in owner can call it.
 */
export async function setKindAction(name: string, kind: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change a project." };
  if (typeof name !== "string" || name.length === 0 || name.length > 100) {
    return { ok: false, error: "Unknown project." };
  }
  if (!isProjectKind(kind)) return { ok: false, error: "Invalid type." };

  const result = await setKind(getDb(), name, kind);
  return result.ok ? { ok: true } : { ok: false, error: KIND_ERROR_MESSAGES[result.error] };
}

/**
 * Turns Away mode on until a return date ("YYYY-MM-DD"), or off with null. While it is on,
 * stalled alerts are paused. Only the signed-in owner can call it. The page is refreshed so the
 * alerts, which are worked out on the server, match.
 */
export async function setAwayAction(returnDate: string | null): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change Away mode." };
  if (returnDate !== null && (typeof returnDate !== "string" || returnDate.length > 10)) {
    return { ok: false, error: AWAY_ERROR_MESSAGES.invalid_date };
  }

  const result = await setAwayUntil(
    getDb(),
    returnDate,
    localDate(new Date(), await requestTimeZone()),
  );
  if (!result.ok) return { ok: false, error: AWAY_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/**
 * Saves the stall threshold and the repo filters. Only the signed-in owner can call it. The
 * dashboard is refreshed because both change what it shows.
 */
export async function saveSettingsAction(values: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change settings." };

  const result = await saveSettings(getDb(), values);
  if (!result.ok) return { ok: false, error: SETTINGS_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

export type ItemResult = { ok: true; item: ChecklistItem } | { ok: false; error: string };
export type ItemsResult = { ok: true; items: ChecklistItem[] } | { ok: false; error: string };

function validName(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.length <= 100;
}

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

/** Adds an item to a project's definition-of-done checklist. Only the signed-in owner can call it. */
export async function addChecklistItemAction(name: string, label: string): Promise<ItemResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change the checklist." };
  if (!validName(name)) return { ok: false, error: "Unknown project." };
  const result = await addChecklistItem(getDb(), name, label);
  return result.ok ? result : { ok: false, error: CHECKLIST_ERROR_MESSAGES[result.error] };
}

/** Fills an empty checklist with the suggested items. Only the signed-in owner can call it. */
export async function addSuggestedChecklistAction(name: string): Promise<ItemsResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change the checklist." };
  if (!validName(name)) return { ok: false, error: "Unknown project." };
  const result = await addSuggestedChecklist(getDb(), name);
  return result.ok ? result : { ok: false, error: CHECKLIST_ERROR_MESSAGES[result.error] };
}

/** Ticks or unticks a checklist item. Only the signed-in owner can call it. */
export async function setChecklistCheckedAction(
  id: number,
  checked: boolean,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change the checklist." };
  if (!validId(id) || typeof checked !== "boolean") return { ok: false, error: "Invalid item." };
  const result = await setChecklistChecked(getDb(), id, checked);
  return result.ok ? { ok: true } : { ok: false, error: CHECKLIST_ERROR_MESSAGES[result.error] };
}

/** Deletes a checklist item. Only the signed-in owner can call it. */
export async function removeChecklistItemAction(id: number): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to change the checklist." };
  if (!validId(id)) return { ok: false, error: "Invalid item." };
  const result = await removeChecklistItem(getDb(), id);
  return result.ok ? { ok: true } : { ok: false, error: CHECKLIST_ERROR_MESSAGES[result.error] };
}

type Failed = { ok: false; error: string; message: string };

/** The tracked repo's full name and the owner's GitHub token, or a reason to stop. */
async function repoAccess(
  name: string,
): Promise<{ ok: true; fullName: string; token: string } | Failed> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "signed_out", message: "Sign in to add to a project." };
  }
  if (typeof name !== "string" || name.length === 0 || name.length > 100) {
    return { ok: false, error: "unknown_project", message: "Unknown project." };
  }
  const [row] = await getDb().select().from(projects).where(eq(projects.name, name));
  if (!row) return { ok: false, error: "unknown_project", message: "That project was not found." };
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "signed_out", message: "Sign in to add to a project." };
  return { ok: true, fullName: row.fullName, token };
}

/**
 * Adds a task to a repo's GitHub Project. Without `confirm` it only returns a preview of what
 * would be created; with it, the task is written. Only the signed-in owner can call it, and it
 * can only add: there is no action to edit, reorder or delete a task.
 */
export async function addTaskAction(
  name: string,
  input: unknown,
  confirm: boolean,
): Promise<AddTaskResult | Failed> {
  const access = await repoAccess(name);
  if (!access.ok) return access;
  try {
    return await addTask(
      {
        writer: createRepoWriter(access.token),
        projects: createProjectsApi(access.token),
        fullName: access.fullName,
      },
      input,
      confirm === true,
    );
  } catch (error) {
    const message = explainAddError(error);
    if (message === null) throw error;
    return { ok: false, error: "github", message };
  }
}

/**
 * Adds a milestone to a repo. Without `confirm` it only returns a preview. Only the signed-in
 * owner can call it.
 */
export async function addMilestoneAction(
  name: string,
  input: unknown,
  confirm: boolean,
): Promise<AddMilestoneResult | Failed> {
  const access = await repoAccess(name);
  if (!access.ok) return access;
  try {
    return await addMilestone(
      { writer: createRepoWriter(access.token), fullName: access.fullName },
      input,
      confirm === true,
    );
  } catch (error) {
    const message = explainAddError(error);
    if (message === null) throw error;
    return { ok: false, error: "github", message };
  }
}
