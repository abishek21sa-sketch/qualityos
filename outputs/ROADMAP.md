# QualityOS roadmap

## Phase 1 — Foundation (current)

Deliver a credible, independently runnable quality-operations cockpit with a coherent domain model and one thin vertical slice:

- Industrial operations visual system and application shell.
- Fixture-backed overview with quality signals, defect family summary, and recent activity.
- SPC-style trend signal for a real lot and supplier.
- Investigation view that makes signal → containment → investigation → corrective action explicit.
- Basic corrective-action creation with owner, priority, due date, notes, and activity feedback.

## Phase 2 — Workflow depth

- Persisted records and audit history.
- Signal inbox with acknowledgement, assignment, severity, and saved filters.
- Lot genealogy and supplier scorecards.
- Inspection entry and defect-code management (initial browser-local inspection slice implemented).
- Evidence upload, preview, and verification workflow (initial local review/reject/verify decision loop implemented).
- Configurable containment templates (initial browser-local extension workflow implemented).

## Phase 3 — Quality intelligence

- Full SPC rule library with configurable limits and rational subgrouping (initial burr-height UCL setting implemented).
- Initial browser-local 5-Why cause chain and CAPA status workflow are implemented; expand into fishbone and a full 8D/CAPA workspace.
- Risk-based prioritization and recurrence detection (initial signal priority scores and persisted queue sorting implemented).
- Effectiveness checks with before/after process capability (verified-evidence closure gates implemented for CAPA and corrective actions).
- Cross-plant benchmarking and supplier collaboration.

## Explicit non-goals for Phase 1

QualityOS Phase 1 does not implement a complete MES, production scheduling, all SPC rules, a full supplier portal, ERP integration, or every quality workflow. Those are intentionally deferred until the workflow foundation and data contracts are validated.
