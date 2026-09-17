# QualityOS

QualityOS is a lightweight manufacturing quality-operations cockpit. The static demo remains self-contained: open `index.html` in a browser to run it. A dependency-free Node server is also included as the first production API boundary.

## Included workflow

- Overview with Plant 04 fixture metrics and an SPC-style burr-height signal.
- Signal inbox, investigation queue, corrective-action register, parts/suppliers, and evidence-library views.
- Investigation modal for `NCR-0264` / lot `L240908-17`.
- Corrective-action form with browser-local persistence and activity updates.
- Inspection-result entry for a part and lot with measurement, result, defect code, notes, and a recent inspection log.
- NCR-0264 quality-packet export with signal, containment, disposition, CAPA, and evidence context.
- NCR-0264 quality-packet export also includes inspection records for the active lot.
- NCR-0264 quality-packet export includes attached local evidence metadata and file content for the current browser workspace.
- Browser-local 5-Why cause chain for NCR-0264, carried with the root-cause context.
- Configurable browser-local containment checks that participate in completion progress, release gating, and packet export.
- CAPA records with a browser-local lifecycle: Open, In progress, Effectiveness check, and Closed.
- CAPA closure guard requiring verified evidence linked to NCR-0264 or lot L240908-17.
- CAPA effectiveness checks store baseline and post-action burr-height results and require a passing result before closure.
- NCR-0264 includes a browser-local Severity × Occurrence × Detection risk assessment with an exported RPN.
- Corrective-action closure guard requiring verified evidence linked to the action record.
- Signal counts and review totals update from acknowledged browser-local decisions.
- Signal inbox includes browser-local priority scores with persisted Highest risk, Newest, and Needs owner sorting.
- Signal rows now show 30-day recurrence indicators and support persisted Repeat issues sorting.
- The visible, filtered signal queue can be exported as CSV with priority and recurrence context.
- Evidence item and verified totals update from browser-local requests and verification actions.
- Local evidence requests can be marked Needs review, Rejected, or Verified with persisted status.
- Evidence library supports browser-local file attachments linked to an NCR, lot, or CAPA, with image/PDF preview, download, and review decisions.
- Browser-local SPC rule settings for the burr-height UCL plus configurable Rule 1 and Rule 4 trend detection, shared by inspection warnings and review context.
- Browser-local audit trail for key operator decisions and handoffs.
- Workspace backup and restore moves browser-local quality records and configuration as a reviewed JSON file.
- Evidence library includes a filterable audit trail with CSV export for browser-local decisions and handoffs.
- Node API foundation exposes `/api/health`, the read-only `/api/quality/overview` contract, and token-protected `/api/workspace` read/write persistence for the migration path.
- The API also exposes token-protected record-level list/read/create/patch routes for actions, evidence, inspections, and CAPAs; `db/schema.sql` documents the reviewed PostgreSQL target shape.
- API sync panel lets an operator test the server, then explicitly pull or push the workspace while retaining browser-local fallback; API tokens stay session-only.
- API sync also supports an explicit collection-level pull or item-by-item upsert for actions, evidence requests, inspections, and CAPAs, with counts and audit events after each successful operation.
- API connection testing now verifies the authenticated `/api/session` identity when a token is provided and shows the effective role; supplier identities remain read-only.
- Workspace and record API responses expose ETags, and conditional writes return a conflict instead of silently overwriting a newer server revision.
- The UI carries the latest API revision into conditional workspace and collection pushes and explains when a pull/review is required after a conflict.

## Scope note

The additional views are fixture-backed workflow shells for continued product exploration. Browser-local state remains the default UI store; the token-protected Node adapter now supports explicit workspace sync and record-level API contracts, but it is not yet a full QMS/MES or multi-user authorization layer. See [ROADMAP.md](ROADMAP.md) for the planned boundary, [DOMAIN_MODEL.md](DOMAIN_MODEL.md) for the core data contracts, and [db/README.md](../db/README.md) for the PostgreSQL starting point.

See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub Pages, Vercel, and Render setup, and [ARCHITECTURE.md](ARCHITECTURE.md) for the browser-local-to-production migration plan. Run `npm test` to validate both the static artifact and API boundary.
