alter table public.declarations
  drop constraint if exists declarations_lost_location_check;

alter table public.declarations
  add constraint declarations_lost_location_check
  check (lost_location in ('AIBD', 'HLM GRAND YOFF', 'TERMINUS GUEDIAWAYE'));
