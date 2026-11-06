# StockMgmtApp（在庫スキャナ）

iPhone のカメラで商品のバーコードを読み取り、商品ごとの在庫数を管理するアプリです。2 つの版があります。

| 版 | 場所 | 使い方 |
| --- | --- | --- |
| **Web 版（PWA）** | [`web/`](./web) | **URL を開くだけ**で使える。App Store 不要。公開 URL: https://yifankaz57.github.io/StockMgmtApp/ |
| Expo 版（ネイティブアプリ） | リポジトリ直下 | Expo Go で実行、または EAS Build でアプリ化。Windows だけで開発可能 |

Web 版の詳細は [web/README.md](./web/README.md) を参照してください。以下は Expo 版の説明です。
Web 版を作る前の Expo 版のソースは `archive/expo-app-v1.0` ブランチにも保存しています。

**Expo 版**は Expo（React Native + TypeScript）で作られているため、**Windows だけで開発・実機確認・ビルド**ができます（Mac 不要）。
データは端末内の SQLite に保存され、サーバーは不要です。同じコードで Android でも動きます。

## 主な機能

| 機能 | 内容 |
| --- | --- |
| スキャン（＝利用） | 未登録のバーコードは登録画面へ。登録済みの商品は大きな確認画面で「減らす」を押すと在庫を1個消費（その日の1個目は青、同じ商品の2個目以降はオレンジの警告）。結果のメッセージは数秒でだんだん消える。履歴には「利用」として記録 |
| 利用可能／利用不可 | 在庫一覧の各行の左のアイコン（緑のチェック／赤の禁止マーク）や商品の詳細画面で切り替え。利用不可の商品はスキャンしても消費せずエラー |
| 入庫・出庫・棚卸 | 在庫一覧から商品を開いて数量指定で実行（出庫のボタンは −1 / −5 …） |
| 商品名・メーカーの候補表示 | 未登録の JAN コードから、インターネット上の商品データ（Open Food Facts）で候補を表示。タップで入力欄に反映 |
| 共有マスタ（任意） | JAN コードと商品名の対応をみんなで共有（Supabase）。候補の閲覧はログイン不要、登録・通報はメールの確認コードでログイン。5人が同じ名前で登録すると「確定」。運営者には「管理」タブ。準備は [supabase/README.md](./supabase/README.md) |
| Web検索 | データベースに無い商品（業務用品など）は、登録画面の「Webで検索」でJANコードを検索し、見つけた商品名を貼り付けて登録 |
| 商品管理 | 商品名・メーカー・色番号・容量・仕入れ値・保管場所・最低在庫数・メモを登録 / 編集 / 削除。登録時の入力チェック（店内コード・文字数・URL・NG ワード） |
| 在庫少アラート | 最低在庫数以下の商品をオレンジ色で強調し、絞り込み可能 |
| 並べ替え | 在庫一覧を名前順 / 今月の消費量の多い順（スキャンでの消費＋手動の出庫）で表示 |
| 設定 | 消費量を数え直す日（毎月何日か。既定 1日）、在庫の色分け（下の行） |
| 在庫の色分け | 在庫数が設定した数を下回った商品を、在庫一覧で背景色を変えて表示。「注意」「警告」の2段階で、数と色を設定タブで指定（既定の色は注意＝薄い黄、警告＝薄い赤。初期設定はどちらも未設定） |
| 入出庫履歴 | すべての在庫変動を日付ごとに表示（種別で絞り込み可） |
| CSV 出力 | 在庫一覧（月ごとの消費数・在庫金額を含む）・入出庫履歴を CSV（Excel で開ける UTF-8 BOM 付き）で共有 |
| 手入力 | カメラで読めない場合もバーコードを手入力して操作可能 |

## Windows での開発手順

### 1. 準備（初回のみ）

1. [Node.js](https://nodejs.org/) の **LTS 版（22.18 以降）** をインストール
2. [Git](https://git-scm.com/download/win) と [VS Code](https://code.visualstudio.com/)（推奨）をインストール
3. iPhone に App Store から **Expo Go** をインストール

### 2. 起動

PowerShell またはコマンドプロンプトで:

```powershell
git clone https://github.com/yifankaz57/stockmgmtapp.git
cd stockmgmtapp
npm install
npx expo start
```

### 3. iPhone で動作確認

1. PC と iPhone を **同じ Wi-Fi** に接続
2. ターミナルに表示された QR コードを **iPhone の標準カメラアプリ** で読み取る → Expo Go でアプリが開く
3. コードを保存すると iPhone 上のアプリに即座に反映されます

> 社内ネットワークなどで接続できない場合は `npx expo start --tunnel` を試してください。
> Windows ファイアウォールの確認ダイアログが出たら「プライベートネットワーク」を許可してください。

### うまく開けないとき

| 症状 | 対処 |
| --- | --- |
| `You're signed in to Expo Go as "…", but not signed in to Expo CLI` | PC で `npx expo login`（Google/GitHub で登録した場合は `npx expo login --sso`）を実行し、Expo Go と同じアカウントでサインイン。`npx expo whoami` で確認してから `npx expo start` し直す。サインインしたくない場合は Expo Go の Profile → Settings → Sign out でも可 |
| QR コードを読んでも接続できない | PC と iPhone が同じ Wi-Fi か確認。だめなら `npx expo start --tunnel` |
| Windows ファイアウォールのダイアログが出た | 「プライベートネットワーク」を許可 |

## JAN コードからの候補表示

商品登録画面では、JAN コード（8桁/13桁、チェックディジットが正しいもの）から商品名・メーカー名の候補を自動で検索します。
候補はあくまで推定です。タップすると入力欄に反映されるので、内容を確認してから保存してください。

| 情報源 | 設定 | 特徴 |
| --- | --- | --- |
| [Open Food Facts](https://world.openfoodfacts.org/) | 不要 | 無料・登録不要。食品・飲料が中心で、日本の商品は収録が少なめ |

候補が見つからない商品は、登録画面の「Web で検索」ボタンでブラウザ検索し、見つけた商品名を入力してください。

## iPhone に単体アプリとしてインストールする（EAS Build）

Expo Go なしで使える正式なアプリにするには、Expo のクラウドビルド（EAS Build）を使います。Mac は不要です。

**必要なもの:** [Expo アカウント](https://expo.dev/signup)（無料）と **Apple Developer Program**（年額 $99）

```powershell
npx eas-cli@latest login
npx eas-cli@latest build:configure     # 初回のみ（EAS プロジェクトを作成）
```

- **社内の数台にだけ配る（Ad Hoc）**
  ```powershell
  npx eas-cli@latest device:create     # 配布する iPhone を登録（表示される URL を iPhone で開く）
  npx eas-cli@latest build --platform ios --profile preview
  ```
  完了後に表示される URL を iPhone で開くとインストールできます。
- **TestFlight / App Store で配る**
  ```powershell
  npx eas-cli@latest build --platform ios --profile production
  npx eas-cli@latest submit --platform ios
  ```

> 公開前に `app.json` の `ios.bundleIdentifier` / `android.package`（初期値 `com.example.stockmgmtapp`）を自分固有の値に変更してください。

## App Store 申請の準備

| 項目 | 状態・やること |
| --- | --- |
| バンドルID | `jp.yifankaz57.zaikoscanner`（`app.json`。App Store に登録すると変更できない） |
| 権限 | カメラのみ（説明文は日本語）。使わないマイクの権限は外してある |
| プライバシーポリシー | `web/public/privacy.html`（公開 URL: https://yifankaz57.github.io/StockMgmtApp/privacy.html）。アプリの「設定」→「このアプリについて」からも開ける。App Store Connect の「プライバシーポリシー URL」にも登録する |
| サポート・連絡先 | `web/public/support.html`（公開 URL: https://yifankaz57.github.io/StockMgmtApp/support.html）。App Store Connect の「サポート URL」に登録する |
| アカウント削除 | 「設定」→「共有マスタ」→「アカウントを削除」。メールアドレス・通報は削除し、登録した商品名は匿名化して残す（合意の人数を保つため）。Supabase で `supabase/migrations/0004_delete_account.sql` と `0005_anonymize_on_delete.sql` の実行が必要 |
| 投稿への対策（1.2） | NG ワード・URL の自動チェック、通報、運営の確認待ち一覧、締め出し |

**★ 連絡先（お問い合わせのメールアドレス）は仮の値（`support@example.com`）です。** 公開前に、次の 3 か所を同じ正式なアドレスに差し替えてください（食い違うと `npm test` が失敗して知らせます）。

1. `shared/app-info.ts` の `CONTACT_EMAIL`
2. `web/public/privacy.html` の `mailto:` とその表示
3. `web/public/support.html` の `mailto:` とその表示

## 開発用コマンド

| コマンド | 内容 |
| --- | --- |
| `npx expo start` | 開発サーバー起動 |
| `npm run typecheck` | TypeScript の型チェック |
| `npm run lint` | ESLint |
| `npm test` | 在庫計算・CSV のユニットテスト（Node 標準のテストランナー） |

> 依存パッケージを追加するときは `npm install` ではなく `npx expo install <パッケージ名>` を使うと、Expo SDK に合ったバージョンが入ります。

## プロジェクト構成

```
src/
├── app/                      # 画面（Expo Router: ファイル = 画面）
│   ├── _layout.tsx           # ルート（SQLite・画面遷移の設定）
│   ├── (tabs)/
│   │   ├── _layout.tsx       # 下部タブ
│   │   ├── index.tsx         # スキャン（＝利用）
│   │   ├── products.tsx      # 在庫一覧
│   │   ├── history.tsx       # 入出庫履歴
│   │   ├── settings.tsx      # 設定（リセット日・共有マスタ）
│   │   └── admin.tsx         # 管理（運営者のときだけ表示）
│   ├── product/[id].tsx      # 商品詳細
│   ├── product/edit.tsx      # 商品登録・編集
│   └── adjust/[id].tsx       # 入庫・出庫・棚卸
├── components/               # 再利用部品（スキャナー・行表示・UI 部品）
├── db/
│   ├── database.ts           # SQLite スキーマと読み書き
│   └── events.ts             # データ変更の通知
├── lib/
│   ├── csv.ts / jan.ts / inventory.ts / web-search.ts  # shared/ の再エクスポート
│   ├── product-lookup.ts     # JAN から商品名・メーカーを検索
│   ├── share.ts              # CSV ファイルの書き出し・共有
│   └── haptics.ts            # 触覚フィードバック
├── shared-master/            # 共有マスタ（Supabase）との通信・候補表示・設定欄
└── constants/theme.ts        # 色
shared/                       # Expo 版・Web 版で共有する在庫計算・CSV・JAN 処理・入力チェック（＋テスト）
supabase/                     # 共有マスタのデータベース定義と準備の手順
```

## 今後の拡張アイデア

- 在庫数・履歴のクラウド同期（複数端末・複数人で在庫を共有）
- 商品写真の登録
- CSV インポートによる商品マスタの一括登録
- 在庫少のプッシュ通知

## ライセンス

[MIT License](./LICENSE) のもとで公開しています。自由に利用・改変・再配布できますが、無保証です。

商品候補の検索に使う外部サービス（Open Food Facts）のデータは、その利用規約に従ってください。

