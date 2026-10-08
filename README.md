# Focus Project Tracker

A personal dashboard that pulls your GitHub repos, shows milestone progress per repo as a line graph, and keeps you on one Focus Project until it is deployed or finished.

Docs: [PLANNING.md](PLANNING.md) (vision, architecture, stack) · [TASKS.md](TASKS.md) (milestones) · [CLAUDE.md](CLAUDE.md) (rules for Claude Code) · [mockup.html](mockup.html) (visual reference).

## Run it with example data

No accounts needed.

```bash
npm install
npm run dev
```

Open the URL it prints. `DATA_SOURCE=fixture` (the default) shows the example data from the mockup.

## Scripts

| Command               | What it does                                        |
| --------------------- | --------------------------------------------------- |
| `npm run dev`         | Start the dev server                                |
| `npm run check`       | Type check, lint and unit tests (run before commit) |
| `npm run format`      | Format with Prettier                                |
| `npm run db:generate` | Create a SQL migration after changing the schema    |
| `npm run db:migrate`  | Apply migrations to the database in `DATABASE_URL`  |

## Setup for real data

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

An OAuth App allows one callback URL, so make a second OAuth App for the deployed site (callback `https://<your-domain>/api/auth/callback/github`).

Scope: the app asks for `read:user repo` so private repos show up. GitHub has no read-only scope for private repos on OAuth Apps; the app only reads. For public repos only, set `GITHUB_SCOPE="read:user public_repo"`.

### 2. Turso database

```bash
turso db create focus-project-tracker
turso db show focus-project-tracker --url        # DATABASE_URL
turso db tokens create focus-project-tracker     # DATABASE_AUTH_TOKEN
npm run db:migrate
```

For local development you can skip Turso: leave `DATABASE_URL` empty and the app uses a local `local.db` file.

### 3. Resend (daily reminder email, Milestone 3)

Create a Resend account and an API key, then set `RESEND_API_KEY`.

### 4. Vercel

Import the GitHub repo in Vercel, add the same environment variables, and set the production OAuth App callback URL.
