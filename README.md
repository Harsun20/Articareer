# ArtiCareer

ArtiCareer is a career-coach workspace that turns a resume and target roles into an evidence-based skill map, focused learning plan, portfolio ideas, interview practice, application insights, and a transparent Pivot-Readiness Score. It never applies to jobs for you.

## Architecture

```text
Browser (Next.js App Router + React + Tailwind)
        │
        ├── Demo workspace ── seeded resume evidence, jobs, plan, interview examples
        ├── API routes ─────── resume upload, job search, readiness, account deletion
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

4. Open `http://localhost:3000`. The seeded workspace has Overview, Resume, Target Roles, Job Market, Skill Gaps, Learning Plan, Portfolio, Interviews, Applications, and Readiness pages.

## Supabase setup

1. Create a Supabase project and configure email OTP and Google OAuth under Authentication. Add local and deployed callback URLs (`/auth/callback`).
2. Run the SQL files in `supabase/migrations/` in timestamp order using the SQL editor or Supabase CLI.
3. Copy the project URL and anon key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Set the server values too. The service role key is only needed for account deletion and must remain server-only.
4. Add redirect URLs and enable Google provider credentials in the Supabase dashboard.
5. Private `resumes` storage is created by the migration with MIME and ownership policies.

## Optional integrations

- **Gemini:** set `GEMINI_API_KEY` and `DEMO_MODE=false`. Interview scoring runs through `lib/ai/client.ts`, validates output with Zod, retries once with a repair instruction, caches responses, strips common contact fields, and records request/token use when a signed-in user is available. Unavailable calls use a deterministic rubric fallback. Set `GEMINI_MONTHLY_QUOTA` if you want to track an account-specific usage target; `0` leaves the target unset.
- **JSearch:** set `RAPIDAPI_KEY`. The configured monthly default is 200 requests (`JSEARCH_MONTHLY_QUOTA`). Results use the provider interface and fall back to Adzuna.
- **Adzuna:** set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. Review Adzuna's terms before commercial use; API access does not itself establish commercial licensing rights.
- **Auth:** set public Supabase URL and anon key for the sign-in page. With no project configured, the demo remains open.

All supported variables are listed in `.env.example`.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

CI runs lint, typecheck, and unit tests. Playwright smoke tests cover the overview, skill gap map, and readiness transparency panel.

## Deploy

Import the repository into Vercel, add the environment values, set Supabase Auth redirect URLs to the deployed `/auth/callback`, and deploy with the Next.js preset. Configure `APP_URL` and `CRON_SECRET` as GitHub repository secrets to call the protected weekly refresh endpoint. Vercel Hobby may limit long-running or scheduled work; an external scheduler or worker can be used for production refresh processing.

## Free-tier limits and caveats

- JSearch's listed free tier has a 200-request monthly quota; use caching and the quota display to avoid exhausting it. Verify your current RapidAPI subscription limits.
- Adzuna access, attribution, and commercial licensing are governed by its current terms and may require a separate commercial agreement.
- Gemini rate limits depend on model, account, region, and current Google AI terms. Review regional data-use terms before sending resume content. ArtiCareer strips obvious email addresses and phone numbers before prompt submission; users should still review uploaded content.
- Supabase free projects may pause after a week of inactivity; check current project limits and backups for your account.
- Vercel Hobby is for non-commercial use and has execution limits. Verify Vercel's current terms before deploying for business use.
- Demo employers and postings are fictional. The UI demo illustrates workflows; Supabase-backed user writes and complete scheduled refresh processing require configured production services.
- This repository is a strong functional prototype, not a substitute for security review, privacy review, vendor-term review, or load testing before launch.
