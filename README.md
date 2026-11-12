# Draw n Play – Netball Tactic Board

Node/Express + PostgreSQL web app (installable as a PWA).

## Run locally
You need a PostgreSQL database. Either install Postgres locally and create a database called `netball`, or create a free hosted one (Neon, Supabase) and copy its connection string.
```
npm install
set DATABASE_URL=postgres://user:password@host:5432/netball   (PowerShell: $env:DATABASE_URL="...")
npm start
```
Open http://localhost:3000. Tables and seed data (teams, players, rules, roles) are created automatically on first start.

## Configuration (environment variables)
| Variable       | Purpose                                                        | Default                                            |
|----------------|----------------------------------------------------------------|----------------------------------------------------|
| `PORT`         | HTTP port (hosts set this automatically)                       | 3000                                               |
| `DATABASE_URL` | PostgreSQL connection string (hosted databases use TLS automatically) | `postgres://postgres:postgres@localhost:5432/netball` |

Saved plays are associated with a browser ID stored in localStorage, not a user account. Clearing browser data or switching browsers or site addresses loses access to those plays. This is not a secure login: anyone with the ID can access its plays.

For playback, a ball drag ending near a player is matched to the nearest player. When the receiver has a recorded movement, the ball arrives as that movement ends. Drag the ball close to the intended receiver's destination; if players are close together the nearest player may not be the one intended. New saves preserve separate drags. Older saves do not identify separate passes, so playback can only match the final destination of the combined ball trail. Passes without a nearby receiver retain their recorded timing.

## Deploy an assignment demo on Render
The app runs on Render and uses the existing Supabase PostgreSQL database; no second database is needed. A private GitHub repository keeps the source private, but the deployed link is publicly accessible to anyone who has or discovers it. The app has no login, so do not use it for sensitive information.

1. Reset any exposed Supabase database password. Keep the new connection string out of the source and GitHub.
2. Create a GitHub repository and upload the project. A private repository keeps source code private; a public one exposes it. Exclude local databases, `node_modules` and environment files. Review the files before uploading.
3. In Render, choose **New > Web Service**, connect the private GitHub repository and select the free instance if available.
4. Choose Node, set the build command to `npm ci` and the start command to `npm start`.
5. Add `DATABASE_URL` as a Render environment variable, using the Supabase session pooler connection string with the current password. Do not share the value in logs or messages.
6. Deploy, open the provided HTTPS link, and check `/healthz` returns `{"ok":true}`. Test drawing, saving and playing a new play on the deployed site, then test on a phone.

The deployed site has its own browser ID; plays saved on localhost will not automatically appear there. Render's free service can sleep after inactivity and take about a minute to wake. Check the link before the assessment; free usage limits and Supabase project availability also apply.

Run the playback tests locally with `npm test`.

## Install on a phone or tablet (PWA)
The installed app opens full screen in landscape with no browser bar. It needs the HTTPS address.
- **Android (Chrome):** open the site, tap the menu (⋮) → **Install app** / **Add to Home screen**.
- **iPhone / iPad (Safari):** open the site, tap **Share** → **Add to Home Screen** → **Add**.
- Open it from the home-screen icon. The board loads without a connection; saved plays need one.

## Backups
Use the database host's backup or snapshot feature, or run `pg_dump` using a securely configured database connection. The app's "Download File" exports the board positions only, not the movement trails, and is not a full playable backup.

## Handover
- Keep host account, domain and repo credentials in your own accounts.
