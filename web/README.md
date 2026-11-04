# 在庫スキャン（Web 版）

iPhone の Safari などで **URL を開くだけで使える** バーコード在庫管理アプリです（PWA）。
App Store を経由せずに配布でき、ホーム画面に追加すればアプリのように全画面で使えます。

公開 URL（GitHub Pages）: https://yifankaz57.github.io/StockMgmtApp/

## 機能

Expo 版（リポジトリ直下）をもとにしていますが、スキャン画面は Web 版だけ「スキャン＝利用」に統合しています。

- スキャン（手入力も可）:
  - 商品マスタにないバーコード → 新規登録画面を開く
  - 登録済みの商品 → 在庫を 1 個消費（履歴は「利用」）。同じ商品の1日2個目以降は大きな確認画面
  - 結果のメッセージ（消費しました・在庫がありません など）は数秒でだんだん消える
  - 「利用不可」に設定した商品 → 在庫を消費せず、その旨のエラーを表示
- 利用可能／利用不可: 在庫一覧の各行の左のアイコン（緑のチェック＝利用可能、赤の禁止マーク＝利用不可）をタップで切り替え。商品の詳細画面でも切り替え可能
- 入庫・出庫・棚卸は、在庫一覧から商品を開いて行う
- 商品管理（メーカー・商品名・色番号・容量・仕入れ値・保管場所・最低在庫数・メモ）
- 在庫金額（仕入れ値 × 在庫数）の表示
- 在庫一覧の並べ替え: 名前順 / 消費量の多い順（今期の消費量＝スキャンでの消費＋手動の出庫。並び順は端末に記憶）
- 設定タブ: 消費量を数え直す日（毎月何日か。既定 1日。29〜31日はその日がない月は月末）
- JAN コードからの候補表示（Open Food Facts）、Web 検索ボタン
- 在庫少アラート、入出庫履歴、CSV 出力（UTF-8 BOM 付き）

在庫計算・CSV・JAN 処理は Expo 版と同じコード（リポジトリ直下の `shared/`）を共有しています。

## iPhone での使い方

1. Safari で公開 URL を開く
2. 共有ボタン →「ホーム画面に追加」（推奨）
3. ホーム画面のアイコンから開き、カメラの使用を「許可」

> **データの保存場所について**
> データはその iPhone のブラウザ内（IndexedDB）に保存され、端末間では共有されません。
> Safari は「ホーム画面に追加していないサイト」のデータを、しばらく使わないと削除することがあります。
> 業務で使う場合は **必ずホーム画面に追加** し、定期的に CSV 出力でバックアップを取ってください。

## 開発

```bash
cd web
npm ci
npm run dev        # http://localhost:5173 （PC のブラウザで確認）
npm test           # データ層のテスト（Vitest + fake-indexeddb）
npm run lint
npm run build      # dist/ に出力
```

- カメラは **https または localhost** でしか使えません。iPhone 実機で開発中の画面を試す場合は、GitHub Pages に公開して確認するのが簡単です。
- `main` ブランチに push すると、GitHub Actions（`.github/workflows/deploy-web.yml`）が自動でビルドして GitHub Pages に公開します。

## 技術構成

- Vite + React + TypeScript
- バーコード読み取り: [barcode-detector](https://github.com/Sec-ant/barcode-detector)（ZXing の WebAssembly 版。iPhone の Safari でも動作）
- 保存: IndexedDB（[idb](https://github.com/jakearchibald/idb)）
- オフライン対応: [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)（Service Worker）
