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
--   * private ("Only me") registers and Internal presentations never leave the database;
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
              and jsonb_typeof(r.data) = 'object' and coalesce(public.share_str(r.data->'kind'), '') not in ('decks', 'snaps')
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
