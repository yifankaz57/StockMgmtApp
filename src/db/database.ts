import type { SQLiteDatabase } from 'expo-sqlite';

import {
  calculateStock,
  startOfLocalDayIso,
  InventoryError,
  normalizeProductInput,
  type Product,
  type ProductInput,
  type StockTransaction,
  type TransactionKind,
} from '@/lib/inventory';
import { notifyDataChanged } from './events';

export const DATABASE_NAME = 'stock.db';

const SCHEMA_VERSION = 4;

/** SQLiteProvider の onInit から呼ばれる。スキーマを作成・移行する */
export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  if (current < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        min_quantity INTEGER NOT NULL DEFAULT 0,
        location TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stock_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        delta INTEGER NOT NULL,
        quantity_after INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_product ON stock_transactions(product_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_created ON stock_transactions(created_at);
    `);
  }
  if (current < 2) {
    // v2: メーカー列を追加（既存データは空文字）
    await db.execAsync(`ALTER TABLE products ADD COLUMN manufacturer TEXT NOT NULL DEFAULT ''`);
  }
  if (current < 3) {
    // v3: 色番号・容量列を追加
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN shade TEXT NOT NULL DEFAULT '';
      ALTER TABLE products ADD COLUMN volume TEXT NOT NULL DEFAULT '';
    `);
  }
  if (current < 4) {
    // v4: 仕入れ値（円）。NULL = 未登録
    await db.execAsync(`ALTER TABLE products ADD COLUMN purchase_price REAL`);
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

// ---------- 行 → モデル変換 ----------

type ProductRow = {
  id: number;
  barcode: string;
  name: string;
  manufacturer: string;
  shade: string;
  volume: string;
  purchase_price: number | null;
  quantity: number;
  min_quantity: number;
  location: string;
  note: string;
  created_at: string;
  updated_at: string;
};

type TransactionRow = {
  id: number;
  product_id: number;
  product_name: string;
  product_barcode: string;
  kind: TransactionKind;
  delta: number;
  quantity_after: number;
  note: string;
  created_at: string;
};

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    manufacturer: row.manufacturer,
    shade: row.shade,
    volume: row.volume,
    purchasePrice: row.purchase_price ?? null,
    quantity: row.quantity,
    // 利用可能／不可の切り替えは Web 版のみ。Expo 版では常に利用可能
    available: true,
    minQuantity: row.min_quantity,
    location: row.location,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTransaction(row: TransactionRow): StockTransaction {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productBarcode: row.product_barcode,
    kind: row.kind,
    delta: row.delta,
    quantityAfter: row.quantity_after,
    note: row.note,
    createdAt: row.created_at,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

const nowIso = () => new Date().toISOString();

// ---------- 商品 ----------

export async function listProducts(db: SQLiteDatabase): Promise<Product[]> {
  const rows = await db.getAllAsync<ProductRow>('SELECT * FROM products ORDER BY name COLLATE NOCASE, id');
  return rows.map(toProduct);
}

export async function getProduct(db: SQLiteDatabase, id: number): Promise<Product | null> {
  const row = await db.getFirstAsync<ProductRow>('SELECT * FROM products WHERE id = ?', id);
  return row ? toProduct(row) : null;
}

export async function findProductByBarcode(db: SQLiteDatabase, barcode: string): Promise<Product | null> {
  const row = await db.getFirstAsync<ProductRow>('SELECT * FROM products WHERE barcode = ?', barcode.trim());
  return row ? toProduct(row) : null;
}

/** 商品を登録する。initialQuantity > 0 なら「初期登録」の履歴も作る */
export async function createProduct(
  db: SQLiteDatabase,
  input: ProductInput,
  initialQuantity: number,
): Promise<Product> {
  const data = normalizeProductInput(input);
  const now = nowIso();
  let productId = 0;
  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      const result = await txn.runAsync(
        `INSERT INTO products (barcode, name, manufacturer, shade, volume, purchase_price, quantity, min_quantity, location, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        data.barcode, data.name, data.manufacturer, data.shade, data.volume, data.purchasePrice, data.minQuantity, data.location, data.note, now, now,
      );
      productId = result.lastInsertRowId;
      if (initialQuantity > 0) {
        const { newQuantity, delta } = calculateStock(0, 'initial', initialQuantity);
        await txn.runAsync('UPDATE products SET quantity = ? WHERE id = ?', newQuantity, productId);
        await txn.runAsync(
          `INSERT INTO stock_transactions (product_id, kind, delta, quantity_after, note, created_at)
           VALUES (?, 'initial', ?, ?, '', ?)`,
          productId, delta, newQuantity, now,
        );
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new InventoryError('duplicateBarcode', 'このバーコードは既に登録されています。');
    }
    throw error;
  }
  notifyDataChanged();
  const product = await getProduct(db, productId);
  if (!product) throw new InventoryError('notFound', '商品が見つかりません。');
  return product;
}

export async function updateProduct(db: SQLiteDatabase, id: number, input: ProductInput): Promise<void> {
  const data = normalizeProductInput(input);
  try {
    await db.runAsync(
      `UPDATE products SET barcode = ?, name = ?, manufacturer = ?, shade = ?, volume = ?, purchase_price = ?, min_quantity = ?, location = ?, note = ?, updated_at = ?
       WHERE id = ?`,
      data.barcode, data.name, data.manufacturer, data.shade, data.volume, data.purchasePrice, data.minQuantity, data.location, data.note, nowIso(), id,
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new InventoryError('duplicateBarcode', 'このバーコードは既に登録されています。');
    }
    throw error;
  }
  notifyDataChanged();
}

export async function deleteProduct(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM products WHERE id = ?', id);
  notifyDataChanged();
}

// ---------- 在庫操作 ----------

/** 入庫・出庫・棚卸を行い、履歴を記録する。更新後の商品を返す */
export async function applyStockChange(
  db: SQLiteDatabase,
  productId: number,
  kind: TransactionKind,
  amount: number,
  note = '',
): Promise<Product> {
  let updated: Product | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<ProductRow>('SELECT * FROM products WHERE id = ?', productId);
    if (!row) throw new InventoryError('notFound', '商品が見つかりません。');
    const { newQuantity, delta } = calculateStock(row.quantity, kind, amount);
    const now = nowIso();
    await txn.runAsync('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?', newQuantity, now, productId);
    await txn.runAsync(
      `INSERT INTO stock_transactions (product_id, kind, delta, quantity_after, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      productId, kind, delta, newQuantity, note.trim(), now,
    );
    updated = toProduct({ ...row, quantity: newQuantity, updated_at: now });
  });
  notifyDataChanged();
  if (!updated) throw new InventoryError('notFound', '商品が見つかりません。');
  return updated;
}

// ---------- 履歴 ----------

export async function listTransactions(
  db: SQLiteDatabase,
  options: { productId?: number; kind?: TransactionKind; limit?: number } = {},
): Promise<StockTransaction[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (options.productId !== undefined) {
    where.push('t.product_id = ?');
    params.push(options.productId);
  }
  if (options.kind) {
    where.push('t.kind = ?');
    params.push(options.kind);
  }
  const sql = `
    SELECT t.*, p.name AS product_name, p.barcode AS product_barcode
    FROM stock_transactions t
    JOIN products p ON p.id = t.product_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY t.created_at DESC, t.id DESC
    ${options.limit ? `LIMIT ${Math.floor(options.limit)}` : ''}`;
  const rows = await db.getAllAsync<TransactionRow>(sql, params);
  return rows.map(toTransaction);
}

// ---------- 単純利用 ----------

/** 今日（端末のローカル日付）この商品を「利用」で何個使ったか */
export async function countUsageToday(db: SQLiteDatabase, productId: number, now: Date = new Date()): Promise<number> {
  const row = await db.getFirstAsync<{ used: number | null }>(
    `SELECT SUM(-delta) AS used FROM stock_transactions
     WHERE product_id = ? AND kind = 'use' AND created_at >= ?`,
    productId,
    startOfLocalDayIso(now),
  );
  return row?.used ?? 0;
}
