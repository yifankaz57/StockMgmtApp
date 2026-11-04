# 共有マスタ（Supabase）の準備

JAN コードと商品名の対応を利用者みんなで共有する「共有マスタ」のサーバー側です。
在庫数や履歴は共有されず、これまでどおり各端末に保存されます。

設定しない場合、アプリに共有マスタの機能は表示されません（これまでどおり動きます）。

## 仕組み

| 項目 | 内容 |
| --- | --- |
| 閲覧 | ログイン不要。公開中の候補だけが見える |
| 登録・通報 | メールアドレスでログインした人だけ（確認コードでログイン） |
| 上書きさせない | 表は直接読み書きできない（RLS、ポリシーなし）。操作は関数経由で「提案の追加」だけ。他人の提案は変更・削除できない |
| 候補 | 同じ JAN・同じ名前（全角半角・大文字小文字・空白などを揃えて比較）の提案を1つにまとめ、登録した人数で並べる |
| 確定 | 別々の利用者 **5人** が同じ名前で登録すると「確定」 |
| 保留 | 新しい利用者1人だけが登録した候補は非公開。運営が承認するか、別の人が同じ名前を登録すると公開 |
| 信頼度 | 信頼済みの利用者の登録はすぐ公開され、並び順の重みが2倍。自分の登録のうち3件が「確定」になると自動で信頼済み。運営が手動でも変更できる |
| 上限 | 1人あたり24時間で登録 **30件**・通報 20件まで |
| 入力チェック | JAN のチェックディジット、店内コード（先頭20〜29）の除外、商品名100文字・メーカー50文字、URL・NG ワードの禁止（アプリ側と同じルールをサーバーでも確認） |
| 事後の対処 | 通報、運営の確認待ち一覧、JAN ごとの履歴、承認・非表示・元に戻す、利用者の締め出し（解除で元に戻る）、運営の操作記録 |

数値（5人・30件など）は `migrations/0001_shared_master.sql` の先頭の「設定値」で変えられます。

## 準備の手順

### 1. Supabase のプロジェクトを作る

1. https://supabase.com でアカウントを作り、「New project」でプロジェクトを作成（リージョンは Tokyo を推奨）
2. 左メニュー「SQL Editor」で、次の2つのファイルの中身を順に貼り付けて「Run」
   1. `migrations/0001_shared_master.sql`
   2. `migrations/0002_ng_words.sql`

### 2. メールの確認コードでログインできるようにする

アプリは、メールのリンクではなく **メールに書かれた確認コード（数字）** でログインします
（ホーム画面に追加したアプリと Safari ではログイン状態が共有されないため）。

1. 「Authentication」→「Sign In / Providers」で **Email** が有効になっていることを確認
2. 「Authentication」→「Emails」（メールのテンプレート）で、**Magic Link** と **Confirm signup** の本文に
   `{{ .Token }}` を入れる。例:

   ```
   <p>在庫スキャンの確認コード: <strong>{{ .Token }}</strong></p>
   <p>アプリの画面にこの数字を入力してください。心当たりがなければ、このメールは破棄してください。</p>
   ```

3. Supabase 標準のメール送信は、送れる数がとても少なく制限されています。利用者が増えてきたら、
   「Authentication」→「Emails」→「SMTP Settings」で自前のメール送信サービス（SMTP）を設定してください。

### 3. アプリに接続先を設定する

1. Supabase の「Project Settings」→「API」（または「Data API」）で次の2つを確認
   - Project URL（例: `https://xxxx.supabase.co`）
   - anon（public）key（**公開して良い鍵**。`service_role` の鍵は絶対に使わない・公開しない）
2. GitHub のリポジトリで「Settings」→「Secrets and variables」→「Actions」→「Variables」タブ →「New repository variable」で2つ登録
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon key
3. 「Actions」タブで「Deploy web app to GitHub Pages」を「Run workflow」で再実行（または次に main へ反映したとき）

手元で試す場合は `web/.env.local` に次を書いて `npm run dev`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=anon key
```

### 4. 自分を運営者にする

1. 公開した Web アプリの「設定」タブで、自分のメールアドレスでログインする（これで利用者として登録される）
2. Supabase の「SQL Editor」で、メールアドレスを自分のものに変えて実行

   ```sql
   insert into public.profiles (user_id, is_admin, trust)
   select id, true, 'trusted' from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set is_admin = true, trust = 'trusted';
   ```

3. アプリを開き直すと、下のタブに「管理」が表示される

## 運用メモ

- NG ワードを変えるときは、アプリ側の `shared/ng-words.ts` と、Supabase の `ng_words` 表の両方を変える
  （SQL Editor で `insert into public.ng_words values ('語');` / `delete from public.ng_words where word = '語';`）
- Supabase の無料プランは、しばらくアクセスがないとプロジェクトが一時停止されます。本格運用では有料プランを検討してください
- 不特定多数に公開する前に、プライバシーポリシー（メールアドレスの扱い、登録内容が公開されること）と利用規約（免責）を用意してください
