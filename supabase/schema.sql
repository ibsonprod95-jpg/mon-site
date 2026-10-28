create table if not exists public.declarations (
  id uuid primary key,
  tracking_code text not null unique,
  access_secret_hash text not null,
  owner_name text not null,
  phone text not null,
  description text not null,
  color text not null,
  lost_location text not null,
  lost_date date not null,
  lost_time_slot text not null
    check (lost_time_slot in ('07h00 – 15h00', '15h00 – 23h00', '23h00 – 07h00')),
  bus_number text,
  photo_path text,
  ticket_path text,
  status text not null default 'received'
    check (status in ('received', 'searching', 'found', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.declarations
  drop constraint if exists declarations_lost_location_check;
alter table public.declarations
  add constraint declarations_lost_location_check
  check (lost_location in ('AIBD', 'HLM GRAND YOFF', 'TERMINUS GUEDIAWAYE'));

alter table public.declarations
  add column if not exists lost_time_slot text;
alter table public.declarations
  drop constraint if exists declarations_lost_time_slot_check;
alter table public.declarations
  add constraint declarations_lost_time_slot_check
  check (lost_time_slot is null or lost_time_slot in ('07h00 – 15h00', '15h00 – 23h00', '23h00 – 07h00'));

create table if not exists public.declaration_status_history (
  id bigint generated always as identity primary key,
  declaration_id uuid not null references public.declarations(id) on delete cascade,
  status text not null check (status in ('received', 'searching', 'found', 'closed')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists declarations_created_at_idx
  on public.declarations (created_at desc);
create index if not exists declaration_status_history_declaration_id_idx
  on public.declaration_status_history (declaration_id, created_at);

alter table public.declarations enable row level security;
alter table public.declaration_status_history enable row level security;
revoke all on public.declarations from anon, authenticated;
revoke all on public.declaration_status_history from anon, authenticated;
revoke all on sequence public.declaration_status_history_id_seq from anon, authenticated;
grant all on public.declarations, public.declaration_status_history to service_role;
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
  uuid, text, text, text, text, text, text, text, date, text, text, text
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
  p_ticket_path text
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
    color, lost_location, lost_date, lost_time_slot, bus_number, photo_path, ticket_path
  ) values (
    p_id, p_tracking_code, p_access_secret_hash, p_owner_name, p_phone,
    p_description, p_color, p_lost_location, p_lost_date, p_lost_time_slot, p_bus_number,
    p_photo_path, p_ticket_path
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

revoke all on function public.create_lost_declaration(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.update_lost_declaration_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_lost_declaration(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text
) to service_role;
grant execute on function public.update_lost_declaration_status(uuid, text, text)
  to service_role;
