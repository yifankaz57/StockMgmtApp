-- 認証キー（公認の利用者）
--
-- 運営者が発行した認証キーを設定画面で入力した利用者は「公認」になり、
-- その人が登録した名前は 5 人の合意を待たずに、すぐ公開・「確定」になる。
-- - キーはハッシュ（SHA-256）だけを保存し、平文は発行時に1回だけ運営者に返す
-- - キーを無効にすると、そのキーで公認になった全員の効果がすぐ外れる（締め出された人も外れる）
-- - 間違ったキーの入力は 1 人あたり 24 時間で 10 回まで
-- 0001・0002 を実行済みの Supabase で、このファイルを SQL Editor で 1 回実行する。

create or replace function private.daily_key_failure_limit() returns int language sql immutable as $$ select 10 $$;

create table if not exists public.bypass_keys (
  id bigint generated always as identity primary key,
  key_hash text not null unique,
  label text not null default '' check (char_length(label) <= 100),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.profiles add column if not exists bypass_key_id bigint references public.bypass_keys (id) on delete set null;

-- 間違ったキーの入力の記録（総当たり対策）
create table if not exists public.key_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists key_failures_user_idx on public.key_failures (user_id, created_at);

alter table public.bypass_keys enable row level security;
alter table public.key_failures enable row level security;

-- キーの比較用: 空白・ハイフンを除いて大文字にしてから SHA-256
create or replace function private.key_hash(k text) returns text language sql immutable as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(k, ''), '[^0-9A-Za-z]', '', 'g')), 'UTF8')), 'hex')
$$;

-- 公認の利用者か（有効なキーを適用済みで、締め出されていない）
create or replace function private.is_authority(uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.bypass_keys k on k.id = p.bypass_key_id
    where p.user_id = uid and k.active and not p.banned
  )
$$;

-- 信頼済み: 運営が設定した人、公認の人、自分の提案のうち一定数が「確定」になった人
create or replace function private.is_trusted(uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select trust = 'trusted' from public.profiles where user_id = uid), false)
    or private.is_authority(uid)
    or (
      select count(*) from private.effective_proposals p
      join private.group_support g on g.jan = p.jan and g.name_key = p.name_key
      where p.user_id = uid and g.supporters >= private.confirm_threshold()
    ) >= private.auto_trust_confirmed()
$$;

-- 候補の集計（0001 から変更: 公認の人が支持した候補はすぐ「確定」。並び順の重みは 5 人分）
create or replace function private.candidates(p_jan text)
returns table (
  name_key text,
  name text,
  manufacturer text,
  supporters int,
  score int,
  confirmed boolean,
  visible boolean,
  hidden boolean,
  open_reports int
) language sql stable security definer set search_path = '' as $$
  with ep as (
    select p.*, private.is_trusted(p.user_id) as trusted, private.is_authority(p.user_id) as authority
    from private.effective_proposals p
    where p.jan = p_jan
  ),
  g as (
    select
      ep.name_key,
      count(distinct ep.user_id)::int as supporters,
      sum(case when ep.authority then private.confirm_threshold() when ep.trusted then 2 else 1 end)::int as score,
      bool_or(ep.status = 'approved' or ep.trusted) as vouched,
      bool_or(ep.authority) as by_authority
    from ep group by ep.name_key
  ),
  all_keys as (
    select distinct p.name_key from public.proposals p where p.jan = p_jan
  )
  select
    k.name_key,
    (select p.name from public.proposals p where p.jan = p_jan and p.name_key = k.name_key
      group by p.name order by count(*) desc, min(p.created_at) limit 1),
    coalesce((select p.manufacturer from public.proposals p where p.jan = p_jan and p.name_key = k.name_key and p.manufacturer <> ''
      group by p.manufacturer order by count(*) desc, min(p.created_at) limit 1), ''),
    coalesce(g.supporters, 0),
    coalesce(g.score, 0),
    coalesce(g.supporters >= private.confirm_threshold() or g.by_authority, false),
    coalesce(g.vouched or g.supporters >= 2, false),
    g.name_key is null,
    (select count(*)::int from public.reports r where r.jan = p_jan and r.name_key = k.name_key and r.status = 'open')
  from all_keys k
  left join g on g.name_key = k.name_key
$$;

-- 自分の状態（0001 から変更: trust に 'authority'（公認）が加わる）
create or replace function public.my_status()
returns table (trust text, banned boolean, is_admin boolean, proposals_today int, proposal_limit int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := private.current_user_id();
  p public.profiles := private.ensure_profile(uid);
begin
  return query select
    case when private.is_authority(uid) then 'authority' when private.is_trusted(uid) then 'trusted' else 'new' end,
    p.banned,
    p.is_admin,
    (select count(*)::int from public.proposals x where x.user_id = uid and x.created_at > now() - interval '1 day'),
    private.daily_proposal_limit();
end $$;

-- ---------- 利用者: 認証キーの適用・解除 ----------

-- 認証キーを適用して公認になる。成功したらキーの名前（label）を返す
create or replace function public.redeem_bypass_key(p_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.current_user_id();
  prof public.profiles := private.ensure_profile(uid);
  k public.bypass_keys;
begin
  if prof.banned then
    raise exception 'この利用者は共有マスタの利用を停止されています。' using errcode = 'P0001';
  end if;
  if (select count(*) from public.key_failures f where f.user_id = uid and f.created_at > now() - interval '1 day')
     >= private.daily_key_failure_limit() then
    raise exception '認証キーの入力に続けて失敗したため、24時間は入力できません。' using errcode = 'P0001';
  end if;
  select * into k from public.bypass_keys where key_hash = private.key_hash(p_key) and active;
  if k.id is null then
    insert into public.key_failures (user_id) values (uid);
    -- 失敗の記録を残すため、例外ではなく結果で返す
    return null;
  end if;
  update public.profiles set bypass_key_id = k.id where user_id = uid;
  perform private.log_action(uid, 'key_redeem', uid::text, jsonb_build_object('key_id', k.id, 'label', k.label));
  return k.label;
end $$;

-- 自分の認証キーを外す（公認をやめる）
create or replace function public.clear_bypass_key()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.current_user_id();
begin
  update public.profiles set bypass_key_id = null where user_id = uid;
end $$;

-- ---------- 運営: 認証キーの発行・一覧・無効化 ----------

-- 認証キーを発行する。平文のキーはここで1回だけ返す（データベースにはハッシュだけを保存）
create or replace function public.admin_create_bypass_key(p_label text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := private.require_admin();
  raw text;
  key text;
begin
  -- 推測できないよう、ランダムな値から 24 桁（約 96 ビット）を作る
  raw := upper(substr(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'), 1, 24));
  key := 'SMK-' || substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4) || '-' || substr(raw, 13, 4)
    || '-' || substr(raw, 17, 4) || '-' || substr(raw, 21, 4);
  insert into public.bypass_keys (key_hash, label, created_by) values (private.key_hash(key), left(trim(coalesce(p_label, '')), 100), admin);
  perform private.log_action(admin, 'key_create', left(trim(coalesce(p_label, '')), 100), '{}'::jsonb);
  return key;
end $$;

create or replace function public.admin_list_bypass_keys()
returns table (id bigint, label text, active boolean, users int, created_at timestamptz, revoked_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select k.id, k.label, k.active, (select count(*)::int from public.profiles p where p.bypass_key_id = k.id), k.created_at, k.revoked_at
  from public.bypass_keys k order by k.created_at desc;
end $$;

-- 認証キーを無効にする（そのキーで公認になった全員の効果がすぐ外れる）
create or replace function public.admin_revoke_bypass_key(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := private.require_admin();
  k public.bypass_keys;
begin
  update public.bypass_keys set active = false, revoked_at = now() where id = p_id and active returning * into k;
  if k.id is null then
    raise exception '有効な認証キーが見つかりません。' using errcode = 'P0001';
  end if;
  perform private.log_action(admin, 'key_revoke', k.label, jsonb_build_object('key_id', k.id));
end $$;

-- ---------- 権限 ----------

revoke execute on all functions in schema private from public, anon, authenticated;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'my_status', 'redeem_bypass_key', 'clear_bypass_key', 'admin_create_bypass_key', 'admin_list_bypass_keys', 'admin_revoke_bypass_key')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function public.my_status() to authenticated;
grant execute on function public.redeem_bypass_key(text) to authenticated;
grant execute on function public.clear_bypass_key() to authenticated;
grant execute on function public.admin_create_bypass_key(text) to authenticated;
grant execute on function public.admin_list_bypass_keys() to authenticated;
grant execute on function public.admin_revoke_bypass_key(bigint) to authenticated;
