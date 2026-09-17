# QualityOS deployment plan

QualityOS is currently a static HTML/CSS/JavaScript prototype. The repository now includes deployment metadata for three low-friction hosting paths.

The repository also includes `package.json` and `scripts/validate.mjs`; run `npm run check` before publishing to validate the embedded app script and required deployment markers.

## Recommended path

Use GitHub Pages for the first public demo. It is the lowest-complexity option for this fixture-backed build, and the repository includes a workflow at `.github/workflows/deploy-pages.yml` that publishes the `outputs/` directory on pushes to `main`.

Use Vercel when preview deployments and a custom domain become more important. The root `vercel.json` publishes `outputs/` with no build step.

Use Render Static Site when the project begins to sit beside a future API or database service. The root `render.yaml` publishes `outputs/` and can later evolve into a multi-service Blueprint.

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

Create a Render Static Site connected to the repository, or use the checked-in Blueprint configuration. The static publish directory is `outputs/` and the build command is intentionally empty.

Render can auto-deploy from a connected Git branch and provides a hosted `onrender.com` URL. See [Render Static Sites](https://render.com/docs/static-sites).

## Important data boundary

The current app stores actions, acknowledgements, evidence requests, small evidence attachments, CAPA records, lot disposition, root-cause notes, audit events, and SPC rule settings in browser `localStorage`. That state is device/browser-local and is not shared between users or deployments. Local attachments are capped at 1 MB each and are a workflow prototype, not production file storage.

Before using QualityOS for real quality records, introduce an authenticated API and database layer. The current export action is the safe handoff for demo data while that backend boundary is designed.
