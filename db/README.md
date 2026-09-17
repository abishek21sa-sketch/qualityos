# QualityOS database starting point

`schema.sql` is the reviewed PostgreSQL starting point for replacing the browser/file-backed prototype. It models workspace membership, suppliers, parts, lots, inspections, signals, NCRs, containment, corrective actions, CAPA effectiveness, evidence metadata, and audit events.

`postgres-store.mjs` is the optional workspace-state adapter. Set `DATABASE_URL` to enable it; otherwise the Node API continues using its file-backed adapter. The adapter expects `schema.sql` to have been applied, stores the versioned workspace JSON in `workspace_state`, and performs a row lock plus ETag check inside a transaction. Corrective actions and CAPAs are now synchronized into the normalized `corrective_actions` and `capas` tables in that same transaction, with non-column fields preserved in `metadata`; evidence and inspections remain on the JSON bridge until their foreign-key mappings are migrated.
