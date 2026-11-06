// アプリの公開情報（App Store 審査ガイドライン 1.5・5.1.1(i) で求められる連絡先とプライバシーポリシー）

export const APP_NAME = '在庫スキャナ';

/**
 * お問い合わせ先のメールアドレス。
 * ★ 仮の値です。公開前に正式なアドレスに差し替えてください。
 *   同じアドレスを web/public/privacy.html と web/public/support.html にも書く必要があります
 *   （食い違うとテスト shared/app-info.test.ts が失敗して知らせます）。
 */
export const CONTACT_EMAIL = 'support@example.com';

/** 連絡先がまだ仮の値か */
export const isContactPlaceholder = CONTACT_EMAIL.endsWith('@example.com');

/** 公開している Web 版の URL（GitHub Pages） */
export const PUBLIC_SITE_URL = 'https://yifankaz57.github.io/StockMgmtApp/';

/** プライバシーポリシー（App Store Connect の「プライバシーポリシー URL」にも登録する） */
export const PRIVACY_POLICY_URL = `${PUBLIC_SITE_URL}privacy.html`;

/** サポート（お問い合わせ）ページ（App Store Connect の「サポート URL」に登録する） */
export const SUPPORT_URL = `${PUBLIC_SITE_URL}support.html`;
