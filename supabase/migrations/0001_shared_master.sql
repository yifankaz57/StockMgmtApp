-- 共有マスタ（JAN コード → 商品名の候補）
--
-- 方針
-- - 利用者は表を直接読み書きできない（RLS を有効にし、ポリシーを作らない）。操作はすべて下の関数（RPC）経由
-- - 投稿は「提案」として追加するだけ。他人の提案を変更・削除する手段はない
-- - 同じ JAN・同じ名前（表記ゆれを揃えたもの）の提案をまとめて「候補」とし、支持した人数で並べる
-- - 別々の利用者 5 人が支持した候補は「確定」
-- - 新しい利用者だけが支持する候補は「保留」（運営の承認か、別の人の支持で公開）
-- - 候補の閲覧はログイン不要。投稿・通報はメールでログインした利用者のみ
-- - 運営（profiles.is_admin）は通報の処理・提案の承認/非表示/復元・利用者の締め出し・信頼度の変更ができ、操作は記録に残る

create schema if not exists private;

-- ---------- 設定値 ----------

create or replace function private.confirm_threshold() returns int language sql immutable as $$ select 5 $$;
create or replace function private.daily_proposal_limit() returns int language sql immutable as $$ select 30 $$;
create or replace function private.daily_report_limit() returns int language sql immutable as $$ select 20 $$;
-- 自分の提案のうち、これだけの数が「確定」になった利用者は自動で信頼済み
create or replace function private.auto_trust_confirmed() returns int language sql immutable as $$ select 3 $$;

-- ---------- 表 ----------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trust text not null default 'new' check (trust in ('new', 'trusted')),
  is_admin boolean not null default false,
  banned boolean not null default false,
  banned_reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id bigint generated always as identity primary key,
  jan text not null,
  name text not null,
  -- 表記ゆれを揃えた比較用の名前
  name_key text not null,
  manufacturer text not null default '',
  user_id uuid not null references auth.users (id) on delete cascade,
  -- active: 通常 / approved: 運営が承認 / hidden: 運営が非表示
  status text not null default 'active' check (status in ('active', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  unique (jan, user_id, name_key)
);
create index if not exists proposals_jan_idx on public.proposals (jan);
create index if not exists proposals_user_created_idx on public.proposals (user_id, created_at);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  jan text not null,
  name_key text not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 200),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  unique (jan, name_key, reporter_id)
);
create index if not exists reports_status_idx on public.reports (status, created_at);

create table if not exists public.moderation_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  target text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- NG ワード（アプリ側の shared/ng-words.ts と同じ内容にする）
create table if not exists public.ng_words (word text primary key);

alter table public.profiles enable row level security;
alter table public.proposals enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_log enable row level security;
alter table public.ng_words enable row level security;
-- ポリシーは作らない = 利用者からの直接の読み書きはすべて拒否

-- ---------- 入力チェック（アプリ側の shared/inventory.ts と同じルール） ----------

-- 比較用に揃える: 全角→半角、大文字→小文字、空白と一部の記号を除去
create or replace function private.fold(t text) returns text language sql immutable as $$
  select regexp_replace(lower(normalize(coalesce(t, ''), NFKC)), '[[:space:]　_\-・.。、,]', '', 'g')
$$;

create or replace function private.is_valid_jan(code text) returns boolean language plpgsql immutable as $$
declare
  digits int[];
  n int;
  total int := 0;
  i int;
begin
  if code !~ '^([0-9]{8}|[0-9]{13})$' then
    return false;
  end if;
  n := length(code);
  for i in 1 .. n - 1 loop
    -- 右から数えて奇数番目（チェックディジットの左隣から）を 3 倍
    total := total + substr(code, i, 1)::int * case when (n - i) % 2 = 1 then 3 else 1 end;
  end loop;
  return (10 - total % 10) % 10 = substr(code, n, 1)::int;
end $$;

create or replace function private.contains_url(t text) returns boolean language sql immutable as $$
  select lower(normalize(coalesce(t, ''), NFKC)) ~
    '(https?://|www\.|[a-z0-9-]+\.(com|net|org|info|biz|xyz|top|site|online|shop|store|io|me|ly|co|jp|cn|ru)([^a-z0-9]|$))'
$$;

create or replace function private.find_ng_word(t text) returns text language sql stable security definer set search_path = '' as $$
  select w.word from public.ng_words w where position(private.fold(w.word) in private.fold(t)) > 0 order by w.word limit 1
$$;

-- 問題があれば例外（メッセージはそのまま画面に出す）
create or replace function private.check_text(label text, value text, max_len int) returns void language plpgsql stable as $$
declare
  ng text;
begin
  if char_length(value) > max_len then
    raise exception '%は%文字以内で入力してください。', label, max_len using errcode = 'P0001';
  end if;
  if private.contains_url(value) then
    raise exception '%に URL やドメイン名は入力できません。', label using errcode = 'P0001';
  end if;
  ng := private.find_ng_word(value);
  if ng is not null then
    raise exception '%に使えない語（「%」）が含まれています。', label, ng using errcode = 'P0001';
  end if;
end $$;

-- ---------- 利用者 ----------

create or replace function private.current_user_id() returns uuid language plpgsql stable as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'ログインが必要です。' using errcode = 'P0001';
  end if;
  return uid;
end $$;

create or replace function private.ensure_profile(uid uuid) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  insert into public.profiles (user_id) values (uid) on conflict (user_id) do nothing;
  select * into p from public.profiles where user_id = uid;
  return p;
end $$;

create or replace function private.require_admin() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.current_user_id();
begin
  if not exists (select 1 from public.profiles where user_id = uid and is_admin and not banned) then
    raise exception '運営者の権限がありません。' using errcode = 'P0001';
  end if;
  return uid;
end $$;

-- ---------- 候補の集計 ----------

-- 有効な提案（非表示・締め出された利用者の分を除く）
create or replace view private.effective_proposals as
  select p.*
  from public.proposals p
  join public.profiles pr on pr.user_id = p.user_id
  where p.status <> 'hidden' and not pr.banned;

-- 候補ごとの支持人数
create or replace view private.group_support as
  select jan, name_key, count(distinct user_id)::int as supporters
  from private.effective_proposals
  group by jan, name_key;

-- 信頼済みの利用者（運営が設定した人、または自分の提案のうち一定数が「確定」になった人）
create or replace function private.is_trusted(uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select trust = 'trusted' from public.profiles where user_id = uid), false)
    or (
      select count(*) from private.effective_proposals p
      join private.group_support g on g.jan = p.jan and g.name_key = p.name_key
      where p.user_id = uid and g.supporters >= private.confirm_threshold()
    ) >= private.auto_trust_confirmed()
$$;

-- JAN ごとの候補一覧（運営用に保留・非表示も含めて返す）
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
    select p.*, private.is_trusted(p.user_id) as trusted
    from private.effective_proposals p
    where p.jan = p_jan
  ),
  g as (
    select
      ep.name_key,
      count(distinct ep.user_id)::int as supporters,
      sum(case when ep.trusted then 2 else 1 end)::int as score,
      bool_or(ep.status = 'approved' or ep.trusted) as vouched
    from ep group by ep.name_key
  ),
  all_keys as (
    select distinct p.name_key from public.proposals p where p.jan = p_jan
  )
  select
    k.name_key,
    -- 表示名・メーカー名は、その候補で最も多く使われた書き方
    (select p.name from public.proposals p where p.jan = p_jan and p.name_key = k.name_key
      group by p.name order by count(*) desc, min(p.created_at) limit 1),
    coalesce((select p.manufacturer from public.proposals p where p.jan = p_jan and p.name_key = k.name_key and p.manufacturer <> ''
      group by p.manufacturer order by count(*) desc, min(p.created_at) limit 1), ''),
    coalesce(g.supporters, 0),
    coalesce(g.score, 0),
    coalesce(g.supporters, 0) >= private.confirm_threshold(),
    coalesce(g.vouched or g.supporters >= 2, false),
    g.name_key is null,
    (select count(*)::int from public.reports r where r.jan = p_jan and r.name_key = k.name_key and r.status = 'open')
  from all_keys k
  left join g on g.name_key = k.name_key
$$;

-- ---------- 公開する関数（誰でも） ----------

-- JAN コードの候補（公開中のものだけ）。mine = ログイン中の利用者が支持しているか
create or replace function public.get_candidates(p_jan text)
returns table (name_key text, name text, manufacturer text, supporters int, confirmed boolean, mine boolean)
language sql stable security definer set search_path = '' as $$
  select c.name_key, c.name, c.manufacturer, c.supporters, c.confirmed,
    exists (select 1 from public.proposals p where p.jan = p_jan and p.name_key = c.name_key and p.user_id = auth.uid())
  from private.candidates(p_jan) c
  where c.visible
  order by c.confirmed desc, c.score desc, c.supporters desc, c.name
  limit 10
$$;

-- ---------- ログインした利用者の関数 ----------

-- 自分の状態（信頼度・締め出し・運営者か・今日の残り投稿数）
create or replace function public.my_status()
returns table (trust text, banned boolean, is_admin boolean, proposals_today int, proposal_limit int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := private.current_user_id();
  p public.profiles := private.ensure_profile(uid);
begin
  return query select
    case when private.is_trusted(uid) then 'trusted' else 'new' end,
    p.banned,
    p.is_admin,
    (select count(*)::int from public.proposals x where x.user_id = uid and x.created_at > now() - interval '1 day'),
    private.daily_proposal_limit();
end $$;

-- 提案を追加する（既に同じ名前を提案済みなら何もしない）。他人の提案は変更できない
create or replace function public.submit_proposal(p_jan text, p_name text, p_manufacturer text default '')
returns table (result text, proposals_today int, proposal_limit int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
#variable_conflict use_column
declare
  uid uuid := private.current_user_id();
  prof public.profiles := private.ensure_profile(uid);
  v_jan text := trim(coalesce(p_jan, ''));
  v_name text := trim(coalesce(p_name, ''));
  v_maker text := trim(coalesce(p_manufacturer, ''));
  today int;
  inserted int;
begin
  if prof.banned then
    raise exception 'この利用者は共有マスタへの投稿を停止されています。' using errcode = 'P0001';
  end if;
  if not private.is_valid_jan(v_jan) then
    raise exception 'JAN コード（8桁または13桁、チェックディジットが正しいもの）のみ投稿できます。' using errcode = 'P0001';
  end if;
  if v_jan ~ '^2[0-9]{12}$' then
    raise exception '店内コード（先頭が20〜29の13桁）は共有マスタに登録できません。' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception '商品名を入力してください。' using errcode = 'P0001';
  end if;
  perform private.check_text('商品名', v_name, 100);
  perform private.check_text('メーカー', v_maker, 50);

  -- 同じ人の同時投稿で上限をすり抜けないよう、利用者ごとに直列化する
  perform 1 from public.profiles where user_id = uid for update;
  select count(*)::int into today from public.proposals x where x.user_id = uid and x.created_at > now() - interval '1 day';
  if today >= private.daily_proposal_limit() then
    raise exception '共有マスタへの投稿は1日（24時間）%件までです。', private.daily_proposal_limit() using errcode = 'P0001';
  end if;

  insert into public.proposals (jan, name, name_key, manufacturer, user_id)
  values (v_jan, v_name, private.fold(v_name), v_maker, uid)
  on conflict (jan, user_id, name_key) do nothing;
  get diagnostics inserted = row_count;

  return query select
    case when inserted > 0 then 'added' else 'already' end,
    today + inserted,
    private.daily_proposal_limit();
end $$;

-- 候補を通報する（同じ候補への通報は1人1回）
create or replace function public.report_candidate(p_jan text, p_name_key text, p_reason text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.current_user_id();
  prof public.profiles := private.ensure_profile(uid);
  inserted int;
begin
  if prof.banned then
    raise exception 'この利用者は共有マスタの利用を停止されています。' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.proposals where jan = p_jan and name_key = p_name_key) then
    raise exception '候補が見つかりません。' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reports where reporter_id = uid and created_at > now() - interval '1 day') >= private.daily_report_limit() then
    raise exception '通報は1日（24時間）%件までです。', private.daily_report_limit() using errcode = 'P0001';
  end if;
  insert into public.reports (jan, name_key, reporter_id, reason)
  values (p_jan, p_name_key, uid, left(trim(coalesce(p_reason, '')), 200))
  on conflict (jan, name_key, reporter_id) do nothing;
  get diagnostics inserted = row_count;
  return case when inserted > 0 then 'reported' else 'already' end;
end $$;

-- ---------- 運営の関数 ----------

create or replace function private.log_action(admin_id uuid, action text, target text, detail jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.moderation_log (admin_id, action, target, detail) values (admin_id, action, target, detail)
$$;

-- 確認待ち: 未処理の通報がある候補と、保留中（新しい利用者だけが支持）の候補
create or replace function public.admin_queue()
returns table (kind text, jan text, name_key text, name text, manufacturer text, supporters int, open_reports int, reasons text[], first_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  with jans as (
    select distinct r.jan from public.reports r where r.status = 'open'
    union
    select distinct p.jan from public.proposals p where p.status = 'active'
  ),
  c as (
    select j.jan, x.* from jans j cross join lateral private.candidates(j.jan) x
  )
  select
    case when c.open_reports > 0 then 'report' else 'pending' end,
    c.jan, c.name_key, c.name, c.manufacturer, c.supporters, c.open_reports,
    array(select r.reason from public.reports r where r.jan = c.jan and r.name_key = c.name_key and r.status = 'open' and r.reason <> ''),
    (select min(p.created_at) from public.proposals p where p.jan = c.jan and p.name_key = c.name_key)
  from c
  where c.open_reports > 0 or (not c.visible and not c.hidden)
  order by (c.open_reports > 0) desc, 9;
end $$;

-- JAN コードの全履歴（非表示・締め出された利用者の提案も含む）
create or replace function public.admin_jan_history(p_jan text)
returns table (proposal_id bigint, name text, name_key text, manufacturer text, status text, user_id uuid, user_email text,
  user_trusted boolean, user_banned boolean, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select p.id, p.name, p.name_key, p.manufacturer, p.status, p.user_id, u.email::text,
    private.is_trusted(p.user_id), coalesce(pr.banned, false), p.created_at
  from public.proposals p
  left join auth.users u on u.id = p.user_id
  left join public.profiles pr on pr.user_id = p.user_id
  where p.jan = trim(p_jan)
  order by p.created_at desc;
end $$;

-- 候補（同じ JAN・同じ名前の提案すべて）を承認 / 非表示 / 元に戻す。関連する未処理の通報は処理済みにする
create or replace function public.admin_set_candidate(p_jan text, p_name_key text, p_action text, p_note text default '')
returns int language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := private.require_admin();
  new_status text;
  n int;
begin
  new_status := case p_action when 'approve' then 'approved' when 'hide' then 'hidden' when 'restore' then 'active' end;
  if new_status is null then
    raise exception '不明な操作です: %', p_action using errcode = 'P0001';
  end if;
  update public.proposals set status = new_status where jan = p_jan and name_key = p_name_key;
  get diagnostics n = row_count;
  update public.reports set status = case when p_action = 'hide' then 'resolved' else 'dismissed' end,
    resolved_by = admin, resolved_at = now()
  where jan = p_jan and name_key = p_name_key and status = 'open';
  perform private.log_action(admin, 'candidate_' || p_action, p_jan || ' / ' || p_name_key,
    jsonb_build_object('proposals', n, 'note', p_note));
  return n;
end $$;

-- 提案1件の状態を変える（承認 / 非表示 / 元に戻す）
create or replace function public.admin_set_proposal(p_id bigint, p_action text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := private.require_admin();
  new_status text;
  old public.proposals;
begin
  new_status := case p_action when 'approve' then 'approved' when 'hide' then 'hidden' when 'restore' then 'active' end;
  if new_status is null then
    raise exception '不明な操作です: %', p_action using errcode = 'P0001';
  end if;
  select * into old from public.proposals where id = p_id;
  if old.id is null then
    raise exception '提案が見つかりません。' using errcode = 'P0001';
  end if;
  update public.proposals set status = new_status where id = p_id;
  perform private.log_action(admin, 'proposal_' || p_action, old.jan || ' / ' || old.name,
    jsonb_build_object('proposal_id', p_id, 'from', old.status, 'to', new_status, 'note', p_note));
end $$;

-- 通報を処理せずに閉じる（候補はそのまま）
create or replace function public.admin_dismiss_reports(p_jan text, p_name_key text, p_note text default '')
returns int language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := private.require_admin();
  n int;
begin
  update public.reports set status = 'dismissed', resolved_by = admin, resolved_at = now()
  where jan = p_jan and name_key = p_name_key and status = 'open';
  get diagnostics n = row_count;
  perform private.log_action(admin, 'reports_dismiss', p_jan || ' / ' || p_name_key, jsonb_build_object('reports', n, 'note', p_note));
  return n;
end $$;

-- 利用者の締め出し / 解除。締め出すと、その人の提案はすべて候補の集計から外れる（解除すると戻る）
create or replace function public.admin_set_banned(p_user_id uuid, p_banned boolean, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := private.require_admin();
begin
  if p_user_id = admin then
    raise exception '自分自身は締め出せません。' using errcode = 'P0001';
  end if;
  perform private.ensure_profile(p_user_id);
  update public.profiles set banned = p_banned, banned_reason = case when p_banned then left(coalesce(p_reason, ''), 200) else '' end
  where user_id = p_user_id;
  perform private.log_action(admin, case when p_banned then 'user_ban' else 'user_unban' end, p_user_id::text,
    jsonb_build_object('reason', p_reason));
end $$;

-- 信頼度を手動で変える（trusted: 投稿がすぐ公開され、重みが2倍になる）
create or replace function public.admin_set_trust(p_user_id uuid, p_trust text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := private.require_admin();
begin
  if p_trust not in ('new', 'trusted') then
    raise exception '不明な信頼度です: %', p_trust using errcode = 'P0001';
  end if;
  perform private.ensure_profile(p_user_id);
  update public.profiles set trust = p_trust where user_id = p_user_id;
  perform private.log_action(admin, 'user_trust', p_user_id::text, jsonb_build_object('trust', p_trust));
end $$;

-- 締め出し中の利用者
create or replace function public.admin_banned_users()
returns table (user_id uuid, user_email text, banned_reason text, proposals int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select pr.user_id, u.email::text, pr.banned_reason, (select count(*)::int from public.proposals p where p.user_id = pr.user_id)
  from public.profiles pr left join auth.users u on u.id = pr.user_id
  where pr.banned order by u.email;
end $$;

-- 運営の操作の記録
create or replace function public.admin_log(p_limit int default 100)
returns table (id bigint, admin_email text, action text, target text, detail jsonb, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select l.id, u.email::text, l.action, l.target, l.detail, l.created_at
  from public.moderation_log l left join auth.users u on u.id = l.admin_id
  order by l.created_at desc limit least(greatest(p_limit, 1), 500);
end $$;

-- ---------- 権限 ----------

revoke all on schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- このファイルで作った public の関数だけ、いったん全員から実行権限を外す（Supabase は既定で全員に付けるため）
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'get_candidates', 'my_status', 'submit_proposal', 'report_candidate', 'admin_queue', 'admin_jan_history',
      'admin_set_candidate', 'admin_set_proposal', 'admin_dismiss_reports', 'admin_set_banned', 'admin_set_trust',
      'admin_banned_users', 'admin_log')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function public.get_candidates(text) to anon, authenticated;
grant execute on function public.my_status() to authenticated;
grant execute on function public.submit_proposal(text, text, text) to authenticated;
grant execute on function public.report_candidate(text, text, text) to authenticated;
grant execute on function public.admin_queue() to authenticated;
grant execute on function public.admin_jan_history(text) to authenticated;
grant execute on function public.admin_set_candidate(text, text, text, text) to authenticated;
grant execute on function public.admin_set_proposal(bigint, text, text) to authenticated;
grant execute on function public.admin_dismiss_reports(text, text, text) to authenticated;
grant execute on function public.admin_set_banned(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_trust(uuid, text) to authenticated;
grant execute on function public.admin_banned_users() to authenticated;
grant execute on function public.admin_log(int) to authenticated;
