# Årshjul (yearwheel) deploy status

**Status: code is live-ready, awaiting bot restart. See "Next step" below.**

## Current state (2026-09-11)

The "Årshjul" link button is wired into `src/features/signup.js`, inside
`updateSignupButtonMessage()` — `btn_arshjul` is a real `ButtonBuilder` and
is in `row1_buttons`'s `.addComponents(...)` call, positioned right after
*Visa mina signups*: **Visa mina signups → Årshjul → Signupverktyg → Hur
gör jag?**. `npm test` passes (278/278). Nothing has restarted yet, so no
member has seen this button — it takes effect on the next bot restart.

Prerequisites confirmed before wiring the button:
- `https://yearwheel-api.ollelindberg.se/api/web/me` → HTTP 401
  `{"error":"no_session"}` — DNS, tunnel, and the API route are live.
- `https://kiribot.ollelindberg.se/yearwheel/` → HTTP 200, real page, not
  a 404 — frontend is deployed.

**Google Drive backup is a known, separate gap — deliberately not blocking
this rollout.** See `docs/GOOGLE_DRIVE_BACKUP.md`. Root cause diagnosed
(service account has no write quota outside a Shared Drive, none exists
yet), fix is on hold pending a Workspace subscription. The `arshjul` entry
in `backupConfig` stays disabled until both that fix lands and milestone 2
starts writing `src/data/arshjul.json`. Decided to launch the button
without backup rather than hold the whole feature on an unrelated infra
gap — re-visit before milestone 2 data volume grows.

An earlier attempt wired the button in via a separate permanent panel
message (`src/features/arshjulPanel.js`, posted into `din-profil` on bot
startup). That approach has been removed entirely — it posted a message to
the live server without warning ahead of time. The current design (a 4th
button added to the existing #verktyg message, edited in place on restart —
never a new message) replaces it.

## Next step: restart the bot

**Restarting the bot will edit the existing #verktyg message
(`ch_Verktyg_Signup`, channel ID `1329775907367551074`) to add a 4th
visible button, "Årshjul", right after "Visa mina signups". Every member
in that channel will see and be able to click it immediately on restart.**
`updateSignupButtonMessage()` edits the message in place — no new message,
no duplicate, no role ping.

Do this only when ready for that to be visible.
