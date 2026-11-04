# StockMgmtApp（在庫スキャン）

iPhone のカメラで商品のバーコードを読み取り、商品ごとの在庫数を管理する iOS アプリです。
SwiftUI + SwiftData + VisionKit で作られており、外部ライブラリやサーバーは不要です（データは端末内に保存）。

## 主な機能

| 機能 | 内容 |
| --- | --- |
| バーコードスキャン | JAN/EAN・UPC・Code128・QR など主要なバーコードを読み取り（VisionKit `DataScannerViewController`） |
| 照会・操作モード | 読み取った商品の **入庫 / 出庫 / 棚卸** を数量指定で実行。未登録のバーコードは登録画面へ |
| 連続入庫 / 連続出庫モード | 読み取るたびに在庫を自動で ±1（大量の入荷・出荷作業向け） |
| 商品管理 | 商品名・保管場所・最低在庫数・メモを登録/編集/削除 |
| 在庫少アラート | 最低在庫数以下の商品をオレンジ色で強調し、一覧で絞り込み可能 |
| 入出庫履歴 | すべての在庫変動を日付ごとに表示（種別で絞り込み可） |
| CSV 出力 | 在庫一覧・入出庫履歴を CSV（Excel で開ける UTF-8 BOM 付き）で共有 |
| 手入力 | カメラが使えない場合もバーコードを手入力して操作可能 |

## 動作環境

- iOS 17.0 以降
- カメラでのスキャンには A12 Bionic 以降の iPhone（iPhone XS / XR 以降）が必要
- 開発には **Xcode 16 以降**（Mac）が必要

## ビルド・実機へのインストール手順

1. Mac で `StockMgmtApp.xcodeproj` を Xcode で開く
2. 左のナビゲータで `StockMgmtApp` プロジェクト → TARGETS `StockMgmtApp` → **Signing & Capabilities** を開く
3. **Team** に自分の Apple ID（無料の Personal Team で可）を選択
   - 必要に応じて **Bundle Identifier**（初期値 `com.example.StockMgmtApp`）を自分固有の値に変更
4. iPhone を USB またはWi-Fiで接続し、実行先に iPhone を選んで ▶︎（Run）
5. 初回は iPhone の「設定 → 一般 → VPNとデバイス管理」で開発者を信頼し、iOS 16 以降は「設定 → プライバシーとセキュリティ → デベロッパモード」をオンにする

> シミュレーターではカメラが使えないため、スキャン画面右上の「手入力」で動作を確認できます。

## 使い方

1. **スキャン** タブでバーコードにカメラを向ける
2. 未登録の商品なら登録画面が開くので、商品名・初期在庫数などを入力して保存
3. 登録済みの商品なら操作シートが開くので、入庫/出庫/棚卸 と数量を選んで「確定」
4. 大量に処理する場合は上部のモードを「連続入庫 +1」「連続出庫 −1」に切り替えて次々スキャン
5. **在庫一覧** タブで在庫数の確認・検索・CSV 出力、**履歴** タブで入出庫履歴を確認

## プロジェクト構成

```
StockMgmtApp/
├── App/StockMgmtApp.swift          # エントリポイント（SwiftData コンテナ設定）
├── Models/
│   ├── Product.swift               # 商品モデル（バーコードで一意）
│   ├── StockTransaction.swift      # 入出庫履歴モデル
│   └── Inventory.swift             # 在庫計算ロジック・エラー定義
├── Scanner/
│   ├── BarcodeScannerView.swift    # VisionKit スキャナーの SwiftUI ラッパー
│   └── CameraPermission.swift      # カメラ権限
├── Views/
│   ├── ContentView.swift           # タブ構成
│   ├── ScanView.swift              # スキャン画面
│   ├── ProductListView.swift       # 在庫一覧
│   ├── ProductDetailView.swift     # 商品詳細・履歴
│   ├── ProductEditView.swift       # 商品登録・編集
│   ├── StockAdjustView.swift       # 入庫・出庫・棚卸シート
│   └── HistoryView.swift           # 入出庫履歴
└── Utilities/                      # CSV 出力・触覚フィードバック・プレビュー用データ
```

`StockMgmtApp/` フォルダは Xcode の「同期フォルダ」として登録されているため、Finder や Xcode でファイルを追加するだけで自動的にビルド対象になります。

## 今後の拡張アイデア

- iCloud（CloudKit）同期で複数端末・複数人で在庫を共有
- 商品写真の登録
- CSV インポートによる商品マスタの一括登録
- 在庫少のプッシュ通知
