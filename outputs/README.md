# QualityOS

QualityOS is a lightweight manufacturing quality-operations cockpit. It is intentionally self-contained: open `index.html` in a browser to run it.

## Included workflow

- Overview with Plant 04 fixture metrics and an SPC-style burr-height signal.
- Signal inbox, investigation queue, corrective-action register, parts/suppliers, and evidence-library views.
- Investigation modal for `NCR-0264` / lot `L240908-17`.
- Corrective-action form with browser-local persistence and activity updates.
- Inspection-result entry for a part and lot with measurement, result, defect code, notes, and a recent inspection log.
- NCR-0264 quality-packet export with signal, containment, disposition, CAPA, and evidence context.
- NCR-0264 quality-packet export also includes inspection records for the active lot.
- Browser-local 5-Why cause chain for NCR-0264, carried with the root-cause context.
- Configurable browser-local containment checks that participate in completion progress, release gating, and packet export.
- CAPA records with a browser-local lifecycle: Open, In progress, Effectiveness check, and Closed.
- CAPA closure guard requiring verified evidence linked to NCR-0264 or lot L240908-17.
- Corrective-action closure guard requiring verified evidence linked to the action record.
- Signal counts and review totals update from acknowledged browser-local decisions.
- Signal inbox includes browser-local priority scores with persisted Highest risk, Newest, and Needs owner sorting.
- Signal rows now show 30-day recurrence indicators and support persisted Repeat issues sorting.
- Evidence item and verified totals update from browser-local requests and verification actions.
- Local evidence requests can be marked Needs review, Rejected, or Verified with persisted status.
- Browser-local SPC rule setting for the burr-height UCL, shared by inspection warnings and review context.
- Browser-local audit trail for key operator decisions and handoffs.

## Scope note

The additional views are fixture-backed workflow shells for continued product exploration. Operator-created records persist in the browser only; they do not persist to a server or replace a full QMS/MES. See [ROADMAP.md](ROADMAP.md) for the planned boundary and [DOMAIN_MODEL.md](DOMAIN_MODEL.md) for the core data contracts.

See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub Pages, Vercel, and Render setup, and [ARCHITECTURE.md](ARCHITECTURE.md) for the browser-local-to-production migration plan.
