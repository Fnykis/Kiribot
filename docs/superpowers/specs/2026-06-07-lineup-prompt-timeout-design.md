# Lineup prompt timeout + no-join re-hide

**Date:** 2026-06-07
**Scope:** Discord bot — the lineup-activity invite flow ([src/interactions/buttons/lineup.js](../../../src/interactions/buttons/lineup.js), [src/services/lineupAccess.js](../../../src/services/lineupAccess.js)).

## Problem

Clicking the lineup button ([lineup.js](../../../src/interactions/buttons/lineup.js)) currently:
1. Grants the clicker a per-user `ViewChannel + Connect` overwrite on the lineup voice channel.
2. Schedules revoke of that overwrite after **5 minutes** (`scheduleRevoke`), cancelled if they join the channel ([voiceStateUpdate.js:27](../../../src/events/voiceStateUpdate.js#L27)), deleted if they leave ([voiceStateUpdate.js:44](../../../src/events/voiceStateUpdate.js#L44)).
3. Replies with an ephemeral message `"Klicka för att starta lineup-aktiviteten:"` + a Link button to the activity invite. **This message never gets deleted.**

Two issues:
- The ephemeral prompt lingers, inviting stale relaunches.
- A clicker who never joins keeps channel access (and a usable link) for 5 minutes.

## Desired behaviour

- The `"Klicka för att starta lineup-aktiviteten:"` ephemeral prompt is **deleted after 1 minute**.
- If the clicker **did not join** the lineup voice channel within that minute, their channel access is **revoked** (channel hidden for them again), killing their stale link.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Re-hide scope | **Per-clicker** — revoke only the clicker's overwrite if they personally didn't join. Fits the existing per-user model; overlapping clickers handled independently. |
| 2 | Existing 5-min revoke | **Replace with 1 min.** Join still cancels it. One timer. |
| 3 | Invite TTL (`activityInvite`, 7-day/unlimited) | **Leave unchanged.** The per-user access revoke is the real protection; the link is useless without the `ViewChannel` overwrite. |

## Design

Two small changes; no change to the per-user access model or `voiceStateUpdate`.

### 1. `src/services/lineupAccess.js`

- `REVOKE_DELAY_MS`: `5 * 60 * 1000` → `60 * 1000` (1 min).
- Export `REVOKE_DELAY_MS` so the prompt-deletion timer reuses the same value (single source of truth — the prompt and the access grant share one lifetime).
- No other change. `scheduleRevoke` (cancel-on-join, per-user) already implements "revoke if they don't join in time"; shortening the delay makes it the no-join re-hide at 1 min.

### 2. `src/interactions/buttons/lineup.js`

- Import `REVOKE_DELAY_MS` alongside `scheduleRevoke`.
- After the final `interaction.editReply({ content: 'Klicka …', components: [...] })`, schedule:
  ```js
  setTimeout(() => {
      interaction.deleteReply().catch(err =>
          logActivity(`btn_lineup_invite: failed to delete prompt for ${member.user.id}: ${err.message}`));
  }, REVOKE_DELAY_MS);
  ```
- The prompt is deleted at 1 min **regardless** of whether the user joined (if they joined, they've launched the activity and no longer need the link). The matching access revoke fires on the same delay only if they didn't join.

## Flow after change

| Clicker action within 1 min | Prompt | Channel access |
|---|---|---|
| Joins lineup voice | deleted at 1 min | kept (`cancelRevoke`), removed later on leave |
| Never joins | deleted at 1 min | revoked at 1 min → hidden again → stale link dead |

## Error handling & limitations

- `deleteReply()` failures (e.g. user already dismissed the ephemeral) are caught and logged, never thrown. Interaction tokens live 15 min, so a 1-min `deleteReply` is within window.
- Timers are in-memory `setTimeout` — **lost on bot restart** (prompt not deleted, revoke not fired for grants made in the minute before restart). This matches the existing `scheduleRevoke` and `voiceStateUpdate` `pendingClears` timers; documented, not fixed.

## Testing

- **`lineupAccess`** (unit, fake timers): `scheduleRevoke` calls `channel.permissionOverwrites.delete(userId)` after `REVOKE_DELAY_MS`; `cancelRevoke` prevents it; `REVOKE_DELAY_MS === 60000`.
- **`lineup.js`** (unit, fake timers + mocked interaction): after `execute`, advancing the clock by `REVOKE_DELAY_MS` triggers `interaction.deleteReply()`; a `deleteReply` rejection is swallowed.

## Out of scope

Persisting timers across restart; touching `voiceStateUpdate`; the invite max_age/max_uses; any change to the join/leave mute behaviour.
