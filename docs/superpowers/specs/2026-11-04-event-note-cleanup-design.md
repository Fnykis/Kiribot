# Signup Note Cleanup — Design

**Date:** 2026-11-04
**Status:** Draft (design) — awaiting review
**Related:** `TODO.md` ("Delete signup notes after events"), `frontend/public/privacy.html` (section 5)

## Goal

Kiribot deletes each signup note 30 days after its event is archived. Notes are free text and can contain sensitive reasons for absence, such as illness. Their purpose ends once the event has been planned.

The privacy policy already makes this promise. The policy cannot be published until this job exists.

## Decisions

| Question | Decision | Source |
|---|---|---|
| What is removed? | Only the `note` value on signup entries. | User |
| What stays? | Names, IDs, responses, lineups and all other event data, as the concert history Kiriaka wants to keep. | User |
| Which events are scanned? | Only `src/events/archived`. The existing archive job moves past events there, and notes become eligible for removal only after that move. | User |
| When is a note removed? | At the first daily run on or after 30 full days from the archive date. Planned events are never touched. | User |
| How is the archive date known? | Both archive paths save a new `archivedAt` ISO timestamp in the event file. | User |
| What about events archived before this change? | They have no `archivedAt`, so the job uses the event `date` instead. This keeps the first-run decision for old notes. | Builder's call, check |
| How does the job log? | It writes no log when nothing changed. It writes a success log only when notes were actually cleared. | User |
| What about existing old notes? | The first run clears all notes that are already past 30 days. This is required for the policy to be true. | User |
| Do API responses include notes? | No. The server removes `note` from all event data sent to the planner. | User |
| Which copies are covered? | Server event files only. Local development copies are out of scope. | User |

## Non-goals

- Deleting or changing names, responses, Discord IDs or lineups
- Deleting member profile data (separate `TODO.md` item)
- Changing or deleting Discord messages
- Changing what the planner shows on screen
- Adding any Discord post, DM or notification
- Adding a manual command or moderator button
- Making the 30-day period configurable

**Anti-goal:** The job must never lose event data other than `note`. A failed run must leave the event file valid and unchanged.

## Current behavior

Archived events are read-only in the existing code: signup buttons refuse them, and `src/services/lineupStore.js` only changes active files.

Notes are written in two places in `src/interactions/buttons/signup.js`: line 128 stores the modal text, and line 681 stores `""` as the default.

Event files live in `src/events/active` and `src/events/archived`. Their structure is:

```json
{
  "date": "14/03/26",
  "signups": {
    "1:a": [{ "id": "...", "name": "...", "response": "nej", "note": "..." }]
  }
}
```

Notes appear in two read paths. The private list code in `src/features/signup.js` skips empty notes. The planner API also returns them: `GET /api/state/:concertId` sends the full event to any authenticated Harmonian, and lineup routes that return the updated event may do the same. `frontend/src` does not read `.note`. A code search found no log line, Discord post or archive metric that contains note text.

Events with unparseable dates never archive, so their notes stay in active as a known gap.

Archive moves happen in `moveToArchived` and `cleanupOutdatedSignups`, both in `src/features/signup.js`. Neither records when the move happened.

## Design

### Archive date

Add a small helper that sets `archivedAt` to the current ISO timestamp, then use it in both archive paths immediately after the file is renamed.

- It must use synchronous file operations, with no `await` between the rename and the write.
- It must not overwrite an existing `archivedAt`.
- If it fails, log an error and leave the event archived. The job then falls back to the event `date`.

### Pure function

Add `stripExpiredNotes(eventData, now)`. It receives parsed event data and a `Date`, and returns `{ eventData, clearedCount, dateValid }`.

- It uses `eventData.archivedAt`. If that key is missing, it parses `eventData.date` with `parseEventDate` from `src/utils/dateUtils.js`.
- A note expires when `now - referenceDate >= 30 days`.
- It checks every entry in every `signups` section.
- It sets each non-empty `note` to `""`. It does not delete the key, which matches the existing default.
- It leaves entries without a `note` key unchanged.
- It does not mutate its input.

### Service

Add `src/services/eventNoteCleanup.js`, exporting `stripExpiredNotes` and `cleanupEventNotes`. Directories and the current time are injectable for tests, matching the factory or parameter style of nearby services.

`cleanupEventNotes` does the following:

1. Scans `.json` files in `dir_EventsArchived` only. A missing directory counts as empty.
2. Reads each file and calls `stripExpiredNotes`.
3. Skips the file if `clearedCount` is 0.
4. Otherwise writes `JSON.stringify(data, null, 2)` to a `.tmp` file in the same directory, then renames it over the original.

A failure in one file must not stop the remaining files.

### Locks

The job takes no locks. The only other write to archived files is the synchronous `archivedAt` stamp, so the job must read, change and rename each file without an `await` in between. The temporary-file rename prevents a partial write.

### API responses

Add one helper, such as `withoutSignupNotes(event)`, that returns a copy of an event with `note` removed from each signup entry. Use it for every planner route that returns event data, including `GET /api/state/:concertId` and the lineup mutation routes in `src/routes/api/lineup.js` that return `updated`.

- Stored event files are not changed by this helper.
- Signup names, responses and all other fields stay in the response.
- The route tests must assert that note text is absent.
- `frontend/src/devData.js` must mirror the new response shape in the same change, and the planner must be checked in dev mode and against the real-API path.

### Schedule

Call the job from `dailyTasks()` in `src/events/ready.js`, after `cleanupLocks()`:

```js
cleanupEventNotes().catch(err => logActivity(`Error in cleanupEventNotes: ${err.message}`));
```

`dailyTasks()` runs at startup and daily at 03:00, so no new schedule is needed.

## Logging

| Situation | Log |
|---|---|
| Nothing changed | Nothing |
| Notes cleared | One summary line for the run: `Event note cleanup: cleared N notes from M events` |
| Read, parse or write failure | One error line naming the file |
| Invalid `archivedAt`, or invalid event date when `archivedAt` is missing, and the event has at least one non-empty note | One error line naming the file |

Logs never contain note text, member names or Discord IDs.

The invalid-date line repeats on each daily run until the file is fixed. This is deliberate: those notes break the policy, and the line is a failure report, not a "nothing changed" message.

## Testing

Use `node:test` in `tests/services/eventNoteCleanup.test.js`, with temporary directories as in `tests/services/lineupStore.test.js`.

- 29 days after `archivedAt`: note kept
- Exactly 30 days after `archivedAt`: note cleared
- 31 days after `archivedAt`: note cleared
- Event date over 30 days old, but `archivedAt` under 30 days old: note kept
- Missing `archivedAt`: event date is used
- Both archive paths save `archivedAt`
- An existing `archivedAt` is not overwritten
- A failed `archivedAt` write logs an error and leaves the event archived
- Multiple sections and entries are all cleared
- Other fields are unchanged, and a missing `note` key is not added
- Input is not mutated
- Invalid reference date: file unchanged, and an error line is logged when notes exist
- No expired notes: file bytes and modified time unchanged, and no log line
- Notes cleared: one summary line, with no note text
- One unreadable file: other files are still processed
- A second run after clearing: no write and no log
- Files in the active directory are not read or changed, even when the event date has passed

Add route tests showing that state and lineup responses contain no `note` key, while stored files keep their notes until the cleanup job clears them.

Run `npm test` and `cd frontend && npx vitest run`. The frontend suite has 3 known failures in `tests/poll.test.js` and `tests/sidebar/available.test.js`, so compare against that baseline. Before deployment, do a dry run on a copy of real event data and report only counts.

## Rollout

> **Live impact:** On the next bot restart after deployment, the first run permanently clears notes from already archived events whose event date is over 30 days old. The notes lists read active events only, so clearing archived notes does not visibly change those lists. Planner API responses stop including notes, with no visible planner change. No Discord message is posted, edited or deleted by this feature.

0. Before restart, check whether server `src/events/oneTimeFunctionState.json` has `executed: false`. If so, the restart would also edit panel messages in #din-profil and #medlemsdetaljer. Sort that out first.
0. Before restart, copy the Cybrancee archive and run `cleanupEventNotes({ dir: copy })` on the copy. Report counts only: files, parse failures, invalid dates, notes cleared, and far-future dates.
1. Stop and copy `src/events` from Cybrancee to a temporary safe location.
2. Upload the changed files and restart the bot. `frontend/src/devData.js` is used only in dev mode, so it needs no production deploy of its own.
3. Check the log for the summary line.
4. Before deleting the backup, compare every archived file with it: all must parse, and only `note` values may differ.
5. Delete the temporary copy and any dry-run copy once the run is confirmed. Otherwise, old notes survive in those copies.
6. Search one real Discord channel for manually copied notes. This is a manual check, not part of the job.
7. Tick the `TODO.md` item.

## Left to the builder

- Exact helper names and internal file structure
- How to inject the logger and clock in tests
- Whether scanning stops early for files that fail to parse, provided each failure is logged
