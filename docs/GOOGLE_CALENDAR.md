# Connect Google Calendar

Google connections currently bring appointments **from Google into MyLight**.
Choose calendars in **Settings → Integrations → Google Calendar**. Edit their
appointments in Google; outgoing writes and two-way conflict resolution are not
implemented yet. iCalendar subscriptions remain available without Google setup.

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
recurrence behavior. These imported appointments remain read-only in MyLight.

## Storage, recovery and limits

Tokens are encrypted with AES-GCM and bound to the Google account identity.
They never appear in the browser, calendar-list responses or logged provider
errors. Authorization uses state, PKCE and a short-lived browser nonce bound to
an active owner session. Pending authorization is excluded from backups.

Private backups include encrypted tokens, raw Google event resources, ETags,
original recurrence identities, sync cursors and the cached display window.
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
account removal. A real OAuth client/account round trip is still required for
external acceptance. Outgoing edit queues, ETag conflict resolution and iCloud
CalDAV remain the next stages of two-way sync.
