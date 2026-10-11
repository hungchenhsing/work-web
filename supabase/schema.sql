-- work-web · Supabase schema
-- Run once in Supabase → SQL Editor → New query → paste everything → Run.
-- Safe to run again: it only creates what is missing and refreshes functions and policies.
--
-- Roles (profiles.role):
--   admin   – everything, incl. approving users      (the FIRST account that signs up becomes admin)
--   editor  – read and change all project data
--   viewer  – read all project data
--   owner   – client: reads published plans only, can leave comments
--   pending – signed up, waiting for approval: sees nothing

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'pending' check (role in ('admin','editor','viewer','owner','pending')),
  created_at timestamptz not null default now()
);
create table if not exists public.app_config (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create table if not exists public.items (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create table if not exists public.publications (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  pub_id text,
  item_id text,
  reg_no text,
  body text not null check (length(body) between 1 and 5000),
  author uuid not null default auth.uid(),
  author_name text,
  status text not null default 'open' check (status in ('open','resolved')),
  reply text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------- role helper ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'none')
$$;

-- new sign-ups get a profile; the very first one becomes admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''),
          case when not exists (select 1 from public.profiles) then 'admin' else 'pending' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- merge helpers (server-side merge so two editors don't overwrite each other's fields) ----------
create or replace function public.item_patch(p_id text, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.items set data = data || p_patch, updated_at = now(), updated_by = auth.uid() where id = p_id;
  if not found then raise exception 'Item % not found or not allowed', p_id using errcode = '42501'; end if;
end $$;
create or replace function public.config_patch(p_id text, p_patch jsonb) returns void
language sql security invoker set search_path = public as $$
  insert into public.app_config (id, data, updated_by) values (p_id, p_patch, auth.uid())
  on conflict (id) do update set data = public.app_config.data || excluded.data, updated_at = now(), updated_by = auth.uid();
$$;

-- ---------- row-level security ----------
alter table public.profiles enable row level security;
alter table public.app_config enable row level security;
alter table public.items enable row level security;
alter table public.publications enable row level security;
alter table public.feedback enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists config_select on public.app_config;
create policy config_select on public.app_config for select to authenticated
  using (public.my_role() in ('admin','editor','viewer') or (public.my_role() = 'owner' and id = 'main'));
drop policy if exists config_insert on public.app_config;
create policy config_insert on public.app_config for insert to authenticated
  with check (public.my_role() in ('admin','editor'));
drop policy if exists config_update on public.app_config;
create policy config_update on public.app_config for update to authenticated
  using (public.my_role() in ('admin','editor')) with check (public.my_role() in ('admin','editor'));

drop policy if exists items_select on public.items;
create policy items_select on public.items for select to authenticated
  using (public.my_role() in ('admin','editor','viewer'));
drop policy if exists items_insert on public.items;
create policy items_insert on public.items for insert to authenticated
  with check (public.my_role() in ('admin','editor'));
drop policy if exists items_update on public.items;
create policy items_update on public.items for update to authenticated
  using (public.my_role() in ('admin','editor')) with check (public.my_role() in ('admin','editor'));
drop policy if exists items_delete on public.items;
create policy items_delete on public.items for delete to authenticated
  using (public.my_role() in ('admin','editor'));

drop policy if exists pubs_select on public.publications;
create policy pubs_select on public.publications for select to authenticated
  using (public.my_role() in ('admin','editor','viewer','owner'));
drop policy if exists pubs_insert on public.publications;
create policy pubs_insert on public.publications for insert to authenticated
  with check (public.my_role() in ('admin','editor'));
drop policy if exists pubs_delete on public.publications;
create policy pubs_delete on public.publications for delete to authenticated
  using (public.my_role() in ('admin','editor'));

drop policy if exists fb_select on public.feedback;
create policy fb_select on public.feedback for select to authenticated
  using (public.my_role() in ('admin','editor','viewer','owner'));
drop policy if exists fb_insert on public.feedback;
create policy fb_insert on public.feedback for insert to authenticated
  with check (public.my_role() in ('admin','editor','owner') and author = auth.uid());
drop policy if exists fb_update on public.feedback;
create policy fb_update on public.feedback for update to authenticated
  using (public.my_role() in ('admin','editor')) with check (public.my_role() in ('admin','editor'));
drop policy if exists fb_delete on public.feedback;
create policy fb_delete on public.feedback for delete to authenticated
  using (public.my_role() = 'admin');

-- ---------- grants (only signed-in users; anonymous visitors get nothing) ----------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.app_config, public.items, public.publications, public.feedback to authenticated;
grant select, update on public.profiles to authenticated;
revoke all on public.app_config, public.items, public.publications, public.feedback, public.profiles from anon;
grant execute on function public.item_patch(text, jsonb), public.config_patch(text, jsonb), public.my_role() to authenticated;
revoke execute on function public.item_patch(text, jsonb), public.config_patch(text, jsonb) from anon;

-- ---------- realtime ----------
do $$
declare t text;
begin
  foreach t in array array['items','app_config','publications','feedback'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- file storage (private bucket, 50 MB per file) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists ww_files_read on storage.objects;
create policy ww_files_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.my_role() in ('admin','editor','viewer'));
drop policy if exists ww_files_insert on storage.objects;
create policy ww_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.my_role() in ('admin','editor'));
drop policy if exists ww_files_delete on storage.objects;
create policy ww_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.my_role() in ('admin','editor'));
