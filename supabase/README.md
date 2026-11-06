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
Supabase では **自前のメール送信（SMTP）を設定しないとメールの本文を編集できない** ため、先に SMTP を設定します。

#### 2-1. 送信用の Gmail を用意する

送信元のアドレスは受け取る人全員に見えるので、個人用ではなく **このアプリ専用の Gmail アカウント** を作るのがおすすめです。

1. 専用の Gmail アカウントを作る
2. https://myaccount.google.com/security で **2段階認証プロセス** をオンにする
3. 同じページの検索欄で「アプリ パスワード」を開き、名前（例: Supabase）を入れて作成
4. 表示された **16文字のパスワード** を控える（画面を閉じると再表示できない）

#### 2-2. Supabase に SMTP を設定する

「Authentication」→「Emails」→「**SMTP Settings**」タブで「Enable custom SMTP」をオンにして入力し、Save。

| 項目 | 値 |
| --- | --- |
| Sender email | 2-1 の Gmail アドレス |
| Sender name | 在庫スキャナ |
| Host | `smtp.gmail.com` |
| Port number | `465` |
| Username | 2-1 の Gmail アドレス |
| Password | 2-1 のアプリ パスワード（空白なし） |

#### 2-3. テンプレートに確認コードを入れる

「Authentication」→「Emails」→「**Templates**」タブで、次の **2つ** を開いて件名と本文を変え、それぞれ Save。

- **Magic link or OTP**（2回目以降のログイン）
- **Confirm sign up**（初めてのログイン）

件名: `在庫スキャナの確認コード`

本文（もとの内容は全部消して貼り付け。`{{ .Token }}` が6桁の数字に置き換わる）:

```html
<h2>在庫スキャナ ログイン</h2>
<p>確認コード: <strong style="font-size:24px">{{ .Token }}</strong></p>
<p>アプリの「設定」タブにこの数字を入力してください。</p>
<p>心当たりがない場合は、このメールを破棄してください。</p>
```

#### 2-4. リンクの戻り先（Site URL）を公開した URL にする

「Authentication」→「**URL Configuration**」の **Site URL** を、公開した Web アプリの URL にして Save。

```
https://yifankaz57.github.io/StockMgmtApp/
```

同じ画面の **Redirect URLs** にも「Add URL」で同じ URL を追加して保存します
（アプリは「確認コードを送る」を押した画面の URL へ戻るよう Supabase に頼みます。ここに登録がないと Site URL に戻ります）。
URL は大文字小文字も区別されるので、`/StockMgmtApp/` のつづりと末尾の `/` まで正確に入れてください（違うと GitHub Pages の 404 になります）。

初期値（`http://localhost:3000`）のままだと、テンプレートを変える前の「リンク付きのメール」を押したときに
`localhost` に飛んでしまいます。Site URL を設定しておけば、リンクを押しても Web アプリが開いてログインできます
（ただし Safari で開くため、ホーム画面に追加したアプリにはログイン状態が引き継がれません。確認コードでのログインを推奨）。

#### 2-5. 送信数の上限（任意）

「Authentication」→「Rate Limits」の「Rate limit for sending emails」（1時間あたりの送信数）を 30 程度に上げる。

### 3. アプリに接続先を設定する

1. Supabase で次の2つを確認する
   - **Project URL**（例: `https://xxxx.supabase.co`）: 「Project Settings」→「Data API」、または画面上部の「Connect」ボタン。
     末尾に `/rest/v1/` が付いて表示される場合は、その部分を除いた `https://xxxx.supabase.co` だけを使う
   - **公開して良い鍵**: 「Project Settings」→「API Keys」で、次のどちらか
     - 「Publishable key」（`sb_publishable_` で始まる。新しい画面。こちらを推奨）
     - 「Legacy API Keys」タブの「anon」「public」の鍵（`eyJ` で始まる）
   - **使ってはいけない鍵**: 「Secret keys」（`sb_secret_` で始まる）と「service_role」の鍵。アプリにも GitHub にも書かない
   - 変数名は、Publishable key を使う場合も `SUPABASE_ANON_KEY`（アプリ版は `EXPO_PUBLIC_SUPABASE_ANON_KEY`）のままで良い
2. GitHub のリポジトリで「Settings」→「Secrets and variables」→「Actions」→「Variables」タブ →「New repository variable」で2つ登録
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon key
3. 「Actions」タブで「Deploy web app to GitHub Pages」を「Run workflow」で再実行（または次に main へ反映したとき）

手元で試す場合は `web/.env.local` に次を書いて `npm run dev`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=anon key
```

### 3-2. アプリ版（Expo）に接続先を設定する

1. プロジェクト直下の `.env.example` をコピーして `.env.local` を作り、3. で確認した Project URL と公開して良い鍵を書く

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=anon key
   ```

2. `npx expo start` を起動し直す（Expo Go でも動きます）
3. EAS Build でアプリにする場合は、同じ2つを EAS の環境変数（https://expo.dev のプロジェクト →「Environment variables」）にも登録する

### 4. 自分を運営者にする

1. Web アプリまたはアプリ版の「設定」タブで、自分のメールアドレスでログインする（これで利用者として登録される）
2. Supabase の「SQL Editor」で、メールアドレスを自分のものに変えて実行

   ```sql
   insert into public.profiles (user_id, is_admin, trust)
   select id, true, 'trusted' from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set is_admin = true, trust = 'trusted';
   ```

3. アプリを開き直すと、下のタブに「管理」が表示される

### 5. 認証キー（公認の利用者）を使う場合

運営者が発行した「認証キー」を設定画面に入力した利用者は **公認** になり、その人の登録は 5 人の合意を待たずに、すぐ共有マスタに「確定」として公開されます。

1. Supabase の「SQL Editor」で `migrations/0003_bypass_keys.sql` の中身を貼り付けて「Run」（0001・0002 を実行済みのプロジェクトに追加で1回。もう一度実行しても問題ありません）
2. 運営者でログインし、「管理」タブ →「キー」で用途の名前を入れて「発行」
3. 表示されたキー（`SMK-XXXX-…`）を、公認にしたい人にだけ伝える（**キーは発行時の1回しか表示されません**。データベースにはキーそのものは保存されません）
4. 受け取った人は、共有マスタにメールでログインしたあと、「設定」タブの「認証キー」に入力して「適用」
5. 不要になったら「キー」画面で「無効にする」。そのキーで公認になった全員の効果がすぐ外れます

- キーを知っていれば誰でも公認になれるので、キーは信頼できる人にだけ、メール以外の安全な方法で伝えてください
- 間違ったキーの入力は 1 人あたり 24 時間で 10 回までです
- 締め出した利用者は、キーを適用していても公認になりません

## 運用メモ

- NG ワードを変えるときは、アプリ側の `shared/ng-words.ts` と、Supabase の `ng_words` 表の両方を変える
  （SQL Editor で `insert into public.ng_words values ('語');` / `delete from public.ng_words where word = '語';`）
- Supabase の無料プランは、しばらくアクセスがないとプロジェクトが一時停止されます。本格運用では有料プランを検討してください
- 不特定多数に公開する前に、プライバシーポリシー（メールアドレスの扱い、登録内容が公開されること）と利用規約（免責）を用意してください
