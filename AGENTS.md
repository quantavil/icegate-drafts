# ICEGATE draft automation

Follow `~/AGENTS.md` as well as these project instructions.

- This project creates Gmail drafts for human review. Never add automatic sending, send mail, or change recipients without the user's explicit instruction.
- `Code.gs` is the local source copy of the Google Apps Script project named in README.md. Saving the file locally does not deploy it; the project's active time-driven trigger uses the saved Apps Script editor code. Inspect and preserve any changes in both copies before synchronizing.
- The trigger is `checkIcegate`, every minute; processing is limited to 11:00–22:00 Asia/Kolkata. `installAutomation` creates or replaces that trigger, and `stopAutomation` removes it. Preserve the existing start timestamp and script properties: resetting them may cause missed or repeated work.
- Match only the configured ICEGATE sender, LEO/eGatepass subjects, and PDFs whose filenames begin with the shipping bill number and date. Group documents by selected customer thread, keep the user-selected longest-thread rule, and do not overwrite a draft that appears to have been edited. Avoid duplicating identical files already sent in the selected conversation. Reply to the latest non-draft message, and leave a draft for review if all its files were sent separately. Preserve attachment indexes and hashes; fail safely if older attachment records are ambiguous. Draft fingerprints cannot prevent every simultaneous edit race.
- The script currently has broad Gmail permissions through GmailApp, including deletion; the workflow must never delete customer email. Temporary test drafts and the script's temporary replacement drafts may be removed as part of their defined cleanup. Never record or commit account credentials, tokens, cookies, or browser profile data.
- Run the local Node checks listed in README.md after changes. Check Apps Script Executions and the trigger after deploying changes. Do not assume a full-day quota or live incoming-mail test has passed without evidence.
- `rules.cjs` mirrors the small pure matching functions in `Code.gs` for Node tests. Keep the two in sync when modifying those functions.
