-- Keep the current persisted gap map idempotent when the weekly worker runs.
delete from public.skill_gaps older
using public.skill_gaps newer
where older.user_id = newer.user_id
  and older.target_role_id = newer.target_role_id
  and older.canonical_skill = newer.canonical_skill
  and older.ctid < newer.ctid;

create unique index if not exists skill_gaps_user_role_skill_unique
  on public.skill_gaps(user_id, target_role_id, canonical_skill);

create index if not exists job_postings_role_refresh_idx
  on public.job_postings(user_id, target_role_id, fetched_at desc);

create index if not exists learning_plan_user_role_week_idx
  on public.learning_plan(user_id, target_role_id, week);
