/// <reference types="node" />

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { csvRow, escapeCsvField, productsToCsv, transactionsToCsv } from './csv.ts';

describe('escapeCsvField', () => {
  it('特殊文字がなければそのまま', () => {
    assert.equal(escapeCsvField('ボールペン'), 'ボールペン');
  });

  it('カンマ・改行・ダブルクォートを含む場合はクォート', () => {
    assert.equal(escapeCsvField('a,b'), '"a,b"');
    assert.equal(escapeCsvField('a\nb'), '"a\nb"');
    assert.equal(escapeCsvField('15"モニター'), '"15""モニター"');
  });
});

describe('csv 出力', () => {
  it('行を組み立てる', () => {
    assert.equal(csvRow(['a', 1, 'b,c']), 'a,1,"b,c"');
  });

  it('在庫一覧', () => {
    const csv = productsToCsv([
      {
        id: 1, barcode: '4901234567894', name: 'ペン, 黒', manufacturer: '文具メーカー', shade: '8-NB', volume: '80g', purchasePrice: 1200.5, quantity: 3, available: true, minQuantity: 5,
        location: '棚A', note: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'バーコード,メーカー,商品名,色番号,容量,利用,在庫数,仕入れ値,在庫金額,最低在庫数,保管場所,メモ,更新日時');
    assert.match(lines[1], /^4901234567894,文具メーカー,"ペン, 黒",8-NB,80g,可,3,1200.5,3601.5,5,棚A,,\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.equal(lines[2], '');
  });

  it('期間ごとの消費数の列が在庫数の右に新しい順で入る（なければ 0）', () => {
    const product = (id: number) => ({
      id, barcode: String(id), name: `商品${id}`, manufacturer: '', shade: '', volume: '', purchasePrice: null, quantity: 3, available: true,
      minQuantity: 0, location: '', note: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const periods = [
      { start: new Date(2026, 10, 1), end: new Date(2026, 11, 1), totals: new Map([[1, 4]]) },
      { start: new Date(2026, 9, 1), end: new Date(2026, 10, 1), totals: new Map([[2, 7]]) },
    ];
    const lines = productsToCsv([product(1), product(2)], periods).split('\r\n');
    assert.match(lines[0], /^バーコード,メーカー,商品名,色番号,容量,利用,在庫数,消費数（2026\/11\/1〜11\/30）,消費数（2026\/10\/1〜10\/31）,仕入れ値,/);
    assert.match(lines[1], /^1,,商品1,,,可,3,4,0,,/);
    assert.match(lines[2], /^2,,商品2,,,可,3,0,7,,/);
  });

  it('仕入れ値が未登録なら仕入れ値・在庫金額は空欄', () => {
    const csv = productsToCsv([
      {
        id: 1, barcode: '1', name: 'a', manufacturer: '', shade: '', volume: '', purchasePrice: null, quantity: 3, available: false, minQuantity: 0,
        location: '', note: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    assert.match(csv.split('\r\n')[1], /^1,,a,,,不可,3,,,0,,,/);
  });

  it('入出庫履歴', () => {
    const csv = transactionsToCsv([
      {
        id: 1, productId: 1, productName: 'ペン', productBarcode: '123', kind: 'stockOut',
        delta: -2, quantityAfter: 1, note: '', createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    assert.match(csv.split('\r\n')[1], /,123,ペン,出庫,-2,1,$/);
  });
});
