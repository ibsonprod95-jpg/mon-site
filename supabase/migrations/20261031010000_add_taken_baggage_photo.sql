alter table public.declarations
  add column if not exists taken_photo_path text;

drop function if exists public.create_lost_declaration(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text
);

create function public.create_lost_declaration(
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

revoke all on function public.create_lost_declaration(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_lost_declaration(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text, text
) to service_role;
