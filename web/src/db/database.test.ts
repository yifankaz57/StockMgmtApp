import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import { InventoryError } from '@shared/inventory'
import {
  applyStockChange,
  countUsageToday,
  createProduct,
  DATABASE_NAME,
  deleteProduct,
  findProductByBarcode,
  getProduct,
  listProducts,
  listTransactions,
  resetDbConnection,
  updateProduct,
} from './database'

const input = (barcode: string, name: string) => ({
  barcode,
  name,
  manufacturer: 'メーカーA',
  shade: '8-NB',
  volume: '80g',
  minQuantity: 2,
  location: '棚A',
  note: '',
})

beforeEach(async () => {
  await resetDbConnection()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DATABASE_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
})

describe('IndexedDB リポジトリ', () => {
  it('商品を登録し、初期在庫の履歴を作る', async () => {
    const p = await createProduct(input(' 4571167058709 ', 'カラー'), 3)
    expect(p.quantity).toBe(3)
    expect((await findProductByBarcode('4571167058709'))?.name).toBe('カラー')
    const tx = await listTransactions({ productId: p.id })
    expect(tx).toHaveLength(1)
    expect(tx[0]).toMatchObject({ kind: 'initial', delta: 3, quantityAfter: 3, productName: 'カラー' })
  })

  it('同じバーコードの重複登録・変更はエラー', async () => {
    await createProduct(input('111', 'A'), 0)
    const b = await createProduct(input('222', 'B'), 0)
    await expect(createProduct(input('111', 'C'), 0)).rejects.toMatchObject({ code: 'duplicateBarcode' })
    await expect(updateProduct(b.id, input('111', 'B'))).rejects.toMatchObject({ code: 'duplicateBarcode' })
    expect(await listProducts()).toHaveLength(2)
  })

  it('入庫・出庫・棚卸で在庫と履歴が更新される', async () => {
    const p = await createProduct(input('333', 'C'), 5)
    expect((await applyStockChange(p.id, 'stockIn', 2)).quantity).toBe(7)
    expect((await applyStockChange(p.id, 'stockOut', 3)).quantity).toBe(4)
    expect((await applyStockChange(p.id, 'adjustment', 10)).quantity).toBe(10)
    const tx = await listTransactions({ productId: p.id })
    expect(tx.map((t) => t.delta)).toEqual([6, -3, 2, 5])
  })

  it('在庫不足の出庫は失敗し、何も変わらない', async () => {
    const p = await createProduct(input('444', 'D'), 1)
    await expect(applyStockChange(p.id, 'stockOut', 2)).rejects.toBeInstanceOf(InventoryError)
    expect((await getProduct(p.id))?.quantity).toBe(1)
    expect(await listTransactions({ productId: p.id })).toHaveLength(1)
  })

  it('今日の利用数は「利用」だけを数える', async () => {
    const p = await createProduct(input('555', 'E'), 10)
    expect(await countUsageToday(p.id)).toBe(0)
    await applyStockChange(p.id, 'use', 1)
    await applyStockChange(p.id, 'stockOut', 3)
    await applyStockChange(p.id, 'use', 1)
    expect(await countUsageToday(p.id)).toBe(2)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    expect(await countUsageToday(p.id, tomorrow)).toBe(0)
    expect((await listTransactions({ kind: 'use' })).length).toBe(2)
  })

  it('商品を削除すると履歴も消える', async () => {
    const p = await createProduct(input('666', 'F'), 2)
    await applyStockChange(p.id, 'use', 1)
    await deleteProduct(p.id)
    expect(await getProduct(p.id)).toBeNull()
    expect(await listTransactions()).toHaveLength(0)
  })
})
