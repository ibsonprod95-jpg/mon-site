create extension if not exists pgcrypto;

create table if not exists public.store_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  size text not null check (char_length(trim(size)) between 1 and 40),
  color text not null default '#1A1A22' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  description text not null default '' check (char_length(description) <= 500),
  price_xof integer check (price_xof is null or price_xof >= 0),
  stock integer not null default 0 check (stock >= 0),
  badge text not null default '' check (char_length(badge) <= 40),
  image_url text not null default '' check (char_length(image_url) <= 2048),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_size_unique unique (name, size)
);

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to authenticated;

alter table public.store_admins enable row level security;
alter table public.products enable row level security;

drop policy if exists "Admins can read their own store access" on public.store_admins;
create policy "Admins can read their own store access"
  on public.store_admins for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products"
  on public.products for select to anon, authenticated
  using (active);

drop policy if exists "Store admins can read all products" on public.products;
create policy "Store admins can read all products"
  on public.products for select to authenticated
  using ((select public.is_store_admin()));

drop policy if exists "Store admins can insert products" on public.products;
create policy "Store admins can insert products"
  on public.products for insert to authenticated
  with check ((select public.is_store_admin()));

drop policy if exists "Store admins can update products" on public.products;
create policy "Store admins can update products"
  on public.products for update to authenticated
  using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));

drop policy if exists "Store admins can delete products" on public.products;
create policy "Store admins can delete products"
  on public.products for delete to authenticated
  using ((select public.is_store_admin()));

grant select on public.store_admins to authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

create index if not exists products_active_position_idx
  on public.products (active, position, created_at);

drop trigger if exists products_set_updated_at on public.products;
create or replace function public.set_product_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_product_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 5242880, array['image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view product photos" on storage.objects;
create policy "Anyone can view product photos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-photos');

drop policy if exists "Store admins can upload product photos" on storage.objects;
create policy "Store admins can upload product photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and (select public.is_store_admin()));

drop policy if exists "Store admins can update product photos" on storage.objects;
create policy "Store admins can update product photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and (select public.is_store_admin()))
  with check (bucket_id = 'product-photos' and (select public.is_store_admin()));

drop policy if exists "Store admins can delete product photos" on storage.objects;
create policy "Store admins can delete product photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and (select public.is_store_admin()));

update public.products
set image_url = replace(
  image_url,
  'https://maguette-t-d-shop-valise.vercel.app/',
  'https://www.td-shop.store/'
)
where image_url like 'https://maguette-t-d-shop-valise.vercel.app/%';

insert into public.products (name, size, color, description, position)
values
  ('Valise cabine — modèle 1', 'Cabine', '#1F4FBF', 'Prix et détails à confirmer', 1),
  ('Valise cabine — modèle 2', 'Cabine', '#FFD21F', 'Prix et détails à confirmer', 2),
  ('Valise moyenne — modèle 1', 'Moyenne', '#1A1A22', 'Prix et détails à confirmer', 3),
  ('Valise moyenne — modèle 2', 'Moyenne', '#D7191F', 'Prix et détails à confirmer', 4),
  ('Grande valise — modèle 1', 'Grande', '#6B4F3A', 'Prix et détails à confirmer', 5),
  ('Set de valises — modèle 1', 'Set', '#1A1A22', 'Prix et détails à confirmer', 6)
on conflict do nothing;
