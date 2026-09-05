# MyLight

A local home for your family's calendar, little routines, meals, and lists.
React + Go + SQLite. No hosted account or subscription required for local features.

**Under active development:** the foundation is being rebuilt toward Skylight
parity. Provider synchronization, rewards, advanced routines, and automatic imports
are not complete. See [the roadmap](docs/PROJECT_REVIEW_2026-09-05.md).

## Quick start with Docker

Install Docker with Compose, then run:

```sh
git clone https://github.com/zachwilke/mylight.git
cd mylight
docker compose up -d --build
```

Open **http://localhost:3000** and create your household owner account. Add family
profiles in Settings; children do not need an email or password. The current image
is built from source—there is no published prebuilt image promised by this README.

Your database and photos live in the `mylight-data` Docker volume. Restarting or
rebuilding the container preserves them. **Do not use `docker compose down -v`: it
deletes that volume.** Use `docker compose logs -f mylight` for startup errors.

From another device on your trusted home network, use `http://YOUR_SERVER_IP:3000`.
Finish first-run setup on the host before sharing access: the first setup request
claims the household. Do not forward port 3000 to the public internet. For remote
use, provide HTTPS and an appropriately secured private network/reverse proxy.
Set `COOKIE_SECURE=true` only when clients use HTTPS, and preserve the original
Host header through the proxy. No wildcard CORS access is enabled.

Optional Compose environment variables: `HOST_PORT` (3000), `TZ`
(America/New_York), and `COOKIE_SECURE` (false). Household timezone is chosen during
setup and controls chore resets independently of the container timezone.

### Updating

Download a backup first. Review release notes, update your checkout, then run
`docker compose up -d --build`. SQLite changes are applied at startup. Restore a
backup with a compatible version rather than running older code against a newer
database.

The container now runs as an unprivileged user. Volumes created by older root-run
versions may require an ownership migration before upgrading. Keep a copy first;
do not change unrelated host directories or make the database world-writable.

## Run without Docker

For development, install Node.js 22+, npm, and Go 1.26.6+:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies API, uploads, and live updates to Go on
port 3000. This is a Go backend, not Express.

For a production-style, self-contained executable:

```sh
make build
DATA_DIR=./data ./mylight
```

`make build` embeds the built UI into the executable. The executable serves both
UI and API on http://localhost:3000; Node is not needed at runtime. Use a dedicated
data directory with write access. `PORT`, `DATA_DIR`, `COOKIE_SECURE`, and optional
`DIST_DIR` (an explicit frontend override) configure the server. Historical
source-checkout databases are detected; setting an explicit `DATA_DIR` is safest
when moving an installation.

The release-candidate workflow builds Linux amd64/arm64, macOS amd64/arm64, and
Windows amd64 executables with checksums as CI artifacts. It also checks
multi-architecture container builds. It does not automatically publish a release
or push a registry image.

## Backup and restore

In **Settings → Backup**, download a ZIP containing the database and uploaded
images. Sessions are excluded. The ZIP is **not encrypted** and includes private
household data, password hashes, and integration settings; store it securely.
Keep a copy outside the machine hosting MyLight.

Restore is deliberately offline. Stop every MyLight process using the target
directory, then use a dedicated data directory (not your repository or home):

```sh
DATA_DIR=/absolute/path/to/mylight-data ./mylight --restore /absolute/path/to/backup.zip
DATA_DIR=/absolute/path/to/mylight-data ./mylight
```

The command validates the archive and SQLite integrity before replacement. An
existing supported data directory is retained beside it as a timestamped
`.before-restore-*` recovery copy. Everyone signs in again afterward. Restore
rejects unrelated directory contents, unsafe archive paths, newer schema versions,
and archives larger than 512 MiB expanded.

For a Docker installation, stop Compose and restore to a **new host directory**
using a native binary, then configure a bind mount for that restored directory
with ownership compatible with the container user. Do not run restore against a
live database or a container volume mountpoint: replacement requires renaming
the directory. A guided Docker-volume restore workflow remains on the roadmap.

## What's implemented

- First-run household setup, server-side cookie sessions, owner-only account and
  settings administration, and protected data/image access.
- Responsive Today dashboard, calendar views, family profiles, chore completion
  with idempotent star awards, meal planning, shared lists, and photos.
- Side-by-side overlapping appointments in day/week grids, plus a desktop week
  agenda for busy calendars; phones use the readable agenda automatically.
- Family schedule filters across calendar layouts, with multiple selections,
  shared events, duplicate-name handling, and a one-tap Everyone reset.
- Multiple family participants per local event, with names across calendar/Today/
  wall views and filters that match any participant without duplicating the event.
- Version-checked calendar saves/deletes prevent stale editors from overwriting
  newer changes. Failed saves retain the draft, and series-wide changes require
  explicit acknowledgement. Single-occurrence editing is not implemented yet.
- Household-timezone daily chore resets and reconnecting live updates.
- Raster image validation, backup export/offline restore, health checks, and CI.

## Current limitations

- Read-only HTTPS/webcal iCalendar subscriptions now work in Settings →
  Integrations. Google/iCloud/Outlook two-way connections are not implemented.
- New all-day events use date-only values with exclusive ends, including ICS
  export and DST-safe daily all-day repeats. Timed recurring events still need
  complete timezone/exception editing and this/future/series operations.
- Restricted wall pairing is available at `/pair`. The older signed-in `/kiosk`
  uses account permissions. Fine-grained child roles and server-side parent
  elevation are unfinished; the existing edit PIN is not a security boundary.
  Password changes and session controls are in Settings → Account; forgotten
  owner passwords require the local recovery command below.
- No offline mutation queue, scheduled backups, recipe extraction, rewards
  catalog, AI import, or mobile push delivery yet.
- Weather/maps need network access. Uploaded images are normalized to PNG;
  animated uploads become still images. Deleted image files may remain in storage.

## Checks

Calendar reads accept `GET /api/events?start=...&end=...` with RFC3339 timestamps
including each boundary's timezone offset. The end is exclusive and the maximum
window is 370 days. URL-encode offsets (especially `+`). Calendar, Today and paired
display views request their visible window. Local overlaps, recurring masters and
matching cached feed occurrences are included; masters still expand in the UI.
Floating all-day dates follow the caller's civil dates, not UTC date conversion.

Responses are capped at 5,000 combined entries and return an explicit 422 error
when exceeded, rather than a silently truncated calendar. The legacy request
without bounds remains available with the same cap. Feed caches still have their
configured coverage window and are decoded before filtering; this is not yet a
normalized provider occurrence store or complete recurring-series engine.

New all-day writes require `YYYY-MM-DD` start/end values; the end must be later
than the start, or omitted for a one-day default. The editor's end picker is the
inclusive last day and performs the conversion automatically. Historical timestamp
records are not rewritten during upgrade; editing one converts its displayed
dates to the new representation.

```sh
npm run build
npm run lint
npm run test:ui
go test -C go-server -race ./...
go vet -C go-server ./...
```

Lint currently includes advisory legacy typing/hook warnings. API regression tests
use disposable databases, not your real family data. See
[implementation status](docs/IMPLEMENTATION_STATUS.md) for verification details.

MIT licensed; see [LICENSE](LICENSE).

## Connected calendars (read-only)

In **Settings → Integrations**, give the calendar a name and paste the provider's
iCalendar subscription/export URL. This is not the normal calendar webpage URL.
Refreshes run server-side every 15 minutes, or manually with the refresh button
(30-second cooldown). The cache covers the previous 31 days and about a year ahead.
The source status shows exact dates, last successful refresh, and any error.

Subscribed events are read-only and labeled with their source. Edit them in the
original calendar. Successful refreshes replace the snapshot, including removed
events; failures retain the last good copy. Conditional requests use ETag and
Last-Modified when supported, avoiding repeat downloads of unchanged feeds.
A changed cache window or household timezone forces a full refresh and expansion.
Removing a subscription removes only
its cached MyLight events, not the original calendar.

Keep secret feed URLs private: they may grant calendar access to anyone holding
the link. MyLight stores them on your server and in backups, never sends them back
to browser API clients, and does not use a cloud proxy. Only HTTPS (including
webcal rewritten to HTTPS) on port 443 is allowed. Local/private/reserved IPs,
embedded username/password credentials, and unsafe redirects are blocked.

This is bounded iCalendar support, not full CalDAV or provider parity. It handles
daily/weekly/monthly/yearly RRULEs, EXDATE, RDATE dates, moved/cancelled individual
occurrences, named IANA timezones, and exclusive date-only all-day ranges.
Unsupported timezones, sub-daily rules, EXRULE, period-valued RDATE, range-based
overrides, duplicate master UIDs, and invalid feeds produce a visible error.
Limits: 20 subscriptions; 2 MiB downloads; 10,000 event definitions; 500 recurring
series; 10,000 expanded occurrences; bounded expansion work and snapshot size.
Feeds using custom VTIMEZONE definitions need an IANA TZID; custom timezone rules
are not interpreted. Local recurring event timezone editing remains unfinished.

Backups now carry schema version 6. Restore them with this or a compatible newer
build; older builds reject them. The new source-table migration is transactional.

## Native Tailscale support

MyLight embeds [tsnet](https://tailscale.com/docs/features/tsnet): its own optional
Tailscale node, without a separate daemon, sidecar, root access, or `/dev/net/tun`.
Nothing contacts Tailscale unless `MYLIGHT_TAILSCALE=true`. Local hosting remains
the default. This is private inbound access, **not** public Funnel, automatic SSO,
two-way calendar sync, or permission to fetch private-network calendar URLs.

### Quick start (Compose)

1. Start MyLight normally and complete local household/owner setup first.
2. Add `MYLIGHT_TAILSCALE=true` to `.env`, then run `docker compose up -d --build`.
3. Open **Settings → Remote access** as the owner and authorize the new device.
4. Enable MagicDNS and [HTTPS certificates](https://tailscale.com/docs/how-to/set-up-https-certificates)
   in your Tailscale admin console. Approve the device if your tailnet requires it.
5. Install/connect Tailscale on your phone and open the private HTTPS address
   shown in Settings. Sign into MyLight normally.

Your tailnet policy must allow access to the MyLight node on TCP 443. No router
port-forwarding or public DNS record is needed. HTTPS certificates are obtained
on connection; the configured status is not an end-to-end reachability test.
Certificate issuance may take time or fail until the tailnet settings are ready.
Certificate names appear in public certificate transparency logs; choose a
non-sensitive hostname. Tailscale's external coordination/logging services and
account policies still apply; this optional mode is not fully offline.

For unattended enrollment, set `TS_AUTHKEY` through your secret-management system,
or mount a key file and set `MYLIGHT_TAILSCALE_AUTH_KEY_FILE` to its container path
in an override. Do not commit keys. Use one method, remove the key after enrollment,
and persist the device-state volume. Without a key, use the owner-only authorization
link. MyLight does not return auth keys or device state through its APIs or backups.

### Native executable and options

After completing local setup, start with:

```sh
MYLIGHT_TAILSCALE=true DATA_DIR=./data ./mylight
```

| Setting | Default | Purpose |
| --- | --- | --- |
| `MYLIGHT_TAILSCALE` | `false` | Opt into embedded Tailscale. |
| `MYLIGHT_TAILSCALE_HOSTNAME` | `mylight` | Lowercase DNS label for the node. |
| `MYLIGHT_TAILSCALE_STATE_DIR` | Sibling of `DATA_DIR`, with `-tailscale` appended | Persistent identity; must be outside household data. Compose uses its own `/var/lib/mylight-tailscale` volume. |
| `MYLIGHT_TAILSCALE_ONLY` | `false` | Bind ordinary HTTP to `127.0.0.1` instead of LAN interfaces. Requires Tailscale enabled. |
| `LISTEN_HOST` | All interfaces | Optional ordinary HTTP bind address; overridden by tailnet-only mode. |
| `MYLIGHT_TAILSCALE_AUTH_KEY_FILE` | Unset | Optional mounted secret; mutually exclusive with `TS_AUTHKEY`. |

Keep LAN access until enrollment works. In tailnet-only mode, native localhost
remains usable for recovery. **In Docker, loopback belongs to the container:**
the published host port stops working. To recover, set `MYLIGHT_TAILSCALE_ONLY=false`
and recreate the container. Do not turn on tailnet-only mode before local setup.
First-run owner creation is blocked on the Tailscale listener, so another tailnet
member cannot claim an unconfigured household remotely.

HTTPS sessions automatically receive Secure cookies; do not set `COOKIE_SECURE=true`
if you still need plain-HTTP local sign-in. Tailscale headers never bypass login.
To disable remote access, set `MYLIGHT_TAILSCALE=false`, unset tailnet-only mode,
and restart. Revoke/delete the node in Tailscale if retiring the installation.
Do not share or clone its state directory between active servers. Household
restore deliberately leaves the separate identity untouched; restoring to another
host requires new enrollment. Headscale/custom control servers are not supported
by this initial integration.

## Pair a restricted wall display

Do not leave the owner account signed in on a shared screen. On a separate browser
or device, open `http://YOUR-SERVER:3000/pair` (or your private HTTPS address with
`/pair`). Generate a code. On your phone, sign in as the owner, open **Settings →
Displays**, enter the code, name the display, and approve it. Codes expire after
10 minutes and can be used once; the code is not the display's login credential.

The display opens a dedicated view of the calendar, tasks and today's meals. It
is view-only unless the owner enables task completion/undo. It cannot edit events,
accounts, lists or meals, upload files, see integration credentials, download a
backup, or manage other devices. Owners can change Today/Week and Light/Dark/System
preferences remotely. Normal signed-in `/kiosk` mode remains an account session,
not a restricted paired device; use `/pair` for unattended shared screens.

Use **Revoke access** to disconnect a screen. New API requests fail immediately;
live connections are checked on broadcasts and at least every 20 seconds. Loaded
content is cleared when the browser receives the revocation signal, but already
viewed/copied information cannot be retracted. Pair again after expiration (one
year), owner recovery, or backup restore. Display credentials are HttpOnly cookies,
hashed in storage, and excluded from downloaded backups together with pending codes.

## Manage account sessions and passwords

Open **Settings → Account** to see your signed-in sessions, disconnect a session,
or change your password. Each change requires your current password, verified
by the server. Other members' sessions cannot be listed or revoked here. Session
handles are not login credentials. Revocation closes the affected live connection.

Changing a password signs out every session for that account, including the
current browser. It preserves household data and independently approved wall
displays; disconnect those under **Displays**. If you suspect the owner account
and its approved displays were compromised, use local recovery to revoke both.

## Recover the owner account locally

Stop **all** MyLight processes using the data directory, including older versions.
Then run the same executable with the same `DATA_DIR`:

```sh
DATA_DIR=./data ./mylight --recover-owner
```

The terminal asks for a new password without echoing it. No password/email-reset
service is exposed over HTTP. The existing owner's email and household data stay
the same; all account sessions, paired displays and pending codes are revoked.
The owner can then sign in with the existing email and new password.

For Docker, stop the service and use its mounted volume and interactive terminal:

```sh
docker compose stop mylight
docker compose run --rm --no-deps mylight ./mylight --recover-owner
docker compose up -d mylight
```

For non-interactive recovery, provide `--password-file /path/to/protected-file`
containing the new password. Mount it explicitly for a container. Never put the
password in the command line or commit the file. Keep it private and remove it
after recovery. Recovery refuses ambiguous/missing owners and does not create a
new household. Current builds take an exclusive `.mylight.lock` inside `DATA_DIR`
to prevent another server, recovery or restore process from using it concurrently;
older builds do not participate, which is why they must be stopped explicitly.
Do not delete the lock file while a process is running. Use local storage for
SQLite and the lock; network-filesystem locking semantics are not supported here.

The full remaining roadmap and acceptance gates are tracked in
[the completion plan](docs/COMPLETION_PLAN.md). A paired display is not evidence
that provider two-way sync, every household feature, or production acceptance is done.
