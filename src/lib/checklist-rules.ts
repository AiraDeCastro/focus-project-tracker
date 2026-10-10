/** Checklist rules with no database code, so the dashboard can use them in the browser. */

export const CHECKLIST_LABEL_MAX = 120;
export const CHECKLIST_MAX_ITEMS = 20;

/** A starting set for the owner to keep, edit or delete. Nothing here is required. */
export const SUGGESTED_CHECKLIST = [
  "It runs from a clean checkout by following the README",
  "Tests pass",
  "No secrets or private notes in the repository",
  "It is live and reachable at its address",
] as const;

export type ChecklistError = "not_found" | "invalid_label" | "too_many" | "not_empty";

export const CHECKLIST_ERROR_MESSAGES: Record<ChecklistError, string> = {
  not_found: "That item was not found.",
  invalid_label: `Write an item of 1 to ${CHECKLIST_LABEL_MAX} characters.`,
  too_many: `A project can have at most ${CHECKLIST_MAX_ITEMS} items.`,
  not_empty: "Suggested items can only be added to an empty list.",
};

/** The label trimmed and with inner runs of whitespace collapsed, or null when it is not usable. */
export function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.replace(/\s+/g, " ").trim();
  return label.length >= 1 && label.length <= CHECKLIST_LABEL_MAX ? label : null;
}
