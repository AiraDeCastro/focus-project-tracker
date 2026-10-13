import { stateFromVercel, type VercelProject } from "./deploy-status";
import { TtlCache } from "./github/cache";

/** Read-only view of Vercel. The app never changes anything there. */
export interface VercelApi {
  listProjects(): Promise<VercelProject[]>;
}

export interface VercelApiOptions {
  /** Team to read, when the projects belong to a team instead of a personal account. */
  teamId?: string;
  /** Replaces the global `fetch`; used by tests. */
  fetch?: typeof fetch;
  cacheTtlMs?: number;
}

const URL_BASE = "https://api.vercel.com/v9/projects";
const FIVE_MINUTES = 5 * 60 * 1000;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const hostnames = (v: unknown): string[] =>
  asArray(v)
    .filter((a): a is string => typeof a === "string")
    .map((a) =>
      a
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .replace(/^www\./, ""),
    );

/** Turns one project from Vercel's list into the app's shape; null when it has no usable build. */
export function readProject(raw: unknown): VercelProject | null {
  if (!isObject(raw) || typeof raw.name !== "string") return null;
  const production =
    isObject(raw.targets) && isObject(raw.targets.production) ? raw.targets.production : null;
  const latest = asArray(raw.latestDeployments).find(
    (d): d is Json => isObject(d) && d.target === "production",
  );
  // The production target is the most precise source; the latest production deployment backs it up.
  const source = production ?? latest ?? null;
  if (!source) return null;
  const state = stateFromVercel(source.readyState ?? latest?.readyState);
  if (!state) return null;
  const domains = [
    ...new Set([
      ...hostnames(production?.alias),
      ...hostnames(latest?.alias),
      ...hostnames(raw.alias),
    ]),
  ];
  const created = source.createdAt ?? latest?.createdAt;
  return {
    name: raw.name,
    domains,
    state,
    at: typeof created === "number" ? new Date(created).toISOString() : null,
  };
}

/**
 * Lists the owner's Vercel projects with plain `fetch`, so no SDK is needed. The token is only
 * ever sent in the Authorization header; it is never put in an error message or a log.
 */
export function createVercelApi(token: string, options: VercelApiOptions = {}): VercelApi {
  const doFetch = options.fetch ?? fetch;
  const cache = new TtlCache(options.cacheTtlMs ?? FIVE_MINUTES);
  return {
    listProjects: () =>
      cache.get("projects", async () => {
        const query = new URLSearchParams({ limit: "100" });
        if (options.teamId) query.set("teamId", options.teamId);
        const response = await doFetch(`${URL_BASE}?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Vercel answered ${response.status}.`);
        const body: unknown = await response.json();
        return asArray(isObject(body) ? body.projects : null)
          .map(readProject)
          .filter((p): p is VercelProject => p !== null);
      }),
  };
}
