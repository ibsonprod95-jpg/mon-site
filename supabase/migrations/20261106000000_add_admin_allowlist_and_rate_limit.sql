create table if not exists public.admin_allowlist (
  email text primary key check (email = lower(trim(email)) and email like '%@%'),
  created_at timestamptz not null default now()
);

create table if not exists public.declaration_rate_limits (
  client_key text not null,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (client_key, action, window_start)
);

create index if not exists declaration_rate_limits_window_start_idx
  on public.declaration_rate_limits (window_start);

alter table public.admin_allowlist enable row level security;
alter table public.declaration_rate_limits enable row level security;

revoke all on public.admin_allowlist, public.declaration_rate_limits from anon, authenticated;
grant select on public.admin_allowlist to service_role;
grant all on public.declaration_rate_limits to service_role;

create or replace function public.consume_declaration_rate_limit(
  p_client_key text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  request_count integer;
begin
  if p_client_key is null or p_client_key !~ '^[0-9a-f]{64}$'
     or p_action is null
     or p_action not in ('health', 'submit', 'track', 'admin-login', 'admin-list', 'admin-update', 'admin-photo')
     or p_limit is null or p_limit < 1 or p_limit > 120
     or p_window_seconds is null or p_window_seconds <> 3600 then
    raise exception 'Invalid declaration rate limit parameters';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)::double precision
      * p_window_seconds
  );

  delete from public.declaration_rate_limits
  where declaration_rate_limits.window_start < clock_timestamp() - interval '24 hours';

  insert into public.declaration_rate_limits (client_key, action, window_start, request_count)
  values (p_client_key, p_action, v_window_start, 1)
  on conflict (client_key, action, window_start)
  do update set request_count = public.declaration_rate_limits.request_count + 1
  returning declaration_rate_limits.request_count into request_count;

  return request_count <= p_limit;
end;
$$;

revoke all on function public.consume_declaration_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_declaration_rate_limit(text, text, integer, integer)
  to service_role;
