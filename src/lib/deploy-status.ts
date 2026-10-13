import type { DeployCheck, DeployState, DeployStatus } from "./types";

/** A Vercel project as the app needs it: its production addresses and its latest production build. */
export interface VercelProject {
  name: string;
  /** Hostnames the production deployment answers on, lower case, without a scheme. */
  domains: string[];
  state: DeployState;
  /** ISO time of that production deployment. */
  at: string | null;
}

/** The hostname of an address, lower case and without "www.", or null when it is not an http(s) address. */
export function hostOf(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    const url = new URL(address.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Maps Vercel's `readyState` to the few states the dashboard shows; null for anything unknown. */
export function stateFromVercel(readyState: unknown): DeployState | null {
  switch (typeof readyState === "string" ? readyState.toUpperCase() : "") {
    case "READY":
      return "ready";
    case "ERROR":
      return "failed";
    case "BUILDING":
    case "INITIALIZING":
      return "building";
    case "QUEUED":
      return "queued";
    case "CANCELED":
      return "canceled";
    default:
      return null;
  }
}

/**
 * Finds the Vercel project behind a repo. The link is the repo's homepage address (or, for a
 * project the owner marked deployed, its live address): whichever of the two matches one of a
 * Vercel project's production hostnames. A repo with neither gets no status.
 */
export function deployStatusFor(
  addresses: (string | null | undefined)[],
  projects: VercelProject[],
): DeployStatus | null {
  const hosts = addresses.map(hostOf).filter((h): h is string => !!h);
  for (const host of hosts) {
    const match = projects.find((p) => p.domains.includes(host));
    if (match) return { state: match.state, at: match.at };
  }
  return null;
}

/** Display text for the card pill. */
export function describeDeployStatus(status: DeployStatus): {
  label: string;
  tone: "good" | "bad" | "quiet";
} {
  switch (status.state) {
    case "ready":
      return { label: "Live on Vercel", tone: "good" };
    case "failed":
      return { label: "Last deploy failed", tone: "bad" };
    case "building":
      return { label: "Deploying...", tone: "quiet" };
    case "queued":
      return { label: "Deploy queued", tone: "quiet" };
    case "canceled":
      return { label: "Last deploy canceled", tone: "quiet" };
  }
}

/** The error text that is safe to show: ours, never a raw network message. */
export function safeVercelMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  return /^Vercel answered \d{3}\.$/.test(text) ? text : "Could not reach Vercel.";
}

/** One line for the dashboard footer that explains the deploy pills, or why there are none. */
export function describeDeployCheck(check: DeployCheck): string {
  if (check.status === "failed") return `Vercel: ${check.message ?? "could not be read."}`;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  let text = `Vercel: read ${plural(check.projects, "project")}`;
  if (check.skipped > 0) text += ` (could not read ${check.skipped} more)`;
  text += `, ${plural(check.matched, "repo")} matched a homepage.`;
  if (check.matched === 0 && check.sample.length > 0) {
    text += ` Vercel's addresses: ${check.sample.join("; ")}.`;
  }
  return text;
}
