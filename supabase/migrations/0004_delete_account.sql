-- アカウントの削除（App Store 審査ガイドライン 5.1.1(v): アカウントを作れるアプリは、アプリ内で削除できること）
--
-- ログイン中の利用者が自分のアカウントを削除する。削除されるもの:
-- - ログイン用のアカウント（メールアドレス）
-- - その人の共有マスタへの登録（提案）・通報・認証キーの入力失敗の記録・利用者情報（信頼度など）
-- 運営の操作記録は残る（操作した運営者の欄は空になる）。端末内の在庫データは影響を受けない。
-- 0001〜0003 を実行済みの Supabase で、このファイルを SQL Editor で 1 回実行する（もう一度実行しても問題ない）。

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.current_user_id();
begin
  -- 外部キーの on delete cascade で、提案・通報・利用者情報なども一緒に消える
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
