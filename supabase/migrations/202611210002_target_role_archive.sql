alter table public.target_roles
  add column if not exists is_active boolean not null default true;

create index if not exists target_roles_active_user_idx
  on public.target_roles(user_id, is_active);
