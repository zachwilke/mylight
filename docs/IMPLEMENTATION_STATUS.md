# Implementation status — September 5, 2026

These are incremental implementations from the approved roadmap, **not full Skylight
parity**. Work is on `codex/mylight-foundation`. This document records
implementation evidence, not release approval or deployment to a household server.

## Calendar conflict protection and explicit series scope — September 5

- Transactional schema 6 adds event versions, starting existing records at 1.
  Successful updates and participant removal advance the version. Versioned
  SQL update/delete predicates and affected-row checks prevent stale writes;
  bounded retries restart rolled-back SQLite lock/snapshot failures, not conflicts
  or successful writes. Tests exercise independent database connections.
- Calendar GET responses include `version`; authenticated GET `/api/events/:id`
  loads the latest complete local record. PUT requires the version in its JSON
  body; DELETE requires a single positive `version` query parameter. Missing
  preconditions return 428, stale versions 409, and deleted records 404. Older
  browser clients must reload MyLight; unconditional API writes are no longer
  accepted. Trusted internal store helpers remain available for maintenance/tests.
- The editor preserves rejected drafts and provides an explicit destructive-draft
  reload action. Reload failures leave the draft intact. Save failures focus and
  scroll the recovery notice into view. Delete failures remain in the confirmation
  dialog and editor; pending saves block editing/closing/double submission.
- Existing recurring-series edits require an acknowledgement. The UI explains
  that dates describe the first occurrence and changes affect past/future instances.
  Series deletion is explicitly named and its confirmation stacks above the editor.
  Custom recurrence rules are displayed as custom and preserved on save.
- This is a safety prerequisite, not this-occurrence/this-and-future editing,
  provider sync, offline replay, automatic merging, or a timezone-engine rewrite.
  A retry after an ambiguously successful save conflicts safely; it does not yet
  reconcile through an idempotent operation queue.

Verification: 50 frontend tests and 48 Go tests pass; production/native build,
typecheck, Go race tests/vet, production dependency audit and diff checks pass.
Lint remains zero errors / 18 existing warnings. Browser evidence covers two open
editors, a rejected stale save, preserved draft, explicit latest-version reload,
visible recovery notice, disabled unacknowledged series save and cancellation of
the series-wide delete confirmation. Only synthetic preview records were changed;
a schema-5 SQLite backup was retained before migration.

The code-review skill prompted SQL predicate/affected-row strengthening, bounded
contention retries and URL normalization. Final calendar review returned zero
findings; storage review had one minor advisory and no major findings. Its proposed
first-selected primary participant was declined: the documented compatibility
field deliberately uses the lowest ID, independent of checkbox selection order.
Gate B remains in progress; timed recurrence exceptions/timezones and
two-way provider synchronization are still unfinished.

## Multi-person calendar events — September 5

- Transactional schema 5 adds an event/member join table and backfills valid
  legacy assignments. Existing event IDs, dates, details and recurrence masters
  are unchanged. Migration/restart fixtures also cover orphaned legacy IDs.
- Create/edit accepts `member_ids`: distinct positive IDs of up to 100 existing
  family members. An explicit empty array means Shared. Writes validate and commit
  event fields plus participants together; invalid IDs and injected SQL failures
  leave the original record intact. The legacy `member_id` remains a primary-ID
  compatibility field, derived from the lowest selected ID.
- Older requests without `member_ids` still work for single-person events. Editing
  a multi-person event with that old shape returns 409 instead of silently losing
  participants. Missing events now return 404 on update. Concurrent-edit version
  checks and provider conflicts remain separate unfinished work.
- Removing a family profile retains the event and remaining participants; removing
  the last participant makes it Shared. Event deletion cascades participant rows.
  Backup/restore accepts schema 5 and round-trips participant assignments.
- The editor provides labeled, touch-sized multi-select checkboxes, duplicate-name
  disambiguation, explicit clearing, and recoverable unavailable selections. Save
  is disabled while profiles load or fail. New events default to Shared rather
  than silently choosing the first profile.
- Calendar filters match any participant without duplicating cards. Calendar,
  agenda, Today and paired wall displays show participant names. These are local
  household assignments, not email invitations or provider attendee synchronization;
  ICS export does not turn internal member IDs into ATTENDEE addresses.

Checks: 45 frontend tests and 43 Go tests pass; production/native builds, typecheck,
lint (zero errors / 18 existing warnings), Go race tests/vet, production dependency
audit and diff checks pass. Browser verified creation/reopening of a synthetic
Alex + Sam event, filtering by Sam, and phone-width participant editing. A SQLite
backup of the synthetic schema-4 preview was retained before migration.
The code-review skill's calendar and storage passes both returned zero findings.
Gate B remains in progress, especially timezones/recurrence exceptions,
individual source filtering, and real two-way provider synchronization.

## Family calendar filters — September 5

- One-person and multi-person schedule filters now work in month/day/week grids
  and desktop/mobile agendas. The first person selected focuses their schedule;
  additional selections combine schedules. Everyone resets, including newly added
  members; an empty selection explicitly shows nobody rather than all events.
- Filters use stable member IDs, disambiguate duplicate names, and retain a
  removable choice if a selected member becomes unavailable. Shared includes
  unassigned/deleted-member events and read-only subscribed calendars. This is
  display filtering, not access control or multi-participant event assignment.
- Selections survive date/view navigation and live refreshes. They are intentionally
  in-memory, reset on leaving/reloading the calendar, and never modify household
  records or globally change another person's display.
- Family metadata and event slices come from the same revision-guarded load.
  Eight new tests cover ID-based filtering, shared/empty states, reset, view/date
  changes, refresh, unavailable members and superseded network responses.
- Browser verified local synthetic timed/all-day data, a filtered desktop agenda,
  keyboard activation, and wrapped 390px phone controls. Week flex sizing now keeps
  the remaining calendar area scrollable beneath the controls.

Verification: 41 frontend tests and 39 Go tests pass, including Go race tests;
typecheck, production/native builds, Go vet, production dependency audit and diff
checks pass. Lint has zero errors and the same 18 existing warnings. The code-review
skill's calendar pass completed with zero findings. No dependencies were added.
Gate B is still in progress: multi-participant events, individual source filtering,
timed-series timezone/exceptions and real two-way provider sync remain unfinished.

## Overlapping calendars and desktop agenda — September 5

- Shared deterministic column layout for timed day/week cards: simultaneous and
  nested events sit side by side, completed overlap groups regain full width,
  and short cards participate in collision detection using their visible height.
  Extra bottom space keeps late-night minimum-height cards inside the scroller.
- Native buttons preserve keyboard activation, show full title/time/member in
  accessible names and tooltips, and edit the original event rather than its
  rendered day slice. All-day rendering is unchanged.
- Desktop week has Time grid / Agenda controls. Phones retain the agenda default.
  Agenda cards retain member/source labels and colors and show full wrapped titles.
- Five algorithm tests cover nested, touching, short, late-night, shuffled and
  dense overlapping intervals; component tests cover identity/activation and
  switching views. 33 frontend tests and 39 Go tests pass; production/native build
  and lint pass (zero errors, 18 existing warnings).
- Browser verified three simultaneous synthetic appointments in day and week,
  correct event selection, and the desktop agenda's full busy-day titles.
  No real household records or provider accounts were used.

Code-review checks found no major issues in the initial calendar or layout-helper
passes; the final calendar/agenda review completed with zero findings. The suggested occurrence-only card key
was declined because segment IDs already include occurrence and day. A separate
advisory to alter unsupported sub-daily recurrence fallback is deferred to the
remaining recurrence-engine work; it is not needed for this layout change.
Gate B remains in progress: two-way sync, timed-series timezone/exception editing,
participants/filtering and the rest of the roadmap are not claimed complete.

## Calendar range and all-day continuation — September 5

- Date-window reads validate explicit-offset start/end bounds (exclusive end,
  maximum 370 days), filter ordinary event overlaps in SQLite and cached ICS
  occurrences in memory, and preserve potentially relevant recurrence masters.
  A 5,000-entry combined ceiling fails explicitly instead of truncating silently.
- Month/week/day, Today and restricted displays request their actual date window.
  Calendar views expose loading/error/retry state, hide an old window's events
  during navigation, and discard responses from superseded requests.
- New all-day writes are date-only with exclusive ends. The editor converts its
  inclusive last day in both directions; exports emit VALUE=DATE. All-day repeat
  expansion uses civil dates across DST. Legacy timestamp records are preserved,
  not guessed/migrated en masse. Timed series timezone/exception work is pending.
- Review-driven adjacent fixes: confirmation callbacks are awaited, repeat clicks
  and dismissal are blocked while pending, rejected promises are displayed, and
  meal deletion waits for completion. Existing callbacks retain ownership of
  success-only closure because some handle errors internally.
- Chore reloads are revision-gated and reconciled only after pending mutations
  settle; a stale response cannot undo a newer optimistic completion. Same-task
  repeated clicks cannot send concurrent writes. Duplicate-name grouping remains
  an explicit upcoming task, not fixed by this race correction.

Checks: 39 Go tests (race detector) and 26 frontend tests pass, including React
component tests for confirmation races, stale chore loads and all-day edit
round trips. Frontend tests passed in America/Chicago and Pacific/Kiritimati;
range-query fixtures additionally cover UTC−12, UTC+14 and the 23-hour DST day.
Typecheck/production build, Go vet, npm audit and diff checks pass. ESLint remains
at zero errors / 18 existing warnings. No runtime dependencies were added; React
Testing Library and jsdom are development-only regression-test dependencies.

Browser evidence: month navigation retains local/imported events; offline loading
shows a persistent calendar error; server restart recovers automatically. A
synthetic all-day event was saved across four days and reopened with its inclusive
last day intact. Native date-picker selection was used after the automation's
direct date-value fill did not commit React input state.

The code-review skill prompted the all-day editor/export and race fixes. Backend
and settings rechecks returned no findings; the calendar recheck had no major
findings. Its two remaining advisories were handled by adding kiosk navigation
labels and verifying that save/delete API failures already surface through the
shared `api-error` handler; a duplicate toast was not added. Family-load failures
now also render inside the event editor and calendar-removal failures reach the
confirmation dialog. Its proposed display
key change was rejected: `segments()` already makes `event.id` unique per
occurrence **and day**, whereas `occurrenceId` repeats across multi-day slices.
The work advances Gate B; two-way provider sync, timed recurrence exceptions,
overlap layout and the other completion gates are still unfinished.

## Completion execution: identity and displays — September 5

The full remaining scope and real acceptance requirements are in
[COMPLETION_PLAN.md](COMPLETION_PLAN.md). Gate A is still in progress, not a claim
that the entire roadmap is done.

- Single-use, ten-minute owner-approved display pairing with a separate browser
  proof, hashed credentials, one-year expiry, bounded pending/active device counts,
  throttled approval attempts, revocation, and server-enforced capabilities.
- Dedicated shared display with Today/Week, family calendar, tasks and meals;
  owner-controlled light/dark/system theme and optional task completion/undo.
  Displays cannot administer accounts, edit calendars, upload, or export backups;
  family contact details and non-display settings are withheld.
- Revoked/expired account and display sessions lose API access and live updates;
  the browser clears its household view when it receives session expiration.
- Settings → Account lists only the current account's sessions. Password-confirmed
  session revocation and password changes are checked transactionally on the
  server; password changes sign out all account sessions without removing data.
  Public session handles are distinct from stored cookie verifiers.
- Offline owner recovery preserves household data while revoking account and
  display credentials. Exclusive data-directory locks protect current server,
  recovery and restore processes. Password files accept bounded LF/CRLF input.
- Transactional schema 4; device grants/pending codes are omitted from downloaded
  backups and cleared on restore. Tailscale identity remains separate.

Verification: 35 Go tests pass, including race detection; Go vet, thirteen frontend
tests, production typecheck/build, native macOS build, Linux arm64 and Windows
amd64 cross-compilation pass. ESLint has zero errors and 19 existing warnings.
An initially mistyped test invocation passed `--run` through to Go and failed;
the corrected `npm test` passed in full. Cross-compilation is not hardware testing.

Browser evidence on the disposable synthetic household: approve a separate
display, automatic pairing transition, task complete/undo, live dark theme and
view-only permission updates, accessible disconnection confirmation, immediate
return to pairing on revocation, and the new account/session controls rendering
at desktop and 390px phone widths.
Password change and cross-account boundaries are covered by backend regression
tests, not a real user's account. Muted text contrast was improved on new screens.
CodeRabbit's backend follow-up returned no findings, including the new account
controls. Its settings review prompted guarded/defaulted device preferences with
three new regression tests and narrower account request payloads. The focused
settings recheck returned no findings. Runtime npm audit reports zero vulnerabilities; Go
vulnerability analysis reports no affected symbols/imported packages and the
previously documented unused module advisory remains.

Remaining in Gate A: server-side parent elevation and finer-grained child/account
administration. Gates B–I remain as explicitly tracked in the completion plan;
real-provider, container, tailnet, hardware/soak and publication gates have not run.

## Private access and sync continuation — September 5

- Optional native Tailscale via pinned `tailscale.com/tsnet` v1.102.3; no separate
  daemon, privileged container, host Tailscale CLI, or public Funnel. Defaults off.
- Private TLS listener on tailnet TCP 443; ordinary LAN HTTP stays available by
  default. Tailnet-only mode restricts HTTP to loopback for local recovery.
- Owner-only Remote access settings show disabled, enrollment, approval, HTTPS
  prerequisites, and configured-address states. No automatic login from Tailscale
  identity headers. First-run owner creation is blocked on the private listener.
- Persistent device identity is separate from household data/backups. Compose
  includes a dedicated identity volume. Optional auth-key file support, hostname
  validation, TLS Secure session cookies, and dual-listener shutdown.
- ICS ETag/Last-Modified conditional refreshes with safe 304 handling. Date-window
  and timezone changes invalidate validators for occurrence re-expansion. Failed
  parsing preserves the previous snapshot and its validators. Migration version 3
  and backup restore support are transactional/compatible with earlier snapshots.
- Go build baseline raised to 1.26.6 for current tsnet. README includes native and
  Compose setup, tailnet policies, HTTPS certificate privacy, and recovery steps.

Checks: 26 Go regression tests and 6 frontend tests; race detector, typecheck,
production build, lint (0 errors / 19 existing warnings), Go vet, and Linux amd64/
arm64, macOS amd64, and Windows amd64 cross-compilation (native macOS arm64 build).
Browser inspected Remote access at desktop and 390px phone
sizes; the isolated demo household upgraded and kept its existing calendar feed.
Compose configuration validates, but Docker's daemon is unavailable here.
`npm audit` reports no vulnerabilities. Go vulnerability analysis reports no
affected symbols or imported packages; one module-level advisory remains for
unused, unmaintained `golang.org/x/crypto/openpgp` (GO-2026-5932). Upgrading
`x/crypto` to v0.56.0 cleared three other module-level advisories. This is not a
security certification or a substitute for a real-tailnet smoke test.
The same Go vulnerability result was checked for Linux arm64, not only macOS.
CodeRabbit identified and prompted a fix for direct family-member lookup being
incorrectly limited to the first 100 profiles; a regression now covers update
and deletion beyond that list limit. Its focused recheck left only an advisory
suggestion to silently default invalid chore-reset times to midnight. That behavior
change was deliberately declined: invalid stored times continue to surface as
errors instead of unexpectedly resetting chores at another time. Wrapped SQL
not-found handling and misleading upload-limit/reset log messages were improved.

Not verified: actual tailnet enrollment, TLS issuance, remote-device reachability,
device revocation/restart behavior against a real tailnet, or a running container.
No real Tailscale account, auth key, or network policy was used or changed. Two-way
provider authorization/sync remains unfinished. Restricted wall-device pairing was
implemented in the subsequent identity slice above.
Follow [the operator smoke checklist](TAILSCALE_SMOKE_TEST.md) before calling
private networking production-ready.

References: [tsnet](https://tailscale.com/docs/features/tsnet),
[tsnet server API](https://tailscale.com/docs/reference/tsnet-server-api),
[HTTPS setup](https://tailscale.com/docs/how-to/set-up-https-certificates),
[HTTP conditional requests](https://www.rfc-editor.org/rfc/rfc9110.html).

## Calendar continuation — September 5

The second slice adds functioning read-only calendar subscriptions. The original
first-slice notes below are historical; subscriptions are no longer scaffolding.

- Owner-managed HTTPS/webcal feed connections with names/colors, refresh, removal,
  last-success/error status, a cached date window, and no feed URL in API responses.
- Refresh every 15 minutes; last-good snapshot retained on failure; stable source
  occurrence IDs; provider removals applied on a successful replacement snapshot.
- Guarded server-side networking: public IP checks at connection time, validated
  redirects, DNS-rebinding resistance, no environment proxy, and bounded download,
  recurrence-work, and snapshot sizes.
- Imported daily/weekly/monthly/yearly recurrence, EXDATE/RDATE, individual moved
  or cancelled instances, IANA timezones, floating household-local times, and
  exclusive all-day dates. Unsupported constructs fail visibly rather than being
  silently approximated. See README for exact supported limits.
- Shared calendar display code across Today/month/week/day. Date-only values no
  longer shift back a day in western timezones; overnight/multi-day events get
  daily slices. Week-view render-triggered refetching is fixed; stale view requests
  cannot overwrite newer results. Day/week have separate all-day rows and begin
  their scroll at 7 a.m.; event cards are keyboard activatable.
  On phones, week view becomes a readable day-by-day agenda.
- Subscribed details explicitly read-only; changes stay in the original calendar.
- Transactional version-2 source migration and restore compatibility. The backup
  regression includes subscription credentials; sessions still do not survive.

Verification: 18 Go tests (race detector) and 6 frontend date/occurrence tests;
production build/typecheck; Go vet; lint without errors (19 legacy warnings);
npm audit with no reported vulnerabilities. A real public US holiday feed was
connected in the synthetic household and yielded 243 cached occurrences; month,
week (including the phone agenda), and read-only event details were checked in the browser.
Fuzzing found a third-party decoder panic on malformed parameters; the importer
now fails safely and retains its last good cache. The failing input is retained
as a regression fixture, and the subsequent fuzz run passed over 2.4 million inputs.
CodeRabbit prompted response-shape validation in subscription settings; its focused
recheck reported no findings. Two-way provider
sync, custom VTIMEZONE interpretation, local series timezone/exception editing,
overlap layout, and offline mutations remain unfinished.

Implementation references: [iCalendar RFC 5545](https://www.rfc-editor.org/rfc/rfc5545),
[go-ical](https://github.com/emersion/go-ical),
[rrule-go](https://github.com/teambition/rrule-go). Public test feed obtained from
[Thunderbird's holiday calendar directory](https://www.thunderbird.net/en-US/calendar/holidays/).

## Implemented in this increment

- First-run household and owner setup, passwordless child profiles, hashed
  server-side sessions, logout/revocation, same-origin mutation protection,
  sign-in throttling, and owner-only settings/account/backup mutations.
- Fix for NULL recurrence breaking ordinary event reads; validation of event
  titles and date ranges; failed event saves retain the editor.
- Working list/item APIs, family edits/deletion, chore/meal/photo deletion, and
  idempotent chore completion/undo. Chore reset follows household timezone.
- Atomic meal moves preserve identity and reject occupied destinations.
- A new warm green/cream Today dashboard and navigation shell, real household
  data, phone bottom navigation, working meal/list routes in wall mode, and
  shared reconnecting live updates. The rest of the feature screens retain
  parts of the previous design and are not a finished system-wide redesign.
- Locally bundled typography, route-based code splitting, reduced-motion
  support, keyboard focus improvements, and shared visible request errors.
- Bounded raster uploads normalized to PNG; authenticated image access.
- SQLite snapshot + photo backup, sessions excluded, offline validated restore,
  and retained pre-restore directory. Restore is not a one-click container flow.
- Schema inspection instead of swallowed migration errors; a schema version
  marker; consistent SQLite connection settings and foreign-key enforcement.
- Non-root Docker configuration, health checks, isolated build context, an
  embedded-UI native executable, and CI/release-candidate workflow definitions.
- TypeScript is now checked by production builds. ESLint actually checks TSX.
  Compatible dependency updates cleared npm audit findings at verification time.

Formatting was normalized with Prettier and TypeScript import organization while
repairing the existing type errors, so the diff includes substantial mechanical
changes as well as functional changes.

## Verification

- Production frontend build/typecheck passed; entry JS approximately 360 KB
  uncompressed / 114 KB gzip, down from approximately 1.23 MB uncompressed.
  Heavier routes are separate chunks, not removed functionality.
- API tests run with Go's race detector: setup/sessions/CSRF, authentication
  throttling, owner authorization, legacy migration, ordinary event lifecycle,
  invalid dates, image rejection, child/family/chore/list lifecycle, atomic meal
  moves, and backup/restore.
- Go vet passed. ESLint has no errors; 20 advisory legacy type/hook warnings remain.
- npm audit reported zero vulnerabilities for both all dependencies and runtime
  dependencies. This is a point-in-time check, not a security certification.
- Browser checked first-run, login, desktop Today, 390px phone navigation and
  calendar, event creation, retained event/session/list after server restart,
  and task completion propagating from phone view to a separate wall tab.
- Native executable served its embedded UI from `/tmp`, without relying on the
  repository's `dist` directory, using only a disposable synthetic household.
- Linux ARM64 cross-compilation passed; that executable was not run on hardware.
- Compose configuration validates. Docker daemon was unavailable, so the actual
  container and multi-platform CI workflows have **not** been executed here.
- CodeRabbit reviews informed fixes to backup locking, accessible dialog naming,
  dashboard request ordering, sign-out failure handling, reduced motion, and ICS
  export. Automated review does not substitute for provider/security testing.

## Still required before the first public release

1. Run container fresh-install and existing-volume upgrade tests on amd64 and
   arm64; publish reviewed, versioned images/binaries after CI passes.
2. Finish server-side parent elevation and finer-grained child/account permissions;
   restricted display pairing and local owner recovery now exist.
3. Complete accessibility and real-device checks across every feature; reduce
   legacy hook/type warnings, and add automated browser regression coverage.
4. Finish bounded calendar queries and local series timezone/exception editing.
   Read-only ICS subscriptions and shared display semantics now exist. Implement provider
   authorization and two-way sync with recovery/conflict fixtures.
5. Harden larger-household edge cases: ID-based chore grouping (names can clash),
   historical foreign-key cleanup, fully versioned transactional migrations,
   photo garbage collection, and upload/backup storage quotas.
6. Make backup scheduling and Docker-volume restoration genuinely approachable;
   complete recovery documentation and failure-injection tests.

The next product milestones remain routines/rewards, recipes/groceries,
notifications, richer media, and offline/optional import features. Legacy
subscription/Google Chat controls are explicitly disabled where surfaced; no
integration is claimed working until its backend and recovery path exist.

No real family data was read or modified during implementation verification. The
local preview uses synthetic names, credentials, and events in a temporary data
directory and should not be treated as a production household.
