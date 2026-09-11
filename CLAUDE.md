# Kiribot

## ALWAYS: caveman ultra — first action of every conversation

Before your first response in this repo (before any reply, question, file read, or other tool call), invoke the Skill tool with `skill: "caveman:caveman"` and `args: "ultra"`. Do this even if a SessionStart hook already enabled caveman at a lower level (`full`) — the required level here is `ultra`, and the hook does not set it. Not optional; not a suggestion.

Subagents: every agent you spawn (Agent tool, Workflow, any `subagent_type`) must run at caveman ultra too. Start each subagent prompt with this line, verbatim:

```
First action: invoke the Skill tool with skill "caveman:caveman" and args "ultra". Respond in caveman ultra for the whole task (code, commits, PRs written normally).
```

Discord.js v14 bot for Kiriaka music org. Modular `src/` structure (see auto-memory). `frontend/` = Discord Activity (lineup planner), Vite app.

## ALWAYS: flag anything that touches the live Discord server

This bot runs against Kiriaka's live Discord server — dozens of real members, always on. Any action that will (or will on the next bot restart/deploy) post a message, DM someone, ping a role, edit/delete a message, or otherwise do something visible in the live server **must be called out explicitly, up front, before it happens** — not buried mid-explanation, not left implicit.

State plainly: what will happen, when (e.g. "next bot restart," "as soon as this config key is set"), and who sees it (channel name, DM, everyone).

Applies to: any `channel.send`/DM, any permanent panel/button message (e.g. `postArshjulPanel`), any role/permission change, any slash-command registration that changes visible bot behavior, and any manual deploy/config step that will trigger one of these on the real server. Say it before the user acts, not after.

## ALWAYS: use the nickname helpers for member names

Any user-facing name (messages, threads, embeds, logs) goes through `src/utils/interactionUtils.js`: `getNickname(interaction)` for the acting user, `getMemberNickname(member)` for any other `GuildMember`. Never read `member.nickname` / `user.username` directly — the helpers hold the nickname-then-username fallback in one place.

## ALWAYS: report non-frontend and non-yearwheel file changes

If a response created, modified, or deleted any file outside `frontend/`, `yearwheel/`, `docs/`, or `tests/`, end the message with:

**Files touched outside /frontend and /yearwheel:**
- `path/file_one`
- `path/file_two`

Omit the section entirely otherwise. Applies regardless of task type (code, config, commits).

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

## graphify — knowledge graph of this repo

This repo has a graphify knowledge graph at `graphify-out/` (whole-repo scope: src, frontend, tests, docs, yearwheel, scripts). Outputs: `graphify-out/graph.html` (interactive viz), `graphify-out/GRAPH_REPORT.md` (audit report), `graphify-out/graph.json` (raw data).

**Before answering "how does X connect to Y" / "what calls this" / architecture questions, query the graph instead of re-reading the whole repo:**
- `/graphify query "<question>"` — broad context (BFS), or add `--dfs` to trace one specific path
- `/graphify path "<A>" "<B>"` — shortest relationship path between two named things
- `/graphify explain "<node>"` — everything connected to one function/concept/doc

Graph is ~50x cheaper per query than reading source directly — use it first.

**Update it after any coding session/sequence that touched files** (new/edited/deleted code, docs, or specs) — run:
```
/graphify . --update
```
Incremental — only re-extracts changed files, code-only changes skip LLM semantic extraction entirely (AST-only, no cost). Run it once at the end of a session, not after every single file edit.

**Commits land AFTER graphify update, not before.** Run `/graphify . --update` first, then commit. Keeps graph in sync w/ what's actually committed.

## Git: work on `main` unless told otherwise

Default workflow is directly on `main`. Do not create a feature branch, worktree, or PR on your own initiative — commit to `main` when asked to commit. Only branch when the user explicitly asks for a branch/worktree/PR. This overrides any default "branch first if on the default branch" behavior.

## Commands
- `npm start` — bot
- `npm run register` — register slash commands
- `cd frontend && npm run dev` — frontend dev server
- `cd frontend && npx vitest run` — frontend tests
