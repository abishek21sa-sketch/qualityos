# QualityOS

QualityOS is currently a browser-local manufacturing measurement-analysis workbench. It starts empty: no operator, plant, part, lot, inspection reading, or capability result is seeded into the app.

## What works today

- Import one CSV/TSV file up to 15 MB. The browser reads the file locally; it is not uploaded or retained after the page is reloaded.
- Review the detected delimiter, column mappings, source-row preview, and population filters before calculating.
- Analyze ordered individual measurements with I–MR, or rational subgroups of equal size 2–10 with X̄–R.
- Calculate chart limits from the selected batch and review selected signals: points beyond limits, eight points on one side of center, six strictly increasing/decreasing points, and range-chart limit breaches.
- Calculate capability only when specification limits are supplied. Results are explicitly preliminary; the app does not test normality or make a product-release decision.
- Map instrument/gage, operator, and calibration-due fields; unlike instruments cannot be silently pooled, and missing, invalid, or expired calibration traceability is surfaced in the report.
- Export the selected-row analysis and provenance as JSON.

## Run locally

Run `npm start`, then open `http://localhost:3000`. Or serve the `outputs/` directory as a static site (Vercel is configured for that directory). Run `npm test` for the parser, SPC, API, database-adapter, and migration checks.

## Deliberate limits

This is offline, batch analysis—not real-time SPC. There is no MES, PLC, OPC-UA, historian, scheduled refresh, authentication in the analysis page, or connected production data source. The optional Node/PostgreSQL API is a separate experimental workspace/record boundary; the analysis page does not send it CSVs or store analysis results there. It is not a validated QMS, and estimated limits from one selected batch are not a substitute for an approved control plan or release criterion.

See [ARCHITECTURE.md](ARCHITECTURE.md) for current boundaries, [DOMAIN_MODEL.md](DOMAIN_MODEL.md) for intended quality-data concepts, [ROADMAP.md](ROADMAP.md) for next steps, and [DEPLOYMENT.md](DEPLOYMENT.md) for hosting notes.
