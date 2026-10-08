// Fails when `npm audit` finds a vulnerability that is not on the reviewed allow-list.
//
// Rules:
//   1. Any vulnerability in production dependencies fails, with no exceptions.
//   2. A vulnerability in development tooling fails unless its advisory is listed in
//      audit-allowlist.json with a reason and a review date. Entries expire, so an exception
//      cannot be forgotten.
//   3. An allow-list entry for an advisory that no longer appears is reported, so it can be removed.
import { execSync } from "node:child_process";
import fs from "node:fs";

function audit(args) {
  try {
    return JSON.parse(
      execSync(`npm audit ${args} --json`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch (error) {
    // npm audit exits non-zero when it finds something; the report is still on stdout.
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

/** Advisory ids ("GHSA-...") found anywhere in a report, with the package they were raised on. */
function advisories(report) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via === "object" && via.url) {
        const id = via.url.split("/").pop();
        found.set(id, {
          id,
          package: via.name,
          severity: via.severity,
          title: via.title,
          url: via.url,
        });
      }
    }
  }
  return found;
}

const allowlist = JSON.parse(
  fs.readFileSync(new URL("../audit-allowlist.json", import.meta.url), "utf8"),
);
const today = new Date().toISOString().slice(0, 10);
const problems = [];

const prod = advisories(audit("--omit=dev"));
for (const a of prod.values()) {
  problems.push(
    `Production dependency vulnerability (never allowed): ${a.package} ${a.severity}: ${a.title}\n    ${a.url}`,
  );
}

const all = advisories(audit(""));
const allowed = new Map(allowlist.entries.map((e) => [e.id, e]));
for (const a of all.values()) {
  if (prod.has(a.id)) continue;
  const entry = allowed.get(a.id);
  if (!entry) {
    problems.push(
      `New vulnerability in dev tooling: ${a.package} ${a.severity}: ${a.title}\n    ${a.url}\n    Fix it, or review it and add it to audit-allowlist.json.`,
    );
  } else if (entry.reviewBy < today) {
    problems.push(
      `Allow-list entry for ${a.id} (${a.package}) expired on ${entry.reviewBy}. Re-check whether a fix exists, then renew or remove it.`,
    );
  }
}
for (const entry of allowlist.entries) {
  if (!all.has(entry.id))
    console.warn(`Note: ${entry.id} is no longer reported. Remove it from audit-allowlist.json.`);
}

if (problems.length > 0) {
  console.error(`\nSecurity audit failed:\n\n${problems.map((p) => `  - ${p}`).join("\n\n")}\n`);
  process.exit(1);
}
const accepted = [...all.values()].filter((a) => allowed.has(a.id));
console.log(
  `Audit passed: no production vulnerabilities, ${accepted.length} reviewed dev-tooling exception(s).`,
);
for (const a of accepted) console.log(`  - ${a.id} (${a.package}): ${allowed.get(a.id).reason}`);
