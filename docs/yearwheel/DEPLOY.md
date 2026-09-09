# Årshjul (yearwheel) deploy status

**Status: NOT LIVE. Do not enable the Discord button without explicit approval.**

## Current state

The "Årshjul" link button is commented out in `src/features/signup.js`, inside
`updateSignupButtonMessage()` (search for `btn_arshjul`). The live button row
in **#verktyg** (`ch_Verktyg_Signup`, channel ID `1329775907367551074`) is
back to its original 3 buttons: *Visa mina signups*, *Signupverktyg*, *Hur
gör jag?*. No member sees any årshjul button today, and none appears on bot
restart.

This is intentional. Milestone 1's backend/frontend code is merged to `main`
and fully tested, but:

- Task 15's manual deploy steps have not run (DNS, Cloudflare Tunnel ingress,
  Discord OAuth redirect URI, `config.json` secrets, FTP upload of
  `yearwheel/dist/`) — see the milestone 1 plan,
  `docs/superpowers/plans/2026-09-09-arshjul-milestone-1.md`, section
  "Task 15: End-to-end verification against the real server".
- Until those steps are done, `https://kiribot.ollelindberg.se/yearwheel/`
  does not resolve to anything. A live button would be a dead link in front
  of the whole server.

An earlier attempt wired the button in via a separate permanent panel
message (`src/features/arshjulPanel.js`, posted into `din-profil` on bot
startup). That approach has been removed entirely — it posted a message to
the live server without warning ahead of time. The current design (a 4th
button added to the existing #verktyg message, edited in place on restart —
never a new message) replaces it.

## Do not do this until explicitly approved

- Do not uncomment `btn_arshjul` in `src/features/signup.js`.
- Do not add it back into `row1_buttons`'s `.addComponents(...)` call.
- Do not restore `src/features/arshjulPanel.js` or its `ready.js` wiring.

## To go live (only when told to)

1. Confirm Task 15's manual prerequisites are actually done — test with:
   ```
   curl -sS https://kiribot-api.ollelindberg.se/api/web/me
   ```
   Expect `{"error":"no_session"}`, HTTP 401. That proves DNS, tunnel, and
   the API route are all live.
2. Confirm the frontend is deployed: `https://kiribot.ollelindberg.se/yearwheel/`
   loads a real page (not a 404) in a browser.
3. Only then, in `src/features/signup.js`:
   - Uncomment the `btn_arshjul` `ButtonBuilder` block.
   - Add `btn_arshjul` into `row1_buttons`'s `.addComponents(...)` call,
     between `btn_signupverktyg` and `btn_signupHowTo`.
4. Run `npm test` — full suite must stay green.
5. State plainly, before committing/deploying, that the next bot restart
   will add a 4th visible button to the live #verktyg message that every
   member can see and click — per the live-Discord-impact rule in
   `CLAUDE.md`.
6. Restart the bot. `updateSignupButtonMessage()` edits the existing
   message in place — no new message, no duplicate.
