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
        id: 1, barcode: '4901234567894', name: 'ペン, 黒', quantity: 3, minQuantity: 5,
        location: '棚A', note: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'バーコード,商品名,在庫数,最低在庫数,保管場所,メモ,更新日時');
    assert.match(lines[1], /^4901234567894,"ペン, 黒",3,5,棚A,,\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.equal(lines[2], '');
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
