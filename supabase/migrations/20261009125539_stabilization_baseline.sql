-- Reference backend for a NEW, LOCAL Supabase project. Never apply to production.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 200),
  role text not null default 'user' check (role in ('user', 'it_staff', 'admin')),
  created_at timestamptz not null default now()
);
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  serial_number text not null unique check (length(trim(serial_number)) between 1 and 200),
  category text not null default 'Laptop',
  status text not null default 'Aktif' check (status in ('Aktif','Arizali','Depoda')),
  assigned_to uuid constraint assets_assigned_to_fkey references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null check (length(trim(description)) between 1 and 10000),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(user_id, request_id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  content text not null check (length(trim(content)) between 1 and 10000),
  created_at timestamptz not null default now()
);
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  comment text not null default '' check (length(comment) <= 5000),
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  title text not null, body text not null,
  type text not null default 'info' check (type in ('info','success','warning','error')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  content text not null check (length(trim(content)) between 1 and 20000),
  category text not null,
  author_id uuid references public.profiles(id) on delete set null,
  source_ticket_id uuid references public.tickets(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  content text not null check (length(trim(content)) between 1 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null, target_type text not null, target_id text, details text not null default '',
  created_at timestamptz not null default now()
);
create index on public.assets(assigned_to);
create index on public.tickets(user_id);
create index on public.tickets(asset_id, status);
create index on public.comments(ticket_id);
create index on public.comments(user_id);
create index on public.ratings(user_id);
create index on public.notifications(user_id, created_at desc);
create index on public.notifications(ticket_id);
create index on public.articles(author_id);
create index on public.articles(source_ticket_id);
create index on public.logs(user_id);

-- The database row, not user metadata or stale JWT role claims, defines authorization.
-- A deleted profile/user or revoked session immediately fails closed.
create function private.current_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p join auth.users u on u.id = p.id
  where p.id = (select auth.uid()) and not coalesce(u.is_anonymous, false)
    and exists (select 1 from auth.sessions s where s.user_id = p.id
      and s.id::text = (select auth.jwt()->>'session_id'))
$$;
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, role)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name',''),200), 'user');
  return new;
end $$;
create trigger create_profile after insert on auth.users
for each row execute function private.handle_new_user();

-- Admin accounts must first be demoted. This also blocks a race with Auth deletion.
create function private.protect_admin_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'admin' then raise exception 'Demote an administrator before deletion' using errcode = '42501'; end if;
  return old;
end $$;
create trigger protect_admin_delete before delete on public.profiles
for each row execute function private.protect_admin_delete();

alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.tickets enable row level security;
alter table public.comments enable row level security;
alter table public.ratings enable row level security;
alter table public.notifications enable row level security;
alter table public.articles enable row level security;
alter table public.announcements enable row level security;
alter table public.logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.assets, public.tickets, public.comments,
  public.ratings, public.notifications, public.articles, public.announcements, public.logs to authenticated;
grant insert(name, serial_number, category, status, assigned_to),
  update(name, serial_number, category, status, assigned_to), delete on public.assets to authenticated;
grant insert(ticket_id, user_id, score, comment) on public.ratings to authenticated;
grant update(is_read), delete on public.notifications to authenticated;
grant insert(title, content, category, author_id, source_ticket_id),
  update(title, content, category), delete on public.articles to authenticated;
grant insert(title, content, is_active), update(title, content, is_active), delete on public.announcements to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (
  private.current_role() is not null and (id = (select auth.uid()) or private.current_role() in ('it_staff','admin'))
);
create policy assets_read on public.assets for select to authenticated using (
  private.current_role() is not null and (assigned_to = (select auth.uid()) or private.current_role() in ('it_staff','admin'))
);
create policy assets_insert on public.assets for insert to authenticated with check (private.current_role() = 'admin');
create policy assets_update on public.assets for update to authenticated using (private.current_role() = 'admin') with check (private.current_role() = 'admin');
create policy assets_delete on public.assets for delete to authenticated using (private.current_role() = 'admin');
create policy tickets_read on public.tickets for select to authenticated using (
  private.current_role() is not null and (user_id = (select auth.uid()) or private.current_role() in ('it_staff','admin'))
);
create policy comments_read on public.comments for select to authenticated using (
  exists(select 1 from public.tickets t where t.id = ticket_id)
);
create policy ratings_read on public.ratings for select to authenticated using (
  private.current_role() is not null and (user_id = (select auth.uid()) or private.current_role() in ('it_staff','admin'))
);
create policy ratings_insert on public.ratings for insert to authenticated with check (
  private.current_role() is not null and user_id = (select auth.uid()) and
  exists(select 1 from public.tickets t where t.id = ticket_id and t.user_id = (select auth.uid()) and t.status = 'resolved')
);
create policy notifications_read on public.notifications for select to authenticated using (private.current_role() is not null and user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated using (private.current_role() is not null and user_id = (select auth.uid())) with check (private.current_role() is not null and user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (private.current_role() is not null and user_id = (select auth.uid()));
create policy articles_read on public.articles for select to authenticated using (private.current_role() is not null);
create policy articles_insert on public.articles for insert to authenticated with check (
  private.current_role() in ('it_staff','admin') and author_id = (select auth.uid()) and
  (source_ticket_id is null or exists(select 1 from public.tickets t where t.id = source_ticket_id and t.status = 'resolved'))
);
create policy articles_update on public.articles for update to authenticated using (private.current_role() in ('it_staff','admin')) with check (private.current_role() in ('it_staff','admin'));
create policy articles_delete on public.articles for delete to authenticated using (private.current_role() in ('it_staff','admin'));
create policy announcements_read on public.announcements for select to authenticated using (private.current_role() is not null and (is_active or private.current_role() = 'admin'));
create policy announcements_insert on public.announcements for insert to authenticated with check (private.current_role() = 'admin');
create policy announcements_update on public.announcements for update to authenticated using (private.current_role() = 'admin') with check (private.current_role() = 'admin');
create policy announcements_delete on public.announcements for delete to authenticated using (private.current_role() = 'admin');
create policy logs_read on public.logs for select to authenticated using (private.current_role() = 'admin');

create function private.admin_list_profiles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_role() not in ('it_staff','admin') or private.current_role() is null then
    raise exception 'Staff authorization required' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'role',p.role,
    'created_at',p.created_at,'email',case when private.current_role() = 'admin' then u.email else null end) order by p.created_at)
    from public.profiles p join auth.users u on u.id = p.id), '[]'::jsonb);
end $$;
create function public.admin_list_profiles(payload jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_list_profiles() $$;

create function private.admin_update_user_role(target_user_id uuid, target_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
  perform pg_advisory_xact_lock(735019);
  if private.current_role() is distinct from 'admin' then raise exception 'Admin authorization required' using errcode = '42501'; end if;
  if target_role is null or target_role not in ('user','it_staff','admin') then raise exception 'Invalid role' using errcode = '22023'; end if;
  select * into result from public.profiles where id = target_user_id for update;
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  if result.role = 'admin' and target_role <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The last administrator cannot be demoted' using errcode = '42501';
  end if;
  update public.profiles set role = target_role where id = target_user_id returning * into result;
  insert into public.logs(user_id,action,target_type,target_id,details)
  values(auth.uid(),'user_role_updated','profile',target_user_id::text,target_role);
  return to_jsonb(result);
end $$;
create function public.admin_update_user_role(target_user_id uuid, target_role text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_update_user_role(target_user_id, target_role) $$;

create function private.create_ticket(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result public.tickets; asset uuid := nullif(payload->>'asset_id','')::uuid; request uuid := (payload->>'request_id')::uuid;
begin
  if private.current_role() is null then raise exception 'Authorization required' using errcode = '42501'; end if;
  if request is null then raise exception 'request_id required' using errcode = '22023'; end if;
  -- Serializes duplicate requests even when no asset is selected.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || request::text, 0));
  select * into result from public.tickets where user_id = auth.uid() and request_id = request;
  if found then
    if result.title is distinct from trim(payload->>'title') or result.description is distinct from trim(payload->>'description')
      or result.asset_id is distinct from asset or result.priority is distinct from coalesce(payload->>'priority','medium') then
      raise exception 'request_id already used with different input' using errcode = '22023';
    end if;
    return to_jsonb(result);
  end if;
  if asset is not null then
    perform 1 from public.assets where id = asset and assigned_to = auth.uid() for update;
    if not found then raise exception 'Asset must belong to the requester' using errcode = '42501'; end if;
  end if;
  insert into public.tickets(user_id,asset_id,title,description,priority,request_id)
  values(auth.uid(),asset,trim(payload->>'title'),trim(payload->>'description'),coalesce(payload->>'priority','medium'),request)
  returning * into result;
  if asset is not null then update public.assets set status = 'Arizali' where id = asset; end if;
  insert into public.logs(user_id,action,target_type,target_id) values(auth.uid(),'ticket_created','ticket',result.id::text);
  return to_jsonb(result);
end $$;
create function public.create_ticket(payload jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select private.create_ticket(payload) $$;

create function private.update_ticket_status(target_ticket_id uuid, target_status text, expected_updated_at timestamptz, note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare previous public.tickets; result public.tickets; asset uuid;
begin
  if private.current_role() not in ('it_staff','admin') or private.current_role() is null then raise exception 'Staff authorization required' using errcode = '42501'; end if;
  if target_status is null or target_status not in ('open','in_progress','resolved') then raise exception 'Invalid status' using errcode = '22023'; end if;
  if note is null or length(note) > 10000 then raise exception 'Invalid note' using errcode = '22023'; end if;
  select asset_id into asset from public.tickets where id = target_ticket_id;
  -- Asset before ticket: consistent lock order across creation and transitions.
  if asset is not null then perform 1 from public.assets where id = asset for update; end if;
  select * into previous from public.tickets where id = target_ticket_id for update;
  if not found then raise exception 'Ticket not found' using errcode = 'P0002'; end if;
  if expected_updated_at is null or previous.updated_at <> expected_updated_at then
    raise exception 'Ticket changed; reload before saving' using errcode = '40001';
  end if;
  update public.tickets set status = target_status, updated_at = clock_timestamp() where id = target_ticket_id returning * into result;
  if trim(note) <> '' then insert into public.comments(ticket_id,user_id,content) values(target_ticket_id,auth.uid(),trim(note)); end if;
  if asset is not null then
    update public.assets set status = case when exists(select 1 from public.tickets where asset_id = asset and status <> 'resolved') then 'Arizali' else 'Aktif' end where id = asset;
  end if;
  if previous.status <> target_status then
    insert into public.notifications(user_id,ticket_id,title,body,type)
    values(previous.user_id,target_ticket_id,
      case target_status when 'resolved' then 'Talebiniz Çözüldü ✅' when 'in_progress' then 'Talebiniz İşleme Alındı 🔧' else 'Talebiniz Yeniden Açıldı' end,
      previous.title, case when target_status = 'resolved' then 'success' else 'info' end);
  end if;
  insert into public.logs(user_id,action,target_type,target_id,details) values(auth.uid(),'ticket_status_updated','ticket',target_ticket_id::text,target_status);
  return to_jsonb(result);
end $$;
create function public.update_ticket_status(target_ticket_id uuid, target_status text, expected_updated_at timestamptz, note text default '') returns jsonb
language sql security invoker set search_path = '' as $$ select private.update_ticket_status(target_ticket_id, target_status, expected_updated_at, note) $$;

-- Admin asset edits cannot clear a fault while any linked ticket remains open.
create function private.asset_consistency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.tickets where asset_id = new.id and status <> 'resolved') then new.status := 'Arizali'; end if;
  return new;
end $$;
create trigger asset_consistency before update on public.assets for each row execute function private.asset_consistency();
create function private.audit_asset() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.logs(user_id,action,target_type,target_id,details)
  values(auth.uid(), case when tg_op = 'DELETE' then 'asset_deleted' when tg_op = 'INSERT' then 'asset_created' else 'asset_updated' end,
    'asset',coalesce(new.id,old.id)::text,case when tg_op = 'DELETE' then old.name else new.name end);
  return null;
end $$;
create trigger audit_asset after insert or update or delete on public.assets for each row execute function private.audit_asset();

create function private.ticket_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.asset_id is not null and old.status <> 'resolved' then
    perform 1 from public.assets where id = old.asset_id for update;
    update public.assets set status = 'Aktif' where id = old.asset_id and status = 'Arizali'
      and not exists(select 1 from public.tickets where asset_id = old.asset_id and status <> 'resolved');
  end if;
  return null;
end $$;
create trigger ticket_deleted after delete on public.tickets for each row execute function private.ticket_deleted();

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_role(), private.admin_list_profiles(),
  private.admin_update_user_role(uuid,text), private.create_ticket(jsonb), private.update_ticket_status(uuid,text,timestamptz,text) to authenticated;
revoke all on function public.admin_list_profiles(jsonb), public.admin_update_user_role(uuid,text),
  public.create_ticket(jsonb), public.update_ticket_status(uuid,text,timestamptz,text) from public, anon;
grant execute on function public.admin_list_profiles(jsonb), public.admin_update_user_role(uuid,text),
  public.create_ticket(jsonb), public.update_ticket_status(uuid,text,timestamptz,text) to authenticated;

-- Auth API cascades need the usual server role; browsers never have this role.
grant usage on schema private to service_role;
grant all on all tables in schema public to service_role;
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
commit;
