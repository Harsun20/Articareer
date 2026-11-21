# Deploy Articareer to Netlify

Articareer uses the Next.js App Router, server-rendered pages, route handlers, and private Supabase sessions. Netlify's current Next.js adapter supports these features; use the automatic framework detection and do not add the legacy `@netlify/plugin-nextjs` plugin.

## Before you deploy

1. Push this repository to GitHub and choose **Add new site → Import an existing project** in Netlify.
2. Select the repository and production branch. The checked-in `netlify.toml` sets `npm run build`, `.next`, and Node.js 22.
3. Add the environment variables below in **Site configuration → Environment variables**. Keep server secrets unprefixed; only the Supabase URL and publishable key belong in `NEXT_PUBLIC_*` variables.
4. Apply every SQL migration in `supabase/migrations` to the Supabase project before using account features.
5. In Supabase Auth URL Configuration, set the Site URL to the production Netlify URL and add `https://YOUR-SITE.netlify.app/auth/callback` to Redirect URLs. Add the corresponding deploy-preview callback patterns only if previews should support sign-in.
6. Add the production site URL as the GitHub Actions `APP_URL` secret, and set `CRON_SECRET` in both Netlify and GitHub Actions. The weekly refresh workflow calls the protected endpoint; trigger it manually once after deployment to verify it.
7. Deploy. After the first deploy, test email sign-in, account deletion, resume upload, and the demo route. If enabling Google OAuth, configure its client ID and secret in Supabase and allow the deployed callback URL there.

## Environment variables

Required for signed-in production use:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon key name)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server only; never use a `NEXT_PUBLIC_` prefix
- `DEMO_MODE=false`
- `CRON_SECRET`

Add `GEMINI_API_KEY` for live AI, `RAPIDAPI_KEY` for JSearch, and `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` for fallback job search. Set `APP_URL` and `CRON_SECRET` as GitHub repository secrets for the weekly worker. Never paste secrets into source code or commit `.env.local`.

## Deployment constraints

- Resume uploads are capped at 4 MB to fit Netlify's buffered function request limit for binary payloads. Larger files need direct-to-Supabase uploads rather than passing through a function.
- Use the GitHub Actions workflow for scheduled refreshes. Do not deploy the refresh endpoint as a public unauthenticated scheduler; it requires the bearer `CRON_SECRET`.
- Netlify deploy previews have distinct origins. Add only the preview redirect patterns you need to Supabase Auth, and avoid using production secrets in untrusted fork builds.
- The Netlify deploy itself is not performed from this repository. Link the repo and configure secrets in the Netlify dashboard.
