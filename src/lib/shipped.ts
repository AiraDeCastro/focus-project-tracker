/** What the owner just finished or deployed while it was their focus project. */
export interface Shipped {
  name: string;
  kind: "finished" | "deployed";
}

/**
 * The words on the pick-your-next-focus card right after the focus project ships: a pill saying
 * what happened and a heading that points at the suggested next project, if there is one.
 */
export function shippedPrompt(
  shipped: Shipped,
  nextName: string | undefined,
): { pill: string; heading: string } {
  return {
    pill: `${shipped.name} is ${shipped.kind === "deployed" ? "live" : "finished"}`,
    heading: nextName ? `Nice work. Next up: ${nextName}` : "Nice work. Pick your next project",
  };
}
