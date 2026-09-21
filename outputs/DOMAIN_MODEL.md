# QualityOS domain model

This document describes the intended manufacturing-quality vocabulary. It is not a claim that every entity or workflow is implemented in the current app.

## Analysis record

The implemented analysis is scoped to one imported dataset and records its source filename, import time, mapped headers, filters, selected rows, ordering, method, rejected rows, calculations, and warnings in the downloadable report. No persistent server-side analysis record is created.

| Concept | Purpose | Current status |
| --- | --- | --- |
| Measurement | Numeric observation of one characteristic with a unit and source row. | Parsed and analyzed in browser memory. |
| Characteristic | The measurable quality property (for example, diameter). | User-mapped or entered; unlike characteristics must be separated. |
| Part / process | Defines where measurements came from. | Optional mapping/filter; app warns when absent. |
| Lot / batch | Traceability scope for a production/material group. | Optional mapping/filter; pooling is explicit. |
| Rational subgroup | Measurements taken under comparable conditions for X̄–R. | Optional; complete equal-sized subgroups, n=2–10. |
| Specification | Customer/engineering LSL and/or USL. | Optional; separate from statistically estimated control limits. |
| Analysis report | Reproducible calculations plus source/provenance and caveats. | Downloadable JSON; not persisted by QualityOS. |

## Broader QMS concepts

Parts, suppliers, lots, inspections, defects, signals, nonconformances, containment, corrective actions, CAPA/8D, and evidence remain target-domain concepts for later workflow development. There is no seeded NCR, supplier, person, plant, or production dataset in the deployed analysis page.

## Data integrity rules

- Never combine unlike characteristics or units in one chart.
- Treat row order as chronological only when verified timestamps can be parsed; otherwise disclose CSV row ordering.
- Preserve source row numbers and report invalid measurements instead of silently coercing them.
- Keep control limits distinct from specification limits.
- Treat capability indices as conditional on stability and distribution assumptions; the app does not qualify those assumptions.
