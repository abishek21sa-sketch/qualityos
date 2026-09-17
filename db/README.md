# QualityOS database starting point

`schema.sql` is the reviewed PostgreSQL starting point for replacing the browser/file-backed prototype. It models workspace membership, suppliers, parts, lots, inspections, signals, NCRs, containment, corrective actions, CAPA effectiveness, evidence metadata, and audit events.

`postgres-store.mjs` is the optional workspace-state adapter. Set `DATABASE_URL` to enable it; otherwise the Node API continues using its file-backed adapter. The adapter expects `schema.sql` to have been applied, stores the versioned workspace JSON in `workspace_state`, and performs a row lock plus ETag check inside a transaction. It does not yet replace the JSON record collections with normalized table writes; that is the next database migration step.
