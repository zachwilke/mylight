# MyLight: project review and product roadmap

Reviewed September 5, 2026, at commit `8611a87`.

## Recommendation

Keep React, Go, and SQLite. The architecture is a good fit for an appliance that a household runs on a small computer or NAS. The project has useful UI and storage foundations, but it is an unfinished prototype, not yet a dependable Skylight replacement. Repairing the existing user journeys is the first milestone; adding more screens alone would overstate progress.

The product promise should be: **Your family's day, beautifully organized. Runs in your home. Works on the screens you already own.**

Design and reliability should advance together. Build one polished, working journey from first installation to a connected calendar, a child's routine, and a phone update appearing on the kitchen display. Use it as the standard for everything else.

## What was verified

- Inspected routing, authentication, API handlers, storage/schema, scheduling, live updates, calendar rendering, chores, meals/lists, weather, screensaver, settings, UI primitives, packaging, and project tooling.
- Installed the locked npm dependencies without updating dependency manifests.
- `npm run build`: passes. Main JavaScript bundle is approximately 1.12 MB minified / 338 KB gzip; CSS is approximately 94 KB / 18 KB gzip. Build does not run TypeScript checks.
- `npx tsc --noEmit`: fails with **73 diagnostics**, including unused code, missing props/types, and component incompatibilities.
- `npm run lint`: passes, but the configuration matches only JS/JSX. The JSON result contains **three files**, leaving the TS/TSX application unchecked.
- `go test ./...` and `go vet ./...`: pass; both Go packages report **no test files**.
- `npm audit`: **18 package findings: 2 critical, 12 high, 2 moderate, 2 low**. These are package advisories, not 18 demonstrated production exploits. The critical entries include `shell-quote` and its dependent `concurrently`, which is a development command tool despite being listed in production dependencies. Several router advisories concern server modes this SPA does not use. Triage reachability while upgrading.
- Ran the built frontend and Go server on port 3307 with a new database under `/tmp/mylight-review.sW3rOC`. Tests used synthetic records, not household data.
- Visually inspected login, desktop dashboard, kiosk calendar at 1280×720, and phone calendar at 390×844.
- Docker configuration was inspected, but an actual image build/container test was unavailable because the Docker daemon was not running. Neither ARM hardware performance nor a long-running kiosk soak test was verified.
- Compared against current official Skylight product/support material, including the August 31, 2026 task documentation. This is a source-based comparison, not hands-on testing of Skylight hardware.
- Used the code-review skill for a supplementary CodeRabbit CLI review of the latest backend changes against `d94e746`. Version 0.7.6 matched the official latest-version endpoint; the review completed across 14 files with three findings: upload body limits, settings query truncation, and history query truncation. Each was checked against source and incorporated below. This limited diff review supplements the broader manual assessment; it is not a whole-repository automated certification.

## Findings and repair backlog

P1 means a release blocker or a major correctness/security issue. P2 means a significant gap to complete before a dependable public release. Static findings are distinguished from reproduced failures.

### P1 — Creating a normal event breaks calendar reads

**Reproduced.** POST `/api/events` with a title and start date, without recurrence, returns success. Subsequent GET `/api/events` returns HTTP 500: `converting NULL to string is unsupported` for `recurrence`.

`eventFromBody` intentionally stores absent recurrence as NULL, but `GetEvents` scans it into a Go string. One ordinary event can therefore prevent retrieval of all events. Use a nullable scan or a consistent non-null contract; add a regression test covering creation, retrieval, edit, and deletion of both repeating and ordinary events.

Evidence: [event conversion](../go-server/api_events.go), [event store](../go-server/store/store_events.go).

### P1 — Fresh installs have no usable onboarding path

**Observed in browser and source.** Every useful route requires a locally stored user; a new database has no accounts; the login page has no first-owner creation flow. `/api/family` can create an account directly, but requiring an API call is not onboarding. The seed utility is not an appropriate fallback: it clears data and does not provide a normal first-owner workflow.

Build `/setup`, shown only before initialization, to create the owner, household timezone, and family profiles. Complete initialization atomically and prevent a second owner-claim race. Child profiles should not need an email or password. Add local recovery and pair wall displays with revocable device credentials.

Evidence: [routes](../src/App.tsx), [login](../src/features/auth/LoginPage.tsx), [schema](../go-server/store/store.go), [seed utility](../go-server/seed.go).

### P1 — Login and parent PIN do not protect the server

**Verified by unauthenticated API requests.** The server returns a user at login, but creates no session and applies no authentication/authorization middleware to household APIs. The parent edit code is sent in the general settings response and checked in browser code. Anyone able to reach the server can read household data and call mutations without signing in.

Separate adult accounts, family profiles, and paired devices. Use server-validated sessions and capabilities, protect settings and uploads, verify a parent PIN on the server, enforce request origins/CSRF rules appropriate to the session design, and keep credential-bearing settings out of general responses. CORS is not authentication.

Evidence: [router](../go-server/main.go), [login handler](../go-server/api_family.go), [auth context](../src/context/AuthContext.tsx), [chore PIN](../src/features/chores/ChoreChart.tsx).

### P1 — Routine mutations are incomplete or report false success

**Reproduced:**

| Action | Current response/behavior |
| --- | --- |
| Read calendar subscriptions or lists | `/api/calendars` and `/api/lists` return HTTP 200 with SPA HTML |
| Edit a family member's name or phone | HTTP 200 success; the original values remain in storage |
| Delete a family member | HTTP 405 |
| Delete a chore | HTTP 400 `EOF`; the request is routed to the toggle handler |
| Delete a meal or photo | HTTP 200 with SPA HTML; no deletion |

**Additional source findings:** `/api/items` and `/api/chat/send` are absent. Member creation returns `{id, success}` while the UI appends it as a complete member. The store ignores phone during member creation. Meals and lists have components but no active application routes. Several fetch callers close dialogs or update local state without checking `res.ok`.

Create an explicit API contract with consistent errors, return full typed resources where the UI expects them, register all intended routes, and return JSON 404 for unknown `/api/*` paths before SPA fallback. Add an API client that handles non-2xx responses, cancellation, and visible retry. Failed optimistic changes need rollback or a pending/error state.

Evidence: [router](../go-server/main.go), [family store](../go-server/store/store_family.go), [family settings](../src/features/settings/tabs/FamilySettings.tsx), [extra handlers](../go-server/api_extra.go), [calendar mutations](../src/features/calendar/CalendarView.tsx), [routes](../src/App.tsx).

### P1 — Chore completion is not idempotent

**Reproduced.** Completing the same chore twice with `{completed:true}` awards two stars and records two completions. Repeating an incomplete request can also subtract stars. This matters immediately with retries and multiple displays.

Use a task occurrence identity, an atomic state transition, and a unique completion constraint. Record reward credits/debits in a ledger so replaying a request cannot change the balance again. Store historical occurrences rather than resetting a single shared boolean every day. Group by stable member ID, not name; two members with the same name currently share the same response bucket.

Evidence: [chore store](../go-server/store/store_chores.go).

### P1 — Uploads need actual size and content restrictions

**Static finding.** `ParseMultipartForm(10 << 20)` sets the in-memory threshold; it does not impose a total upload limit. Files are copied without a maximum body size or image-content validation, and user-selected extensions are served on the application origin. Along with missing API authentication, this permits arbitrary uploads and disk exhaustion; HTML or SVG can introduce active same-origin content if opened.

Enforce body, file-count, decoded-image, and storage limits; validate/re-encode supported image types; use generated names; clean failed uploads and replaced assets; add deliberate serving headers. Video support should arrive with its own supported formats and resource budget.

Evidence: [avatar upload](../go-server/api_family.go), [photo upload](../go-server/api_extra.go), [upload file serving](../go-server/main.go).

### P2 — Calendar semantics are not ready for real provider sync

**Static findings.** Month/week/day views independently expand recurrence. There is no event timezone field, exception model, provider identity, or sync cursor. Clicking an occurrence maps back to the series ID, but editing offers no “this event / future events / whole series” choice. Day/week filtering starts from the event's start day; multiday/all-day treatment is incomplete. Dashboard events are filtered by their original start date and omit later recurring occurrences. Event update validation is weaker than creation validation.

`generateICS` expects `event.date` instead of the domain's `start_date`, always chooses a one-hour end, and does not correctly serialize the full event model or escape text. Rendered views currently attach a `date`, so some exports work, but their duration/details are still lossy.

Create a shared occurrence engine with household/event timezones, date-only all-day ranges and exclusive ends, RRULE/EXDATE/RECURRENCE-ID support, stable occurrence IDs, and range-based queries. Test daylight-saving transitions, midnight, overlapping and multiday events, cancelled occurrences, and series edits before two-way sync.

Evidence: [calendar components](../src/features/calendar/components), [ICS helper](../src/lib/icsUtils.ts), [event model](../go-server/store/models.go).

### P2 — Live updates and scheduled resets are fragile

**Static findings.** SSE exists only in the kiosk wrapper. That effect reconnects when idle state changes and hard-reloads after an SSE error. One slow subscriber can block the broker's unbuffered broadcast loop and eventually API notifications. Meals/photos do not broadcast changes. Scheduled reset paths do not broadcast either.

`rescheduleReset` removes every cron entry, including the safety-net job registered immediately before it. Invalid reset settings are stored and existing jobs removed before validation succeeds. `ResetChores` checks the calendar date instead of whether the configured reset boundary was crossed; a restart can reset chores early. Resetting data and recording the reset are separate writes.

Provide one application-wide live connection, bounded/nonblocking subscribers, reconnect/backoff, visible stale state, and resource-specific invalidation. Track scheduler jobs individually and validate before replacement. Prefer occurrence-based routines to global daily resets.

Evidence: [broker/scheduler](../go-server/main.go), [kiosk wrapper](../src/App.tsx), [chore reset](../go-server/store/store_chores.go), [meal/photo handlers](../go-server/api_extra.go).

### P2 — UI is not yet a coherent wall-and-phone product

**Visually confirmed.** At 390px wide, the persistent desktop sidebar takes about 256px and squeezes/clips the calendar into the remaining space. The older `Layout` has mobile navigation, but the active `DesktopLayout` does not use it. Kiosk mode uses a different visual treatment and exposes only weather/calendar/chores; its calendar lacks the desktop view switcher.

**Source findings.** Dashboard temperature and weekly progress are hard-coded to 72° and 85%; event and chore “counts” are lengths of capped previews. A notification component contains mock data and is not evidence of a notification service. Modals lack focus trapping, dialog semantics, and reliable focus restoration. Several icon-only controls lack accessible names. Chore celebrations ignore saved enable/disable settings and include a rapid full-screen color-flash animation. The configured font is not bundled. Themes initialize only in components that call `useTheme`.

Adopt one design system and adaptive navigation, use real data and honest empty/error states, add accessible controls, and honor reduced-motion settings. Replace full-screen flashing with a short, local celebration.

Evidence: [active layout](../src/components/Layout/DesktopLayout.tsx), [kiosk](../src/features/kiosk/Kiosk.tsx), [dashboard](../src/features/dashboard/DashboardHome.tsx), [modal](../src/components/ui/Modal.tsx), [styles](../src/index.css), [appearance settings](../src/features/settings/tabs/AppearanceSettings.tsx).

### P2 — Storage, releases, and maintenance need a product workflow

**Static findings.** Migrations are repeated `ALTER TABLE` attempts whose errors are ignored. SQLite foreign keys are declared but not enabled by this setup. PRAGMA behavior needs to be consistent across pooled connections. Queries impose silent limits without pagination/overflow reporting. Meal upsert has no database uniqueness constraint on date/type and cannot represent multiple recipes per slot. There is no backup/restore UI or documented tested upgrade path.

Compose currently builds locally, names an unversioned local image, and uses an application endpoint as a healthcheck. No checked-in release CI, `.dockerignore`, or license file was found. README claims MIT but the referenced license is absent. Two approximately 14 MB backend binaries are tracked. The Makefile runs from `go-server` while the default static directory is `./dist`; the built frontend is one directory above. The documented `go run ./go-server` from the repository root also does not match the nested module layout. The Go prerequisites and current folder structure are not documented correctly. `.gitignore` does not broadly cover `.env` or SQLite WAL/SHM sidecars.

Introduce versioned migrations, integrity checks, deterministic queries, typed contracts, restore-tested snapshots, explicit release artifacts, and automated clean-install/upgrade tests. Handle license selection as an owner decision rather than silently inventing licensing terms.

## Skylight parity matrix

This is functional parity for a household calendar, not parity with proprietary display hardware or licensed character artwork. “Partial” means source/UI exists, not that the complete workflow passes.

| Capability | Current Skylight baseline | MyLight today | Target |
| --- | --- | --- | --- |
| Shared family calendar | Color-coded profiles, shared events | Partial local CRUD; ordinary-event blocker | Reliable day/week/month/agenda, multiple people, filtering, overlap/all-day support |
| Provider sync | Two-way Google and iCloud; one-way Outlook/Yahoo/Cozi and calendar URLs | Subscription UI/schema fragments; no working connector | Reliable ICS subscriptions, then Google and iCloud two-way; Outlook import for parity |
| Routines and chores | Assigned tasks, morning/afternoon/evening, flexible repeat rules, shared claimable tasks, skip/habit features | Morning/evening list, single completion boolean | Task templates + occurrences; multiple assignees; scheduled/completion-based repeats, skip/overdue/claim workflows |
| Stars and rewards | Earn and redeem stars | Basic star counter; duplicate-credit bug; no redemption | Auditable credits, configurable value, reward catalog, redemption and parent controls |
| Lists | Shared custom/grocery/to-do lists, phone access | Unrouted UI; missing server/storage support | Shared lists, ordering, categories, instant sync and practical offline shopping |
| Meals and recipes | Meal plans, recipe collection/import, grocery integration | Unrouted planner; partial date/type storage | Week plan, recipe library, ingredients/servings, multiple meals, grocery generation |
| Import assistant | Events/recipes from emails, images/PDFs; generated meal plans | Environment-variable placeholders | Reviewable extraction drafts with source, deduplication, explicit accept; optional AI provider |
| Screensaver | Photos/videos, albums/captions | Photo slideshow and clock/weather; deletion broken | Reliable media library, albums/crop/orientation, schedule; videos later |
| Phone and multiple displays | Mobile app and linked devices | Responsive intent; broken phone shell; kiosk SSE only | Installable responsive app, household pairing, per-device display settings, resilient sync |
| Reminders | Calendar/task workflows and mobile capabilities | No notification delivery service | Local display reminders first; optional phone push with quiet hours |
| Weather | Not the central parity requirement in the reviewed sources | Detailed external weather/map integration | Retain as a secondary widget; shared cached location/settings and stale-data fallback |
| Visual personalization | Profile colors/photos and licensed Disney mode | Pastels, avatars, dark theme, confetti | Original themes and icon sets, calm mode, accessible family identity; no dependency on licensed characters |

Sources: [Skylight sync support](https://skylight.zendesk.com/hc/en-us/articles/35986090425627-What-does-Skylight-Calendar-sync-with), [current routines/tasks support](https://skylight.zendesk.com/hc/en-us/articles/36846381293979-Using-the-Tasks-Tab-Routines-and-Chores), [Calendar Plus](https://myskylight.com/products/calendar-skylight-plus), [meal planning](https://myskylight.com/lp/meal-planning/), [device linking and lists](https://shop.myskylight.com/disney).

Specific current sync documentation lists both Google and iCloud two-way support. An older general setup page says only Google; use the more specific updated documentation. Flexible routines and completion-based repeats are already in Skylight's current task documentation, so those should not be marketed as new advantages over Skylight.

## Make hosting wicked easy

The acceptance target: **with Docker already installed, a new user gets from a short command to a usable household display in under five minutes, excluding optional provider authorization.** Measure it with someone unfamiliar with the repo.

1. Publish versioned Linux amd64 and arm64 images. Default Compose should pull a release, not compile source. Retain a development override for contributors. One app, one persistent data location, no separate database/cache service.
2. Also publish signed/checksummed standalone binaries with the frontend embedded. A basic local installation should not require Node, Go, or a source checkout. Provide service instructions for restart-on-boot; binaries alone do not solve that.
3. First-run wizard: create owner → household name/timezone → people → optional calendars → pair display. Detect defaults, explain failures inline, and let users skip integrations.
4. A phone scans the wall's short-lived pairing code/QR, signs in, and approves that display. Store revocable, restricted display credentials; editing account/integration settings needs adult access. Separate global household settings from device orientation, brightness theme, home view, and sleep schedule.
5. Add `/healthz` and `/readyz`, a readable diagnostics page, server/version/storage status, and copyable logs with secrets removed. Startup should explain unwritable volumes, bad config, migration failures, and occupied ports.
6. Offer a single backup archive containing a consistent database snapshot, uploads, metadata, and a documented treatment of credentials/encryption keys. Encrypt credential-bearing exports or exclude secrets and require reauthorization. Include restore preview and compatibility checks. Use SQLite's online backup mechanism or `VACUUM INTO`, not a bare copy of a live WAL database. [SQLite backup documentation](https://www.sqlite.org/backup.html)
7. Updates should show release notes, take a snapshot, and have a tested recovery plan. An old binary is not sufficient rollback after an incompatible migration; restore the compatible snapshot when necessary.
8. Offer remote access as optional setup. Start with a documented private-network/VPN path; a public reverse proxy requires production auth and TLS. Do not make domain ownership, router port forwarding, or an online MyLight account prerequisites for local use.

Two real constraints must be designed explicitly. First, a server's `localhost` is not the phone's `localhost`; Google OAuth needs an intentional client/redirect strategy. Offer an advanced bring-your-own OAuth setup initially and investigate a verified connection helper later, with clear trust and maintenance costs. Do not bury credentials setup in a supposedly effortless wizard. [Google web OAuth requirements](https://developers.google.com/identity/protocols/oauth2/web-server)

Second, service-worker offline features require a secure browser context. A phone opening plain `http://192.168.x.x` does not gain the localhost exemption. The local HTTP app can still work while the home server/LAN are up, but a fully offline phone experience needs a supported HTTPS path and browser testing. Separate “internet down, LAN still up” from “phone disconnected from server.” [MDN service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)

## Make the UI beautiful

Recommended direction: **warm, quiet, legible, and recognizably MyLight**. A household display should feel at home in a kitchen. Replace decorative competition with a clear visual hierarchy and enough space for real family schedules.

| Element | Proposed design rule |
| --- | --- |
| Canvas | Warm paper `#F7F5F0`, white surfaces, ink `#252923`; subtle boundaries and sparing shadows |
| Accent | Deep evergreen `#355B48` for primary actions; family colors remain a separate identity system |
| Family identity | Sage, terracotta, muted blue, ochre, and lavender tints; always pair color with a name, initials, or avatar |
| Typography | Bundle one carefully chosen open font; use tabular time numerals and a consistent size scale. Start around 20–24px for wall event titles and validate at actual viewing distance |
| Density | Comfortable wall mode, compact planner mode, phone agenda; scale content intentionally instead of increasing the global root font size |
| Touch | At least 48px controls as a project target; large completion targets; clear pressed/selected states; no hover-only actions |
| Motion | Short local feedback; restrained transitions; reduced-motion support; no full-screen flashing |
| Themes | Designed light and dark palettes with tested contrast; per-display settings and optional schedules |
| Content states | Useful empty setup suggestions, skeletons, unsaved/pending state, readable errors, retry and undo |

**Wall home:** a compact header with household, date/time, weather and discreet sync status. The next seven days take roughly two-thirds of a wide screen. A “Today” panel holds upcoming events, routines and dinner. A compact navigation strip provides Today, Calendar, Tasks, Meals, and Lists. Full month and focused chores views remain available. On portrait displays, stack today's information above the agenda.

**Phone:** Today/agenda first, bottom navigation, a prominent Add action, and full-width sheets for editing. Optimize quick event entry and grocery checkoff. Settings and historical charts belong behind secondary navigation.

**Child tasks:** large avatar columns or a focused personal view, optional pictograms, progress toward a chosen reward, and one-tap completion with undo. Use friendly language; “Performance History” and “household efficiency” currently read like an employee dashboard.

**Calendar details:** consistent source/profile labeling; real event times; visible overlap and multiday treatment; a compact “more events” count with an accessible expansion. Editing a series must explain the scope before saving. Drag-and-drop needs a tap/keyboard alternative.

Validate with a dense six-person week, long titles, empty households, multiple overlapping events, dark mode, portrait, and disconnected states. Review at 390px, 768px, 1280×800 and 1920×1080, then on actual target hardware at viewing distance. Palette choices are proposed, not contrast-tested deliverables yet.

## Architecture to support parity without complicating hosting

Keep one Go application with modules for identity/devices, calendars/sync, tasks/rewards, meals/lists, media, and settings/operations. Use durable jobs in SQLite for polling/import work before considering separate workers. Keep the React frontend and consolidate shared fetch/cache and live-update logic.

Recommended data-model additions:

- Adult accounts/sessions, family profiles, devices/pairing tokens. One household per installation initially.
- Calendars/sources, provider credentials, event masters, recurrence exceptions, event participants, sync cursors and tombstones.
- Task templates, assignees, occurrences, unique completions, reward definitions, star transactions, redemptions.
- Lists/items; recipes/ingredients; meal entries referencing recipes. Do not make one date/type pair the sole meal identity.
- Media metadata, albums and device preferences; schema version and backup metadata.

Use typed Go responses and a documented/generated client contract rather than `map[string]interface{}` and pervasive `any`. Keep changes incremental; replacing the entire stack would spend time without addressing the user-facing failures.

Sync should run server-side, keep a local copy usable without internet, report last successful sync and errors, and distinguish source-controlled fields from local metadata. Preserve stable provider IDs; deduplicate imports; handle deletions and expired sync cursors. Google's incremental-sync guide explicitly requires recovering from invalidated tokens. [Google Calendar sync](https://developers.google.com/workspace/calendar/api/guides/sync)

Offline writes require an outbox with operation IDs, resource versions, conflict rules and visible status—not just a service worker. Make local chores/list changes replay safely before enabling offline calendar edits against providers.

## Where MyLight can be better

1. **Ownership and longevity:** ordinary household features without a MyLight subscription, portable calendar/data exports, no required vendor account, and support for existing tablets/screens. Hosting hardware, optional AI, and remote services can still have costs.
2. **Dependable local operation:** calendar and routines remain usable during an internet outage when the home server is reachable; cache useful phone data separately and show stale/pending changes honestly.
3. **Explainable sync:** show which source owns an event, when it last synced, why it failed, and how conflicts were resolved. Prevent duplicates and silent disappearance.
4. **A calmer family experience:** legibility, original tasteful themes, sensory-friendly motion controls, pictogram tasks, accessible touch targets, and household-specific display layouts.
5. **Open integration:** a documented authenticated API and selected Home Assistant/webhook connections after the core is stable. Two-way Outlook through Microsoft Graph is a potential functional advantage over Skylight's currently documented one-way Outlook support, but needs a dedicated feasibility/security spike.
6. **Optional intelligence with review:** upload a school flyer, see proposed events alongside the source, resolve ambiguity, then accept. AI assistance should be optional; support a provider adapter and explicit data disclosure. Email ingestion needs a mailbox/relay strategy and should not block local event import.

Avoid a plugin marketplace, arbitrary drag-anything dashboard builder, native mobile apps, bundled large models, or complex distributed infrastructure in the first release. They add maintenance before the essential household workflows are trustworthy.

## Delivery sequence and acceptance gates

Effort labels express relative scope, not promised dates. Sync and browser/device behavior require discovery before a credible calendar estimate.

| Milestone | Work | Relative scope | Done means |
| --- | --- | --- | --- |
| 1. Trustworthy foundation | Fix P1 bugs; setup/accounts/devices; typed API contracts; migrations; proper lint/typecheck; release tooling and backups | Large | Fresh install creates a household; ordinary event CRUD works; repeated chore requests award once; unauthorized operations fail; restart and backup restore preserve data |
| 2. Beautiful daily-use release | Shared design system; wall Today/week/tasks; real dashboard data; phone navigation; finish lists and basic meals/photos; global live updates | Large | A parent edits on phone, display updates, child completes routine, grocery item persists; all visible controls work at target sizes |
| 3. Calendar parity | Shared occurrence model; ICS subscriptions; Google/iCloud two-way; provider errors/recovery; import/export and series editing | Extra large | DST, exceptions, cancellations, duplicate prevention, reconnects and concurrent edits pass provider fixtures and real integration tests |
| 4. Household parity | Rich routines/rewards; recipes and groceries; screensaver library; reminder controls | Large | Earn/redeem/undo is consistent; recipes make usable grocery lists; task schedules/skip/claim behavior are correct; media management survives restart |
| 5. Distinctive advantages | Phone offline outbox; optional reviewed AI import; selected home integrations; evaluate Outlook two-way | Large to extra large | Each addition has a tested failure/recovery path and preserves the simple local installation |

A compelling first release can ship before full Skylight parity, but publish an honest feature checklist. Do not label partial subscription support as “calendar sync complete.”

The first implementation slice should be **fresh install → owner + child → ordinary event → daily routine → phone/display sync → restart → restored backup**, presented in the new wall/phone shell. That joins easy hosting, beauty, and correctness in a reviewable product increment.

## Tests that matter

- HTTP contract tests for every visible create/edit/delete control, empty arrays, status codes, invalid input, and unauthorized access.
- Storage tests for idempotent completion, star ledger/undo, duplicate names, concurrency, and migrations from a representative old database.
- Calendar fixtures for DST, date-only events, overlaps, multiday ranges, recurrence exceptions, moved occurrences, and sync deletion/retry.
- Browser flows for new-household onboarding, mobile event entry, kiosk completion, upload/delete, lost network, and successful recovery.
- Release tests on clean Docker volumes and existing databases; amd64/arm64 smoke tests; backup restore and incompatible-upgrade recovery.
- A display soak test covering multiple day transitions, sleep/wake, reconnects and bounded memory. Establish performance targets from real target hardware rather than claiming support from a Dockerfile alone.

## Scope of this deliverable

This is an assessment and implementation roadmap. Application source was not changed. Generated local build/dependency files and the disposable test household were used only for verification. Dependency advisories were not automatically fixed. Product sources and package audit data reflect the review date.
