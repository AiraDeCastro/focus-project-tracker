/**
 * A small client for GitHub Projects (v2), which are only reachable through GraphQL. Plain `fetch`,
 * no SDK. The token is only ever sent in the Authorization header; it is never put in an error
 * message or a log. Reading needs the `read:project` scope and writing needs `project`; a token
 * without them gets `ProjectScopeError`.
 *
 * Phase 5 (Milestone 5). The query shapes follow GitHub's documentation and have NOT yet been run
 * against a real Project, so every read is defensive: an entry that does not look right is skipped
 * and counted, not trusted.
 */

const ENDPOINT = "https://api.github.com/graphql";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const MAX_TITLE = 256;

/** A Project the app can find, by id (the GraphQL node id) and by the number in its address. */
export interface ProjectRef {
  id: string;
  number: number;
  title: string;
  url: string;
  /** True when the Project is linked to the repo, false when it was only found by title. */
  linked: boolean;
}

/** One issue on a Project, with its Status. Draft items and pull requests are not returned. */
export interface ProjectItem {
  /** The Project item's own id; needed to change its Status. */
  itemId: string;
  /** The issue's node id. */
  issueId: string;
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  milestone: { number: number; title: string } | null;
  /** The Status option's name, or null when none is set. */
  status: string | null;
}

export interface ProjectItems {
  items: ProjectItem[];
  /** Entries that were drafts, pull requests, redacted or not readable. */
  skipped: number;
}

/** The Project's Status field and the ids of its options, by name. */
export interface StatusField {
  fieldId: string;
  options: { id: string; name: string }[];
}

export interface Viewer {
  id: string;
  login: string;
}

export interface ProjectsApi {
  /** The signed-in owner; the Project owner's id is needed to create one. */
  viewer(): Promise<Viewer>;
  /** The node id of a repo, for linking a new Project to it. */
  repositoryId(fullName: string): Promise<string>;
  /**
   * Finds a repo's Project. Looks at the Projects linked to the repo first, then at the owner's
   * own Projects, and in both cases matches by title (the repo's name, ignoring case) and skips
   * closed Projects. Returns null when there is none, so the caller can create it.
   */
  findProject(fullName: string): Promise<ProjectRef | null>;
  listItems(projectId: string): Promise<ProjectItems>;
  statusField(projectId: string): Promise<StatusField | null>;
  /** Creates a Project owned by `ownerId` and links it to `repositoryId`. */
  createProject(input: {
    ownerId: string;
    repositoryId: string;
    title: string;
  }): Promise<ProjectRef>;
  /** Adds an issue to a Project; returns the new item's id. Adding it twice returns the same item. */
  addIssue(projectId: string, issueId: string): Promise<string>;
  setStatus(input: {
    projectId: string;
    itemId: string;
    fieldId: string;
    optionId: string;
  }): Promise<void>;
}

export interface ProjectsApiOptions {
  /** Replaces the global `fetch`; used by tests. */
  fetch?: typeof fetch;
}

/** The token cannot read or edit Projects: sign in again so GitHub can ask for the Projects scope. */
export class ProjectScopeError extends Error {
  readonly needsWrite: boolean;
  constructor(needsWrite: boolean) {
    super(
      needsWrite
        ? "GitHub needs permission to change your Projects. Sign in again to grant it."
        : "GitHub needs permission to read your Projects. Sign in again to grant it.",
    );
    this.name = "ProjectScopeError";
    this.needsWrite = needsWrite;
  }
}

/**
 * GitHub answered with an error. Shaped like Octokit's request error (a `status` and the response
 * headers), so `translateGithubError` turns a 401 or a rate limit into the right notice.
 */
export class GithubGraphqlError extends Error {
  readonly status: number;
  readonly response: { headers: Record<string, string> };
  constructor(message: string, status: number, headers: Record<string, string> = {}) {
    super(message);
    this.name = "GithubGraphqlError";
    this.status = status;
    this.response = { headers };
  }
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

function split(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new Error(`Expected "owner/name", got "${fullName}"`);
  return { owner, repo };
}

function requireId(value: string, what: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`A ${what} is required.`);
  }
  return value;
}

/** Turns one Project node from GitHub into the app's shape; null when it is not usable. */
export function readProject(raw: unknown, linked: boolean): ProjectRef | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id);
  const title = text(raw.title);
  if (!id || !title || typeof raw.number !== "number") return null;
  return { id, number: raw.number, title, url: text(raw.url) ?? "", linked };
}

/** Turns one item of a Project into the app's shape; null for drafts, pull requests and the rest. */
export function readItem(raw: unknown): ProjectItem | null {
  if (!isObject(raw) || !isObject(raw.content)) return null;
  const content = raw.content;
  const itemId = text(raw.id);
  const issueId = text(content.id);
  const title = text(content.title);
  const state = content.state === "OPEN" ? "open" : content.state === "CLOSED" ? "closed" : null;
  // The query only fills `id`, `number`, `title` and `state` for an Issue, so a pull request, a draft
  // item or a redacted one arrives without them and is skipped here.
  if (!itemId || !issueId || !title || !state || typeof content.number !== "number") return null;
  const milestone =
    isObject(content.milestone) &&
    typeof content.milestone.number === "number" &&
    text(content.milestone.title)
      ? { number: content.milestone.number, title: text(content.milestone.title) as string }
      : null;
  const status = isObject(raw.status) ? text(raw.status.name) : null;
  return {
    itemId,
    issueId,
    number: content.number,
    title,
    url: text(content.url) ?? "",
    state,
    milestone,
    status,
  };
}

const PROJECT_FIELDS = "id number title url closed";

const ITEMS_QUERY = `query($id: ID!, $after: String) {
  node(id: $id) {
    ... on ProjectV2 {
      items(first: ${PAGE_SIZE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content {
            __typename
            ... on Issue { id number title url state milestone { number title } }
          }
          status: fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
        }
      }
    }
  }
}`;

export function createProjectsApi(token: string, options: ProjectsApiOptions = {}): ProjectsApi {
  const doFetch = options.fetch ?? fetch;

  async function run(query: string, variables: Json, write = false): Promise<Json> {
    const response = await doFetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      const headers: Record<string, string> = {};
      for (const name of ["x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"]) {
        const value = response.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      throw new GithubGraphqlError(`GitHub answered ${response.status}.`, response.status, headers);
    }
    const body: unknown = await response.json();
    if (!isObject(body)) throw new GithubGraphqlError("GitHub sent an unreadable answer.", 502);
    const errors = asArray(body.errors).filter(isObject);
    if (errors.length > 0) {
      const types = errors.map((e) => String(e.type ?? ""));
      const messages = errors.map((e) => String(e.message ?? ""));
      if (types.includes("INSUFFICIENT_SCOPES") || messages.some((m) => /scope/i.test(m))) {
        throw new ProjectScopeError(write);
      }
      if (types.includes("RATE_LIMITED")) {
        throw new GithubGraphqlError("GitHub is limiting requests.", 429);
      }
      // Messages come from GitHub, not from the request, so the token cannot be in them.
      throw new GithubGraphqlError(
        `GitHub could not do that: ${messages.filter(Boolean).join("; ") || "unknown error"}`,
        200,
      );
    }
    return isObject(body.data) ? body.data : {};
  }

  return {
    async viewer() {
      const data = await run("query { viewer { id login } }", {});
      const viewer = isObject(data.viewer) ? data.viewer : null;
      const id = text(viewer?.id);
      const login = text(viewer?.login);
      if (!id || !login) throw new GithubGraphqlError("GitHub did not say who you are.", 502);
      return { id, login };
    },

    async repositoryId(fullName) {
      const { owner, repo } = split(fullName);
      const data = await run(
        "query($o: String!, $n: String!) { repository(owner: $o, name: $n) { id } }",
        { o: owner, n: repo },
      );
      const id = isObject(data.repository) ? text(data.repository.id) : null;
      if (!id) throw new GithubGraphqlError(`GitHub could not find ${fullName}.`, 404);
      return id;
    },

    async findProject(fullName) {
      const { owner, repo } = split(fullName);
      const wanted = repo.toLowerCase();
      const open = (nodes: unknown, linked: boolean) =>
        asArray(nodes)
          .filter((n) => isObject(n) && n.closed !== true)
          .map((n) => readProject(n, linked))
          .filter((p): p is ProjectRef => p !== null)
          .filter((p) => p.title.toLowerCase() === wanted);

      const linkedData = await run(
        `query($o: String!, $n: String!) { repository(owner: $o, name: $n) { projectsV2(first: 20) { nodes { ${PROJECT_FIELDS} } } } }`,
        { o: owner, n: repo },
      );
      const repository = isObject(linkedData.repository) ? linkedData.repository : null;
      const linked = open(
        isObject(repository?.projectsV2) ? repository.projectsV2.nodes : null,
        true,
      );
      if (linked.length > 0) return linked[0];

      const ownData = await run(
        `query($login: String!) { user(login: $login) { projectsV2(first: 50) { nodes { ${PROJECT_FIELDS} } } } }`,
        { login: owner },
      );
      const user = isObject(ownData.user) ? ownData.user : null;
      const own = open(isObject(user?.projectsV2) ? user.projectsV2.nodes : null, false);
      return own[0] ?? null;
    },

    async listItems(projectId) {
      requireId(projectId, "Project id");
      const items: ProjectItem[] = [];
      let skipped = 0;
      let after: string | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const data = await run(ITEMS_QUERY, { id: projectId, after });
        const node = isObject(data.node) ? data.node : null;
        const connection = isObject(node?.items) ? node.items : null;
        for (const raw of asArray(connection?.nodes)) {
          const item = readItem(raw);
          if (item) items.push(item);
          else skipped += 1;
        }
        const info = isObject(connection?.pageInfo) ? connection.pageInfo : null;
        after = text(info?.endCursor);
        if (info?.hasNextPage !== true || !after) break;
      }
      return { items, skipped };
    },

    async statusField(projectId) {
      requireId(projectId, "Project id");
      const data = await run(
        `query($id: ID!) { node(id: $id) { ... on ProjectV2 { field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } } } } }`,
        { id: projectId },
      );
      const node = isObject(data.node) ? data.node : null;
      const field = isObject(node?.field) ? node.field : null;
      const fieldId = text(field?.id);
      if (!fieldId) return null;
      const options = asArray(field?.options)
        .filter(isObject)
        .map((o) => ({ id: text(o.id), name: text(o.name) }))
        .filter((o): o is { id: string; name: string } => o.id !== null && o.name !== null);
      return { fieldId, options };
    },

    async createProject({ ownerId, repositoryId, title }) {
      requireId(ownerId, "owner id");
      requireId(repositoryId, "repository id");
      const clean = title.trim();
      if (!clean || clean.length > MAX_TITLE) {
        throw new Error(`A Project title needs 1 to ${MAX_TITLE} characters.`);
      }
      const data = await run(
        `mutation($input: CreateProjectV2Input!) { createProjectV2(input: $input) { projectV2 { ${PROJECT_FIELDS} } } }`,
        { input: { ownerId, repositoryId, title: clean } },
        true,
      );
      const created = isObject(data.createProjectV2) ? data.createProjectV2.projectV2 : null;
      const project = readProject(created, true);
      if (!project) throw new GithubGraphqlError("GitHub did not return the new Project.", 502);
      return project;
    },

    async addIssue(projectId, issueId) {
      requireId(projectId, "Project id");
      requireId(issueId, "issue id");
      const data = await run(
        `mutation($input: AddProjectV2ItemByIdInput!) { addProjectV2ItemById(input: $input) { item { id } } }`,
        { input: { projectId, contentId: issueId } },
        true,
      );
      const result = isObject(data.addProjectV2ItemById) ? data.addProjectV2ItemById : null;
      const id = isObject(result?.item) ? text(result.item.id) : null;
      if (!id) throw new GithubGraphqlError("GitHub did not return the new item.", 502);
      return id;
    },

    async setStatus({ projectId, itemId, fieldId, optionId }) {
      requireId(projectId, "Project id");
      requireId(itemId, "item id");
      requireId(fieldId, "field id");
      requireId(optionId, "option id");
      await run(
        `mutation($input: UpdateProjectV2ItemFieldValueInput!) { updateProjectV2ItemFieldValue(input: $input) { projectV2Item { id } } }`,
        { input: { projectId, itemId, fieldId, value: { singleSelectOptionId: optionId } } },
        true,
      );
    },
  };
}
