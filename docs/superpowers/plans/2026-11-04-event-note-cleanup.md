# Signup Note Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear signup notes 30 days after an event is archived, and stop sending notes through the planner API.

**Architecture:** Both archive paths share one helper that moves the file and saves `archivedAt`. A daily job scans archived files and clears expired notes with synchronous file operations. Route responses pass through one helper that omits notes without changing stored files.

**Tech Stack:** Node.js, Discord.js v14, Express, `node:test`, Vite and Vitest

**Spec:** `docs/superpowers/specs/2026-11-04-event-note-cleanup-design.md`

## Global Constraints

- Retention is exactly 30 days: `now - referenceDate >= 30 * 24 * 60 * 60 * 1000`.
- The reference date is `archivedAt`. Use the event `date` only when `archivedAt` is missing.
- Scan only `src/events/archived`. Never read or change active files in the cleanup job.
- Set expired notes to `""`. Do not delete the key or add one.
- Nothing changed means no log. Success logs one line only: `Event note cleanup: cleared N notes from M events`.
- Logs never contain note text, member names or Discord IDs.
- No Discord posts, edits, DMs or notifications are added.
- Member-facing names are not touched by this work.
- Work on `main`. **Do not commit.** The commit happens only when the user asks, after `/graphify . --update`.

## Review Focus

- `archivedAt` in the future: notes stay, because the elapsed time is negative. Test in Task 2.
- `archivedAt` present but invalid: do not fall back to the event date. Keep notes and log a file error. Test in Task 2.
- `signups` missing or containing a non-array section: skip it without throwing. Test in Task 2.
- Whitespace-only note: treated as non-empty and cleared. Test in Task 2.
- Leftover `.tmp` file in the archive directory: ignored because it does not end in `.json`. Test in Task 2.

---

### Task 1: Save the archive date

**Files:**
- Create: `src/utils/eventArchive.js`
- Modify: `src/features/signup.js:265-279`
- Modify: `src/features/signup.js:353-367`
- Test: `tests/utils/eventArchive.test.js`

**Interfaces:**
- Produces: `archiveEventFile(oldPath: string, newPath: string, { now?: () => Date, log?: Function }) -> void`. It creates the destination directory, renames the file, then calls `stampArchivedAt`. Rename failures throw.
- Produces: `stampArchivedAt(filePath: string, { now?: () => Date, log?: Function }) -> void`. It synchronously saves `archivedAt`, keeps an existing value, logs failures and does not throw.

- [ ] **Step 1: Write failing tests in `tests/utils/eventArchive.test.js`**

Use temporary directories as in `tests/services/lineupStore.test.js`, a fixed `now`, and a log spy:

```js
test('archiveEventFile moves the event and saves archivedAt', () => {
    // writes active/a_1.json with { id: '1', signups: {} }
    archiveEventFile(oldPath, newPath, { now: () => new Date('2026-11-04T03:00:00.000Z'), log });
    assert.strictEqual(fs.existsSync(oldPath), false);
    assert.strictEqual(JSON.parse(fs.readFileSync(newPath, 'utf8')).archivedAt, '2026-11-04T03:00:00.000Z');
});
```

Also test these cases:

- `stampArchivedAt keeps an existing archivedAt`
- `archiveEventFile creates a missing archive directory`
- `archiveEventFile throws when the rename fails`, with the source missing
- `a failed archivedAt write logs an error and leaves the event archived`, with invalid JSON in the source file. Assert one log line that contains the file name, and assert that the file is in the archive

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/utils/eventArchive.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement `src/utils/eventArchive.js`**

Default `now` to `() => new Date()` and `log` to `require('../core/logger')`. Use only synchronous `fs` calls, and write with `JSON.stringify(data, null, 2)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/utils/eventArchive.test.js`
Expected: PASS.

- [ ] **Step 5: Use the helper in both archive paths**

In `src/features/signup.js`, replace the `mkdirSync` and `renameSync` code in `moveToArchived` and `cleanupOutdatedSignups` with `archiveEventFile(oldPath, newPath)`. Keep the existing metrics and error handling.

- [ ] **Step 6: Verify the wiring**

Run: `grep -n "renameSync\|archiveEventFile" src/features/signup.js`
Expected: no `renameSync` lines, and one import plus two calls of `archiveEventFile`.

Run: `npm test`
Expected: 0 failures.

### Task 2: Add the cleanup job

**Files:**
- Create: `src/services/eventNoteCleanup.js`
- Modify: `src/events/ready.js:1-14`
- Modify: `src/events/ready.js` (`dailyTasks`, after `cleanupLocks()`)
- Test: `tests/services/eventNoteCleanup.test.js`

**Interfaces:**
- Consumes: `archivedAt` written by Task 1, and `parseEventDate(dateString)` from `src/utils/dateUtils.js`.
- Produces: `stripExpiredNotes(eventData: object, now: Date) -> { eventData: object, clearedCount: number, dateValid: boolean }`
- Produces: `cleanupEventNotes({ dir?: string, now?: () => Date, log?: Function }) -> Promise<{ clearedNotes: number, changedEvents: number }>`

- [ ] **Step 1: Write failing `stripExpiredNotes` tests**

Use `archivedAt: '2026-10-05T03:00:00.000Z'` and these cases:

```js
test('keeps notes 29 days after archivedAt', () => {
    const result = stripExpiredNotes(event, new Date('2026-11-03T03:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 0);
    assert.strictEqual(result.eventData.signups['1:a'][0].note, 'Bortrest');
});

test('clears notes exactly 30 days after archivedAt', () => {
    const result = stripExpiredNotes(event, new Date('2026-11-04T03:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 1);
    assert.strictEqual(result.eventData.signups['1:a'][0].note, '');
});
```

Also add:

- `clears notes 31 days after archivedAt`
- `uses archivedAt when the event date is older`, with `date: '01/01/25'` and a recent `archivedAt`
- `uses the event date when archivedAt is missing`
- `clears notes in every section`
- `keeps other fields and does not add a note key`
- `does not mutate its input`
- `keeps notes when archivedAt is in the future`
- `does not fall back to the date when archivedAt is invalid`, expecting `dateValid: false` and `clearedCount: 0`
- `reports dateValid false when the date is invalid and archivedAt is missing`
- `skips missing signups and non-array sections`
- `clears a whitespace-only note`

- [ ] **Step 2: Write failing `cleanupEventNotes` tests**

Use a temporary directory, a fixed clock and a log spy:

- `clears expired notes and logs one summary line`, asserting exact text `Event note cleanup: cleared 2 notes from 1 events` and no note text
- `leaves file bytes and modified time unchanged and logs nothing when no notes expired`
- `a second run neither writes nor logs`
- `logs a file error for invalid JSON and still processes other files`
- `logs a file error for an invalid date only when notes exist`
- `does not read active files`, passing the archive directory while a past event exists in a sibling active directory, then asserting that the active file is unchanged
- `returns zero counts for a missing directory`
- `ignores .tmp files`
- `leaves the original valid when the write fails`, by making the temporary path a directory

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/services/eventNoteCleanup.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 4: Implement `src/services/eventNoteCleanup.js`**

Use `DEFAULT_ARCHIVED_DIR = 'src/events/archived'`, following the comment style in `src/services/lineupStore.js`, so tests do not need `config.json`. Clone input with `structuredClone`.

For each `.json` file, read, parse, change, write to `${filePath}.tmp`, and rename with synchronous calls and no `await`. Catch errors per file. After the loop, log the summary only if `clearedNotes > 0`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/services/eventNoteCleanup.test.js`
Expected: PASS.

- [ ] **Step 6: Schedule the job in `src/events/ready.js`**

Import `cleanupEventNotes`, then add this after `cleanupLocks();`:

```js
cleanupEventNotes().catch(err => logActivity(`Error in cleanupEventNotes: ${err.message}`));
```

- [ ] **Step 7: Verify the suite**

Run: `node --check src/events/ready.js && npm test`
Expected: 0 failures.

### Task 3: Remove notes from planner responses

**Files:**
- Create: `src/utils/eventResponse.js`
- Modify: `src/routes/api/state.js:1-7`
- Modify: `src/routes/api/lineup.js:57,83,115,131,166`
- Modify: `frontend/src/devData.js:22-30`
- Test: `tests/utils/eventResponse.test.js`
- Test: `tests/routes/state.test.js`
- Test: `tests/routes/lineup.test.js`
- Test: `frontend/tests/devData.test.js`

**Interfaces:**
- Produces: `withoutSignupNotes(event: object) -> object`, a copy with `note` removed from every signup entry. Stored data and all other fields are unchanged.

- [ ] **Step 1: Write failing tests**

```js
test('state: response omits signup notes and keeps other signup fields', async () => {
    // loadEvent returns signups: { '1:a': [{ id: 'u1', name: 'A', response: 'nej', note: 'Sjuk' }] }
    await handler({ params: { concertId: 'c1' } }, res);
    assert.deepStrictEqual(res.body.signups['1:a'][0], { id: 'u1', name: 'A', response: 'nej' });
});
```

Add these tests:

- `tests/utils/eventResponse.test.js`: omits notes in all sections, does not mutate input, handles missing signups and non-array sections
- `tests/routes/lineup.test.js`: one note-free response test each for place, move, mestre, remove and instrument change, each also asserting that `store.peek()` still contains the note
- `frontend/tests/devData.test.js`: `getState` and `place` return no `note` key

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/utils/eventResponse.test.js tests/routes/state.test.js tests/routes/lineup.test.js`
Expected: FAIL.

Run: `cd frontend && npx vitest run tests/devData.test.js`
Expected: FAIL on the new note assertions.

- [ ] **Step 3: Implement and use `withoutSignupNotes`**

Wrap `res.json(event)` in `state.js` and all five `res.json(updated)` calls in `lineup.js`. `src/routes/api/concerts.js` and `src/routes/api/shareLineupImage.js` do not return signups and stay unchanged.

- [ ] **Step 4: Mirror the shape in `frontend/src/devData.js`**

Remove `note` from a copy of each event when `createDevData(rawEvents)` builds `events`. Do not add this to `frontend/src/dataSource.js`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/utils/eventResponse.test.js tests/routes/state.test.js tests/routes/lineup.test.js`
Expected: PASS.

Run: `cd frontend && npx vitest run tests/devData.test.js`
Expected: PASS.

### Task 4: Verify the whole change

**Files:**
- Modify: none

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: 0 failures.

Run: `cd frontend && npx vitest run`
Expected: only the 3 existing failures in `tests/poll.test.js` and `tests/sidebar/available.test.js`.

- [ ] **Step 2: Build the production frontend to the scratchpad**

Run: `cd frontend && npx vite build --outDir "$TMPDIR/kiribot-note-build" --emptyOutDir`
Expected: build succeeds.

- [ ] **Step 3: Check dev mode**

With `VITE_DEV_MODE=true` in `frontend/.env.development`, run `npm run dev` from `frontend/`. Open a concert and place, move and remove one person. Expected: the planner works and the state response has no `note` keys. Restore `VITE_DEV_MODE=false` afterward.

- [ ] **Step 4: Dry-run on a temporary copy**

Copy local event JSON to a temporary archive directory, run `cleanupEventNotes({ dir })` with a throwaway script outside the repo, and report only the counts. Delete the copy afterward. Local project files must stay unchanged.

- [ ] **Step 5: Confirm the source tree stays uncommitted**

Run: `git status --short -- src tests frontend/src frontend/tests`
Expected: only this plan's files, plus the earlier uncommitted work.

- [ ] **Step 6: Hand over**

Report results, the live-impact warning from the spec, and the rollout steps. Wait for the user to request `/graphify . --update`, commit or deployment.
