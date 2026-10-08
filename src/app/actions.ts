"use server";

import { auth } from "@/auth";
import { getDb } from "@/db/client";
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
