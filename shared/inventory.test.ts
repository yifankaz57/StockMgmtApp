/// <reference types="node" />

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  calculateStock,
  formatShadeVolume,
  InventoryError,
  isLowStock,
  needsUsageConfirmation,
  startOfLocalDayIso,
  formatYen,
  normalizeProductInput,
  parsePrice,
  parseQuantity,
  stockValue,
  totalStockValue,
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
      normalizeProductInput({
        barcode: ' 4901234567894 ', name: ' ペン ', manufacturer: ' 文具メーカー ', shade: ' 8-NB ', volume: ' 80g ', purchasePrice: 1200.004, minQuantity: -2, location: ' 棚A ', note: '',
      }),
      { barcode: '4901234567894', name: 'ペン', manufacturer: '文具メーカー', shade: '8-NB', volume: '80g', purchasePrice: 1200, minQuantity: 0, location: '棚A', note: '' },
    );
  });

  it('バーコード・商品名が空ならエラー', () => {
    const base = { barcode: '1', name: 'a', manufacturer: '', shade: '', volume: '', purchasePrice: null, minQuantity: 0, location: '', note: '' };
    assert.throws(() => normalizeProductInput({ ...base, barcode: '  ' }), (e: unknown) => e instanceof InventoryError && e.code === 'emptyBarcode');
    assert.throws(() => normalizeProductInput({ ...base, name: '' }), (e: unknown) => e instanceof InventoryError && e.code === 'emptyName');
  });

  it('仕入れ値が負・非数ならエラー、null はそのまま', () => {
    const base = { barcode: '1', name: 'a', manufacturer: '', shade: '', volume: '', purchasePrice: null, minQuantity: 0, location: '', note: '' };
    assert.equal(normalizeProductInput(base).purchasePrice, null);
    for (const purchasePrice of [-1, Number.NaN, Infinity]) {
      assert.throws(() => normalizeProductInput({ ...base, purchasePrice }), (e: unknown) => e instanceof InventoryError && e.code === 'invalidPrice');
    }
  });
});

describe('parsePrice', () => {
  it('空欄は null（未登録）', () => {
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice('  '), null);
  });

  it('半角・全角・カンマ・円記号・小数2桁まで', () => {
    assert.equal(parsePrice('1200'), 1200);
    assert.equal(parsePrice('１，２００'), 1200);
    assert.equal(parsePrice('¥1,200'), 1200);
    assert.equal(parsePrice('1200円'), 1200);
    assert.equal(parsePrice('98.5'), 98.5);
    assert.equal(parsePrice('0'), 0);
  });

  it('不正な入力は undefined', () => {
    assert.equal(parsePrice('-5'), undefined);
    assert.equal(parsePrice('abc'), undefined);
    assert.equal(parsePrice('1.234'), undefined);
    assert.equal(parsePrice('1e3'), undefined);
    assert.equal(parsePrice('100000001'), undefined);
  });
});

describe('formatYen / stockValue', () => {
  it('3桁区切り、小数は必要なときだけ', () => {
    assert.equal(formatYen(0), '¥0');
    assert.equal(formatYen(1234567), '¥1,234,567');
    assert.equal(formatYen(98.5), '¥98.5');
    assert.equal(formatYen(98.25), '¥98.25');
  });

  it('在庫金額 = 仕入れ値 × 在庫数（未登録なら null）', () => {
    assert.equal(stockValue({ purchasePrice: 0.1, quantity: 3 }), 0.3);
    assert.equal(stockValue({ purchasePrice: null, quantity: 3 }), null);
  });

  it('合計は仕入れ値のある商品だけを足し、未登録の数を返す', () => {
    assert.deepEqual(
      totalStockValue([
        { purchasePrice: 1000, quantity: 2 },
        { purchasePrice: null, quantity: 5 },
        { purchasePrice: 250, quantity: 0 },
      ]),
      { total: 2000, unpricedCount: 1 },
    );
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

describe('formatShadeVolume', () => {
  it('色番号と容量をつなぐ（空は省略）', () => {
    assert.equal(formatShadeVolume({ shade: '8-NB', volume: '80g' }), '8-NB / 80g');
    assert.equal(formatShadeVolume({ shade: '', volume: '80g' }), '80g');
    assert.equal(formatShadeVolume({ shade: '', volume: '' }), '');
  });
});

describe('単純利用', () => {
  it('利用は出庫と同じく1個ずつ減り、在庫0では使えない', () => {
    assert.deepEqual(calculateStock(3, 'use', 1), { newQuantity: 2, delta: -1 });
    assert.throws(
      () => calculateStock(0, 'use', 1),
      (e: unknown) => e instanceof InventoryError && e.code === 'insufficientStock',
    );
  });

  it('1日の1個目は確認なし、2個目以降は確認する', () => {
    assert.equal(needsUsageConfirmation(0), false);
    assert.equal(needsUsageConfirmation(1), true);
    assert.equal(needsUsageConfirmation(5), true);
  });

  it('今日の0時（ローカル時刻）を返す', () => {
    const now = new Date(2026, 10, 4, 15, 30, 12);
    assert.equal(new Date(startOfLocalDayIso(now)).getTime(), new Date(2026, 10, 4, 0, 0, 0).getTime());
  });
});
