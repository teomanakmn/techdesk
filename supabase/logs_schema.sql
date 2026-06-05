create table if not exists public.logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text,
  details text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_logs_created_at on public.logs (created_at desc);
create index if not exists idx_logs_user_id on public.logs (user_id);
create index if not exists idx_logs_target on public.logs (target_type, target_id);

alter table public.logs enable row level security;

drop policy if exists "logs_insert_own" on public.logs;
create policy "logs_insert_own"
on public.logs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "logs_read_admin_it" on public.logs;
create policy "logs_read_admin_it"
on public.logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role in ('admin', 'it_staff')
  )
);
