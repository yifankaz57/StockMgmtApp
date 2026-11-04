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
  formatUsagePeriod,
  normalizeResetDay,
  sortByUsage,
  usagePeriod,
  stockValue,
  sumUsageByProduct,
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

describe('消費量の集計と並べ替え', () => {
  const tx = (productId: number, kind: 'use' | 'stockOut' | 'stockIn', delta: number, createdAt: string) => ({ productId, kind, delta, createdAt });
  const transactions = [
    tx(1, 'use', -1, '2026-11-01T00:00:00.000Z'),
    tx(1, 'use', -1, '2026-11-03T00:00:00.000Z'),
    tx(2, 'use', -1, '2026-11-03T00:00:00.000Z'),
    tx(2, 'use', -1, '2026-11-03T01:00:00.000Z'),
    tx(2, 'use', -1, '2026-11-03T02:00:00.000Z'),
    tx(1, 'stockOut', -5, '2026-11-03T00:00:00.000Z'),
    tx(3, 'stockIn', 10, '2026-11-03T00:00:00.000Z'),
  ];

  it('「利用」と手動の「出庫」を数え、入庫は含めない', () => {
    assert.deepEqual([...sumUsageByProduct(transactions, null)].sort(), [[1, 7], [2, 3]]);
  });

  it('期間の開始以降だけを数える', () => {
    assert.deepEqual([...sumUsageByProduct(transactions, '2026-11-02T00:00:00.000Z')].sort(), [[1, 6], [2, 3]]);
  });

  it('消費量の多い順、同数は商品名順', () => {
    const products = [
      { id: 1, name: 'い' },
      { id: 2, name: 'う' },
      { id: 3, name: 'あ' },
      { id: 4, name: 'え' },
    ];
    const usage = new Map([[1, 2], [2, 3]]);
    assert.deepEqual(sortByUsage(products, usage).map((p) => p.id), [2, 1, 3, 4]);
  });

});

describe('消費量の集計期間（毎月のリセット日）', () => {
  const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()];

  it('既定（1日）なら今月1日〜月末', () => {
    const p = usagePeriod(1, new Date(2026, 10, 4, 15, 0));
    assert.deepEqual(ymd(p.start), [2026, 11, 1, 0]);
    assert.deepEqual(ymd(p.end), [2026, 12, 1, 0]);
    assert.equal(formatUsagePeriod(p), '11/1〜11/30');
  });

  it('リセット日より前なら先月のリセット日から', () => {
    const p = usagePeriod(15, new Date(2026, 10, 4));
    assert.deepEqual(ymd(p.start), [2026, 10, 15, 0]);
    assert.equal(formatUsagePeriod(p), '10/15〜11/14');
  });

  it('リセット日当日の0時から新しい期間', () => {
    assert.deepEqual(ymd(usagePeriod(15, new Date(2026, 10, 15, 0, 0)).start), [2026, 11, 15, 0]);
    assert.deepEqual(ymd(usagePeriod(15, new Date(2026, 10, 14, 23, 59)).start), [2026, 10, 15, 0]);
  });

  it('その日がない月は月末（31日設定の2月・年またぎ）', () => {
    const feb = usagePeriod(31, new Date(2027, 1, 28, 12));
    assert.deepEqual(ymd(feb.start), [2027, 2, 28, 0]);
    assert.deepEqual(ymd(feb.end), [2027, 3, 31, 0]);
    const jan = usagePeriod(31, new Date(2027, 0, 10));
    assert.deepEqual(ymd(jan.start), [2026, 12, 31, 0]);
    assert.equal(formatUsagePeriod(jan), '12/31〜1/30');
  });

  it('設定値の検証', () => {
    assert.equal(normalizeResetDay(15), 15);
    for (const v of [0, 32, 1.5, '5', null, undefined]) assert.equal(normalizeResetDay(v), 1);
  });
});
