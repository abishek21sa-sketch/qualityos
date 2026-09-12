# QualityOS

QualityOS is a lightweight manufacturing quality-operations cockpit. It is intentionally self-contained: open `index.html` in a browser to run it.

## Included workflow

- Overview with Plant 04 fixture metrics and an SPC-style burr-height signal.
- Signal inbox, investigation queue, corrective-action register, parts/suppliers, and evidence-library views.
- Investigation modal for `NCR-0264` / lot `L240908-17`.
- Corrective-action form with browser-local persistence and activity updates.
- NCR-0264 quality-packet export with signal, containment, disposition, CAPA, and evidence context.
- Browser-local audit trail for key operator decisions and handoffs.

## Scope note

The additional views are fixture-backed workflow shells for continued product exploration. They do not persist to a server or replace a full QMS/MES. See [ROADMAP.md](ROADMAP.md) for the planned boundary and [DOMAIN_MODEL.md](DOMAIN_MODEL.md) for the core data contracts.

See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub Pages, Vercel, and Render setup, and [ARCHITECTURE.md](ARCHITECTURE.md) for the browser-local-to-production migration plan.
