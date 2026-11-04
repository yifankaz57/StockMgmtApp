/// <reference types="node" />

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  calculateStock,
  InventoryError,
  isLowStock,
  normalizeProductInput,
  parseQuantity,
} from './inventory.ts';

describe('calculateStock', () => {
  it('入庫で在庫が増える', () => {
    assert.deepEqual(calculateStock(5, 'stockIn', 3), { newQuantity: 8, delta: 3 });
  });

  it('出庫で在庫が減る', () => {
    assert.deepEqual(calculateStock(5, 'stockOut', 5), { newQuantity: 0, delta: -5 });
  });

  it('在庫を超える出庫はエラー', () => {
    assert.throws(
      () => calculateStock(2, 'stockOut', 3),
      (e: unknown) => e instanceof InventoryError && e.code === 'insufficientStock',
    );
  });

  it('入庫・出庫の数量0や負数はエラー', () => {
    for (const kind of ['stockIn', 'stockOut', 'initial'] as const) {
      assert.throws(() => calculateStock(10, kind, 0), InventoryError);
      assert.throws(() => calculateStock(10, kind, -1), InventoryError);
    }
  });

  it('小数はエラー', () => {
    assert.throws(() => calculateStock(10, 'stockIn', 1.5), InventoryError);
  });

  it('棚卸は実在庫数に置き換え、差分を記録', () => {
    assert.deepEqual(calculateStock(10, 'adjustment', 7), { newQuantity: 7, delta: -3 });
    assert.deepEqual(calculateStock(10, 'adjustment', 12), { newQuantity: 12, delta: 2 });
    assert.deepEqual(calculateStock(10, 'adjustment', 0), { newQuantity: 0, delta: -10 });
  });
});

describe('isLowStock', () => {
  it('最低在庫数以下で在庫少', () => {
    assert.equal(isLowStock({ quantity: 3, minQuantity: 3 }), true);
    assert.equal(isLowStock({ quantity: 4, minQuantity: 3 }), false);
  });

  it('最低在庫数0なら警告しない', () => {
    assert.equal(isLowStock({ quantity: 0, minQuantity: 0 }), false);
  });
});

describe('normalizeProductInput', () => {
  it('前後の空白を除去し、最低在庫数を0以上の整数にする', () => {
    assert.deepEqual(
      normalizeProductInput({ barcode: ' 4901234567894 ', name: ' ペン ', minQuantity: -2, location: ' 棚A ', note: '' }),
      { barcode: '4901234567894', name: 'ペン', minQuantity: 0, location: '棚A', note: '' },
    );
  });

  it('バーコード・商品名が空ならエラー', () => {
    const base = { barcode: '1', name: 'a', minQuantity: 0, location: '', note: '' };
    assert.throws(() => normalizeProductInput({ ...base, barcode: '  ' }), (e: unknown) => e instanceof InventoryError && e.code === 'emptyBarcode');
    assert.throws(() => normalizeProductInput({ ...base, name: '' }), (e: unknown) => e instanceof InventoryError && e.code === 'emptyName');
  });
});

describe('parseQuantity', () => {
  it('半角・全角数字を数値に変換', () => {
    assert.equal(parseQuantity('12'), 12);
    assert.equal(parseQuantity('１２'), 12);
    assert.equal(parseQuantity(' 0 '), 0);
  });

  it('数字以外は null', () => {
    assert.equal(parseQuantity(''), null);
    assert.equal(parseQuantity('-1'), null);
    assert.equal(parseQuantity('1.5'), null);
    assert.equal(parseQuantity('abc'), null);
  });
});
