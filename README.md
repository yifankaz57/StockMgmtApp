# StockMgmtApp（在庫スキャン）

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
| バーコードスキャン | JAN/EAN・UPC・Code128/39/93・ITF・QR などを読み取り（`expo-camera`） |
| 単純利用モード（「利用」タブ） | 登録済み商品のバーコードを読み取るたびに在庫を1減らす。同じ商品を1日に2個以上使うときは、大きな確認画面で「減らす / やめる」を選ぶ。履歴には「利用」として記録 |
| 照会・操作モード | 読み取った商品の **入庫 / 出庫 / 棚卸** を数量指定で実行。未登録のバーコードは登録画面へ |
| 連続入庫 / 連続出庫モード | 読み取るたびに在庫を自動で ±1（大量の入荷・出荷作業向け） |
| 商品名・メーカーの候補表示 | 未登録の JAN コードを読み取ると、インターネット上の商品データから商品名・メーカー名の候補を表示。タップで入力欄に反映 |
| Web検索 | データベースに無い商品（業務用品など）は、登録画面の「Webで検索」でJANコードを検索し、見つけた商品名を貼り付けて登録 |
| 商品管理 | 商品名・メーカー・色番号・容量・保管場所・最低在庫数・メモを登録 / 編集 / 削除 |
| 在庫少アラート | 最低在庫数以下の商品をオレンジ色で強調し、絞り込み可能 |
| 入出庫履歴 | すべての在庫変動を日付ごとに表示（種別で絞り込み可） |
| CSV 出力 | 在庫一覧・入出庫履歴を CSV（Excel で開ける UTF-8 BOM 付き）で共有 |
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

## JAN コードからの候補表示（任意設定）

商品登録画面では、JAN コード（8桁/13桁、チェックディジットが正しいもの）から商品名・メーカー名の候補を自動で検索します。
候補はあくまで推定です。タップすると入力欄に反映されるので、内容を確認してから保存してください。

| 情報源 | 設定 | 特徴 |
| --- | --- | --- |
| [Open Food Facts](https://world.openfoodfacts.org/) | 不要 | 無料・登録不要。食品・飲料が中心で、日本の商品は収録が少なめ |
| Yahoo!ショッピング 商品検索API (V3) | Client ID が必要（無料） | 日本の商品を幅広くカバー。メーカー候補はブランド名 |

**Yahoo! を使う場合の設定**

1. [Yahoo!デベロッパーネットワーク](https://e.developer.yahoo.co.jp/register) でアプリケーションを登録し、**Client ID** を取得
2. プロジェクト直下の `.env.example` をコピーして `.env.local` を作成し、Client ID を記入
   ```
   EXPO_PUBLIC_YAHOO_APP_ID=取得したClientID
   ```
3. `npx expo start` を起動し直す

> `.env.local` は Git に含まれません。`EXPO_PUBLIC_` で始まる値はアプリ本体に組み込まれるため、
> Client ID 以外の秘密情報（シークレット等）は書かないでください。
> 商品データの利用にあたっては各 API の利用規約（Yahoo! はクレジット表示など）を確認してください。

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
│   │   ├── index.tsx         # スキャン
│   │   ├── use.tsx           # 単純利用モード
│   │   ├── products.tsx      # 在庫一覧
│   │   └── history.tsx       # 入出庫履歴
│   ├── product/[id].tsx      # 商品詳細
│   ├── product/edit.tsx      # 商品登録・編集
│   └── adjust/[id].tsx       # 入庫・出庫・棚卸
├── components/               # 再利用部品（スキャナー・行表示・UI 部品）
├── db/
│   ├── database.ts           # SQLite スキーマと読み書き
│   └── events.ts             # データ変更の通知
├── lib/
│   ├── inventory.ts          # 在庫計算・入力チェック（＋テスト）
│   ├── csv.ts                # CSV 生成（＋テスト）
│   ├── jan.ts                # JAN 検証・候補の整形（＋テスト）
│   ├── product-lookup.ts     # JAN から商品名・メーカーを検索
│   ├── share.ts              # CSV ファイルの書き出し・共有
│   └── haptics.ts            # 触覚フィードバック
└── constants/theme.ts        # 色
```

## 今後の拡張アイデア

- クラウド同期（Supabase / Firebase など）で複数端末・複数人で在庫を共有
- 商品写真の登録
- CSV インポートによる商品マスタの一括登録
- 在庫少のプッシュ通知

## ライセンス

[MIT License](./LICENSE) のもとで公開しています。自由に利用・改変・再配布できますが、無保証です。

商品候補の検索に使う外部サービス（Open Food Facts、Yahoo!ショッピング 商品検索API）のデータは、
それぞれの利用規約に従ってください。

