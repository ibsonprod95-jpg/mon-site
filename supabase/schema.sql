create table if not exists public.declarations (
  id uuid primary key,
  tracking_code text not null unique,
  access_secret_hash text not null,
  owner_name text not null,
  phone text not null,
  description text not null,
  color text not null,
  lost_location text not null
    check (lost_location in ('AIBD', 'HLM GRAND YOFF', 'TERMINUS GUEDIAWAYE')),
  lost_date date not null,
  lost_time_slot text not null
    check (lost_time_slot in ('07h00 – 15h00', '15h00 – 23h00', '23h00 – 07h00')),
  bus_number text,
  photo_path text,
  taken_photo_path text,
  ticket_path text,
  declaration_type text not null default 'lost'
    check (declaration_type in ('lost', 'confused')),
  taken_description text,
  status text not null default 'received'
    check (status in ('received', 'searching', 'found', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint declarations_confused_description_check
    check (declaration_type <> 'confused' or (taken_description is not null and length(trim(taken_description)) > 0))
);

alter table public.declarations
  add column if not exists lost_time_slot text,
  add column if not exists declaration_type text not null default 'lost',
  add column if not exists taken_description text,
  add column if not exists taken_photo_path text;

alter table public.declarations
  drop constraint if exists declarations_lost_location_check,
  drop constraint if exists declarations_lost_time_slot_check,
  drop constraint if exists declarations_declaration_type_check,
  drop constraint if exists declarations_confused_description_check;

alter table public.declarations
  add constraint declarations_lost_location_check
    check (lost_location in ('AIBD', 'HLM GRAND YOFF', 'TERMINUS GUEDIAWAYE')),
  add constraint declarations_lost_time_slot_check
    check (lost_time_slot is null or lost_time_slot in ('07h00 – 15h00', '15h00 – 23h00', '23h00 – 07h00')),
  add constraint declarations_declaration_type_check
    check (declaration_type in ('lost', 'confused')),
  add constraint declarations_confused_description_check
    check (declaration_type <> 'confused' or (taken_description is not null and length(trim(taken_description)) > 0));

create table if not exists public.declaration_status_history (
  id bigint generated always as identity primary key,
  declaration_id uuid not null references public.declarations(id) on delete cascade,
  status text not null check (status in ('received', 'searching', 'found', 'closed')),
  note text not null default '',
  created_at timestamptz not null default now()
);

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

create index if not exists declarations_created_at_idx
  on public.declarations (created_at desc);
create index if not exists declaration_status_history_declaration_id_idx
  on public.declaration_status_history (declaration_id, created_at);
create index if not exists declaration_rate_limits_window_start_idx
  on public.declaration_rate_limits (window_start);

alter table public.declarations enable row level security;
alter table public.declaration_status_history enable row level security;
alter table public.admin_allowlist enable row level security;
alter table public.declaration_rate_limits enable row level security;

revoke all on public.declarations, public.declaration_status_history,
  public.admin_allowlist, public.declaration_rate_limits from anon, authenticated;
revoke all on sequence public.declaration_status_history_id_seq from anon, authenticated;
grant all on public.declarations, public.declaration_status_history to service_role;
grant select on public.admin_allowlist to service_role;
grant all on public.declaration_rate_limits to service_role;
grant usage, select on sequence public.declaration_status_history_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'declaration-photos',
  'declaration-photos',
  false,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop function if exists public.create_lost_declaration(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text
);
drop function if exists public.create_lost_declaration(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text
);

create or replace function public.create_lost_declaration(
  p_id uuid,
  p_tracking_code text,
  p_access_secret_hash text,
  p_owner_name text,
  p_phone text,
  p_description text,
  p_color text,
  p_lost_location text,
  p_lost_date date,
  p_lost_time_slot text,
  p_bus_number text,
  p_photo_path text,
  p_ticket_path text,
  p_declaration_type text,
  p_taken_description text,
  p_taken_photo_path text
) returns public.declarations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.declarations;
begin
  insert into public.declarations (
    id, tracking_code, access_secret_hash, owner_name, phone, description,
    color, lost_location, lost_date, lost_time_slot, bus_number, photo_path,
    ticket_path, declaration_type, taken_description, taken_photo_path
  ) values (
    p_id, p_tracking_code, p_access_secret_hash, p_owner_name, p_phone,
    p_description, p_color, p_lost_location, p_lost_date, p_lost_time_slot,
    p_bus_number, p_photo_path, p_ticket_path, p_declaration_type,
    p_taken_description, p_taken_photo_path
  )
  returning * into created;

  insert into public.declaration_status_history (declaration_id, status)
  values (created.id, created.status);

  return created;
end;
$$;

create or replace function public.update_lost_declaration_status(
  p_id uuid,
  p_status text,
  p_note text
) returns public.declarations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated public.declarations;
begin
  update public.declarations
  set status = p_status, updated_at = now()
  where id = p_id
  returning * into updated;

  if not found then
    raise exception 'Declaration not found';
  end if;

  insert into public.declaration_status_history (declaration_id, status, note)
  values (updated.id, updated.status, coalesce(p_note, ''));

  return updated;
end;
$$;

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
     or p_action not in ('health', 'submit', 'track', 'admin-login', 'admin-list', 'admin-update', 'admin-delete', 'admin-photo')
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

revoke all on function public.create_lost_declaration(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.update_lost_declaration_status(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.consume_declaration_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.create_lost_declaration(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text, text
) to service_role;
grant execute on function public.update_lost_declaration_status(uuid, text, text)
  to service_role;
grant execute on function public.consume_declaration_rate_limit(text, text, integer, integer)
  to service_role;
