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
  /** 1個あたりの仕入れ値（円）。未登録なら null */
  purchasePrice: number | null;
  quantity: number;
  /** 利用可能か。false の商品はスキャンしても消費しない（エラーにする） */
  available: boolean;
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
  /** 1個あたりの仕入れ値（円）。未登録なら null */
  purchasePrice: number | null;
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
  | 'invalidPrice'
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
  const price = input.purchasePrice;
  if (price !== null && !(Number.isFinite(price) && price >= 0 && price <= MAX_PRICE)) {
    throw new InventoryError('invalidPrice', PRICE_ERROR_MESSAGE);
  }
  return {
    barcode,
    name,
    manufacturer: input.manufacturer.trim(),
    shade: input.shade.trim(),
    volume: input.volume.trim(),
    purchasePrice: price === null ? null : roundPrice(price),
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

// ---------- 仕入れ値 ----------

/** 仕入れ値の上限（入力ミス防止。1億円） */
export const MAX_PRICE = 100_000_000;

export const PRICE_ERROR_MESSAGE = '仕入れ値は0以上の数値（小数は2桁まで）で入力してください。';

/** 小数第2位で丸める（浮動小数点の誤差対策） */
function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 仕入れ値の入力欄の文字列を数値に変換する。
 * 全角数字、桁区切りのカンマ、「¥」「円」を許可する。空欄なら null（未登録）。
 * 不正な入力なら undefined。
 */
export function parsePrice(text: string): number | null | undefined {
  const normalized = text
    .trim()
    .replace(/[０-９．，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/^[¥￥]\s*/, '')
    .replace(/\s*円$/, '')
    .replace(/,/g, '');
  if (normalized === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const value = Number(normalized);
  return value <= MAX_PRICE ? value : undefined;
}

/** 金額を「¥1,234」形式にする（小数は必要なときだけ最大2桁） */
export function formatYen(value: number): string {
  const [int, frac] = roundPrice(value).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === '00' ? `¥${grouped}` : `¥${grouped}.${frac.replace(/0$/, '')}`;
}

/** 在庫金額（仕入れ値 × 在庫数）。仕入れ値が未登録なら null */
export function stockValue(product: Pick<Product, 'purchasePrice' | 'quantity'>): number | null {
  return product.purchasePrice === null ? null : roundPrice(product.purchasePrice * product.quantity);
}

/** 仕入れ値が登録されている商品の在庫金額の合計と、未登録の商品数 */
export function totalStockValue(products: Pick<Product, 'purchasePrice' | 'quantity'>[]): { total: number; unpricedCount: number } {
  let total = 0;
  let unpricedCount = 0;
  for (const p of products) {
    const value = stockValue(p);
    if (value === null) unpricedCount += 1;
    else total += value;
  }
  return { total: roundPrice(total), unpricedCount };
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

// ---------- 消費量（スキャンでの消費「利用」と手動の「出庫」で減らした個数） ----------

/** 消費量を数え直す日（毎月何日か）の既定値 */
export const DEFAULT_USAGE_RESET_DAY = 1;

/** 設定値を 1〜31 の整数にする（不正なら既定値） */
export function normalizeResetDay(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31 ? value : DEFAULT_USAGE_RESET_DAY;
}

/** year 年 month 月（0始まり。範囲外は前後の年に繰り越し）のリセット日。その日がない月は月末 */
function resetDateOf(year: number, month: number, resetDay: number): Date {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(resetDay, daysInMonth));
}

/**
 * 現在の消費量の集計期間（端末のローカル時刻）。
 * start: 直近のリセット日の0時、end: 次のリセット日の0時（この時刻は含まない）
 */
export function usagePeriod(resetDay: number, now: Date = new Date()): { start: Date; end: Date } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const thisMonth = resetDateOf(y, m, resetDay);
  const startMonth = now >= thisMonth ? m : m - 1;
  return { start: resetDateOf(y, startMonth, resetDay), end: resetDateOf(y, startMonth + 1, resetDay) };
}

/** 「11/1〜11/30」形式（end は含まないので前日まで） */
export function formatUsagePeriod(period: { start: Date; end: Date }): string {
  const last = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() - 1);
  const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${md(period.start)}〜${md(last)}`;
}

/** 消費量に数える操作（スキャンでの消費と手動の出庫。棚卸での増減は含めない） */
export const CONSUMPTION_KINDS: readonly TransactionKind[] = ['use', 'stockOut'];

/** 商品ごとの消費量（利用・出庫の減少数の合計）。sinceIso 以降だけを数える（null なら全期間） */
export function sumUsageByProduct(
  transactions: Pick<StockTransaction, 'productId' | 'kind' | 'delta' | 'createdAt'>[],
  sinceIso: string | null,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const t of transactions) {
    if (!CONSUMPTION_KINDS.includes(t.kind) || (sinceIso !== null && t.createdAt < sinceIso)) continue;
    totals.set(t.productId, (totals.get(t.productId) ?? 0) - t.delta);
  }
  return totals;
}

/** 消費量の多い順（同数なら商品名順）に並べた新しい配列を返す */
export function sortByUsage<T extends Pick<Product, 'id' | 'name'>>(products: T[], usage: Map<number, number>): T[] {
  return [...products].sort(
    (a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'ja') || a.id - b.id,
  );
}
