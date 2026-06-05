-- TechDesk Asset Management schema
-- Supabase SQL Editor'da calistirin.

create table if not exists public.assets (
  id bigint generated always as identity primary key,
  name text not null,
  serial_number text not null unique,
  category text not null,
  status text not null check (status in ('Aktif', 'Arizali', 'Depoda')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_assets_assigned_to on public.assets(assigned_to);
create index if not exists idx_assets_created_at on public.assets(created_at desc);
create index if not exists idx_assets_serial_number on public.assets(serial_number);

alter table public.assets enable row level security;

drop policy if exists "assets_select_authenticated" on public.assets;
create policy "assets_select_authenticated"
on public.assets
for select
to authenticated
using (true);

drop policy if exists "assets_insert_admin_it" on public.assets;
create policy "assets_insert_admin_it"
on public.assets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'it_staff')
  )
);

drop policy if exists "assets_update_admin_it" on public.assets;
create policy "assets_update_admin_it"
on public.assets
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'it_staff')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'it_staff')
  )
);

drop policy if exists "assets_delete_admin" on public.assets;
create policy "assets_delete_admin"
on public.assets
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create or replace function public.mark_assigned_asset_faulty(target_asset_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count int;
begin
  update public.assets a
  set status = 'Arizali'
  where a.id = target_asset_id
    and a.assigned_to = auth.uid();

  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    raise exception 'Secilen ekipman size atanmamis veya bulunamadi';
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.mark_assigned_asset_faulty(bigint) from public;
grant execute on function public.mark_assigned_asset_faulty(bigint) to authenticated;
