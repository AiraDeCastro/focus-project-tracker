# Set up Focus Trail on another computer

Use this when the project folder is not on the computer in front of you, for example to run
`npm run db:migrate` or to work on the app somewhere new. It needs no GitHub or Vercel secrets.
Commands are for Windows PowerShell; Mac and Linux notes are at the end.

## 1. Install two programs

Skip any you already have.

- Node.js, the LTS version: https://nodejs.org
- Git: https://git-scm.com/download/win

Close every open terminal afterwards, then open a new PowerShell window. Use a normal one, not
"Run as administrator" (that window starts in `C:\Windows\system32`, which is the wrong place).
Check that both programs work:

```
node -v
git --version
```

Both should print a version number. If you see "not recognized", the terminal was open before the
install; close it and open a new one.

## 2. Download the project

Open PowerShell in the folder where you keep code (in File Explorer, click the address bar, type
`powershell` and press Enter), then run:

```
git clone https://github.com/AiraDeCastro/focus-project-tracker.git
cd focus-project-tracker
```

The repository is public, so cloning needs no sign-in.

## 3. Choose the right branch

`main` is the released code. If a change is waiting for review (for example, a new database
migration), check out its branch instead:

```
git fetch
git checkout <branch-name>
```

To see what is available: `git branch -r`.

## 4. Install the packages

```
npm install
```

This takes a minute or two.

## 5. Create `.env.local`

This file holds secrets and is never committed (`.gitignore` blocks it). To run the migration you
only need the two database values:

1. Open https://turso.tech and choose the database `focus-project-tracker`.
2. Copy its URL (it starts with `libsql://`).
3. Create a new token for the database and copy it. A new token does not affect the one Vercel
   uses.
4. In the project folder, create a file named exactly `.env.local` containing:

   ```
   DATABASE_URL=libsql://your-database-url-here
   DATABASE_AUTH_TOKEN=your-token-here
   ```

In Notepad, choose File, Save As, set "Save as type" to **All files**, and type `.env.local` as
the name. With "Text documents" selected, Notepad saves `.env.local.txt` and the script will not
find it.

## 6. Run the migration

```
npm run db:migrate
```

The output names the database host it is using (never the token). It should show your Turso
host. If it says `file:local.db`, the script did not find `.env.local` or the values in it.
Running it again is safe: only missing migrations are applied.

## 7. Clean up on a computer that is not yours

- Delete the `focus-project-tracker` folder.
- In Turso, open the database, go to Tokens and revoke the token you made.

## Running the whole app on this computer (optional)

The migration needs only the two values above. To run the dashboard itself, copy the remaining
values from `.env.example` into `.env.local` and follow "Setup for real data" in `README.md`. The
quickest check needs none of them: set `DATA_SOURCE=fixture` (the default) and run `npm run dev`
to see the example dashboard at http://localhost:3000.

## Getting later changes

```
git pull
npm install
npm run db:migrate
```

Run `npm install` only when `package.json` changed, and `npm run db:migrate` only when a new file
appeared in `drizzle/`. Pushing your own changes needs you to sign in to GitHub on that computer.

## Mac and Linux

The steps are the same. Install Node from https://nodejs.org (or your package manager), then use
Terminal instead of PowerShell. Create `.env.local` with any text editor.
