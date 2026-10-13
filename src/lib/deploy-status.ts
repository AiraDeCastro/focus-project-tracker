import type { DeployState, DeployStatus } from "./types";

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
