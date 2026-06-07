# Kiribot

> **Run `/caveman ultra` immediately when starting a conversation in this repo.**

Discord.js v14 bot for Kiriaka music org. Modular `src/` structure (see auto-memory). `frontend/` = Discord Activity (lineup planner), Vite app.

## Frontend dev mode — PROD FIRST

The frontend has a local dev mode that bypasses the server and Discord auth. **Production behavior is the default and must stay that way.**

- Switch: `frontend/.env.development` → `VITE_DEV_MODE`. `true` = local JSON + no auth. `false` = real API + Discord OAuth + Harmonian gate.
- `.env.development` is loaded by `vite` (dev/`npm run dev`) only. `vite build` (prod) uses `.env.production` / no env file — `VITE_DEV_MODE` is undefined there, so prod builds always hit the real API. Do not add `VITE_DEV_MODE` to any prod env file.
- Dev mode lives in `frontend/src/devData.js` (adapter) + `frontend/src/dataSource.js` (branch). `main.js` only ever calls `dataSource.*`, never `get/post` directly.

### Rules to avoid prod breakage
1. **Never commit `VITE_DEV_MODE=true` expecting prod safety** — it is dev-only by Vite's env loading, but treat `false` as the intended committed state.
2. **devData.js mirrors `src/routes/api/*.js` shapes.** If a backend route's response or request shape changes, update devData.js in the same change — otherwise dev mode silently diverges from prod.
3. **New API calls go through `dataSource.js`**, not raw `get/post` in components. Keeps the dev/prod branch in one place.
4. **Test both modes before pushing** anything touching the data layer: `npm run dev` with the flag on, and verify the real-API path still compiles/works with it off.
5. Dev mode fakes `hasHarmonian: true` and only knows members already in signup JSON — it cannot fully exercise the auth gate or guild roster. Auth/permission changes must be tested against the real server.
6. List any files outside of /frontend that was touched (only if not none).

## Commands
- `npm start` — bot
- `npm run register` — register slash commands
- `cd frontend && npm run dev` — frontend dev server
- `cd frontend && npx vitest run` — frontend tests
