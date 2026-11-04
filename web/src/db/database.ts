import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import {
  calculateStock,
  InventoryError,
  normalizeProductInput,
  startOfLocalDayIso,
  type Product,
  type ProductInput,
  type StockTransaction,
  type TransactionKind,
} from '@shared/inventory'
import { notifyDataChanged } from './events'

// ブラウザ内の IndexedDB に保存する（端末・ブラウザごとのデータ）

type StoredTransaction = Omit<StockTransaction, 'productName' | 'productBarcode'>

interface StockDB extends DBSchema {
  products: {
    key: number
    value: Product
    indexes: { barcode: string }
  }
  transactions: {
    key: number
    value: StoredTransaction
    indexes: { productId: number; createdAt: string }
  }
}

export const DATABASE_NAME = 'stock-scan'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<StockDB>> | null = null

export function getDb(): Promise<IDBPDatabase<StockDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StockDB>(DATABASE_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const products = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true })
          products.createIndex('barcode', 'barcode', { unique: true })
          const transactions = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true })
          transactions.createIndex('productId', 'productId')
          transactions.createIndex('createdAt', 'createdAt')
        }
      },
    })
  }
  return dbPromise
}

/** テスト用: 接続を閉じて次回開き直す */
export async function resetDbConnection(): Promise<void> {
  if (dbPromise) (await dbPromise).close()
  dbPromise = null
}

const nowIso = () => new Date().toISOString()

function isConstraintError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'ConstraintError'
}

const duplicateBarcode = () => new InventoryError('duplicateBarcode', 'このバーコードは既に登録されています。')

// ---------- 商品 ----------

export async function listProducts(): Promise<Product[]> {
  const db = await getDb()
  const products = await db.getAll('products')
  return products.sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.id - b.id)
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDb()
  return (await db.get('products', id)) ?? null
}

export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  const db = await getDb()
  return (await db.getFromIndex('products', 'barcode', barcode.trim())) ?? null
}

/** 商品を登録する。initialQuantity > 0 なら「初期登録」の履歴も作る */
export async function createProduct(input: ProductInput, initialQuantity: number): Promise<Product> {
  const data = normalizeProductInput(input)
  const quantity = initialQuantity > 0 ? calculateStock(0, 'initial', initialQuantity).newQuantity : 0
  const now = nowIso()
  const db = await getDb()
  const tx = db.transaction(['products', 'transactions'], 'readwrite')
  try {
    const record = { ...data, quantity, createdAt: now, updatedAt: now } as Omit<Product, 'id'>
    const id = await tx.objectStore('products').add(record as Product)
    if (quantity > 0) {
      await tx.objectStore('transactions').add({
        productId: id,
        kind: 'initial',
        delta: quantity,
        quantityAfter: quantity,
        note: '',
        createdAt: now,
      } as StoredTransaction)
    }
    await tx.done
    notifyDataChanged()
    return { ...record, id }
  } catch (error) {
    await tx.done.catch(() => {})
    if (isConstraintError(error)) throw duplicateBarcode()
    throw error
  }
}

export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  const data = normalizeProductInput(input)
  const db = await getDb()
  const tx = db.transaction('products', 'readwrite')
  try {
    const current = await tx.store.get(id)
    if (!current) throw new InventoryError('notFound', '商品が見つかりません。')
    await tx.store.put({ ...current, ...data, updatedAt: nowIso() })
    await tx.done
  } catch (error) {
    await tx.done.catch(() => {})
    if (isConstraintError(error)) throw duplicateBarcode()
    throw error
  }
  notifyDataChanged()
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['products', 'transactions'], 'readwrite')
  await tx.objectStore('products').delete(id)
  let cursor = await tx.objectStore('transactions').index('productId').openCursor(id)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
  notifyDataChanged()
}

// ---------- 在庫操作 ----------

/** 入庫・出庫・棚卸・利用を行い、履歴を記録する。更新後の商品を返す */
export async function applyStockChange(
  productId: number,
  kind: TransactionKind,
  amount: number,
  note = '',
): Promise<Product> {
  const db = await getDb()
  const tx = db.transaction(['products', 'transactions'], 'readwrite')
  try {
    const product = await tx.objectStore('products').get(productId)
    if (!product) throw new InventoryError('notFound', '商品が見つかりません。')
    const { newQuantity, delta } = calculateStock(product.quantity, kind, amount)
    const now = nowIso()
    const updated: Product = { ...product, quantity: newQuantity, updatedAt: now }
    await tx.objectStore('products').put(updated)
    await tx.objectStore('transactions').add({
      productId,
      kind,
      delta,
      quantityAfter: newQuantity,
      note: note.trim(),
      createdAt: now,
    } as StoredTransaction)
    await tx.done
    notifyDataChanged()
    return updated
  } catch (error) {
    try {
      tx.abort()
    } catch {
      // すでに完了・中断済み
    }
    await tx.done.catch(() => {})
    throw error
  }
}

// ---------- 履歴 ----------

export async function listTransactions(
  options: { productId?: number; kind?: TransactionKind; limit?: number } = {},
): Promise<StockTransaction[]> {
  const db = await getDb()
  const tx = db.transaction(['products', 'transactions'], 'readonly')
  const stored =
    options.productId !== undefined
      ? await tx.objectStore('transactions').index('productId').getAll(options.productId)
      : await tx.objectStore('transactions').getAll()
  const products = new Map((await tx.objectStore('products').getAll()).map((p) => [p.id, p]))
  await tx.done

  const result = stored
    .filter((t) => !options.kind || t.kind === options.kind)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .slice(0, options.limit ?? Infinity)
    .map((t) => ({
      ...t,
      productName: products.get(t.productId)?.name ?? '(削除された商品)',
      productBarcode: products.get(t.productId)?.barcode ?? '',
    }))
  return result
}

// ---------- 単純利用 ----------

/** 今日（端末のローカル日付）この商品を「利用」で何個使ったか */
export async function countUsageToday(productId: number, now: Date = new Date()): Promise<number> {
  const db = await getDb()
  const since = startOfLocalDayIso(now)
  const items = await db.getAllFromIndex('transactions', 'productId', productId)
  return items.filter((t) => t.kind === 'use' && t.createdAt >= since).reduce((sum, t) => sum - t.delta, 0)
}
