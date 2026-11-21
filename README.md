# ArtiCareer

ArtiCareer is a career-coach workspace that turns a resume and target roles into an evidence-based skill map, focused learning plan, portfolio ideas, interview practice, application insights, and a transparent Pivot-Readiness Score. It never applies to jobs for you.

## Architecture

```text
Browser (Next.js App Router + React + Tailwind)
        │
        ├── Demo workspace ── seeded resume evidence, jobs, plan, interview examples
        ├── API routes ─────── resume normalization, job analysis, plan generation, readiness, account deletion
        │                       ├── Gemini wrapper (schema-validated, cached, throttled)
        │                       └── JobProvider (JSearch → Adzuna fallback)
        └── Supabase ───────── Auth, Postgres + pgvector, private resume storage, RLS
                                  └── user-owned rows + readiness event snapshots
```

The readiness math is deterministic and documented in [docs/READINESS_SCORE.md](docs/READINESS_SCORE.md). Product assumptions are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Local setup

1. Install Node.js 22 or newer and npm.
2. Copy `.env.example` to `.env.local`. `DEMO_MODE=true` works without credentials.
3. Install and run:

   ```sh
   npm install
   npm run dev
   ```

4. Open `http://localhost:3000`. The sign-in screen appears first. Choose **Explore the demo workspace** to try seeded resume evidence, postings, a plan, interviews, applications, and readiness without an account, or sign in to load private workspace data.

## Supabase setup

1. Create a Supabase project and enable email OTP under Authentication. Add `http://localhost:3000/auth/callback` and your deployed `/auth/callback` URL to Authentication → URL Configuration → Redirect URLs.
2. Run the SQL files in `supabase/migrations/` in timestamp order using the SQL editor or Supabase CLI.
3. Copy the project URL into `NEXT_PUBLIC_SUPABASE_URL`; set either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` for browser sign-in. Set the server URL and anon key too. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only for the protected refresh worker and account deletion.
4. Google sign-in is optional. To enable it, open Authentication → Sign In / Providers → Google, enable the provider, add your Google OAuth client ID and secret, and set `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true`. In Google Cloud, add Supabase's callback (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI. Leave the flag false until the provider is enabled; otherwise use the email sign-in link.
5. Private `resumes` storage is created by the migration with MIME and ownership policies.

## Optional integrations

- **Gemini:** set `GEMINI_API_KEY` and `DEMO_MODE=false`. The default model is `gemini-3.6-flash` and can be changed with `GEMINI_MODEL`. Resume normalization, job requirement extraction, learning plan drafting, and interview scoring all use the single `lib/ai/client.ts` wrapper. It validates JSON with Zod, retries once with a repair instruction, caches results per user, redacts obvious resume contact details, rate-limits requests, and logs token usage. Invalid, unavailable, or disabled AI calls use clearly labeled deterministic fallbacks. Resume evidence is checked against the redacted source before it is accepted. Set `GEMINI_MONTHLY_QUOTA` if you want to track a usage target. The scheduled service-role worker requires migration `202611210004_service_api_usage.sql` to attribute Gemini usage safely to the account owner.
- **JSearch:** set `RAPIDAPI_KEY`. The configured monthly default is 200 requests (`JSEARCH_MONTHLY_QUOTA`). Results use the provider interface and fall back to Adzuna.
- **Adzuna:** set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. Review Adzuna's terms before commercial use; API access does not itself establish commercial licensing rights.
- **Auth:** set public Supabase URL and anon key for the sign-in page. With no project configured, the demo remains open.

All supported variables are listed in `.env.example`. Resume normalization and learning plans are user-editable; plan regeneration preserves completed and in-progress weeks. The UI labels sample, cached, Gemini-generated, and deterministic fallback results so it does not present mock data as live output.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

CI runs lint, typecheck, and unit tests. Playwright smoke tests cover the overview, skill gap map, and readiness transparency panel.

## Deploy

Import the repository into Vercel, add the environment values, set Supabase Auth redirect URLs to the deployed `/auth/callback`, and deploy with the Next.js preset. Set `DEMO_MODE=false`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and any provider keys in Vercel. Set `APP_URL` (the deployed origin) and the same `CRON_SECRET` as GitHub repository secrets. The weekly GitHub Actions workflow calls the protected endpoint in four-role pages until every active target role has been processed. Each role refresh uses a seven-day posting cache, respects each user's monthly JSearch quota, stores requirements and readiness history, refreshes the persisted gap map, and reprioritizes pending learning tasks. Completed and in-progress tasks are preserved. Run the `Refresh every connected target role` workflow manually to verify setup. A failed role is reported with its role ID and error; remaining roles in that page still run.

## Free-tier limits and caveats

- JSearch's listed free tier has a 200-request monthly quota; use caching and the quota display to avoid exhausting it. Verify your current RapidAPI subscription limits.
- Adzuna access, attribution, and commercial licensing are governed by its current terms and may require a separate commercial agreement.
- Gemini rate limits depend on model, account, region, and current Google AI terms. Review regional data-use terms before sending resume content. ArtiCareer strips obvious email addresses and phone numbers before prompt submission; users should still review uploaded content.
- Supabase free projects may pause after a week of inactivity; check current project limits and backups for your account.
- Vercel Hobby is for non-commercial use and has execution limits. Verify Vercel's current terms before deploying for business use.
- Demo employers and postings are fictional. Demo mode intentionally skips private-account refresh. Live scheduled processing requires the Vercel service role key, `DEMO_MODE=false`, provider keys, and both `APP_URL` and `CRON_SECRET` GitHub secrets. Vercel Hobby functions have a short execution window, so the workflow pages the refresh workload into small requests.
- This repository is a strong functional prototype, not a substitute for security review, privacy review, vendor-term review, or load testing before launch.
