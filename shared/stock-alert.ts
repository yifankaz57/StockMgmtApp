// 在庫の色分け（設定タブ）: 在庫数が設定した数を下回った商品の、在庫一覧での背景色。
// 2段階（注意・警告）。数が未設定の段階は使わない。初期設定はどちらも未設定（色分けしない）。

export type StockAlertLevelKey = 'caution' | 'warning';

export type StockAlertLevel = {
  /** この数「未満」になったら色を付ける。null なら使わない */
  threshold: number | null;
  /** 背景色（#RRGGBB） */
  color: string;
};

export type StockAlertSettings = Record<StockAlertLevelKey, StockAlertLevel>;

export const STOCK_ALERT_LABELS: Record<StockAlertLevelKey, string> = { caution: '注意', warning: '警告' };

/** 選べる色（明るい色にして、文字が読みやすいままにする） */
export const STOCK_ALERT_PALETTE: { color: string; name: string }[] = [
  { color: '#FFF4CC', name: '黄' },
  { color: '#FFE4CC', name: '橙' },
  { color: '#FDE2E1', name: '赤' },
  { color: '#FCE4EC', name: '桃' },
  { color: '#EDE7F6', name: '紫' },
  { color: '#E3F2FD', name: '青' },
  { color: '#E8F5E9', name: '緑' },
  { color: '#ECEFF1', name: '灰' },
];

/** 既定の色: 注意は薄い黄色、警告は薄い赤 */
export const DEFAULT_STOCK_ALERTS: StockAlertSettings = {
  caution: { threshold: null, color: '#FFF4CC' },
  warning: { threshold: null, color: '#FDE2E1' },
};

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const MAX_THRESHOLD = 1_000_000;

function normalizeLevel(value: unknown, fallback: StockAlertLevel): StockAlertLevel {
  const v = (value ?? {}) as { threshold?: unknown; color?: unknown };
  const threshold =
    typeof v.threshold === 'number' && Number.isInteger(v.threshold) && v.threshold >= 1 && v.threshold <= MAX_THRESHOLD ? v.threshold : null;
  const color = typeof v.color === 'string' && COLOR_RE.test(v.color) ? v.color.toUpperCase() : fallback.color;
  return { threshold, color };
}

/** 保存されていた値（JSON など）を読み直す。壊れていれば既定値 */
export function normalizeStockAlerts(value: unknown): StockAlertSettings {
  const v = (value ?? {}) as Partial<Record<StockAlertLevelKey, unknown>>;
  return {
    caution: normalizeLevel(v.caution, DEFAULT_STOCK_ALERTS.caution),
    warning: normalizeLevel(v.warning, DEFAULT_STOCK_ALERTS.warning),
  };
}

/** 設定の矛盾を確認する。問題があればメッセージ、なければ null */
export function validateStockAlerts(settings: StockAlertSettings): string | null {
  const { caution, warning } = settings;
  if (caution.threshold !== null && warning.threshold !== null && warning.threshold >= caution.threshold) {
    return `「警告」の数（${warning.threshold}）は「注意」の数（${caution.threshold}）より小さくしてください。`;
  }
  return null;
}

/** 在庫数に当てはまる段階（警告を優先）。どれにも当てはまらなければ null */
export function stockAlertLevel(quantity: number, settings: StockAlertSettings): StockAlertLevelKey | null {
  for (const key of ['warning', 'caution'] as const) {
    const { threshold } = settings[key];
    if (threshold !== null && quantity < threshold) return key;
  }
  return null;
}

/** 在庫一覧の行の背景色（当てはまらなければ null） */
export function stockAlertColor(quantity: number, settings: StockAlertSettings): string | null {
  const level = stockAlertLevel(quantity, settings);
  return level ? settings[level].color : null;
}
