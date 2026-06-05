-- TechDesk admin user management helpers
-- Bu fonksiyonlari Supabase SQL Editor'da calistirin.

drop function if exists public.admin_list_profiles();

create function public.admin_list_profiles(payload jsonb default '{}'::jsonb)
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  perform payload;

  select p.role into actor_role
  from public.profiles p
  where p.id = auth.uid();

  if actor_role not in ('admin', 'it_staff') then
    raise exception 'Yetkisiz islem';
  end if;

  return query
  select p.id, u.email::text, p.full_name, p.role, p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at asc;
end;
$$;

revoke all on function public.admin_list_profiles() from public;
grant execute on function public.admin_list_profiles() to authenticated;

create or replace function public.admin_update_user_role(target_user_id uuid, target_role text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  updated_profile public.profiles;
begin
  select p.role into actor_role
  from public.profiles p
  where p.id = auth.uid();

  if actor_role <> 'admin' then
    raise exception 'Yetkisiz islem';
  end if;

  if target_role not in ('user', 'it_staff', 'admin') then
    raise exception 'Gecersiz rol';
  end if;

  update public.profiles p
  set role = target_role
  where p.id = target_user_id
  returning p.* into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profil bulunamadi';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.admin_update_user_role(uuid, text) from public;
grant execute on function public.admin_update_user_role(uuid, text) to authenticated;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_role text;
begin
  select p.role into actor_role
  from public.profiles p
  where p.id = auth.uid();

  if actor_role <> 'admin' then
    raise exception 'Yetkisiz islem';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Kendi hesabinizi bu panelden silemezsiniz';
  end if;

  delete from auth.users u
  where u.id = target_user_id;

  if not found then
    raise exception 'Kullanici bulunamadi';
  end if;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
