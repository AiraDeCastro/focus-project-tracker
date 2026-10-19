/** What a milestone's display date says when GitHub has no due date for it. */
export const NO_DUE_DATE = "No due date";

/**
 * A milestone's due date as words, so a missing date reads "no due date" instead of "due No due
 * date". `sentence` is for the middle of a line ("due Oct 22" or "no due date"); `label` is for
 * a heading ("Due Oct 22" or "No due date").
 */
export function dueText(due: string, form: "sentence" | "label"): string {
  if (due === NO_DUE_DATE) return form === "sentence" ? "no due date" : NO_DUE_DATE;
  return form === "sentence" ? `due ${due}` : `Due ${due}`;
}
