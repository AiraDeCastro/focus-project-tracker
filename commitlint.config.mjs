// Conventional Commits: https://www.conventionalcommits.org
//   <type>(<optional scope>): <subject>
// Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
// The subject starts lowercase, uses the imperative ("add", not "added"), and has no final period.
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [2, "always", 100],
  },
};

export default config;
