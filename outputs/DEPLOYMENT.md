# QualityOS deployment plan

QualityOS is a static HTML/CSS/JavaScript quality-workflow app with an optional token-protected Node API and PostgreSQL persistence. The repository includes deployment metadata for GitHub, Vercel, and Render.

The repository also includes `package.json` and `scripts/validate.mjs`; run `npm run check` before publishing to validate the embedded app script and required deployment markers.

## Recommended path

Use GitHub as the source repository, Vercel for the static UI and preview deployments, and Render for the API (plus PostgreSQL when configured). The repository includes a GitHub Pages workflow as an alternative static host, but Pages is not required when Vercel is connected.

Vercel serves the static UI from `outputs/` with no framework build step. The root `vercel.json` defines its deployment output and preview deployments.

Use Render for the API boundary beside the Vercel UI. The root `render.yaml` declares a `qualityos-api` Node web service with `/api/health` health checks and an optional static service; when Vercel is the chosen frontend, the Render static service is redundant and can be left unused.

## GitHub Pages

1. Create a GitHub repository and push this project, including the `outputs/` directory and `.github/workflows/deploy-pages.yml`.
2. In repository Settings → Pages, select GitHub Actions as the source.
3. Push to `main` or run the workflow manually from the Actions tab.
4. GitHub Pages will publish the static files from `outputs/`.

GitHub Pages publishes static files from a repository or custom workflow. See the [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Vercel

Import the repository into Vercel. The checked-in `vercel.json` points the deployment output at `outputs/`; no framework detection or build command is required. Vercel can then create preview deployments for repository changes.

See [Vercel deployment documentation](https://vercel.com/docs/deployments/overview).

## Render

Create the `qualityos-api` Node Web Service from the checked-in Blueprint configuration. If Vercel is serving the UI, the Blueprint's optional Render Static Site is not needed. The API uses `npm install --omit=dev` and `npm start`.

Render can auto-deploy from a connected Git branch and provides hosted `onrender.com` URLs. The API has token-protected workspace and record-level routes. It defaults to file persistence and uses the optional PostgreSQL workspace adapter when `DATABASE_URL` is configured. PostgreSQL writes keep the versioned workspace and normalized records in one transaction; this is still a prototype boundary, not a validated regulated QMS. See [Render Static Sites](https://render.com/docs/static-sites) and [Render Web Services](https://render.com/docs/web-services).

### API service configuration

The `qualityos-api` service expects `QUALITYOS_API_TOKEN` to be set as a secret and writes the workspace to `QUALITYOS_DATA_DIR` in file mode. For interim role-aware access, optionally set `QUALITYOS_API_TOKENS` to a JSON array such as `[{"token":"supplier-secret","subject":"northstar","role":"supplier","workspaceId":"apex-motion-plant-04"}]`. Supported roles are `admin`, `quality_manager`, `quality_engineer`, `operator`, and `supplier`; supplier access is read-only. To use PostgreSQL, create a Render PostgreSQL database and set its `DATABASE_URL` secret; keep `QUALITYOS_DATABASE_WORKSPACE_ID` as a valid UUID. Render runs `npm run db:migrate` before starting the API: the runner initializes an empty database from `db/schema.sql`, safely recognizes an existing QualityOS schema, and applies pending SQL transactionally. The API stores the versioned workspace in `workspace_state`, synchronizes actions, CAPAs, inspections, evidence metadata, and append-only audit events into normalized tables in the same transaction, and uses canonical ETags plus row locks for concurrent writes. Browser attachment bytes remain in the workspace bridge until object storage is added. The Blueprint mounts a 1 GB persistent disk at `/var/data` for file mode; set `QUALITYOS_ALLOWED_ORIGIN` to the exact Vercel or custom-domain origin before using the UI's API sync panel. Enter the API URL and token in the panel, test the connection, and choose Pull or Push deliberately. Never commit tokens or workspace JSON files.

## Important data boundary

The static UI stores its active working copy in browser `localStorage`, so browsers are not automatically kept in sync. Explicit whole-workspace push/pull is available through the token-protected API; in PostgreSQL mode, synced audit events are additionally retained append-only (up to the latest 200 are returned to the UI). Record-level collection push remains item-by-item, not transactional. Conditional `If-Match` writes reject stale revisions, and the workspace API presents a conflict-review flow, but the product still needs real user authentication, token rotation, database-backed membership, backup/restore operations, and production file storage before real quality records. The migration runner actively applies `db/schema.sql` on first install and subsequent SQL migrations on upgrade. The sync token remains in page memory only. Local attachments are capped at 1 MB each; their metadata can sync to PostgreSQL, but their bytes remain a workflow prototype until object storage is added.

Before using QualityOS for real quality records, replace interim environment-managed tokens with authenticated sessions, validate role and workspace policies, add production object storage, and implement monitored backups/restore plus audit-retention controls. Keep using exported workspace backups as a manual safety net while those production boundaries are completed.
