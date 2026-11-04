# TODO

## Before publishing the privacy policy

- [ ] **Delete member data on leave.** `frontend/public/privacy.html` says that profile details are deleted when a member leaves Kiriaka, but nothing does this yet. Add a `guildMemberRemove` handler that removes the member from `src/data/detailsList.json` (both `aktiv` and `inaktiv`). Decide how to treat accidental leaves, and check downstream lists such as the Sheet sync and `#nyckellista`.

- [x] **Delete signup notes after events.** `frontend/public/privacy.html` says that signup notes are deleted 30 days after the event is archived, but nothing does this yet. Add a daily cleanup for `src/events/archived`, following `docs/superpowers/specs/2026-11-04-event-note-cleanup-design.md`. Notes are free text and can contain sensitive reasons, such as illness. Decide how to handle copies outside the event JSON, such as archive metrics and Discord messages.

- [ ] **Document historical event retention.** Kiriaka wants to keep signups, responses and lineups indefinitely as history for recurring concerts. Have the board adopt that purpose and write a legitimate interests balancing test covering why each field is needed. Pay particular attention to `nej` and `kanske` responses and Discord IDs, because they are harder to justify than performer names. Define access limits and a routine for handling objections, and update the policy if the decision changes.

- [ ] **Make dietary data consent valid.** `frontend/public/privacy.html` says that dietary details are optional and based on explicit consent, but `kost` is a required field in the shared `modal_detaljer` form (`src/interactions/buttons/profile.js`) and members get no consent information. Make `kost` optional and allow it to be blank. Add text that explains the purpose and who can see the details, and ask for practical food needs only, without health or religious reasons. Check who can see the `#medlemsdetaljer` lists and "Lista kost", then state that in the policy. Have Kiriaka confirm the wording.

  **Why this matters:** Dietary details can reveal health (allergies, celiac disease) or religion (halal, kosher). GDPR Article 9 treats those as special categories of personal data, and processing them is prohibited unless an exception applies. The policy relies on explicit consent under Article 9(2)(a).

  **What valid consent requires:**

  - **Freely given, specific, informed and unambiguous (Article 4(11)):** A required field fails "freely given", and the `kost` label alone does not explain the purpose or who can see the details.
  - **Explicit (Article 9(2)(a)):** The member must clearly agree to this use. Filling in a shared form is weak evidence of that.
  - **Provable (Article 7(1)):** Kiriaka must be able to show that a member consented, so store a record such as a consent timestamp.
  - **Easy to withdraw (Article 7(3)):** Withdrawing must be as easy as giving consent. Members need a clear way to remove the details, which also requires deleting them from any lists that show them.

  **Alternative:** Article 9(2)(d) allows some members-only processing by non-profit associations. If Kiriaka prefers that basis, confirm that it applies and update the policy. If the field collects only practical food needs, it may also reduce the sensitive data held, but those needs can still reveal health or religion.

  This summary is not legal advice. Have Kiriaka confirm the final approach.
