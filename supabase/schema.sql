-- work-web · Supabase schema (v2: user-defined registers, private registers, full change log)
-- Run in Supabase → SQL Editor → New query → paste everything → Run.
-- Safe to run again: it only creates what is missing and refreshes functions and policies.
-- Upgrading from v1 keeps the old `items` table untouched; the site copies it into the new
-- Turnover register the first time the admin signs in.
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

-- =====================================================================
-- v2: registers (each with its own fields), records, change log
-- =====================================================================
create table if not exists public.registers (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  visibility text not null default 'team' check (visibility in ('team','private')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create table if not exists public.records (
  id text primary key,
  register_id text not null references public.registers(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists records_register_idx on public.records(register_id);
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  actor_name text,
  register_id text,
  record_id text,
  action text not null,            -- insert | update | delete | reg_insert | reg_update | reg_delete
  keys text[],                     -- changed top-level keys (update)
  old jsonb,
  new jsonb
);
create index if not exists audit_reg_idx on public.audit_log(register_id, id desc);
create index if not exists audit_rec_idx on public.audit_log(record_id, id desc);

-- who may read / write a register: private = only its creator (not even admins); team = by role
create or replace function public.can_read_register(rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.registers r where r.id = rid and (
    (r.visibility = 'private' and r.owner = auth.uid()) or
    (r.visibility = 'team' and public.my_role() in ('admin','editor','viewer'))))
$$;
create or replace function public.can_write_register(rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.registers r where r.id = rid and (
    (r.visibility = 'private' and r.owner = auth.uid()) or
    (r.visibility = 'team' and public.my_role() in ('admin','editor'))))
$$;

-- server-side merge so two people editing different fields never overwrite each other
create or replace function public.record_patch(p_id text, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.records set data = data || p_patch, updated_at = now(), updated_by = auth.uid() where id = p_id;
  if not found then raise exception 'Record % not found or not allowed', p_id using errcode = '42501'; end if;
end $$;
create or replace function public.register_patch(p_id text, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.registers set data = data || p_patch, updated_at = now(), updated_by = auth.uid() where id = p_id;
  if not found then raise exception 'Register % not found or not allowed', p_id using errcode = '42501'; end if;
end $$;

-- change log, written by the database itself (cannot be skipped from the web page)
create or replace function public.audit_records() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text[]; nm text;
begin
  select coalesce(nullif(name, ''), email) into nm from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.audit_log(actor, actor_name, register_id, record_id, action, new)
    values (auth.uid(), nm, new.register_id, new.id, 'insert', new.data);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log(actor, actor_name, register_id, record_id, action, old)
    values (auth.uid(), nm, old.register_id, old.id, 'delete', old.data);
    return old;
  end if;
  select array_agg(key order by key) into k from (
    select key from jsonb_each(old.data) union select key from jsonb_each(new.data)) x
  where (old.data -> key) is distinct from (new.data -> key);
  if k is null and old.register_id = new.register_id then return new; end if;
  insert into public.audit_log(actor, actor_name, register_id, record_id, action, keys, old, new)
  values (auth.uid(), nm, new.register_id, new.id, 'update', k,
          (select coalesce(jsonb_object_agg(e.key, old.data -> e.key), '{}'::jsonb) from unnest(coalesce(k, '{}')) e(key)),
          (select coalesce(jsonb_object_agg(e.key, new.data -> e.key), '{}'::jsonb) from unnest(coalesce(k, '{}')) e(key)));
  return new;
end $$;
drop trigger if exists records_audit on public.records;
create trigger records_audit after insert or update or delete on public.records
  for each row execute function public.audit_records();

create or replace function public.audit_registers() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select coalesce(nullif(name, ''), email) into nm from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.audit_log(actor, actor_name, register_id, action, new) values (auth.uid(), nm, new.id, 'reg_insert', new.data || jsonb_build_object('_visibility', new.visibility));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log(actor, actor_name, register_id, action, old) values (auth.uid(), nm, old.id, 'reg_delete', old.data || jsonb_build_object('_visibility', old.visibility));
    return old;
  end if;
  if old.data is distinct from new.data or old.visibility is distinct from new.visibility then
    insert into public.audit_log(actor, actor_name, register_id, action, old, new)
    values (auth.uid(), nm, new.id, 'reg_update', old.data || jsonb_build_object('_visibility', old.visibility), new.data || jsonb_build_object('_visibility', new.visibility));
  end if;
  return new;
end $$;
drop trigger if exists registers_audit on public.registers;
create trigger registers_audit after insert or update or delete on public.registers
  for each row execute function public.audit_registers();

alter table public.registers enable row level security;
alter table public.records enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists reg_select on public.registers;
create policy reg_select on public.registers for select to authenticated
  using ((visibility = 'private' and owner = auth.uid()) or (visibility = 'team' and public.my_role() in ('admin','editor','viewer')));
drop policy if exists reg_insert on public.registers;
create policy reg_insert on public.registers for insert to authenticated
  with check (owner = auth.uid() and (public.my_role() in ('admin','editor') or (visibility = 'private' and public.my_role() = 'viewer')));
drop policy if exists reg_update on public.registers;
create policy reg_update on public.registers for update to authenticated
  using ((visibility = 'private' and owner = auth.uid()) or (visibility = 'team' and public.my_role() in ('admin','editor')))
  with check ((visibility = 'private' and owner = auth.uid()) or (visibility = 'team' and public.my_role() in ('admin','editor')));
drop policy if exists reg_delete on public.registers;
create policy reg_delete on public.registers for delete to authenticated
  using ((visibility = 'private' and owner = auth.uid()) or (visibility = 'team' and public.my_role() = 'admin'));

drop policy if exists rec_select on public.records;
create policy rec_select on public.records for select to authenticated using (public.can_read_register(register_id));
drop policy if exists rec_insert on public.records;
create policy rec_insert on public.records for insert to authenticated with check (public.can_write_register(register_id));
drop policy if exists rec_update on public.records;
create policy rec_update on public.records for update to authenticated
  using (public.can_write_register(register_id)) with check (public.can_write_register(register_id));
drop policy if exists rec_delete on public.records;
create policy rec_delete on public.records for delete to authenticated using (public.can_write_register(register_id));

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.can_read_register(register_id) or (record_id is null and action = 'reg_delete' and actor = auth.uid()));

grant select, insert, update, delete on public.registers, public.records to authenticated;
grant select on public.audit_log to authenticated;
revoke all on public.registers, public.records, public.audit_log from anon;
grant execute on function public.record_patch(text, jsonb), public.register_patch(text, jsonb), public.can_read_register(text), public.can_write_register(text) to authenticated;
revoke execute on function public.record_patch(text, jsonb), public.register_patch(text, jsonb), public.can_read_register(text), public.can_write_register(text) from anon;

do $$
declare t text;
begin
  foreach t in array array['registers','records','audit_log'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- file storage (private bucket, 50 MB per file) ----------
-- v2 files live under r/<register id>/... and follow that register's privacy; older files follow the role.
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists ww_files_read on storage.objects;
create policy ww_files_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and (
    (name like 'r/%' and public.can_read_register(split_part(name, '/', 2))) or
    (name not like 'r/%' and public.my_role() in ('admin','editor','viewer'))));
drop policy if exists ww_files_insert on storage.objects;
create policy ww_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (
    (name like 'r/%' and public.can_write_register(split_part(name, '/', 2))) or
    (name not like 'r/%' and public.my_role() in ('admin','editor'))));
drop policy if exists ww_files_delete on storage.objects;
create policy ww_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (
    (name like 'r/%' and public.can_write_register(split_part(name, '/', 2))) or
    (name not like 'r/%' and public.my_role() in ('admin','editor'))));
