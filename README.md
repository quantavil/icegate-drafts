# ICEGATE Gmail drafts

Open the Apps Script project named “ICEGATE shipment drafts” in the account that receives the customs emails. The local `Code.gs` is a copy of the project source; editing it here does not update the project online.

## How it works

The `checkIcegate` trigger runs every minute, but processes mail only from **11:00 to 22:00 India time**. Mail received outside that window is processed when the window opens. It considers mail received after the automation was installed, not the old inbox.

It matches ICEGATE LEO and eGatepass subjects and PDF filenames to shipping bill numbers and dates, finds customer conversations containing the number, and picks the conversation with the most messages (then the most recent). It creates a reply-all draft to the latest non-draft message in that conversation and groups later documents for the same conversation into it. The draft text names the document types actually attached. When a new draft is created, its ICEGATE source email is marked as read; a later email that only updates the draft is not marked as read. **You review the recipients and attachments and send it.** The script never sends the email.

Before adding a file, the script checks whether a file with the same name and contents was already sent by this account in the selected conversation. If its managed draft was sent or deleted, a later document starts a new draft. When updating an unchanged draft, it removes files that were sent separately. It cannot recognize files sent into another conversation or immediately remove a file from a draft after a separate manual send; the next incoming document triggers another check. If every file in a draft has already been sent separately, the script leaves the draft for you to review rather than deleting it.

If a managed draft has changed, the script creates a separate draft for the new attachment instead of intentionally replacing the edit. A simultaneous edit can still race with an update. Inactive bill and draft tracking records expire after 30 days; a later document can start a fresh draft. If a draft is created or updated but saving its tracking state fails, a retry may produce an extra draft; review duplicates if execution errors occur.

## Set up

1. Create an Apps Script project in the Google account receiving ICEGATE emails and copy `Code.gs` into its editor.
2. Add the Gmail API under **Services** in the editor and save the project.
3. Run `installAutomation` and authorize the requested access. This sets the starting time and creates the minute trigger; existing emails are not backfilled.
4. Check **Triggers** and **Executions**. Review initial drafts carefully before relying on the matching rules.

The script requires access to Gmail and can modify drafts. Its built-in Gmail service currently requests full mailbox access, including permanent deletion capability. The automation does not send messages or delete customer mail.

## Operate and troubleshoot

Open **Executions** in Apps Script to inspect failures and timing. Unsuccessful matches are logged and retried after about 15 minutes. Google quotas, the email attachment-size limit, and temporary outages can delay or prevent drafts. The personal Google account's 90-minute daily trigger-runtime quota is shared across its scripts. A full day of live usage has not yet been measured.

To stop the automation, run `stopAutomation` in the project editor or delete the `checkIcegate` trigger. To restart it, run `installAutomation`. The start timestamp and stored matching state should be preserved so mail is not unexpectedly missed or reprocessed. The project uses the Apps Script Gmail service and the enabled Gmail API; it currently has broad Gmail access, including deletion permission, and permission to connect to external services. Credentials are not stored in this folder.

## Files and verification

- `Code.gs`: Apps Script source, also saved in the online project.
- `AGENTS.md`: maintenance instructions and safety boundaries.
- `rules.cjs` and `test.cjs`: matching and scheduling rule checks. Keep the copied rules in sync with `Code.gs`.
- `*-test.cjs`: local checks for customer matching, reply selection, attachments, polling and recovery.

Run the local checks with:

```sh
cd ~/Documents/icegate-drafts
node test.cjs
node behavior-test.cjs
node customer-test.cjs
node draft-flow-test.cjs
node poll-test.cjs
node latest-reply-test.cjs
node draft-body-test.cjs
node stale-attachments-test.cjs
node poll-failure-test.cjs
node duplicate-filenames-test.cjs
```

`testPollReadOnly` tests the ICEGATE search without changing mail. Check the project's **Executions** page after tests and after changing the online code.

## License

[MIT](LICENSE).
