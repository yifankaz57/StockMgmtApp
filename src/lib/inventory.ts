// 在庫管理のドメインロジック（UI・DB から独立した純粋関数）

/** use = 単純利用モードでの使用（1個ずつ減らす。出庫とは別に集計する） */
export type TransactionKind = 'initial' | 'stockIn' | 'stockOut' | 'adjustment' | 'use';

export const KIND_LABELS: Record<TransactionKind, string> = {
  initial: '初期登録',
  stockIn: '入庫',
  stockOut: '出庫',
  adjustment: '棚卸',
  use: '利用',
};

/** 画面から選べる操作 */
export const SELECTABLE_KINDS: TransactionKind[] = ['stockIn', 'stockOut', 'adjustment'];

export function isTransactionKind(value: unknown): value is TransactionKind {
  return value === 'initial' || value === 'stockIn' || value === 'stockOut' || value === 'adjustment' || value === 'use';
}

export type Product = {
  id: number;
  barcode: string;
  name: string;
  /** メーカー（任意） */
  manufacturer: string;
  /** 色番号（例: 8-NB）。任意 */
  shade: string;
  /** 容量（例: 80g, 1000ml）。任意 */
  volume: string;
  quantity: number;
  /** この数量以下で「在庫少」。0 なら警告しない */
  minQuantity: number;
  location: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type StockTransaction = {
  id: number;
  productId: number;
  productName: string;
  productBarcode: string;
  kind: TransactionKind;
  /** 増減量（入庫は正、出庫は負） */
  delta: number;
  quantityAfter: number;
  note: string;
  createdAt: string;
};

export type ProductInput = {
  barcode: string;
  name: string;
  manufacturer: string;
  shade: string;
  volume: string;
  minQuantity: number;
  location: string;
  note: string;
};

export type InventoryErrorCode =
  | 'invalidAmount'
  | 'insufficientStock'
  | 'duplicateBarcode'
  | 'emptyBarcode'
  | 'emptyName'
  | 'notFound';

export class InventoryError extends Error {
  readonly code: InventoryErrorCode;

  constructor(code: InventoryErrorCode, message: string) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
  }
}

export function isLowStock(product: Pick<Product, 'quantity' | 'minQuantity'>): boolean {
  return product.minQuantity > 0 && product.quantity <= product.minQuantity;
}

/**
 * 在庫操作後の数量と増減量を計算する。
 * @param amount 入庫/出庫では移動数量、棚卸では実在庫数
 */
export function calculateStock(
  current: number,
  kind: TransactionKind,
  amount: number,
): { newQuantity: number; delta: number } {
  if (!Number.isInteger(amount)) {
    throw new InventoryError('invalidAmount', '数量は整数で入力してください。');
  }
  switch (kind) {
    case 'initial':
    case 'stockIn':
      if (amount <= 0) throw new InventoryError('invalidAmount', '数量は1以上を指定してください。');
      return { newQuantity: current + amount, delta: amount };
    case 'stockOut':
    case 'use':
      if (amount <= 0) throw new InventoryError('invalidAmount', '数量は1以上を指定してください。');
      if (amount > current) {
        throw new InventoryError('insufficientStock', `在庫が不足しています（現在の在庫: ${current}）。`);
      }
      return { newQuantity: current - amount, delta: -amount };
    case 'adjustment':
      if (amount < 0) throw new InventoryError('invalidAmount', '実在庫数は0以上を指定してください。');
      return { newQuantity: amount, delta: amount - current };
  }
}

/** 入力値を正規化し、不正なら InventoryError を投げる */
export function normalizeProductInput(input: ProductInput): ProductInput {
  const barcode = input.barcode.trim();
  const name = input.name.trim();
  if (!barcode) throw new InventoryError('emptyBarcode', 'バーコードを入力してください。');
  if (!name) throw new InventoryError('emptyName', '商品名を入力してください。');
  return {
    barcode,
    name,
    manufacturer: input.manufacturer.trim(),
    shade: input.shade.trim(),
    volume: input.volume.trim(),
    minQuantity: Math.max(0, Math.floor(Number.isFinite(input.minQuantity) ? input.minQuantity : 0)),
    location: input.location.trim(),
    note: input.note.trim(),
  };
}

/** 数量入力欄の文字列を数値に変換（全角数字も許可）。不正なら null */
export function parseQuantity(text: string): number | null {
  const halfWidth = text
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!/^\d+$/.test(halfWidth)) return null;
  const value = Number(halfWidth);
  return Number.isSafeInteger(value) ? value : null;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** 一覧などで使う「色番号 / 容量」の表示文字列（両方空なら空文字） */
export function formatShadeVolume(product: Pick<Product, 'shade' | 'volume'>): string {
  return [product.shade, product.volume].filter(Boolean).join(' / ');
}

/**
 * 単純利用モード: 同じ商品をこの個数目以降に使う場合は確認する
 * （2 → 1日の2個目から確認）
 */
export const USAGE_CONFIRM_FROM = 2;

/** 今日すでに usedToday 個使っているとき、次の1個の利用に確認が必要か */
export function needsUsageConfirmation(usedToday: number): boolean {
  return usedToday + 1 >= USAGE_CONFIRM_FROM;
}

/** 端末のローカル時刻での「今日の0時」を ISO 文字列（UTC）で返す。created_at との比較用 */
export function startOfLocalDayIso(now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}
