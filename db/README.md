# QualityOS database starting point

`schema.sql` is the reviewed PostgreSQL starting point for replacing the browser/file-backed prototype. It models workspace membership, suppliers, parts, lots, inspections, signals, NCRs, containment, corrective actions, CAPA effectiveness, evidence metadata, and audit events.

The current Node API does not execute this schema yet. It remains a deliberately small migration step: the API contract and database shape can be reviewed before introducing credentials, migrations, or a production data service.
