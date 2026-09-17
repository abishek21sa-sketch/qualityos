# QualityOS architecture boundary

## Current demo

```text
Browser
  ├── Static HTML / CSS / JavaScript
  ├── Fixture-backed quality views
  └── localStorage for demo records and audit events
       └── JSON export for NCR handoff
```

This is intentionally suitable for GitHub Pages, Vercel static hosting, or Render Static Site. There is no server-side secret, database, or authenticated user state in the current build.

## First API boundary

The repository now includes a dependency-free Node server for the next migration step. It serves the same `outputs/` UI and exposes overview, workspace, and record-level contracts:

```text
GET /api/health
GET /api/quality/overview
GET /api/workspace/overview  (compatibility alias)
GET /api/records/:collection
GET /api/records/:collection/:id
POST /api/records/:collection
PATCH /api/records/:collection/:id
```

The overview response is still fixture-backed. The `/api/workspace` endpoint supports token-protected `GET` and `PUT` operations against a versioned file-backed workspace, with an 8 MB request limit and atomic replacement writes. Record routes currently cover `actions`, `evidence`, `inspections`, and `capas`, and use the same bearer token with bounded payloads and atomic workspace writes. `db/schema.sql` defines the reviewed PostgreSQL target shape, but the running Node API does not execute it yet; row-level authorization, database transactions, and conflict handling remain future boundaries.

The static UI's API sync panel uses explicit workspace Pull/Push actions plus collection-level Pull/Push actions for the four record routes. Collection Pull replaces only the selected local collection; collection Push reads remote IDs and upserts local records one at a time. It remembers only the API URL in browser storage and keeps the token in page memory, preserving localStorage as the offline fallback until a full authenticated session, conflict strategy, and database adapter are added.

The interim auth boundary accepts the legacy `QUALITYOS_API_TOKEN` as an admin-compatible token or a JSON `QUALITYOS_API_TOKENS` list of `{ token, subject, role, workspaceId }` identities. `GET /api/session` reports the non-secret identity and effective read/mutate permission. This is environment-managed access control, not a replacement for login, OAuth, session rotation, or database-backed workspace membership.

## Target production shape

```text
Browser app
  ├── Authenticated API
  │    ├── Quality domain service
  │    ├── Audit/event service
  │    └── Notification worker
  ├── Relational database
  │    ├── Parts, suppliers, lots, inspections
  │    ├── Signals, NCRs, containment, actions
  │    └── CAPA / 8D and effectiveness checks
  └── Object storage
       └── Evidence files, inspection exports, signed quality packets
```

## Migration sequence

1. Keep the current fixture and UI contract stable.
2. Replace the local fixture with a read-only `/api/quality/overview` response.
3. Move actions, acknowledgements, dispositions, CAPA records, and audit events to authenticated API mutations; the current record routes and PostgreSQL schema establish the contract to harden.
4. Add database-backed evidence metadata and object-storage uploads.
5. Add role-based access, supplier access boundaries, and immutable audit events.
6. Add SPC computation and notification jobs behind the API; keep the current UI focused on decisions.

## Hosting recommendation

- GitHub Pages: first public demo and portfolio review.
- Vercel: best fit for preview-driven UI iteration and a future frontend/API split.
- Render: best fit once the static UI sits beside a persistent API and database service.

Keep the current static deployment as the demo surface until authentication, persistence, and evidence access controls exist. Quality records should not rely on browser `localStorage` beyond this prototype stage.
