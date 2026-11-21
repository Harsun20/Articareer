-- Allow only trusted server-role workers to attribute Gemini usage to an owner.
create or replace function public.record_user_api_usage(
  p_user_id uuid,
  p_provider text,
  p_tokens bigint,
  p_quota integer default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare month_start date := date_trunc('month', now())::date;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  insert into public.api_usage(user_id, provider, period_start, request_count, tokens_used, quota)
  values(p_user_id, p_provider, month_start, 1, greatest(0, p_tokens), greatest(0, p_quota))
  on conflict(user_id, provider, period_start) do update
    set request_count = api_usage.request_count + 1,
        tokens_used = api_usage.tokens_used + greatest(0, p_tokens),
        quota = greatest(0, p_quota),
        updated_at = now();
end;
$$;

revoke all on function public.record_user_api_usage(uuid, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.record_user_api_usage(uuid, text, bigint, integer) to service_role;
