"use server";

import { auth } from "@/auth";
import { getDb } from "@/db/client";
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
