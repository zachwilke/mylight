# Connect Google Calendar

Google connections bring selected calendars into MyLight. Connections start
read-only. The household owner can enable editing to change individual Google
appointments, including one occurrence of a repeating event, through a durable
outgoing queue with version-conflict review. iCalendar feeds remain read-only.

## One-time server setup

Use your own Google OAuth client. No shared MyLight client or paid service is
required by this implementation.

1. In your Google Cloud project, enable the Calendar API, configure the consent
   screen, and create an OAuth client of type **Web application**. For a project
   in Testing, add the Google accounts you will use as test users.
2. Register one exact authorized redirect URI, for example
   `https://calendar.example.com/google/callback`. It must use the same origin
   where you open MyLight. Local development also allows
   `http://localhost:3000/google/callback` or `http://127.0.0.1:3000/google/callback`.
   The callback is a browser redirect: a private origin can work if that browser
   can reach it and Google accepts its registered URI.
3. Generate a token-encryption key **once**, using `openssl rand -base64 32`.
   Save it securely with the client credentials. Do not regenerate it at startup.
4. Set the following environment variables on the MyLight server process and
   restart it. Use a protected environment file or your service/container's secret
   configuration; MyLight does not automatically load a `.env` file.

| Variable | Value |
| --- | --- |
| `MYLIGHT_GOOGLE_CLIENT_ID` | Your Web application client ID |
| `MYLIGHT_GOOGLE_CLIENT_SECRET` | That client's secret |
| `MYLIGHT_GOOGLE_REDIRECT_URL` | The exact registered callback URI |
| `MYLIGHT_GOOGLE_TOKEN_KEY` | The saved base64-encoded 32-byte key |

Configure all four or none. Invalid or partial configuration fails startup with
an explanation. Keep credentials out of source control. The binary installer
inherits environment variables, but a desktop shortcut or system service needs
its own environment configuration.

Google's [Web Server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server)
and [consent configuration guide](https://developers.google.com/workspace/guides/configure-oauth-consent)
cover project setup and testing restrictions. Testing-mode grants may need
periodic reconnection; consent verification and publishing are managed by the
person operating the Google project.

## Connect and choose

Open MyLight at the configured origin and sign in as the household owner. In
**Settings → Integrations**, select **Connect Google**, choose your Google account,
and allow both requested Calendar permissions. MyLight requests read-only access
to calendar events and the calendar list, plus OpenID for stable account identity.

After returning, select **Choose calendars** and **Add** beside each calendar to
show. Only selected calendars are persisted. Up to five Google accounts and
20 calendars total (Google plus feeds) are supported. Connecting the same Google
account again refreshes its credentials without duplicating its calendars.

Refresh runs every 15 minutes; each calendar also has a manual refresh button
with a 30-second cooldown. Cached appointments remain available when the network
is down. A failed refresh displays an error and the last successful refresh time.
Google's own expansion supplies moved instances, cancellations, all-day dates and
recurrence behavior. See below to enable individual appointment editing.

## Enable editing and review outgoing changes

Under the connected Google account, choose **Enable editing** and authorize the
additional `calendar.events` permission. Select the same Google account: a
callback for a different account is rejected. Existing read-only connections
never gain editing permission automatically. **Reconnect with editing** renews
an enabled account's credentials; Google calendar permissions still apply.

Open a Google appointment in MyLight's calendar. The owner can edit its title,
dates/times, location and description. The editor fetches the latest Google
version and supports ordinary appointments and individual recurring instances
in calendars where the account has owner/writer access. Special Google event
types and entire recurring masters must be edited in Google. All-day end dates
are inclusive in the editor; unchanged timed values retain their original
seconds and repeated-clock instant.

**Queue Google edit** saves a durable request. A background worker checks for
work every minute, sharing the calendar refresh coordinator. The calendar keeps
showing the last confirmed Google copy while the edit is waiting. Once Google
accepts the edit, an incoming refresh updates the display.

In **Settings → Integrations → Outgoing Google changes**:

- **Queued / Sending / Waiting to retry** shows pending work. Network and rate-limit
  failures retry with backoff from one minute up to an hour.
- **Needs attention** requires checking permissions or reconnecting the account,
  then **Check again**. Failed token refreshes caused by temporary network problems
  retry automatically; revoked access pauses.
- **Review both versions** shows the saved draft beside Google's latest version.
  **Apply my draft** requires confirmation against that displayed version. Another
  intervening Google change causes another conflict. **Keep Google version** stops
  the queued edit.
- **Cancel queued edit / Stop retrying** stops future attempts after confirmation.
  Stopping a retry cannot undo an edit Google already accepted. An in-flight job
  cannot be stopped until the worker finishes or recovers it.

The worker uses Google's [conditional modification protocol](https://developers.google.com/workspace/calendar/api/guides/version-resources)
with `If-Match` ETags. A private operation marker identifies an already accepted
edit after a lost response or process restart. It checks both before every retry.
Only one active edit is allowed per appointment. Unresolved work must be reviewed
or stopped before disconnecting its calendar/account.

Current outgoing limits are 1,000 active changes and 10,000 history records per
household, up to 10 jobs per worker pass, a 45-second job deadline and a 120-second
recoverable worker lease. Reaching a storage limit rejects additional changes
visibly. History cleanup is not yet exposed in the UI.

Creating/deleting Google events, publishing local events, Google whole-series or
future-series edits, attendee management and iCloud CalDAV remain unimplemented.
This is individual-appointment editing, not full two-way calendar parity.

## Storage, recovery and limits

Tokens are encrypted with AES-GCM and bound to the Google account identity.
They never appear in the browser, calendar-list responses or logged provider
errors. Authorization uses state, PKCE and a short-lived browser nonce bound to
an active owner session. Pending authorization is excluded from backups.

Private backups include encrypted tokens, raw Google event resources, ETags,
original recurrence identities, sync cursors, outgoing jobs and the cached display
window. Jobs retain their operation IDs and version checks after restore, so an
old backup cannot silently overwrite a newer Google version.
**Save the encryption key separately:** the backup does not contain it. Restore
with the same key to retain connections, or reconnect each account with a new
key. Losing the key does not erase the cached calendar display.

Disconnect removes the account credentials and its cached calendars from
MyLight. It does not alter Google events or revoke the Google-wide grant. You
can remove that grant separately in your Google Account's third-party access
settings. Removing one calendar leaves the account available for other calendars.

The display covers the last 31 days and the following 367 days, with an exclusive
end date. Incoming synchronization retains up to 10,000 raw resources, including
cancellation tombstones, within 16 MiB per calendar. The display is bounded to
10,000 instances and 2 MiB. Each response page is limited to 2 MiB, pagination to
100 pages, and refresh work to 90 seconds. Larger calendars fail visibly without
replacing the last good copy.

Following Google's [incremental sync protocol](https://developers.google.com/workspace/calendar/api/guides/sync),
all pages are staged before the next cursor commits. Expired cursors trigger one
full reconciliation. Raw resources and the visible window commit together; failed
pagination or expansion never commits a partial result. The expanded window is
fetched when resources change or the display date window/timezone changes.

## Acceptance status

Automated tests use synthetic Google responses and disposable households. They
cover consent/state rejection, token refresh persistence, encrypted backup/restore,
pagination, failed-window rollback, expired cursors, calendar selection and
account removal, competing worker leases, lost write responses, version conflicts,
explicit resolution and old-backup replay protection. Browser checks use fictional
Google fixtures. Real OAuth and write acceptance on dedicated Google test calendars
remain required before claiming provider acceptance.
