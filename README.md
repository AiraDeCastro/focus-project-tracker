# Focus Project Tracker

A personal dashboard that pulls your GitHub repos, shows milestone progress per repo as a line graph, and keeps you on one Focus Project until it is deployed or finished.

Docs: [PLANNING.md](PLANNING.md) (vision, architecture, stack) · [TASKS.md](TASKS.md) (milestones) · [CLAUDE.md](CLAUDE.md) (rules for Claude Code) · [mockup.html](mockup.html) (visual reference).

## Run it with example data

No accounts needed.

```bash
npm install
npm run dev
```

Open the URL it prints. `DATA_SOURCE=fixture` (the default) shows the example data from the mockup. `DATA_SOURCE=fixture-first-run` shows the same data with no focus project yet, so you can try picking one.

## Commit standards

Git hooks (Husky) run on every commit and block it when something fails.

- **Pre-commit:** formats and lints staged files, then `npm run verify`: dependency check, security audit, type check, lint (no warnings), unit tests, production build.
- **Commit message:** must follow [Conventional Commits](https://www.conventionalcommits.org), for example `feat(auth): add GitHub sign-in` or `fix(sync): keep status when a repo is renamed`. Subjects start lowercase, with no final period.
- **Audit exceptions:** a dev-tooling vulnerability with no available fix can be listed in `audit-allowlist.json` with a reason and review date. It expires and blocks commits again until re-checked. Production dependencies can never be listed.

Hooks are installed by `npm install` (the `prepare` script). Do not bypass them with `--no-verify`.

The same checks run on GitHub (`.github/workflows/ci.yml`) for every push to `main`, every pull request, and once a week for new security advisories.

## Scripts

| Command               | What it does                                         |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Start the dev server                                 |
| `npm run check`       | Quick check: type check, lint and unit tests         |
| `npm run verify`      | Everything the pre-commit hook runs (about a minute) |
| `npm run deps:check`  | Dependency tree, lockfile and npm warnings           |
| `npm run audit:check` | Security audit with the reviewed allow-list          |
| `npm run format`      | Format with Prettier                                 |
| `npm run db:generate` | Create a SQL migration after changing the schema     |
| `npm run db:migrate`  | Apply migrations to the database in `DATABASE_URL`   |

## Setup for real data

Set `DATA_SOURCE=github` in `.env.local` after finishing the steps below, run `npm run db:migrate` once, then `npm run dev`. Star a project to mark it high priority; those projects are listed first. Visiting the app signs you in with GitHub, syncs your repos into the database, and records one progress snapshot per repo per day, so the graph history starts on your first visit.

Copy `.env.example` to `.env.local` and fill it in. Never commit `.env.local`.

### 1. GitHub OAuth App (sign-in)

1. GitHub, Settings, Developer settings, OAuth Apps, New OAuth App.
2. Homepage URL: `http://localhost:3000`.
3. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`.
4. Create it, then generate a client secret.
5. Put the values in `.env.local`:
   - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
   - `ALLOWED_GITHUB_LOGIN`: your GitHub username. Nobody else can sign in.
   - `AUTH_SECRET`: run `openssl rand -base64 32`.

The app also accepts Auth.js's own names, `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`, in place of `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

An OAuth App allows one callback URL, so make a second OAuth App for the deployed site (callback `https://<your-domain>/api/auth/callback/github`).

Scope: the app asks for `read:user repo` so private repos show up. GitHub has no read-only scope for private repos on OAuth Apps; the app only reads. For public repos only, set `GITHUB_SCOPE="read:user public_repo"`.

### 2. Turso database

Turso hosts the database in production. Locally you can skip it: with `DATABASE_URL` empty the app uses a `local.db` file.

**Pick the libSQL engine.** Turso now offers two engines. This app uses `@libsql/client`, which is for the **libSQL** engine (the default). Do not choose the newer "Turso" engine (`--tursodb`); the docs do not say whether our client works with it.

**Create it in the web dashboard** (no command line needed; the Turso CLI only runs on Linux, macOS, or Windows through WSL):

1. Sign up or log in at https://app.turso.tech (signing in with GitHub is fine).
2. Create a database named `focus-project-tracker`. Choose the libSQL engine and a region near your Vercel deployment (US East, Virginia, is the Vercel default).
3. Open the database and copy its URL. It looks like `libsql://focus-project-tracker-<your-org>.<region>.turso.io`. That is `DATABASE_URL`.
4. Create a database token for it (full access is fine for one owner) and copy it. That is `DATABASE_AUTH_TOKEN`. It is shown once.

**If you use the CLI** (Linux, macOS, or WSL): `turso auth login`, `turso db create focus-project-tracker`, `turso db show focus-project-tracker --url`, `turso db tokens create focus-project-tracker`.

**Keep the token secret.** Put it only in `.env.local` (ignored by git) and in Vercel's environment variables. Never paste it into chat, issues, or commits.

**Create the tables** (once, and again after any schema change). Add the two values to `.env.local`, then:

```bash
npm run db:migrate
```

It reads `.env.local`, prints which database it is using (the host, never the token), and is safe to run repeatedly. A wrong URL or token shows "Migration failed".

### 3. Resend (daily reminder email, Milestone 3)

Create a Resend account and an API key, then set `RESEND_API_KEY`.

### 4. Vercel

Import the GitHub repo in Vercel (every push to `main` then deploys). Production: https://focus-project-tracker.vercel.app. To switch it to real data, add the same environment variables in Vercel plus `DATA_SOURCE=github`, and register a production OAuth App with callback URL `https://focus-project-tracker.vercel.app/api/auth/callback/github`.
