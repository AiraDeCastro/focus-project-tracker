// Fails on dependency problems: a lockfile that is out of sync, missing or invalid packages,
// peer dependency conflicts, and any npm warning or error while resolving the tree.
import { spawnSync } from "node:child_process";

// One fixed command string and the shell, so it behaves the same on Windows and Linux.
function run(command) {
  const r = spawnSync(command, { encoding: "utf8", shell: true });
  return { status: r.status ?? 1, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const problems = [];

// 1. The installed tree must be valid (no missing, invalid, extraneous or conflicting packages).
const ls = run("npm ls --all");
if (ls.status !== 0) problems.push(`npm ls reports a problem:\n${ls.output.trim()}`);

// 2. Resolving the tree from package.json must not change anything and must not warn.
const dry = run("npm install --dry-run --no-audit --no-fund --ignore-scripts");
const noisy = dry.output.split("\n").filter((l) => /^npm (warn|error)/i.test(l));
if (dry.status !== 0 || noisy.length > 0) {
  problems.push(
    `npm install --dry-run reported warnings or errors:\n${(noisy.length ? noisy.join("\n") : dry.output).trim()}`,
  );
}
if (/\b(add|remove|change)d? \d+ packages?/i.test(dry.output) && !/up to date/i.test(dry.output)) {
  problems.push(
    `package.json and package-lock.json are out of sync. Run \`npm install\` and commit the lockfile.\n${dry.output.trim()}`,
  );
}

if (problems.length > 0) {
  console.error(`\nDependency check failed:\n\n${problems.map((p) => `  - ${p}`).join("\n\n")}\n`);
  process.exit(1);
}
console.log("Dependency check passed: tree is valid, lockfile is in sync, no npm warnings.");
