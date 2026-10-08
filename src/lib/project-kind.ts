/**
 * What kind of work a repo is. Only a real `project` can become the Focus Project; practice code
 * and school work are tracked but never compete for focus. Safe to import in client code.
 */
export const PROJECT_KINDS = ["project", "practice", "school"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const KIND_LABEL: Record<ProjectKind, string> = {
  project: "Project",
  practice: "Practice",
  school: "School",
};

export function isProjectKind(value: unknown): value is ProjectKind {
  return typeof value === "string" && (PROJECT_KINDS as readonly string[]).includes(value);
}
