# Hosting map

Where each part of this repo actually runs.

## Bot + backend API (`src/`)

- **Host:** Cybrancee — a Pterodactyl-panel container hosting provider. Filesystem root `/home/container`. All Cybrancee files are uploaded manually through FTP by user.
- **Process:** `src/index.js`, started by Cybrancee's own startup command. No PM2, no separate process manager.
- **Tunnel:** `src/index.js` spawns `cloudflared` itself as a child process on startup (`/home/container/cloudflared`, config at `/home/container/config.yml`) — the tunnel is not a separate service, it dies and restarts with the bot.
- **Data:** `config.json`, `src/data/*.json` live on the container's filesystem. Backed up daily to Google Drive (`src/services/google/drive.js`).
- **Inbound:** none directly — the Express app (`localhost:3000`) has no open port of its own. Reached only through the Cloudflare Tunnel below.

## Cloudflare Tunnel

- Tunnel name: `kiribot-lineup`.
- Ingress rules live in `config.yml` on the Cybrancee container, both pointing at the same `http://localhost:3000`:
  - `lineup-api.ollelindberg.se` → Discord Activity's `/api/*`
  - `yearwheel-api.ollelindberg.se` → årshjul's `/api/web/*`
- `ollelindberg.se`'s nameservers are Cloudflare's (`charles.ns.cloudflare.com` / `nataly.ns.cloudflare.com`) — it's a full Cloudflare-managed zone, not DNS-at-one.com with a CNAME pointed at Cloudflare. one.com is only the domain **registrar**; actual DNS records live in Cloudflare's own dashboard (zone `ollelindberg.se` → **DNS → Records**).
- **Adding a hostname to `config.yml`'s `ingress:` list is NOT enough on its own.** It makes the tunnel *able* to serve that hostname, but a separate DNS record must exist for it too — type **Tunnel**, target = the tunnel name (`kiribot-lineup`), Proxied. Without that record, the hostname either 404s outright or (if it happens to match an existing wildcard/other record in the zone) silently falls through to whatever else that record points at — which is what happened here: `yearwheel-api.ollelindberg.se` had the config.yml ingress rule but no DNS record, so requests landed on the regular one.com website hosting instead of the bot, with no obvious error anywhere in the chain.
  - To add one: Cloudflare dashboard → `ollelindberg.se` zone → DNS → Records → Add record → Type **Tunnel** → Name (the subdomain) → Target (select the tunnel) → Proxied.
  - `lineup-api.ollelindberg.se` is set up this way already (Type: Tunnel, Target: `kiribot-lineup`, Proxied) — use it as the reference when adding a new one.
- **Never rename or remove the `lineup-api` entry** — the Discord Activity's URL mapping in the Discord Developer Portal depends on that exact hostname.

## Discord Activity / lineup planner frontend (`frontend/`)

- **Host:** Cloudflare Pages.
- **Domain:** kiribot.pages.dev
- **Deploy:** automatic — connected to this repo on GitHub, a push to the connected branch triggers a Pages build and deploy. No manual step.
- **Mapping:** Mapping to Lineup Discord app is set in Discord Developer Portal.
- **Talks to the bot via:** `lineup-api.ollelindberg.se`.

## Årshjul frontend (`yearwheel/`)

- **Host:** the user's regular web host on one.com — same host as the rest of `ollelindberg.se`, **not** Cloudflare Pages.
- **Deploy:** manual. `cd yearwheel && npm run build`, then FTP the contents of `yearwheel/dist/` to `/yearwheel` on the web host. The bot host is not involved in this deploy.
- **Served at:** `kiribot.ollelindberg.se/yearwheel`.
- **Talks to the bot via:** `yearwheel-api.ollelindberg.se`.
- **Current status:** not live yet — see `docs/yearwheel/DEPLOY.md`.

## External services (called, not hosted)

- **Discord API** — bot gateway connection, OAuth token exchange.
- **Google Sheets / Drive API** — event data sync and daily JSON backups.
