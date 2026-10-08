"use server";

import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { DONE_ERROR_MESSAGES, markDone, reopenProject } from "@/lib/done";
import { FOCUS_ERROR_MESSAGES, setFocus } from "@/lib/focus";
import { setHighPriority } from "@/lib/priority";

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

  const result = await markDone(getDb(), name, kind, liveUrl);
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
