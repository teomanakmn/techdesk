-- TechDesk CSAT ratings schema
-- Supabase SQL Editor'da calistirin.

create table if not exists public.ratings (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (ticket_id, user_id)
);

create index if not exists idx_ratings_ticket_id on public.ratings(ticket_id);
create index if not exists idx_ratings_user_id on public.ratings(user_id);
create index if not exists idx_ratings_created_at on public.ratings(created_at desc);

alter table public.ratings enable row level security;

drop policy if exists "ratings_select_own" on public.ratings;
create policy "ratings_select_own"
on public.ratings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "ratings_select_admin_it" on public.ratings;
create policy "ratings_select_admin_it"
on public.ratings
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'it_staff')
  )
);

drop policy if exists "ratings_insert_own" on public.ratings;
create policy "ratings_insert_own"
on public.ratings
for insert
to authenticated
with check (auth.uid() = user_id);
