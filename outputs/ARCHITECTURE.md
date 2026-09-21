# QualityOS architecture boundary

## Current analysis path

```text
User-selected CSV/TSV
  → browser memory only
  → explicit field mapping and population scope
  → deterministic batch I–MR or X̄–R analysis
  → chart, rule review, data-quality report, JSON export
```

The static Vercel site serves `outputs/`. The analysis flow makes no request to a server. Imported rows are cleared when the page is reloaded or the user clears the session. No sample readings or named operator are loaded by default.

## Separate API foundation

`server.mjs` exposes health, an empty/no-source overview, and token-protected workspace and record contracts. File persistence is the default; PostgreSQL support is optional when `DATABASE_URL` is configured. The static analysis page does not call these endpoints, upload files, persist its results, or receive live data from them. The API overview intentionally reports no connected source and no metrics.

```text
Quality Lab (browser, offline)       Experimental API (not connected to UI)
CSV → map → analyze → export         token → workspace / record routes → file or PostgreSQL
```

ETags and PostgreSQL workspace/record synchronization provide an API prototype, not production identity, tenant isolation, or a real-time data pipeline. Evidence/object storage and full authorization are not implemented.

## Real-time boundary

Real-time SPC is future work. It requires an approved source adapter (for example a historian or MES), timestamp/identity contracts, authentication and plant-level authorization, persistence, replay/idempotency, outage behavior, and operations for versioned rules and alarms. A static host cannot supply those on its own. Do not use the current batch estimates as automatic machine or lot-release decisions.
