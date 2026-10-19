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

-- =====================================================================
-- v2.6: public links — read-only pages anyone with the link can open, no sign-in
-- =====================================================================
-- A link is a random id (20+ characters). Visitors never read tables: the only way in is
-- share_get(id), which returns one share and nothing else. What it shows follows the Owner rules:
--   * private ("Only me") registers, the Team & contacts directory and Internal presentations never leave the database;
--   * registers published to the Owner (and the document library): only records marked "Show in Owner plan";
--   * register views: only fields marked External plus No. and title, only the chosen columns, only the
--     records matching the publisher's filter;
--   * overviews and presentations: External fields plus the ones charts need (No., title, dates, progress,
--     status, block, package, type, baseline). Files, links and sub-tables never go out, nor do field
--     explanations, speaker notes, hidden slides or names from lists the shared records do not use;
--   * snapshots keep their values but follow today's permissions (see share_recheck);
--   * links made before v2.6.1 (data.v missing) stay closed.
-- Admins and editors create, revoke and delete links on the site (Settings → Public links).
create table if not exists public.shares (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{20,64}$'),
  data jsonb not null default '{}'::jsonb,       -- {kind: reg|deck|overview, mode: snap|live, title, lang, cfg, snap}
  revoked boolean not null default false,
  expires_at timestamptz,
  views integer not null default 0,
  last_view timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.shares enable row level security;
drop policy if exists shares_read on public.shares;
create policy shares_read on public.shares for select to authenticated using (public.my_role() in ('admin','editor'));
drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares for insert to authenticated with check (public.my_role() in ('admin','editor'));
drop policy if exists shares_update on public.shares;
create policy shares_update on public.shares for update to authenticated using (public.my_role() in ('admin','editor')) with check (public.my_role() in ('admin','editor'));
drop policy if exists shares_delete on public.shares;
create policy shares_delete on public.shares for delete to authenticated using (public.my_role() in ('admin','editor'));
revoke all on public.shares from anon;
grant select, insert, update, delete on public.shares to authenticated;

-- small pure helpers used below. They read no table and are written without their own search_path so that Postgres can
-- inline them; the functions that call them pin search_path to '' (built-ins only, everything else schema-qualified).
-- js/share.js mirrors all of this for the demo and the preview.
drop function if exists public.share_match(jsonb, jsonb, jsonb);
create or replace function public.share_obj(p jsonb) returns jsonb   -- drop top-level keys whose value is null
language sql immutable as $$
  select coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e
                    where e.value <> 'null'::jsonb), '{}'::jsonb) $$;
create or replace function public.share_truthy(v jsonb) returns boolean   -- the site's own notion of "set"
language sql immutable as $$
  select v is not null and v not in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb) $$;
create or replace function public.share_str(v jsonb) returns text
language sql immutable as $$ select case when jsonb_typeof(v) = 'string' then v #>> '{}' end $$;
create or replace function public.share_arr(v jsonb) returns setof jsonb   -- one value or a list of values
language sql immutable as $$
  select x from jsonb_array_elements(case when v is null or v in ('null'::jsonb, '""'::jsonb) then '[]'::jsonb
                                          when jsonb_typeof(v) = 'array' then v else jsonb_build_array(v) end) x $$;
-- a field definition as visitors get it: what displaying needs (no explanations or other settings)
create or replace function public.share_field(f jsonb) returns jsonb
language sql immutable as $$
  select public.share_obj(jsonb_build_object('key', f->'key', 'en', f->'en', 'zh', f->'zh', 'type', f->'type', 'list', f->'list', 'multi', f->'multi',
    'opts', f->'opts', 'tree', f->'tree', 'unit', f->'unit', 'w', f->'w', 'hide', f->'hide', 'ext', f->'ext',
    'auto', case when jsonb_typeof(f->'auto') = 'object' then public.share_obj(jsonb_build_object('op', f->'auto'->'op', 'a', f->'auto'->'a', 'b', f->'auto'->'b')) end,
    'calc', case when jsonb_typeof(f->'calc') = 'object' then public.share_obj(jsonb_build_object('op', f->'calc'->'op', 'a', f->'calc'->'a', 'b', f->'calc'->'b')) end)) $$;
-- the field-value part of a publisher's filter, prepared once per register: [{k, w: wanted values, c: is a tick box}]
create or replace function public.share_fx(p_rec jsonb, p_fx jsonb) returns boolean
language plpgsql immutable as $$
declare c jsonb; have jsonb; k text;
begin
  for c in select x from jsonb_array_elements(p_fx) x loop
    k := c->>'k';
    if c->'c' = 'true'::jsonb then have := jsonb_build_array(case when public.share_truthy(p_rec->k) then '1' else '0' end);
    else have := (select coalesce(jsonb_agg(x), '[]'::jsonb) from public.share_arr(p_rec->k) x); end if;
    continue when jsonb_array_length(have) = 0 and (c->'w') @> '["__none"]'::jsonb;
    if not exists (select 1 from jsonb_array_elements(have) h, jsonb_array_elements(c->'w') w where h = w) then return false; end if;
  end loop;
  return true;
end $$;
-- lists behind status / type / block / matrix keep every entry; other lists (names) keep only the entries the records use
create or replace function public.share_lists(p_lists jsonb, p_lst text[], p_full text[], p_used text[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, case
      when e.key = any(p_full) or jsonb_typeof(e.value) <> 'object' or coalesce(jsonb_typeof(e.value->'opts'), '') <> 'array' then e.value
      else e.value || jsonb_build_object('opts', (select coalesce(jsonb_agg(o order by n), '[]'::jsonb) from jsonb_array_elements(e.value->'opts') with ordinality y(o, n)
                                                    where jsonb_typeof(o->'v') = 'string' and (e.key || chr(31) || (o->>'v')) = any(p_used))) end), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(p_lists) = 'object' then p_lists else '{}'::jsonb end) e where e.key = any(p_lst) $$;
-- bookkeeping for share_lists, one register at a time: lists its fields use / that stay whole / entries its records use
create or replace function public.share_listuse(p_flds jsonb, p_recs jsonb, p_roles jsonb, p_matrix jsonb, out lst text[], out full_l text[], out used_l text[])
language sql immutable as $$
  with st as (select array_remove(array[public.share_str(p_roles->'status'), public.share_str(p_roles->'kind'), public.share_str(p_roles->'block'),
                                        public.share_str(p_matrix->'row'), public.share_str(p_matrix->'col')], null) s),
       lf as (select f->>'key' k, public.share_str(f->'list') l from jsonb_array_elements(p_flds) f where coalesce(public.share_str(f->'list'), '') <> '')
  select array(select l from lf),
         array(select l from lf, st where k = any(st.s)),
         array(select lf.l || chr(31) || (v #>> '{}') from lf cross join st cross join jsonb_array_elements(p_recs) x cross join lateral public.share_arr(x->'d'->lf.k) v
                where not (lf.k = any(st.s)) and jsonb_typeof(v) = 'string') $$;

-- the public copy of some registers: whitelisted register settings, allowed fields only, allowed records only.
-- p_opt: {strict: true} — register views: External fields plus No. and title, nothing extra for charts;
--        {cols: [...]} — only these columns (plus No., title and package); {filter: {fx, node}} — only matching records;
--        {ids: [...]} — only these records (a snapshot of a register view, frozen as the publisher saw it).
drop function if exists public.share_project(text[]);
drop function if exists public.share_project(text[], boolean);
create or replace function public.share_project(p_regs text[], p_opt jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g record; fs jsonb; ro jsonb; keys text[]; allk text[]; gated boolean; lib boolean; is_strict boolean; flds jsonb; rls jsonb; rs jsonb; c jsonb;
  cols text[]; idset jsonb; flt jsonb; fx jsonb; nmode text; nset jsonb; tk text; nd text; tf jsonb; tn jsonb; u record;
  lst text[] := '{}'; full_l text[] := '{}'; used_l text[] := '{}'; out_regs jsonb := '[]'::jsonb; out_recs jsonb := '[]'::jsonb;
  role_keys constant text[] := array['no','title','title2','start','finish','progress','status','block','tree','kind','astart','afinish','base'];
  lib_keys constant text[] := array['no','title','titleZh','docNo','rev','disc','status','date'];
  bad_types constant text[] := array['files','link','sub','section'];
begin
  p_opt := case when jsonb_typeof(p_opt) = 'object' then p_opt else '{}'::jsonb end;
  is_strict := coalesce(p_opt->'strict' = 'true'::jsonb, false);
  cols := case when jsonb_typeof(p_opt->'cols') = 'array' then array(select x #>> '{}' from jsonb_array_elements(p_opt->'cols') x where jsonb_typeof(x) = 'string') end;
  idset := case when jsonb_typeof(p_opt->'ids') = 'array' then coalesce((select jsonb_object_agg(x #>> '{}', true) from jsonb_array_elements(p_opt->'ids') x where jsonb_typeof(x) = 'string'), '{}'::jsonb) end;
  flt := p_opt->'filter';
  for g in select r.id, r.data from public.registers r
            where r.id = any(coalesce(p_regs, '{}'::text[])) and r.visibility = 'team' and r.id ~ '^[A-Za-z0-9_-]{1,64}$'
              and jsonb_typeof(r.data) = 'object' and coalesce(public.share_str(r.data->'kind'), '') not in ('decks', 'snaps', 'people')
            order by array_position(p_regs, r.id) loop
    fs := case when jsonb_typeof(g.data->'fields') = 'array' then (select coalesce(jsonb_agg(f order by o), '[]'::jsonb) from jsonb_array_elements(g.data->'fields') with ordinality x(f, o) where jsonb_typeof(f) = 'object') else '[]'::jsonb end;
    ro := case when jsonb_typeof(g.data->'roles') = 'object' then g.data->'roles' else '{}'::jsonb end;
    lib := coalesce(g.data->'kind' = '"library"'::jsonb, false);
    gated := lib or public.share_truthy(g.data->'ownerPublish');
    allk := array(select f->>'key' from jsonb_array_elements(fs) f where jsonb_typeof(f->'key') = 'string');
    select coalesce(array_agg(distinct k), '{}') into keys from (
      select public.share_str(f->'key') as k from jsonb_array_elements(fs) f
       where coalesce(public.share_str(f->'type'), '') <> all(bad_types)
         and (f->'ext' = 'true'::jsonb or (lib and public.share_str(f->'key') = any(lib_keys)))
      union select public.share_str(e.value) from jsonb_each(ro) e where e.key = any(case when is_strict then array['no','title','title2'] else role_keys end)
      union select public.share_str(f->'auto'->'a') from jsonb_array_elements(fs) f where not is_strict and f->'key' = ro->'progress' and jsonb_typeof(f->'key') = 'string'
      union select public.share_str(f->'auto'->'b') from jsonb_array_elements(fs) f where not is_strict and f->'key' = ro->'progress' and jsonb_typeof(f->'key') = 'string'
      union select public.share_str(g.data->'matrix'->'row') where not is_strict
      union select public.share_str(g.data->'matrix'->'col') where not is_strict
      union select unnest(array['baseStart', 'baseFinish']) where not is_strict
    ) x where k is not null and k <> '';
    -- a role pointing at a file / link / sub-table field is still not shared
    keys := array(select k from unnest(keys) k where not exists (
      select 1 from jsonb_array_elements(fs) f where f->'key' = to_jsonb(k) and coalesce(public.share_str(f->'type'), '') = any(bad_types)));
    if cols is not null then
      keys := array(select k from unnest(keys) k where k = any(cols)
                      or k = any(array(select public.share_str(ro->x) from unnest(array['no', 'title', 'title2', 'tree']) x)));
    end if;
    select coalesce(jsonb_agg(public.share_field(f) order by o), '[]'::jsonb) into flds from jsonb_array_elements(fs) with ordinality x(f, o) where public.share_str(f->'key') = any(keys);
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into rls from jsonb_each(ro) e where e.key = any(role_keys) and public.share_str(e.value) = any(keys);
    -- the publisher's filter, prepared once for the register
    fx := '[]'::jsonb; nmode := 'all'; nset := '{}'::jsonb; tk := null;
    if jsonb_typeof(flt) = 'object' then
      if jsonb_typeof(flt->'fx') = 'object' then
        fx := coalesce((select jsonb_agg(jsonb_build_object('k', e.key, 'w', e.value, 'c', coalesce(q.f->'type' = '"check"'::jsonb, false)) order by e.key)
          from jsonb_each(flt->'fx') e
          cross join lateral (select f from jsonb_array_elements(fs) with ordinality x(f, o) where f->'key' = to_jsonb(e.key) order by o limit 1) q
          where case when jsonb_typeof(e.value) = 'array' then jsonb_array_length(e.value) > 0 else false end), '[]'::jsonb);
      end if;
      nd := public.share_str(flt->'node'); tk := public.share_str(ro->'tree');
      if coalesce(nd, '') not in ('', 'all') and coalesce(tk, '') <> '' then
        tf := (select f from jsonb_array_elements(fs) with ordinality x(f, o) where f->'key' = to_jsonb(tk) order by o limit 1);
        if tf is not null then
          tn := case when jsonb_typeof(tf->'tree') = 'array' then tf->'tree' else '[]'::jsonb end;
          if nd = 'none' then
            nmode := 'none';
            nset := coalesce((select jsonb_object_agg(n->>'id', true) from jsonb_array_elements(tn) n where jsonb_typeof(n->'id') = 'string'), '{}'::jsonb);
          else
            nmode := 'set';
            nset := (with recursive t(id) as (
                select nd
                union
                select n->>'id' from t join jsonb_array_elements(tn) n
                  on jsonb_typeof(n->'id') = 'string' and coalesce(public.share_str(n->'parent'), '') = t.id)
              select jsonb_object_agg(id, true) from t);
          end if;
        end if;
      end if;
    end if;
    rs := coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reg', r.register_id, 'd',
        (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(case when jsonb_typeof(r.data) = 'object' then r.data else '{}'::jsonb end) e
          where e.key = any(keys) or (e.key in ('parent', 'ms', 'ext') and not (e.key = any(allk))))) order by r.created_at, r.id)
      from public.records r where r.register_id = g.id
        and (not gated or r.data->'ext' = 'true'::jsonb)
        and (idset is null or idset ? r.id)
        and (jsonb_array_length(fx) = 0 or public.share_fx(r.data, fx))
        and (nmode = 'all'
             or (nmode = 'set' and jsonb_typeof(r.data->tk) = 'string' and nset ? (r.data->>tk))
             or (nmode = 'none' and not (public.share_truthy(r.data->tk) and jsonb_typeof(r.data->tk) = 'string' and nset ? (r.data->>tk))))), '[]'::jsonb);
    out_regs := out_regs || jsonb_build_array(jsonb_build_object('id', g.id, 'vis', 'team', 'd', public.share_obj(jsonb_build_object(
      'kind', g.data->'kind', 'en', g.data->'en', 'zh', g.data->'zh', 'icon', g.data->'icon', 'color', g.data->'color', 'sec', g.data->'sec',
      'prefix', g.data->'prefix', 'tpl', g.data->'tpl', 'ownerPublish', g.data->'ownerPublish', 'allMs', g.data->'allMs', 'view', g.data->'view',
      'matrix', g.data->'matrix', 'roles', rls, 'fields', flds))));
    out_recs := out_recs || rs;
    select * into u from public.share_listuse(flds, rs, ro, g.data->'matrix');
    lst := lst || u.lst; full_l := full_l || u.full_l; used_l := used_l || u.used_l;
  end loop;
  c := coalesce((select a.data from public.app_config a where a.id = 'main'), '{}'::jsonb);
  if jsonb_typeof(c) <> 'object' then c := '{}'::jsonb; end if;
  return jsonb_build_object('regs', out_regs, 'recs', out_recs, 'cfg', public.share_obj(jsonb_build_object('v2', true,
    'projectEn', c->'projectEn', 'projectZh', c->'projectZh', 'asOf', c->'asOf', 'ganttStart', c->'ganttStart', 'ganttEnd', c->'ganttEnd',
    'lists', public.share_lists(c->'lists', lst, full_l, used_l))));
end $$;
revoke all on function public.share_project(text[], jsonb) from public, anon, authenticated;

-- which registers a link reads, and the options for share_project (stage: live / freeze / check)
create or replace function public.share_regs(d jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(x #>> '{}'), '{}') from jsonb_array_elements(case when jsonb_typeof(d->'cfg'->'regs') = 'array' then d->'cfg'->'regs' else '[]'::jsonb end) x
   where jsonb_typeof(x) = 'string' $$;
create or replace function public.share_opt(d jsonb, stage text) returns jsonb
language sql immutable as $$
  select case when d->'kind' = '"reg"'::jsonb then public.share_obj(jsonb_build_object('strict', true, 'cols', d->'cfg'->'cols',
    'filter', case when stage <> 'check' then d->'cfg'->'filter' end, 'ids', case when stage = 'freeze' then d->'cfg'->'ids' end)) else '{}'::jsonb end $$;

-- a snapshot keeps its values, but follows today's permissions: registers made private, fields no longer External,
-- records no longer marked for the Owner drop out of it (and so do list entries only they used)
create or replace function public.share_recheck(p_snap jsonb, p_live jsonb) returns jsonb
language plpgsql immutable as $$
declare g jsonb; lg jsonb; kf text[]; kr text[]; gated boolean; lids jsonb; fl jsonb; rl jsonb; rs jsonb; c jsonb; u record;
  lst text[] := '{}'; full_l text[] := '{}'; used_l text[] := '{}'; regs jsonb := '[]'::jsonb; recs jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_snap) is distinct from 'object' then return null; end if;
  for g in select x from jsonb_array_elements(case when jsonb_typeof(p_snap->'regs') = 'array' then p_snap->'regs' else '[]'::jsonb end) x loop
    continue when jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'d') is distinct from 'object' or jsonb_typeof(g->'id') is distinct from 'string';
    lg := (select x from jsonb_array_elements(case when jsonb_typeof(p_live->'regs') = 'array' then p_live->'regs' else '[]'::jsonb end) x where x->'id' = g->'id' limit 1);
    continue when lg is null;
    -- what may go out for this register today: its fields, and the record keys its live copy carries
    kf := array(select f->>'key' from jsonb_array_elements(lg->'d'->'fields') f where jsonb_typeof(f->'key') = 'string');
    kr := kf || array(select distinct k from jsonb_array_elements(p_live->'recs') x cross join jsonb_object_keys(x->'d') k where x->'reg' = g->'id');
    gated := coalesce(lg->'d'->'kind' = '"library"'::jsonb, false) or public.share_truthy(lg->'d'->'ownerPublish');
    lids := coalesce((select jsonb_object_agg(x->>'id', true) from jsonb_array_elements(p_live->'recs') x where x->'reg' = g->'id'), '{}'::jsonb);
    fl := (select coalesce(jsonb_agg(public.share_field(f) order by n), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(g->'d'->'fields') = 'array' then g->'d'->'fields' else '[]'::jsonb end) with ordinality y(f, n)
            where jsonb_typeof(f->'key') = 'string' and f->>'key' = any(kf));
    rl := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(case when jsonb_typeof(g->'d'->'roles') = 'object' then g->'d'->'roles' else '{}'::jsonb end) e
            where jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') = any(kf));
    regs := regs || jsonb_build_array(g || jsonb_build_object('d', (g->'d') || jsonb_build_object('fields', fl, 'roles', rl)));
    rs := coalesce((select jsonb_agg(r || jsonb_build_object('d', (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
          from jsonb_each(case when jsonb_typeof(r->'d') = 'object' then r->'d' else '{}'::jsonb end) e where e.key = any(kr))) order by n)
      from jsonb_array_elements(case when jsonb_typeof(p_snap->'recs') = 'array' then p_snap->'recs' else '[]'::jsonb end) with ordinality y(r, n)
      where jsonb_typeof(r) = 'object' and r->'reg' = g->'id' and (not gated or (jsonb_typeof(r->'id') = 'string' and lids ? (r->>'id')))), '[]'::jsonb);
    recs := recs || rs;
    select * into u from public.share_listuse(fl, rs, rl, g->'d'->'matrix');
    lst := lst || u.lst; full_l := full_l || u.full_l; used_l := used_l || u.used_l;
  end loop;
  c := case when jsonb_typeof(p_snap->'cfg') = 'object' then p_snap->'cfg' else '{}'::jsonb end;
  if c ? 'lists' then c := c || jsonb_build_object('lists', public.share_lists(c->'lists', lst, full_l, used_l)); end if;
  return jsonb_build_object('regs', regs, 'recs', recs, 'cfg', c);
end $$;

-- a presentation as visitors of a live link get it: visible slides only, display settings only
-- (no speaker notes, comments, frozen internal figures, hidden slides, photo picks or file paths, hidden-item labels)
create or replace function public.share_pcfg(p_type text, c jsonb) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(c) is distinct from 'object' then null else
    (c - 'picks' - 'hideLab' - 'hide')
    || case when jsonb_typeof(c->'hide') = 'array' then jsonb_build_object('hide', (select coalesce(jsonb_agg(h order by n), '[]'::jsonb)
         from jsonb_array_elements(c->'hide') with ordinality y(h, n) where not (jsonb_typeof(h) = 'string' and left(h #>> '{}', 2) = 'p:'))) else '{}'::jsonb end
    || case when p_type is distinct from 'photos' and jsonb_typeof(c->'picks') = 'array' then jsonb_build_object('picks', (select coalesce(jsonb_agg(case when jsonb_typeof(p) = 'object' then p - 'path' else p end order by n), '[]'::jsonb)
         from jsonb_array_elements(c->'picks') with ordinality y(p, n))) else '{}'::jsonb end
  end $$;
create or replace function public.share_cfg(p_type text, c jsonb) returns jsonb
language sql immutable as $$
  select case when p_type = 'combo' and jsonb_typeof(c) = 'object' then public.share_pcfg(p_type, c) || public.share_obj(jsonb_build_object(
      'L', case when jsonb_typeof(c->'L') = 'object' then (c->'L') || public.share_obj(jsonb_build_object('cfg', public.share_pcfg(c->'L'->>'type', c->'L'->'cfg'))) end,
      'R', case when jsonb_typeof(c->'R') = 'object' then (c->'R') || public.share_obj(jsonb_build_object('cfg', public.share_pcfg(c->'R'->>'type', c->'R'->'cfg'))) end))
    else public.share_pcfg(p_type, c) end $$;
create or replace function public.share_el(e jsonb) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(e) = 'object' and e->'k' = '"data"'::jsonb then e || public.share_obj(jsonb_build_object('cfg', public.share_cfg(e->>'type', e->'cfg'))) else e end $$;
create or replace function public.share_logo(l jsonb) returns jsonb
language sql immutable as $$ select case when jsonb_typeof(l->'path') = 'string' then jsonb_build_object('path', l->'path') end $$;
create or replace function public.share_deck(p_id text, p jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', p_id, 'd', public.share_obj(jsonb_build_object('no', p->'no', 'title', p->'title', 'titleZh', p->'titleZh', 'date', p->'date',
    'lang', p->'lang', 'presenter', p->'presenter', 'aud', 'owner',
    'theme', case when jsonb_typeof(p->'theme') = 'object' then public.share_obj(jsonb_build_object('color', p->'theme'->'color', 'foot', p->'theme'->'foot',
      'footText', p->'theme'->'footText', 'conf', p->'theme'->'conf', 'style', p->'theme'->'style', 'agenda', p->'theme'->'agenda',
      'logoL', public.share_logo(p->'theme'->'logoL'), 'logoR', public.share_logo(p->'theme'->'logoR'))) end,
    'slides', (select coalesce(jsonb_agg(public.share_obj(jsonb_build_object('id', s->'id', 'type', s->'type', 'title', s->'title', 'box', s->'box',
        'cfg', public.share_cfg(s->>'type', s->'cfg'),
        'els', case when jsonb_typeof(s->'els') = 'array' then (select coalesce(jsonb_agg(public.share_el(e) order by m), '[]'::jsonb) from jsonb_array_elements(s->'els') with ordinality z(e, m)) end)) order by n), '[]'::jsonb)
      from jsonb_array_elements(case when jsonb_typeof(p->'slides') = 'array' then p->'slides' else '[]'::jsonb end) with ordinality y(s, n)
      where jsonb_typeof(s) = 'object' and not public.share_truthy(s->'hidden'))))) $$;
-- images embedded in a live presentation link: only those the visible slides and the logos use
create or replace function public.share_media(m jsonb, dk jsonb) returns jsonb
language sql immutable as $$
  select coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(case when jsonb_typeof(m) = 'object' then m else '{}'::jsonb end) e
    where e.key in (select el->>'path' from jsonb_array_elements(dk->'d'->'slides') s
                      cross join jsonb_array_elements(case when jsonb_typeof(s->'els') = 'array' then s->'els' else '[]'::jsonb end) el
                     where jsonb_typeof(el->'path') = 'string'
                    union select dk->'d'->'theme'->'logoL'->>'path' union select dk->'d'->'theme'->'logoR'->>'path')), '{}'::jsonb) $$;
do $$ declare f text; begin
  foreach f in array array['share_obj(jsonb)', 'share_truthy(jsonb)', 'share_str(jsonb)', 'share_arr(jsonb)', 'share_field(jsonb)', 'share_fx(jsonb,jsonb)',
    'share_lists(jsonb,text[],text[],text[])', 'share_listuse(jsonb,jsonb,jsonb,jsonb)', 'share_regs(jsonb)', 'share_opt(jsonb,text)', 'share_recheck(jsonb,jsonb)',
    'share_pcfg(text,jsonb)', 'share_cfg(text,jsonb)', 'share_el(jsonb)', 'share_logo(jsonb)', 'share_deck(text,jsonb)', 'share_media(jsonb,jsonb)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
  end loop; end $$;

-- what a visitor's browser asks for: one link, nothing else
create or replace function public.share_get(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.shares; d jsonb; regs text[]; dk record; dj jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,64}$' then return null; end if;
  select * into s from public.shares where id = p_token;
  if not found or s.revoked or (s.expires_at is not null and s.expires_at <= now()) then return null; end if;
  d := case when jsonb_typeof(s.data) = 'object' then s.data else '{}'::jsonb end;
  -- links made before v2.6.1 followed older rules: they stay closed (make a new link)
  if d->'v' is distinct from '2'::jsonb then return null; end if;
  regs := public.share_regs(d);
  if d->'kind' = '"deck"'::jsonb then
    -- the presentation must still exist, be a team presentation and be in Owner mode
    select r.id, r.data into dk from public.records r join public.registers g on g.id = r.register_id
     where jsonb_typeof(d->'cfg'->'deck') = 'string' and r.id = d->'cfg'->>'deck' and jsonb_typeof(r.data) = 'object'
       and g.visibility = 'team' and g.data->'kind' = '"decks"'::jsonb and r.data->'aud' is distinct from '"internal"'::jsonb;
    if not found then return null; end if;
  end if;
  if d->'mode' = '"live"'::jsonb then
    d := (d - 'snap' - 'media') || jsonb_build_object('live', public.share_project(regs, public.share_opt(d, 'live')));
    if d->'kind' = '"deck"'::jsonb then
      dj := public.share_deck(dk.id, dk.data);
      d := d || jsonb_build_object('deck', dj, 'media', public.share_media(s.data->'media', dj));
    end if;
  elsif coalesce(d->'kind' <> '"deck"'::jsonb, true) then
    d := (d - 'media') || jsonb_build_object('snap', public.share_recheck(d->'snap', public.share_project(regs, public.share_opt(d, 'check'))));
  else
    d := d - 'media';
  end if;
  -- the publisher's filter and record list stay with the link
  if jsonb_typeof(d->'cfg') = 'object' then d := d || jsonb_build_object('cfg', (d->'cfg') - 'filter' - 'ids'); end if;
  -- counted only for links that open; repeated loads within 20 seconds count once
  update public.shares set views = views + 1, last_view = now() where id = s.id and (last_view is null or last_view < now() - interval '20 seconds');
  return jsonb_build_object('id', s.id, 'at', now(), 'created_at', s.created_at, 'expires_at', s.expires_at, 'data', d);
end $$;
revoke all on function public.share_get(text) from public;
grant execute on function public.share_get(text) to anon, authenticated;

-- freeze a register / overview link: the same public copy, stored with the link (admins and editors)
create or replace function public.share_freeze(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.shares;
begin
  if coalesce(public.my_role(), '') not in ('admin', 'editor') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from public.shares where id = p_id;
  if not found then raise exception 'Link % not found', p_id using errcode = 'P0002'; end if;
  if coalesce(s.data->>'kind', '') not in ('reg', 'overview') then raise exception 'Only register and overview links are frozen here' using errcode = '22023'; end if;
  update public.shares set data = data || jsonb_build_object('snap', public.share_project(public.share_regs(s.data), public.share_opt(s.data, 'freeze')), 'snapAt', now()),
         updated_at = now() where id = p_id;
end $$;
revoke all on function public.share_freeze(text) from public, anon;
grant execute on function public.share_freeze(text) to authenticated;

-- =====================================================================
-- v2.8: safety rules the site alone cannot guarantee
-- =====================================================================
-- Registers: who created a register never changes; only its creator may change who sees it, and only an admin may
-- turn a team register private (otherwise one person could hide team data, and its change log, from everyone).
-- Field types are limited to the ones the site knows (anything else becomes plain text), and updated_at always moves,
-- so a page that was asleep or offline can fetch exactly what changed.
-- true only inside backup_restore (v2.9), run by an admin
create or replace function public.ww_restoring() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('ww.restoring', true), '') = '1' and public.my_role() = 'admin'
$$;
create or replace function public.guard_register() returns trigger
language plpgsql set search_path = '' as $$
declare
  types constant text[] := array['text','long','number','percent','date','select','tree','check','url','files','link','calc','sub','section'];
  sub_types constant text[] := array['text','long','number','date','select','check'];
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.ww_restoring() then
    if new.id is distinct from old.id or new.owner is distinct from old.owner then
      raise exception 'A register''s id and creator cannot change' using errcode = '42501';
    end if;
    if new.visibility is distinct from old.visibility then
      if old.owner is distinct from auth.uid() then raise exception 'Only the person who created this register can change who sees it' using errcode = '42501'; end if;
      if new.visibility = 'private' and public.my_role() is distinct from 'admin' then raise exception 'Only an admin can make a team register private' using errcode = '42501'; end if;
    end if;
  end if;
  if jsonb_typeof(new.data->'fields') = 'array' and exists (
       select 1 from jsonb_array_elements(new.data->'fields') f
        where jsonb_typeof(f) = 'object' and (coalesce(f->>'type', '') <> all(types)
           or (jsonb_typeof(f->'cols') = 'array' and exists (select 1 from jsonb_array_elements(f->'cols') c where jsonb_typeof(c) = 'object' and coalesce(c->>'type', '') <> all(sub_types))))) then
    new.data := jsonb_set(new.data, '{fields}', (select coalesce(jsonb_agg(
        case when jsonb_typeof(f) <> 'object' then f else
          (case when coalesce(f->>'type', '') = any(types) then f else f || '{"type":"text"}'::jsonb end)
          || case when jsonb_typeof(f->'cols') = 'array' then jsonb_build_object('cols', (select coalesce(jsonb_agg(
               case when jsonb_typeof(c) = 'object' and coalesce(c->>'type', '') <> all(sub_types) then c || '{"type":"text"}'::jsonb else c end order by m), '[]'::jsonb)
               from jsonb_array_elements(f->'cols') with ordinality y(c, m))) else '{}'::jsonb end
        end order by n), '[]'::jsonb) from jsonb_array_elements(new.data->'fields') with ordinality x(f, n)));
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
drop trigger if exists guard_register on public.registers;
create trigger guard_register before insert or update on public.registers for each row execute function public.guard_register();

-- Records stay in the register they were created in (moving one into a private register would hide it and its history)
create or replace function public.guard_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and (new.id is distinct from old.id or new.register_id is distinct from old.register_id) then
    raise exception 'Records cannot move between registers' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_record on public.records;
create trigger guard_record before update on public.records for each row execute function public.guard_record();
create index if not exists records_updated_at on public.records (updated_at);

-- For admins: who signed up, when, and whether they confirmed their email address
-- (only meaningful with Authentication → Sign In / Providers → Email → "Confirm email" on, which needs your own SMTP sender:
--  with it off, Supabase marks every address confirmed at sign-up)
create or replace function public.admin_users()
returns table (id uuid, email text, name text, role text, created_at timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select p.id, p.email, p.name, p.role, p.created_at, u.email_confirmed_at, u.last_sign_in_at
    from public.profiles p left join auth.users u on u.id = p.id order by p.created_at;
end $$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- functions are callable only by signed-in users (revoking from anon alone does not remove the PUBLIC grant)
do $$ declare f text; begin
  foreach f in array array['public.item_patch(text,jsonb)', 'public.config_patch(text,jsonb)', 'public.my_role()', 'public.record_patch(text,jsonb)',
                           'public.register_patch(text,jsonb)', 'public.can_read_register(text)', 'public.can_write_register(text)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop; end $$;

-- =====================================================================
-- v2.9: several people at once — element-level changes, numbering, Owner comments, files, backups
-- =====================================================================
-- A change is sent as a list of small operations and applied to what the database holds at that moment, so two people
-- editing different rows of one sub-table, ticking different options or attaching different files never overwrite each
-- other. A path is a list of object keys and array-element selectors {"by": "<key>", "eq": "<value>"}.
--   set   {path, value}                   put a value (missing parent objects are created)
--   unset {path}                          remove a key
--   add   {path, value, by?, after?, at?} add to a list unless it is already there (after = the element it follows)
--   del   {path, value | by + eq}         remove from a list
--   order {path, ids, by?}                put a list in this order (elements others added meanwhile go last)
-- An operation that no longer fits the stored data (its row was deleted meanwhile) is skipped.
create or replace function public.ww_path(d jsonb, steps jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare st jsonb; p text[] := '{}'; arr jsonb; i int;
begin
  if steps is null or jsonb_typeof(steps) is distinct from 'array' then return null; end if;
  if jsonb_array_length(steps) = 0 then return null; end if;
  for st in select value from jsonb_array_elements(steps) loop
    if jsonb_typeof(st) = 'string' then
      p := p || (st #>> '{}');
    elsif jsonb_typeof(st) = 'object' and st ? 'by' and st ? 'eq' then
      arr := d #> p;
      if jsonb_typeof(arr) is distinct from 'array' then return null; end if;
      i := null;
      select x.o - 1 into i from jsonb_array_elements(arr) with ordinality x(e, o)
        where jsonb_typeof(x.e) = 'object' and x.e ->> (st ->> 'by') = st ->> 'eq' order by x.o limit 1;
      if i is null then return null; end if;
      p := p || i::text;
    else
      return null;
    end if;
  end loop;
  return p;
end $$;

-- puts v at p when the place that holds it still exists; a container someone else removed meanwhile is not re-created
-- (the page sends a new container whole). Returns null when the operation no longer fits.
create or replace function public.ww_set(d jsonb, p text[], v jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare n int := coalesce(array_length(p, 1), 0); t text;
begin
  if d is null or jsonb_typeof(d) is distinct from 'object' then d := '{}'::jsonb; end if;
  if n = 0 then return null; end if;
  if n > 1 then
    t := jsonb_typeof(d #> p[1:n - 1]);
    if t is distinct from 'object' and t is distinct from 'array' then return null; end if;
    if t = 'array' and p[n] !~ '^-?[0-9]+$' then return null; end if;
  end if;
  return jsonb_set(d, p, coalesce(v, 'null'::jsonb), true);
end $$;

create or replace function public.ww_apply_ops(d jsonb, ops jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare op jsonb; p text[]; arr jsonb; v jsonb; k text; i int; n int := 0;
begin
  d := coalesce(d, '{}'::jsonb);
  if ops is null or jsonb_typeof(ops) is distinct from 'array' then return d; end if;
  for op in select value from jsonb_array_elements(ops) loop
    n := n + 1;
    exit when n > 5000;
    begin
      continue when jsonb_typeof(op) is distinct from 'object';
      p := public.ww_path(d, op -> 'path');
      continue when p is null;
      k := op ->> 'by';
      v := coalesce(op -> 'value', 'null'::jsonb);
      if op ->> 'op' = 'set' then
        d := coalesce(public.ww_set(d, p, v), d);
      elsif op ->> 'op' = 'unset' then
        d := d #- p;
      elsif op ->> 'op' in ('add', 'del', 'order') then
        arr := d #> p;
        if jsonb_typeof(arr) is distinct from 'array' then
          continue when op ->> 'op' <> 'add';
          continue when array_length(p, 1) > 1 and jsonb_typeof(d #> p[1:array_length(p, 1) - 1]) is distinct from 'object';
          arr := '[]'::jsonb;
        end if;
        if op ->> 'op' = 'add' then
          continue when exists (select 1 from jsonb_array_elements(arr) x(e)
            where case when k is null then x.e = v else jsonb_typeof(x.e) = 'object' and x.e ->> k = v ->> k end);
          i := null;
          if jsonb_typeof(op -> 'after') in ('string', 'number', 'boolean', 'object', 'array') then
            select x.o into i from jsonb_array_elements(arr) with ordinality x(e, o)
              where case when k is null then x.e = op -> 'after' else jsonb_typeof(x.e) = 'object' and x.e ->> k = op ->> 'after' end
              order by x.o limit 1;
          elsif op ->> 'at' = 'start' then
            i := 0;
          end if;
          if i is null then
            arr := arr || jsonb_build_array(v);
          else
            arr := (select coalesce(jsonb_agg(y.e order by y.s), '[]'::jsonb) from (
                      select x.e, x.o * 2 as s from jsonb_array_elements(arr) with ordinality x(e, o)
                      union all select v, i * 2 + 1) y);
          end if;
        elsif op ->> 'op' = 'del' then
          arr := (select coalesce(jsonb_agg(x.e order by x.o), '[]'::jsonb) from jsonb_array_elements(arr) with ordinality x(e, o)
                   where not (case when k is null then x.e = v else jsonb_typeof(x.e) = 'object' and coalesce(x.e ->> k = op ->> 'eq', false) end));
        else
          continue when jsonb_typeof(op -> 'ids') is distinct from 'array';
          if k is null then
            arr := (select coalesce(jsonb_agg(y.e order by y.w, y.o), '[]'::jsonb) from (
                      select x.e, x.o, coalesce(min(z.q), 1000000000) as w
                        from jsonb_array_elements(arr) with ordinality x(e, o)
                        left join jsonb_array_elements(op -> 'ids') with ordinality z(id, q) on z.id = x.e
                       group by x.o, x.e) y);
          else
            arr := (select coalesce(jsonb_agg(y.e order by y.w, y.o), '[]'::jsonb) from (
                      select x.e, x.o, coalesce(min(z.q), 1000000000) as w
                        from jsonb_array_elements(arr) with ordinality x(e, o)
                        left join jsonb_array_elements(op -> 'ids') with ordinality z(id, q) on x.e ->> k = z.id #>> '{}'
                       group by x.o, x.e) y);
          end if;
        end if;
        d := coalesce(public.ww_set(d, p, arr), d);
      end if;
    exception when others then
      null;
    end;
  end loop;
  return d;
end $$;

create or replace function public.record_ops(p_id text, p_ops jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare d jsonb;
begin
  select data into d from public.records where id = p_id for update;
  if not found then raise exception 'Record % not found or not allowed', p_id using errcode = '42501'; end if;
  update public.records set data = public.ww_apply_ops(d, p_ops), updated_by = auth.uid() where id = p_id returning data into d;
  if not found then raise exception 'Record % not found or not allowed', p_id using errcode = '42501'; end if;
  return d;
end $$;

-- many records in one request (bulk edits, renaming a person everywhere): [{id, ops}] → [{id, error?}]
create or replace function public.records_ops(p_items jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare it jsonb; d jsonb; res jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then return res; end if;
  if jsonb_array_length(p_items) > 1000 then raise exception 'At most 1000 records per request' using errcode = '22023'; end if;
  for it in select value from jsonb_array_elements(p_items) loop
    d := null;
    select data into d from public.records where id = it ->> 'id' for update;
    if not found then res := res || jsonb_build_array(jsonb_build_object('id', it ->> 'id', 'error', 'not found or not allowed')); continue; end if;
    update public.records set data = public.ww_apply_ops(d, it -> 'ops'), updated_by = auth.uid() where id = it ->> 'id';
    if not found then res := res || jsonb_build_array(jsonb_build_object('id', it ->> 'id', 'error', 'not allowed')); end if;
  end loop;
  return res;
end $$;

create or replace function public.register_ops(p_id text, p_ops jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare d jsonb;
begin
  select data into d from public.registers where id = p_id for update;
  if not found then raise exception 'Register % not found or not allowed', p_id using errcode = '42501'; end if;
  update public.registers set data = public.ww_apply_ops(d, p_ops), updated_by = auth.uid() where id = p_id returning data into d;
  if not found then raise exception 'Register % not found or not allowed', p_id using errcode = '42501'; end if;
  return d;
end $$;

create or replace function public.config_ops(p_id text, p_ops jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare d jsonb;
begin
  select data into d from public.app_config where id = p_id for update;
  if not found then
    insert into public.app_config (id, data, updated_by) values (p_id, public.ww_apply_ops('{}'::jsonb, p_ops), auth.uid()) returning data into d;
    return d;
  end if;
  update public.app_config set data = public.ww_apply_ops(d, p_ops), updated_at = now(), updated_by = auth.uid() where id = p_id returning data into d;
  if not found then raise exception 'Settings % not allowed', p_id using errcode = '42501'; end if;
  return d;
end $$;

-- Numbers stay unique: when two people add an item at the same moment (or a deleted item is restored after its number
-- was reused), the second one gets the next free number. Hand-made numbers that do not follow PREFIX-001 are left alone.
create or replace function public.number_record() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text; pre text; v text; re text; n bigint; s text; g text; taken boolean;
begin
  select r.data -> 'roles' ->> 'no', upper(coalesce(nullif(r.data ->> 'prefix', ''), 'REC')) into k, pre
    from public.registers r where r.id = new.register_id;
  if k is null or k = '' or public.ww_restoring() then return new; end if;
  v := new.data ->> k;
  if v is null or btrim(v) = '' then return new; end if;
  re := '^' || regexp_replace(pre, '[^A-Z0-9]', '', 'g') || '-([0-9]{1,9})$';
  if v !~* re then return new; end if;
  perform pg_advisory_xact_lock(hashtext('ww_no:' || new.register_id));
  -- planned with the actual values each time, so the records_data index is used (as typed, and in upper case)
  execute 'select exists (select 1 from public.records x where (x.data @> $1 or x.data @> $2) and x.register_id = $3 and x.id <> $4)'
    into taken using jsonb_build_object(k, v), jsonb_build_object(k, upper(btrim(v))), new.register_id, new.id;
  g := 'ww.no_' || md5(new.register_id);   -- the highest number given out in this transaction (the lock keeps others out until it ends)
  if not taken then
    n := (regexp_match(v, re, 'i'))[1]::bigint;
    if current_setting(g, true) is not null and current_setting(g, true) <> '' and n > current_setting(g, true)::bigint then perform set_config(g, n::text, true); end if;
    return new;
  end if;
  if current_setting(g, true) is null or current_setting(g, true) = '' then
    select coalesce(max(m[1]::bigint), 0) into n from public.records x, regexp_match(x.data ->> k, re, 'i') m where x.register_id = new.register_id;
  else n := current_setting(g, true)::bigint;
  end if;
  loop
    n := n + 1; s := n::text; if length(s) < 3 then s := lpad(s, 3, '0'); end if;
    execute 'select exists (select 1 from public.records x where x.data @> $1 and x.register_id = $2)' into taken using jsonb_build_object(k, pre || '-' || s), new.register_id;
    exit when not taken;
  end loop;
  perform set_config(g, n::text, true);
  new.data := jsonb_set(new.data, array[k], to_jsonb(pre || '-' || s));
  return new;
end $$;
create index if not exists records_data on public.records using gin (data jsonb_path_ops) with (fastupdate = off);
alter index public.records_data set (fastupdate = off);
drop trigger if exists number_record on public.records;
create trigger number_record before insert on public.records for each row execute function public.number_record();

create or replace function public.number_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n bigint; s text;
begin
  if new.id !~ '^PUB-[0-9]{1,9}$' or public.ww_restoring() then return new; end if;
  perform pg_advisory_xact_lock(hashtext('ww_pub_no'));
  if not exists (select 1 from public.publications where id = new.id) then return new; end if;
  select coalesce(max(substring(id from 5)::bigint), 0) + 1 into n from public.publications where id ~ '^PUB-[0-9]{1,9}$';
  s := n::text; if length(s) < 3 then s := lpad(s, 3, '0'); end if;
  new.id := 'PUB-' || s;
  if jsonb_typeof(new.data) = 'object' then new.data := jsonb_set(new.data, '{no}', to_jsonb(new.id)); end if;
  return new;
end $$;
drop trigger if exists number_publication on public.publications;
create trigger number_publication before insert on public.publications for each row execute function public.number_publication();

-- Owner comments: the author and the time come from the database (guard_feedback, in the v3.1 section below).
alter table public.feedback add column if not exists resolved_by uuid;

-- Files: removing a file from a record no longer deletes it at once (undo and the change log can bring it back).
-- An admin clears files nobody uses from Settings → Data & backup; only admins may delete stored files.
drop policy if exists ww_files_delete on storage.objects;
create policy ww_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.my_role() = 'admin' and (
    (name like 'r/%' and public.can_write_register(split_part(name, '/', 2))) or name not like 'r/%'));

-- files under r/ that no record, register, setting, publication, public link or kept backup uses, and that no change in
-- the last p_days days touched (so undo still works), older than p_days
create or replace function public.storage_unused(p_days integer default 30)
returns table (name text, bytes bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 30), 7));
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  with used as (
    select m[1] as nm from public.records r, regexp_matches(r.data::text, '"(r/[^"\\]+)"', 'g') m
    union select m[1] from public.registers r, regexp_matches(r.data::text, '"(r/[^"\\]+)"', 'g') m
    union select m[1] from public.app_config c, regexp_matches(c.data::text, '"(r/[^"\\]+)"', 'g') m
    union select m[1] from public.publications p, regexp_matches(p.data::text, '"(r/[^"\\]+)"', 'g') m
    union select m[1] from public.shares s, regexp_matches(s.data::text, '"(r/[^"\\]+)"', 'g') m
    union select m[1] from public.audit_log a, regexp_matches(coalesce(a.old::text, '') || coalesce(a.new::text, ''), '"(r/[^"\\]+)"', 'g') m where a.at > since
    union select m[1] from public.backups b, regexp_matches(b.data::text, '"(r/[^"\\]+)"', 'g') m)
  select o.name, coalesce((o.metadata ->> 'size')::bigint, 0), o.created_at
    from storage.objects o
   where o.bucket_id = 'files' and o.name like 'r/%' and o.created_at < since
     and public.can_write_register(split_part(o.name, '/', 2))
     and not exists (select 1 from used u where u.nm = o.name)
   order by o.created_at;
end $$;

-- Backups: a full copy of the data every night (14 kept), on demand (10 kept) and before every restore (10 kept).
-- Downloads leave out other people's private registers; a restore never touches them either.
create table if not exists public.backups (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null default 'manual' check (kind in ('nightly', 'manual', 'before-restore')),
  by_user uuid,
  counts jsonb,
  bytes bigint,
  data jsonb not null
);
alter table public.backups enable row level security;
revoke all on public.backups from public, anon, authenticated;

create or replace function public.ww_backup(p_kind text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare d jsonb; bid bigint;
begin
  d := jsonb_build_object('v', 1, 'at', now(),
    'app_config', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'data', c.data) order by c.id), '[]'::jsonb) from public.app_config c),
    'registers', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'owner', r.owner, 'visibility', r.visibility, 'data', r.data, 'created_at', r.created_at) order by r.id), '[]'::jsonb) from public.registers r),
    'records', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'register_id', x.register_id, 'data', x.data, 'created_at', x.created_at, 'created_by', x.created_by) order by x.id), '[]'::jsonb) from public.records x),
    'publications', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from public.publications p),
    'feedback', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at), '[]'::jsonb) from public.feedback f),
    'shares', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.shares s));
  insert into public.backups (kind, by_user, counts, bytes, data)
  values (case when p_kind in ('nightly', 'manual', 'before-restore') then p_kind else 'manual' end, auth.uid(),
          jsonb_build_object('registers', jsonb_array_length(d -> 'registers'), 'records', jsonb_array_length(d -> 'records'),
                             'publications', jsonb_array_length(d -> 'publications'), 'feedback', jsonb_array_length(d -> 'feedback')),
          octet_length(d::text), d)
  returning id into bid;
  delete from public.backups b where b.kind = 'nightly' and b.id not in (select b2.id from public.backups b2 where b2.kind = 'nightly' order by b2.id desc limit 14);
  delete from public.backups b where b.kind = 'manual' and b.id not in (select b2.id from public.backups b2 where b2.kind = 'manual' order by b2.id desc limit 10);
  delete from public.backups b where b.kind = 'before-restore' and b.id not in (select b2.id from public.backups b2 where b2.kind = 'before-restore' order by b2.id desc limit 10);
  return bid;
end $$;
revoke all on function public.ww_backup(text) from public, anon, authenticated;

create or replace function public.backup_now() returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Not allowed' using errcode = '42501'; end if;
  return public.ww_backup('manual');
end $$;

-- the nightly copy when the database has no scheduler: the first admin or editor to open the site after 20 hours makes it
create or replace function public.backup_if_due() returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and public.my_role() not in ('admin', 'editor') then return null; end if;
  if exists (select 1 from public.backups b where b.kind = 'nightly' and b.at > now() - interval '20 hours') then return null; end if;
  perform pg_advisory_xact_lock(hashtext('ww_backup'));
  if exists (select 1 from public.backups b where b.kind = 'nightly' and b.at > now() - interval '20 hours') then return null; end if;
  return public.ww_backup('nightly');
end $$;

create or replace function public.backup_list()
returns table (id bigint, at timestamptz, kind text, by_name text, counts jsonb, bytes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select b.id, b.at, b.kind, (select coalesce(nullif(p.name, ''), p.email) from public.profiles p where p.id = b.by_user), b.counts, b.bytes
    from public.backups b order by b.id desc;
end $$;

create or replace function public.backup_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b jsonb; me uuid := auth.uid(); keep jsonb;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Not allowed' using errcode = '42501'; end if;
  select x.data into b from public.backups x where x.id = p_id;
  if b is null then raise exception 'Backup % not found', p_id using errcode = 'P0002'; end if;
  keep := (select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(b -> 'registers') r
            where r ->> 'visibility' = 'team' or r ->> 'owner' = me::text);
  return b || jsonb_build_object('registers', keep,
    'records', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(b -> 'records') x
                 where x ->> 'register_id' in (select k ->> 'id' from jsonb_array_elements(keep) k)));
end $$;

-- Put the team's registers, records and settings back as they were in a backup. Other people's private registers are
-- left as they are; publications and Owner comments made since are kept. A copy is taken first, so a restore can be undone.
create or replace function public.backup_restore(p_id bigint, p_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b jsonb; me uuid := auth.uid(); res jsonb := '{}'::jsonb; n int;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_confirm is distinct from 'RESTORE' then raise exception 'Type RESTORE to confirm' using errcode = '22023'; end if;
  select x.data into b from public.backups x where x.id = p_id;
  if b is null then raise exception 'Backup % not found', p_id using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('ww_backup'));
  res := res || jsonb_build_object('before', public.ww_backup('before-restore'));
  perform set_config('ww.restoring', '1', true);
  drop table if exists pg_temp.ww_br, pg_temp.ww_bc;
  create temp table ww_br on commit drop as
    select r ->> 'id' as id, (r ->> 'owner')::uuid as owner, r ->> 'visibility' as vis, r -> 'data' as data
      from jsonb_array_elements(b -> 'registers') r where r ->> 'visibility' = 'team' or r ->> 'owner' = me::text;
  create temp table ww_bc on commit drop as
    select x ->> 'id' as id, x ->> 'register_id' as rid, x -> 'data' as data, nullif(x ->> 'created_by', '')::uuid as created_by
      from jsonb_array_elements(b -> 'records') x where x ->> 'register_id' in (select id from pg_temp.ww_br);
  -- registers made since the backup (team ones, and the caller's own)
  delete from public.registers r where (r.visibility = 'team' or r.owner = me)
    and not exists (select 1 from jsonb_array_elements(b -> 'registers') x where x ->> 'id' = r.id);
  get diagnostics n = row_count; res := res || jsonb_build_object('registers_removed', n);
  insert into public.registers (id, owner, visibility, data)
    select w.id, case when exists (select 1 from auth.users u where u.id = w.owner) then w.owner else me end, w.vis, w.data
      from pg_temp.ww_br w where not exists (select 1 from public.registers r where r.id = w.id);
  get diagnostics n = row_count; res := res || jsonb_build_object('registers_back', n);
  update public.registers r set data = w.data, visibility = w.vis from pg_temp.ww_br w
   where r.id = w.id and (r.visibility = 'team' or r.owner = me) and (r.data is distinct from w.data or r.visibility is distinct from w.vis);
  get diagnostics n = row_count; res := res || jsonb_build_object('registers_changed', n);
  delete from public.records c where c.register_id in (select id from pg_temp.ww_br) and not exists (select 1 from pg_temp.ww_bc x where x.id = c.id)
    and exists (select 1 from public.registers r where r.id = c.register_id and (r.visibility = 'team' or r.owner = me));
  get diagnostics n = row_count; res := res || jsonb_build_object('records_removed', n);
  insert into public.records (id, register_id, data, created_by)
    select x.id, x.rid, x.data, x.created_by from pg_temp.ww_bc x
     where not exists (select 1 from public.records c where c.id = x.id) and exists (select 1 from public.registers r where r.id = x.rid and (r.visibility = 'team' or r.owner = me));
  get diagnostics n = row_count; res := res || jsonb_build_object('records_back', n);
  update public.records c set data = x.data from pg_temp.ww_bc x where c.id = x.id and c.register_id = x.rid and c.data is distinct from x.data
    and exists (select 1 from public.registers r where r.id = c.register_id and (r.visibility = 'team' or r.owner = me));
  get diagnostics n = row_count; res := res || jsonb_build_object('records_changed', n);
  insert into public.app_config (id, data) select c ->> 'id', c -> 'data' from jsonb_array_elements(b -> 'app_config') c
    on conflict (id) do update set data = excluded.data, updated_at = now() where public.app_config.data is distinct from excluded.data;
  insert into public.publications (id, data, created_at, created_by)
    select p ->> 'id', p -> 'data', (p ->> 'created_at')::timestamptz, nullif(p ->> 'created_by', '')::uuid from jsonb_array_elements(b -> 'publications') p
    where not exists (select 1 from public.publications x where x.id = p ->> 'id')
    on conflict (id) do nothing;
  insert into public.feedback (id, pub_id, item_id, reg_no, body, author, author_name, status, reply, created_at, resolved_at, resolved_by, code, kind)
    select (f ->> 'id')::uuid, f ->> 'pub_id', f ->> 'item_id', f ->> 'reg_no', f ->> 'body', (f ->> 'author')::uuid, f ->> 'author_name',
           coalesce(f ->> 'status', 'open'), f ->> 'reply', (f ->> 'created_at')::timestamptz, (f ->> 'resolved_at')::timestamptz, nullif(f ->> 'resolved_by', '')::uuid,
           f ->> 'code', f ->> 'kind'
      from jsonb_array_elements(b -> 'feedback') f
    on conflict (id) do nothing;
  return res;
end $$;

-- nightly at 02:00 Manila time (18:00 UTC) when the database has a scheduler (Supabase: Database → Extensions → pg_cron)
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'ww-nightly-backup';
  perform cron.schedule('ww-nightly-backup', '0 18 * * *', 'select public.backup_if_due()');
exception when others then
  raise notice 'Nightly backup not scheduled (%): the site makes the daily copy when an admin or editor opens it.', sqlerrm;
end $$;

do $$ declare f text; begin
  foreach f in array array['public.ww_path(jsonb,jsonb)', 'public.ww_set(jsonb,text[],jsonb)', 'public.ww_apply_ops(jsonb,jsonb)',
                           'public.record_ops(text,jsonb)', 'public.records_ops(jsonb)', 'public.register_ops(text,jsonb)', 'public.config_ops(text,jsonb)',
                           'public.storage_unused(integer)', 'public.backup_now()', 'public.backup_if_due()', 'public.backup_list()',
                           'public.backup_get(bigint)', 'public.backup_restore(bigint,text)', 'public.ww_restoring()'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop; end $$;

-- =====================================================================
-- v3.1: handover — transmittals, the Owner's responses, files the Owner may download
-- =====================================================================
-- A transmittal is a record of the "transmittals" register; d.items lists the documents sent
-- ([{_id, rid, rev, files:[{path, sha}], code, comment, ...}]). Once it is sent, the documents, revisions, files and
-- fingerprints in it are fixed, it never goes back to draft, and only an admin may delete it. The Owner answers each
-- document in the Owner portal: a feedback row of kind 'response' with a code, which the database writes into the
-- transmittal and into the document's "Owner result" (only while the document is still at the revision answered).

alter table public.feedback add column if not exists code text;
alter table public.feedback add column if not exists kind text;

-- Owner comments and responses: author and time come from the database, the text and code can never be edited
-- afterwards, and only the team can reply or close one (who closed it, and when, is recorded).
create or replace function public.guard_feedback() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p jsonb;
begin
  if auth.uid() is null or public.ww_restoring() then return new; end if;   -- the SQL editor, or a backup being restored
  if tg_op = 'INSERT' then
    new.author := auth.uid();
    new.author_name := (select coalesce(nullif(x.name, ''), x.email) from public.profiles x where x.id = auth.uid());
    new.status := 'open'; new.reply := null; new.resolved_at := null; new.resolved_by := null; new.created_at := now();
    if new.kind is distinct from 'response' then new.kind := null; new.code := null; end if;
    select data into p from public.publications where id = new.pub_id;
    if public.my_role() = 'owner' and p is null then
      raise exception 'Comments belong to a published plan' using errcode = '42501';
    end if;
    if new.kind = 'response' then
      if new.code is null or new.code not in ('accepted', 'accepted_c', 'revise', 'rejected') then
        raise exception 'Unknown response code' using errcode = '22023';
      end if;
      if p is null or p ->> 'kind' is distinct from 'transmittal' or not exists (
           select 1 from jsonb_array_elements(case when jsonb_typeof(p -> 'items') = 'array' then p -> 'items' else '[]'::jsonb end) x
            where x ->> '_id' = new.item_id) then
        raise exception 'A response belongs to a document of a transmittal' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.pub_id is distinct from old.pub_id or new.item_id is distinct from old.item_id
     or new.reg_no is distinct from old.reg_no or new.body is distinct from old.body or new.author is distinct from old.author
     or new.author_name is distinct from old.author_name or new.created_at is distinct from old.created_at
     or new.code is distinct from old.code or new.kind is distinct from old.kind then
    raise exception 'A comment''s text and author cannot be changed' using errcode = '42501';
  end if;
  if new.status = 'resolved' and old.status is distinct from 'resolved' then new.resolved_at := now(); new.resolved_by := auth.uid();
  elsif new.status = 'open' then new.resolved_at := null; new.resolved_by := null;
  else new.resolved_at := old.resolved_at; new.resolved_by := old.resolved_by;
  end if;
  return new;
end $$;
drop trigger if exists guard_feedback on public.feedback;
create trigger guard_feedback before insert or update on public.feedback for each row execute function public.guard_feedback();

-- what may not change once a transmittal is sent: each document, its revision, its files and their fingerprints
create or replace function public.trn_ident(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('_id', x -> '_id', 'rid', x -> 'rid', 'rev', x -> 'rev', 'files',
           (select coalesce(jsonb_agg(jsonb_build_object('path', f -> 'path', 'sha', f -> 'sha') order by f ->> 'path', f ->> 'sha'), '[]'::jsonb)
              from jsonb_array_elements(case when jsonb_typeof(x -> 'files') = 'array' then x -> 'files' else '[]'::jsonb end) f))
         order by x ->> '_id'), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
$$;
create or replace function public.guard_transmittal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.ww_restoring() then return coalesce(new, old); end if;
  if coalesce(old.data ->> 'status', 'draft') = 'draft'
     or not exists (select 1 from public.registers r where r.id = old.register_id and r.data ->> 'kind' = 'transmittals') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if public.my_role() is distinct from 'admin' then
      raise exception 'Only an admin can delete a transmittal that was sent' using errcode = '42501';
    end if;
    return old;
  end if;
  if coalesce(new.data ->> 'status', 'draft') = 'draft' then
    raise exception 'A transmittal that was sent cannot go back to draft' using errcode = '42501';
  end if;
  if public.trn_ident(old.data -> 'items') is distinct from public.trn_ident(new.data -> 'items') then
    raise exception 'The documents, revisions and files of a sent transmittal cannot be changed — put a new revision in a new transmittal' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_transmittal on public.records;
create trigger guard_transmittal before update or delete on public.records for each row
  when (old.data ? 'items') execute function public.guard_transmittal();

-- the Owner's response goes into the transmittal (and its status) and into the document's Owner result
create or replace function public.apply_owner_response() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p jsonb; t record; items jsonb; i integer; it jsonb; st text;
begin
  if new.kind is distinct from 'response' or new.code is null or public.ww_restoring() then return null; end if;
  select data into p from public.publications where id = new.pub_id;
  if p is null or p ->> 'kind' is distinct from 'transmittal' then return null; end if;
  select r.id, r.data into t from public.records r where r.id = p ->> 'trnId' for update;
  if not found or jsonb_typeof(t.data -> 'items') is distinct from 'array' then return null; end if;
  items := t.data -> 'items';
  select e.n - 1 into i from jsonb_array_elements(items) with ordinality e(x, n) where e.x ->> '_id' = new.item_id limit 1;
  if i is null then return null; end if;
  it := (items -> i) || jsonb_build_object('code', new.code, 'comment', case when new.body = new.code then '' else new.body end,
        'at', to_jsonb(new.created_at), 'by', coalesce(new.author_name, ''), 'src', 'portal', 'fb', new.id::text);
  items := jsonb_set(items, array[i::text], it);
  st := t.data ->> 'status';
  if st = 'sent' and not exists (select 1 from jsonb_array_elements(items) x where coalesce(x ->> 'code', '') = '') then st := 'responded'; end if;
  update public.records set data = data || jsonb_build_object('items', items)
         || case when st is distinct from t.data ->> 'status' then jsonb_build_object('status', st) else '{}'::jsonb end
   where id = t.id;
  update public.records d set data = d.data || jsonb_build_object('ownerResult', new.code)
   where d.id = it ->> 'rid' and d.data ->> 'ownerResult' is distinct from new.code
     and (coalesce(d.data ->> 'rev', '') = '' or coalesce(it ->> 'rev', '') = '' or d.data ->> 'rev' = it ->> 'rev')
     and exists (select 1 from public.registers r
                  cross join lateral jsonb_array_elements(case when jsonb_typeof(r.data -> 'fields') = 'array' then r.data -> 'fields' else '[]'::jsonb end) f
                  where r.id = d.register_id and f ->> 'key' = 'ownerResult');
  return null;
end $$;
drop trigger if exists apply_owner_response on public.feedback;
create trigger apply_owner_response after insert on public.feedback for each row execute function public.apply_owner_response();

-- the Owner may download exactly the files listed in a transmittal shown to them
create or replace function public.owner_can_read_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.publications p where p.data ->> 'kind' = 'transmittal' and p.data -> 'paths' ? p_name)
$$;
drop policy if exists ww_files_read on storage.objects;
create policy ww_files_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and (
    (name like 'r/%' and public.can_read_register(split_part(name, '/', 2))) or
    (name not like 'r/%' and public.my_role() in ('admin','editor','viewer')) or
    (public.my_role() = 'owner' and public.owner_can_read_file(name))));

do $$ declare f text; begin
  foreach f in array array['public.trn_ident(jsonb)', 'public.owner_can_read_file(text)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop; end $$;
