# Deadline — Implementation Plan

> Implementation status: MVP frontend, offline PWA shell, Local Storage outbox synchronization, REST API, and SQLite persistence are implemented. Optional statistics and enhancement features remain future work.

Source specification: [Deadline](https://app.notion.com/p/3a2ba9be983481c9b569e7c1afe010b7)

Responsive UI specification: [Mobile-First Responsive Design](./DESIGN_SPEC.md)

## 1. Goal and scope

Build the MVP as a responsive, installable Progressive Web App (PWA) using HTML, CSS, and modular JavaScript. The application must remain usable offline after its first successful load. Persist data in browser Local Storage under `deadline_items`. Keep all time-related statuses derived from the stored deadline data and the current time.

The MVP includes:

- Create, list, view, edit, delete, complete, and cancel deadlines.
- Live countdowns and automatic status calculation.
- Dashboard totals and focused deadline lists.
- Search by title, filter by status, and sort by nearest due date.
- Form validation, safe Local Storage handling, empty states, and responsive layouts.
- PWA installation metadata, offline application-shell caching, and offline CRUD support.

Optional statistics and enhancements are excluded until the MVP definition of done is met.

## 2. Technical approach

### Stack

- Vanilla HTML, CSS, and JavaScript using ES modules.
- A small client-side router and screen-level rendering modules.
- Local Storage as the PWA's offline persistence layer.
- A Node.js REST API backed by SQLite for durable server persistence and future synchronization.
- A web app manifest and service worker for installation and offline operation.
- Vitest or an equivalent lightweight test runner for pure JavaScript logic.
- HTTPS static deployment to GitHub Pages, Netlify, or Vercel so service workers are available in production.

### Recommended application structure

```text
index.html
manifest.webmanifest
service-worker.js
icons/
  icon-192.png
  icon-512.png
  icon-maskable-512.png
src/
  app.js
  router.js
  server.js
  api/
    app.js
  styles/
    tokens.css
    base.css
    components.css
    pages.css
  pages/
    dashboard.js
    deadline-list.js
    deadline-form.js
    deadline-detail.js
    not-found.js
  components/
    app-shell.js
    deadline-card.js
    countdown.js
    status-badge.js
    confirm-dialog.js
    empty-state.js
  domain/
    deadline.js
    deadline-status.js
    deadline-query.js
    validation.js
  storage/
    deadline-repository.js
    sqlite-deadline-repository.js
  utils/
    dates.js
    ids.js
    html.js
tests/
  deadline-status.test.js
  deadline-query.test.js
  validation.test.js
  deadline-repository.test.js
```

### Key design decisions

1. **Derived statuses:** Store only `completionState` and `completedAt`; calculate upcoming, due soon, due today, overdue, completed on time, and completed late on demand.
2. **One repository boundary:** All Local Storage reads and writes go through `deadline-repository.js`, which validates and normalizes loaded data.
3. **Pure domain functions:** Status, countdown, validation, dashboard totals, filtering, and sorting are pure functions so they can be tested without a browser UI.
4. **One reusable form:** Add and edit screens share the same fields, validation, and submit logic.
5. **Static-host-compatible routing:** Prefer hash routes such as `#/deadlines/:id` unless literal paths are a course requirement. Literal History API routes require deployment rewrite/fallback configuration.
6. **Safe rendering:** Treat user-entered values as text and escape them before inserting into HTML.
7. **Offline-first application shell:** Precache the HTML, CSS, JavaScript, manifest, and icons required to start the app. Since deadline records are local, CRUD and countdown features continue working offline without a server API.
8. **Controlled cache updates:** Version static caches, remove obsolete caches during service-worker activation, and notify users when a new application version is ready instead of unexpectedly replacing the running UI.
9. **Local-first synchronization boundary:** UI operations write locally first so they work offline. An outbox will replay CRUD changes to `/api/deadlines` when online; API failures must not discard local user changes.
10. **Server persistence:** The REST API owns server IDs/timestamps, validates all input again, stores canonical records in SQLite, and calculates time-related statuses rather than persisting them.
11. **Mobile-first responsive UI:** Implement the single-column phone experience first, then progressively add tablet grids, desktop side navigation, and table density according to `DESIGN_SPEC.md`.

## 3. Data contract

```js
{
  id: "deadline-<unique-id>",
  title: "Submit Mini Project",
  description: "...",
  category: "Education",
  dueDateTime: "2026-07-20T23:59:00.000Z",
  priority: "high",
  progress: 60,
  notes: "...",
  completionState: "incomplete", // incomplete | completed | cancelled
  completedAt: null,
  createdAt: "2026-07-15T10:30:00.000Z",
  updatedAt: "2026-07-18T14:20:00.000Z"
}
```

Dates should be stored as ISO 8601 timestamps and displayed in the user's local timezone. Category is free text for the MVP. Progress is an integer from 0 through 100.

## 4. Status precedence

Evaluate statuses in this order to avoid overlapping labels:

1. `cancelled` when `completionState === "cancelled"`.
2. `completed-on-time` or `completed-late` when completed, based on `completedAt <= dueDateTime`.
3. `overdue` when incomplete and the due timestamp has passed.
4. `due-today` when incomplete and due on the user's current local calendar date.
5. `due-soon` when incomplete and zero to three days remain.
6. `upcoming` when incomplete and more than three days remain.

Dashboard counters should use these mutually exclusive calculated statuses. Cancelled items should not count as active, overdue, or completed.

## 5. Implementation phases

### Phase 0 — Foundation and decisions (0.5–1 day)

- Initialize the frontend project, scripts, linting/formatting, and test runner.
- Add the application shell, navigation, responsive CSS tokens, and route placeholders.
- Implement the phone layout first and verify the 320px minimum viewport before adding wider breakpoint enhancements.
- Decide hash routing versus literal URL paths based on course/deployment requirements.
- Add the web app manifest, icons, theme metadata, and service-worker registration.
- Add a small seed-data helper for demonstrations and development only.

Exit criteria:

- The app starts locally, each MVP screen route renders, the manifest is valid, the service worker registers in a production build, and tests can run in one command.

### Phase 1 — Domain model and persistence (1 day)

- Define the deadline schema, defaults, allowed enums, and normalization rules.
- Implement ID and timestamp creation.
- Implement `getDeadlines`, `saveDeadlines`, `addDeadline`, `updateDeadline`, and `deleteDeadline`.
- Recover safely from missing, malformed, non-array, or partially invalid Local Storage data.
- Add repository and validation unit tests.
- Maintain a shared data contract between Local Storage records and the SQLite API representation.

Exit criteria:

- CRUD persists across reloads, malformed storage does not crash the app, and valid records are preserved.

### Phase 1B — REST API and SQLite persistence (1–1.5 days)

- Implement `/api/deadlines` and `/api/deadlines/:id` CRUD routes.
- Add server-side validation, generated IDs/timestamps, calculated statuses, and list query controls.
- Create the SQLite schema, constraints, and indexes.
- Add request-level tests using an isolated in-memory database.
- Document runtime configuration and example requests.

Exit criteria:

- All CRUD and validation tests pass, and the API can persist records to a local SQLite database file.

### Phase 2 — CRUD screens (1.5–2 days)

- Build the all-deadlines screen and deadline cards/table rows.
- Build the shared add/edit form with inline error messages.
- Build the detail screen with complete metadata and actions.
- Implement delete confirmation and not-found handling.
- Validate required title, due date/time, priority, progress range, and completion timestamp invariants.

Exit criteria:

- A user can add, list, inspect, edit, and delete a deadline, with changes surviving a reload.

### Phase 3 — Countdown, statuses, and lifecycle actions (1–1.5 days)

- Implement remaining/overdue time calculations.
- Implement the status precedence rules as pure functions.
- Add a shared one-second timer that updates visible countdowns without reloading.
- Implement mark-complete and cancel actions.
- Save completion time and calculate on-time versus late results.
- Stop active countdown behavior for completed and cancelled items.
- Add boundary tests for exact due time, midnight, three-day cutoff, overdue, completion, and cancellation.

Exit criteria:

- Countdown and status labels change correctly across time boundaries, including exact-deadline completion.

### Phase 4 — Dashboard and discovery (1–1.5 days)

- Add summary cards for total, upcoming, due soon, due today, completed on time, completed late, and overdue.
- Show the nearest active deadline with a prominent countdown.
- Add due-today, upcoming, overdue, and recent-completion lists.
- Add title search, status filter, and nearest-deadline sorting.
- If time remains, extend search to description/category and add priority/category/date filters and the remaining sort modes.
- Keep query/filter state in the URL where practical.

Exit criteria:

- Dashboard counts match the lists, and discovery controls compose predictably without mutating stored data.

### Phase 5 — Quality, accessibility, and delivery (1 day)

- Add empty, loading-equivalent, invalid-data, and no-search-results states.
- Verify keyboard navigation, form labels, visible focus, dialog behavior, color contrast, and reduced-motion support.
- Test phone, tablet, and desktop layouts.
- Verify every item in the responsive acceptance checklist and viewport matrix in `DESIGN_SPEC.md`.
- Run a manual timezone/date-boundary checklist and the automated test suite.
- Precache the complete application shell and provide an offline fallback for navigation requests.
- Verify that create, view, edit, delete, complete, cancel, countdown, search, filtering, and dashboard calculations work in browser offline mode after the first load.
- Verify PWA installability, standalone display, icons, theme colors, cache upgrades, and recovery from a failed/partial cache update.
- Prepare realistic demo data, screenshots, README setup/usage notes, poster content, and demonstration steps.
- Deploy and smoke-test the production URL, including reload behavior on nested routes.

Exit criteria:

- Every definition-of-done scenario passes in the deployed build, after closing/reopening the browser, and while the browser is offline after an initial online load.

## 6. MVP acceptance checklist

- [ ] Create a deadline with all supported fields.
- [ ] Reject a missing title or due date/time, invalid priority, and progress outside 0–100.
- [ ] List all valid stored deadlines after a browser restart.
- [ ] View full details for one deadline.
- [ ] Edit a deadline without changing its `id` or `createdAt`.
- [ ] Require confirmation before deletion.
- [ ] Search deadlines by title.
- [ ] Filter deadlines by calculated status.
- [ ] Sort deadlines by nearest due timestamp.
- [ ] Update active countdowns once per second without a reload.
- [ ] Mark a deadline complete and save `completedAt`.
- [ ] Classify exact/on-before-deadline completion as on time and after-deadline completion as late.
- [ ] Classify incomplete past-due items as overdue.
- [ ] Exclude cancelled items from active countdowns and active dashboard counts.
- [ ] Show accurate dashboard totals and the nearest incomplete deadline.
- [ ] Handle corrupted Local Storage without a blank screen or uncaught error.
- [ ] Render usable layouts on mobile and desktop.
- [ ] Expose a valid manifest with application name, start URL, standalone display mode, theme/background colors, and 192px/512px icons.
- [ ] Install as a PWA from a supported desktop or mobile browser.
- [ ] Reload and navigate between all previously cached application screens while offline.
- [ ] Perform the complete deadline CRUD workflow while offline and retain changes after reopening the installed app.
- [ ] Upgrade to a new cached application version without deleting Local Storage deadline data.

## 7. Test strategy

### Automated unit tests

- Status boundaries and precedence.
- Countdown output and negative durations.
- Form validation and record normalization.
- Search, filter, sort, and dashboard aggregation.
- Repository CRUD and malformed Local Storage recovery.

### Manual flows

1. Create, reload, edit, reload, and delete a deadline.
2. Complete one item before and one after its due timestamp.
3. Verify due-today behavior around local midnight.
4. Combine search, status filter, and sorting, then clear them.
5. Open an invalid/missing detail ID.
6. Corrupt `deadline_items`, reload, and confirm graceful recovery.
7. Verify the deployed site on mobile width and a desktop browser.
8. Load the deployed app once, switch the browser to offline mode, reload it, navigate through every screen, and complete a CRUD workflow.
9. Install the PWA, launch it in standalone mode, and verify icons, colors, startup route, and persisted data.
10. Deploy a cache-version change and verify that the update activates cleanly without losing deadline records.

## 8. Dependencies, risks, and mitigations

- **Route hosting mismatch:** Confirm the deployment platform before router implementation; use hash routing when rewrites are unavailable.
- **Timezone ambiguity:** Store timestamps consistently and define due-today using the user's local calendar date; cover daylight-saving/timezone cases in tests where supported.
- **Status overlap:** Enforce the documented precedence and aggregate using one calculated status per item.
- **Storage corruption or schema drift:** Parse defensively, normalize records, and keep a version/migration hook in the repository.
- **Unsafe user content:** Escape rendered text and avoid interpolating raw user input into HTML attributes or markup.
- **Stale PWA assets:** Use versioned caches and a deliberate update flow; never cache Local Storage data inside the service worker.
- **Incomplete offline cache:** Generate or maintain an explicit application-shell asset list and make offline smoke tests part of release verification.
- **Service-worker routing conflict:** Use a navigation fallback compatible with the chosen hash/history routing strategy and test direct reloads on the deployed host.
- **Scope creep:** Do not start statistics, recurring deadlines, notifications, import/export, or other enhancements before the full MVP checklist passes.

## 9. Suggested delivery sequence

Assuming one developer, the MVP is approximately 7–9 focused working days:

| Milestone | Estimated effort | Deliverable |
| --- | ---: | --- |
| Foundation | 0.5–1 day | Runnable shell and tests |
| Persistence + CRUD | 2–3 days | Complete stored deadline workflow |
| Time logic | 1–1.5 days | Tested countdown and lifecycle states |
| Dashboard + discovery | 1–1.5 days | Accurate overview and findability |
| PWA + QA + delivery | 1–2 days | Installable, offline-capable, responsive deployed MVP and documentation |

## 10. Clarifications to resolve early

1. Must routes exactly match `/deadlines/:id`, or are hash routes acceptable for static hosting?
2. May users create deadlines in the past, or should the form require a future due timestamp?
3. Is category free text, a fixed list, or a user-managed list?
4. Should editing a completed deadline recalculate its on-time/late result if the due timestamp changes?
5. Does `Total deadlines` include cancelled items, or only active and completed items?
6. Which browser and deployment platform will be used for grading?
7. Must the grader install the application, or is offline browser operation sufficient in addition to installability?

Until clarified, use the assumptions documented in this plan: hash routing, past dates allowed, free-text categories, completion result recalculated from current stored values, total count including every record, and full installable PWA support on current Chromium-based browsers with graceful fallback on other modern browsers.
