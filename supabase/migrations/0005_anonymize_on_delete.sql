-- アカウント削除のとき、登録した商品名は消さずに匿名化する
--
-- 共有マスタの候補は「別々の利用者 5 人の合意」で確定するため、1 人が退会しただけで
-- その人の登録が消えると、確定が外れてしまう。そこで退会時は次のようにする:
-- - メールアドレス（ログイン用のアカウント）・利用者情報・通報・認証キーの入力失敗の記録は削除する
-- - 登録（提案）は残し、登録者を「退会した利用者」として、誰とも結び付かない新しい番号に置き換える
--   （退会 1 回ごとに新しい番号を作るので、元の人をたどることはできない。合意の人数はそのまま数える）
-- - 退会した人が信頼済み・公認だった場合、その人の登録は「承認済み」にして公開を続ける
--   （公認 1 人だけで確定していた候補は、確定ではなくなる）
-- 0001〜0004 を実行済みの Supabase で、このファイルを SQL Editor で 1 回実行する（もう一度実行しても問題ない）。

-- 退会した人の登録を残すため、提案と利用者（auth.users）の連動削除をやめる
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.proposals'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.proposals drop constraint %I', c.conname);
  end loop;
end $$;

-- 退会した利用者の登録か
alter table public.proposals add column if not exists anonymized boolean not null default false;

-- 有効な提案（0001 から変更: 利用者情報の無い = 退会した人の提案も数える。締め出された人・非表示は除く）
create or replace view private.effective_proposals as
  select p.*
  from public.proposals p
  left join public.profiles pr on pr.user_id = p.user_id
  where p.status <> 'hidden' and not coalesce(pr.banned, false);

-- 利用者情報を用意する（0001 から変更: 退会した利用者には作らない）
create or replace function private.ensure_profile(uid uuid) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  if not exists (select 1 from auth.users where id = uid) then
    raise exception '退会した利用者です。' using errcode = 'P0001';
  end if;
  insert into public.profiles (user_id) values (uid) on conflict (user_id) do nothing;
  select * into p from public.profiles where user_id = uid;
  return p;
end $$;

-- 自分のアカウントを削除する（0004 から変更: 登録は匿名化して残す）
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.current_user_id();
  anon uuid := gen_random_uuid();
begin
  -- 信頼済み・公認だった人の登録は、退会後も公開が続くよう承認済みにしておく
  if private.is_trusted(uid) then
    update public.proposals set status = 'approved' where user_id = uid and status = 'active';
  end if;
  -- 登録者を、誰とも結び付かない新しい番号に置き換える
  update public.proposals set user_id = anon, anonymized = true where user_id = uid;
  -- アカウントを削除（利用者情報・通報・認証キーの入力失敗の記録は連動して消える）
  delete from auth.users where id = uid;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
