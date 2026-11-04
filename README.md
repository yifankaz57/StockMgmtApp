# StockMgmtApp（在庫スキャン）

iPhone のカメラで商品のバーコードを読み取り、商品ごとの在庫数を管理するアプリです。
**Expo（React Native + TypeScript）** で作られているため、**Windows だけで開発・実機確認・ビルド**ができます（Mac 不要）。
データは端末内の SQLite に保存され、サーバーは不要です。同じコードで Android でも動きます。

## 主な機能

| 機能 | 内容 |
| --- | --- |
| バーコードスキャン | JAN/EAN・UPC・Code128/39/93・ITF・QR などを読み取り（`expo-camera`） |
| 照会・操作モード | 読み取った商品の **入庫 / 出庫 / 棚卸** を数量指定で実行。未登録のバーコードは登録画面へ |
| 連続入庫 / 連続出庫モード | 読み取るたびに在庫を自動で ±1（大量の入荷・出荷作業向け） |
| 商品管理 | 商品名・保管場所・最低在庫数・メモを登録 / 編集 / 削除 |
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
│   ├── share.ts              # CSV ファイルの書き出し・共有
│   └── haptics.ts            # 触覚フィードバック
└── constants/theme.ts        # 色
```

## 今後の拡張アイデア

- クラウド同期（Supabase / Firebase など）で複数端末・複数人で在庫を共有
- 商品写真の登録
- CSV インポートによる商品マスタの一括登録
- 在庫少のプッシュ通知
