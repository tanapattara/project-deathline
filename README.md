# Deadline

Nxt Gen IT KKU

A deadline-tracking mini project with a mobile-first, installable offline PWA and a dependency-free Node.js REST API backed by SQLite. Changes are saved locally first and synchronized with the API when a connection is available.

Project documentation:

- [Implementation plan](./IMPLEMENTATION_PLAN.md)
- [Mobile-first responsive design](./DESIGN_SPEC.md)

## Requirements

- Node.js 24 or newer (`node:sqlite` is used for persistence)

## Deploy to Vercel

The Vercel deployment serves the offline-first PWA from `public/` as a static
site. The repository's `vercel.json` deliberately disables framework and server
auto-detection so `src/server.js` is not started as a Serverless Function.

The SQLite API is intended for a persistent Node.js host. Vercel Functions do
not provide durable local filesystem storage, so deploying that API requires a
managed database and a Vercel-compatible function entry point.

## Run the API

```bash
npm start
```

Open `http://localhost:3000` after starting the project. The same server delivers the frontend and API, and creates `data/deadlines.db` automatically.

## Frontend features

- Mobile-first dashboard with a prominent nearest-deadline countdown.
- Create, view, edit, complete, cancel, and delete workflows.
- Search, calculated-status filtering, priority filtering, and sorting.
- Responsive phone bottom navigation and desktop sidebar.
- Local-first storage with a synchronization outbox.
- Installable manifest and service-worker application-shell caching.
- Offline CRUD, countdown, dashboard, filtering, and navigation after the first load.
- Accessible labels, focus styles, dialogs, touch targets, and reduced-motion behavior.

Configuration:

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `data/deadlines.db` | SQLite database file |
| `ALLOWED_ORIGIN` | `*` | CORS origin allowed to call the API |

## API routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/deadlines` | List deadlines |
| `POST` | `/api/deadlines` | Create a deadline |
| `GET` | `/api/deadlines/:id` | Read a deadline |
| `PUT` | `/api/deadlines/:id` | Replace editable deadline fields |
| `PATCH` | `/api/deadlines/:id` | Update selected fields, complete, or cancel |
| `DELETE` | `/api/deadlines/:id` | Delete a deadline |

The list route supports these query parameters:

- `q`: search title, description, and category.
- `status`: filter by calculated status.
- `priority`: filter by `high`, `medium`, or `low`.
- `category`: exact category match, ignoring case.
- `sort`: `nearest`, `latest`, `priority`, `recently-created`, or `progress`.

### Create example

```bash
curl http://localhost:3000/api/deadlines \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "title": "Submit Mini Project",
    "description": "Submit source code and demonstration video",
    "category": "Education",
    "dueDateTime": "2026-07-25T16:59:00.000Z",
    "priority": "high",
    "progress": 60,
    "notes": "Verify links before submission"
  }'
```

### Complete example

```bash
curl http://localhost:3000/api/deadlines/DEADLINE_ID \
  --request PATCH \
  --header 'Content-Type: application/json' \
  --data '{"completionState":"completed","progress":100}'
```

If `completedAt` is omitted, the API records the server's current time. Setting the state to `incomplete` or `cancelled` clears `completedAt`.

## Validation and status behavior

- `title` and `dueDateTime` are required for create and replace operations.
- `priority` must be `high`, `medium`, or `low`.
- `progress` must be an integer from 0 through 100.
- The server generates an ID when omitted. Offline clients may supply an ID in `deadline-<UUID>` format so the same identity is retained during synchronization; IDs are immutable after creation.
- Time-related status is calculated when reading data and is not stored in SQLite.
- Completed deadlines are classified as `completed-on-time` or `completed-late` by comparing `completedAt` with `dueDateTime`.

## Offline PWA integration

The future PWA should not depend on a live API connection for normal use:

1. Write user changes to the browser's local store first, using a `deadline-<UUID>` ID.
2. Record unsynchronized create/update/delete operations in an outbox.
3. Send the outbox to this API when connectivity returns.
4. Mark local records synchronized only after a successful API response. A `409` response on create means that ID already exists and should be reconciled with `GET /api/deadlines/:id` rather than blindly retried.

The service worker caches application files; it should not cache or own deadline database records. A conflict/version strategy must be added before multi-device synchronization is enabled.

## Tests

```bash
npm test
```

The test suite starts the API on an ephemeral port with an in-memory SQLite database and exercises CRUD, validation, calculated status, search, filtering, and sorting.
