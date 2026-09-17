# QualityOS deployment plan

QualityOS is currently a static HTML/CSS/JavaScript prototype. The repository now includes deployment metadata for three low-friction hosting paths.

The repository also includes `package.json` and `scripts/validate.mjs`; run `npm run check` before publishing to validate the embedded app script and required deployment markers.

## Recommended path

Use GitHub Pages for the first public demo. It is the lowest-complexity option for this fixture-backed build, and the repository includes a workflow at `.github/workflows/deploy-pages.yml` that publishes the `outputs/` directory on pushes to `main`.

Use Vercel when preview deployments and a custom domain become more important. The root `vercel.json` publishes `outputs/` with no build step.

Use Render for the first API boundary beside the static UI. The root `render.yaml` now declares a `qualityos-api` Node web service with `/api/health` health checks, alongside the existing static `qualityos` service.

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

Create the Render services from the checked-in Blueprint configuration, or keep the existing Render Static Site for the demo and add a Node Web Service for `qualityos-api`. The static publish directory is `outputs/`; the API uses `npm install --omit=dev` and `npm start`.

Render can auto-deploy from a connected Git branch and provides hosted `onrender.com` URLs. The API now has a token-protected file-backed workspace endpoint, but it is still a migration adapter rather than a database-backed QMS. See [Render Static Sites](https://render.com/docs/static-sites) and [Render Web Services](https://render.com/docs/web-services).

### API service configuration

The `qualityos-api` service expects `QUALITYOS_API_TOKEN` to be set as a secret and writes the workspace to `QUALITYOS_DATA_DIR`. The Blueprint mounts a 1 GB persistent disk at `/var/data`; set `QUALITYOS_ALLOWED_ORIGIN` to the exact Vercel or custom-domain origin before using the UI's API sync panel. Enter the API URL and token in the panel, test the connection, and choose Pull or Push deliberately. Never commit the token or a workspace JSON file.

## Important data boundary

The current static UI stores actions, acknowledgements, evidence requests, small evidence attachments, CAPA records, lot disposition, root-cause notes, audit events, SPC rule settings, and the API URL in browser `localStorage`. That state is device/browser-local and is not shared between users or deployments. The API workspace endpoint is separately token-protected and file-backed; it does not yet provide record-level authorization, conflict handling, database transactions, or production file storage. The sync token remains in page memory only. Local attachments are capped at 1 MB each and are a workflow prototype, not production file storage.

Before using QualityOS for real quality records, introduce an authenticated API and database layer. The current export action is the safe handoff for demo data while that backend boundary is designed.
