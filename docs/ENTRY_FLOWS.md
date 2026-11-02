# One entry, one flow

Implemented event types:

| Saved entry | Event |
| --- | --- |
| New family and first member | `family.created` |
| Relative added through the questionnaire | `member.created` |
| Personal details saved | `profile.updated` |
| Access preferences saved | `sharing.updated` |
| Family message sent | `message.created` |
| Gathering created | `gathering.created` |

Read requests, login, logout, and failed validation do not create business-entry events. Registration's initial family/member is one atomic creation event. Repeated successful saves create separate events, even if the values are unchanged. HTTP client retries are not deduplicated yet; add client idempotency keys before automatic offline/mobile retries.

```mermaid
sequenceDiagram
  participant U as User
  participant A as API
  participant D as PostgreSQL
  participant W as Worker
  participant G as Google Drive
  U->>A: Save entry
  A->>A: Validate and authorize
  A->>D: BEGIN; save entry + encrypted event; COMMIT
  A-->>U: Saved
  W->>D: Claim one pending event with lease
  W->>G: Reserve file ID
  W->>D: Save reserved file ID
  W->>G: Upload encrypted event under that ID
  W->>D: Mark completed (or schedule retry)
```

## Google Drive configuration

Target folder: `1lvN0BWP1yIZM0udGoFZ4XrxYz5SLcjKo` ([open folder](https://drive.google.com/drive/folders/1lvN0BWP1yIZM0udGoFZ4XrxYz5SLcjKo)). No credentials or Drive permission have been assumed from this link.

1. Enable the Google Drive API in a Google Cloud project and configure an OAuth client for the operator account that controls this folder.
2. Use an authorized OAuth consent flow, preferably with the per-file `drive.file` scope. Select/open the target folder with Google Picker so that this app has access to it. Entering a folder ID alone does not grant per-file scope access. Set the app’s OAuth publishing/verification and consent configuration appropriately for its actual audience.
3. Store `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a refresh token issued for that selected-folder access as backend runtime secrets. Do not paste tokens into chat or commit them. This repository does not include a user-facing Google OAuth callback/Picker UI; that setup is an operator task.
4. Set `GOOGLE_DRIVE_FOLDER_ID` and preserve `WORKFLOW_ENCRYPTION_KEY` in a separate secret manager with a tested recovery procedure.
5. Apply migrations and run `npm run workflows -w backend -- --once` against synthetic entries first. The worker checks that the folder exists and is writable before processing events.
6. Run the worker as a separate supervised process after successful validation. Inspect pending/dead events, provider errors, and key rotation procedures operationally.

The ChatGPT Google Drive connection can help inspect the folder during development. It does **not** provision OAuth secrets for the deployed app. The connector is not yet confirmed connected in this session.

Google documents [folder creation/uploads](https://developers.google.com/workspace/drive/api/guides/folder), [per-file scope and Picker](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), and [files.create permissions inheritance](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create). Keep the folder restricted to authorized operators. User-level sharing rules in my.roots do not alter Drive's folder permissions.

## Encryption and retry behavior

The API encrypts the full event envelope with AES-256-GCM before inserting it into `entry_flows`. Each event has a random UUID and a fresh nonce. Drive receives a file named `entry-<event UUID>.enc`, whose contents are the encrypted envelope; it receives no readable contact/profile/message fields. Folder operators with the archive key can decrypt entries, so protect the key separately. PostgreSQL still stores ordinary profile and chat data in its protected database; this feature does not provide full database field encryption.

The worker uses `FOR UPDATE SKIP LOCKED`, a two-minute lease, exponential backoff (capped at one hour), and eight attempts. Expired leases can be reclaimed. Before upload it saves a provider-generated file ID. Retrying a successful upload verifies the existing file's event ID, parent folder, and checksum, avoiding duplicate files after a crash. Exhausted events remain `dead` for investigation. There is no user-facing dead-letter replay endpoint yet; a privileged operator must review and requeue a corrected event through an audited operational procedure.

This is an archive workflow, not automatic relationship verification. Future SMS and WhatsApp adapters must enforce recipient opt-in and channel policy independently. A database save is not consent to contact a third party.

## Operational limits

This event archive is not a complete disaster-recovery backup: test PostgreSQL backups and restore procedures separately. Add retention/deletion orchestration across PostgreSQL, queue files, and Drive before handling real users. Partition/archive old events, monitor quota and queue age, and shard archive folders before large volumes. Editing privacy settings does not retroactively remove historical encrypted archive records.
