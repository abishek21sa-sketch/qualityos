# QualityOS roadmap

## Current slice — local batch SPC

- Empty-by-default, manufacturing-specific analysis workspace.
- CSV/TSV parsing, mapping, selected population scope, row-level exclusions, and source-aware JSON export.
- Individuals–Moving Range and equal-size X̄–R charts with selected rule checks.
- Optional specification/capability calculations with explicit caveats.
- Measurement-system traceability fields for instrument/gage, operator, and calibration-due review.
- No live feed, real plant data, multi-user collaboration, or product-release decision.

## Next — validate the measurement workflow

- Exercise the import and calculations against user-provided, de-identified inspection files.
- Add golden datasets and independent reference calculations, including boundary/rounding cases.
- Improve large-file handling, date parsing controls, subgroup diagnostics, and reproducible report versioning.
- Establish a stronger data contract for calibration certificate identity, measurement uncertainty, units, spec revision, and timestamps before wiring any external system.

## Later — connected quality operations

- Only after data contracts and security are designed: authenticated persistence for datasets and analysis reports.
- Add a historian/MES connector with replay, idempotency, gap/outage handling, and controlled alarm policy.
- Build traceability and investigation workflows (lot, signal, nonconformance, containment, CAPA, evidence) from verified source records.
- Harden tenant authorization, auditability, retention, backups, monitoring, and deployment operations before production use.

## Not implemented

There is no real-time analysis, connected factory feed, validated SPC package, normality assessment, automated release gate, full QMS/MES, supplier portal, or production-grade authentication. The optional API/PostgreSQL foundation is not connected to the analysis page.
