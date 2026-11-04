/// <reference types="node" />

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildSuggestions,
  cleanProductName,
  isValidJan,
  normalizeJan,
  parseOpenFoodFacts,
  parseYahooShopping,
  rankSuggestions,
} from './jan.ts';

describe('isValidJan', () => {
  it('正しいチェックディジットの JAN-13 / JAN-8 / UPC-A を受け付ける', () => {
    assert.equal(isValidJan('4901234567894'), true);
    assert.equal(isValidJan('49123456'), true);
    assert.equal(isValidJan('012345678905'), true);
  });

  it('チェックディジット不一致・桁数違い・数字以外は不正', () => {
    assert.equal(isValidJan('4901234567890'), false);
    assert.equal(isValidJan('49012345'), false);
    assert.equal(isValidJan('123'), false);
    assert.equal(isValidJan('https://example.com'), false);
  });

  it('UPC-A は先頭 0 を補う', () => {
    assert.equal(normalizeJan('012345678905'), '0012345678905');
  });
});

describe('cleanProductName', () => {
  it('隅付き括弧や宣伝文句を除去し全角英数を半角にする', () => {
    assert.equal(cleanProductName('【送料無料】【あす楽】 ボールペン　ＢＬＡＣＫ 0.5mm ★お買い得★'), 'ボールペン BLACK 0.5mm');
  });
});

describe('rankSuggestions', () => {
  it('重複をまとめて出現回数順に並べる', () => {
    const result = rankSuggestions(['B社', 'A社', 'B社', 'ｂ社', 'A社 ', 'C社']);
    assert.deepEqual(result.map((r) => [r.value, r.count]), [['B社', 3], ['A社', 2], ['C社', 1]]);
  });
});

describe('parseOpenFoodFacts', () => {
  it('日本語名を優先し、ブランドをメーカー候補にする', () => {
    const hits = parseOpenFoodFacts({
      status: 1,
      product: { product_name: 'Green tea', product_name_ja: 'お茶', brands: 'A飲料, Bブランド' },
    });
    assert.deepEqual(buildSuggestions(hits).names.map((s) => s.value), ['お茶']);
    assert.deepEqual(buildSuggestions(hits).manufacturers.map((s) => s.value), ['A飲料', 'Bブランド']);
  });

  it('未登録・不正な応答は空', () => {
    assert.deepEqual(parseOpenFoodFacts({ status: 0 }), []);
    assert.deepEqual(parseOpenFoodFacts(null), []);
    assert.deepEqual(parseOpenFoodFacts('oops'), []);
  });
});

describe('parseYahooShopping', () => {
  it('商品名を整形し、ブランド名をメーカー候補にする。JAN 不一致は除外', () => {
    const hits = parseYahooShopping(
      {
        hits: [
          { name: '【送料無料】お茶 500ml', brand: { name: 'A飲料' }, janCode: '4901234567894' },
          { name: 'お茶 500ml', brand: { name: 'A飲料' }, janCode: '4901234567894' },
          { name: '別の商品', brand: { name: 'Z社' }, janCode: '4909999999999' },
          { name: 'お茶 500ml 24本', janCode: '' },
          'broken',
        ],
      },
      '4901234567894',
    );
    const s = buildSuggestions(hits);
    assert.equal(s.names[0].value, 'お茶 500ml');
    assert.equal(s.names[0].count, 2);
    assert.deepEqual(s.manufacturers.map((m) => m.value), ['A飲料']);
    assert.deepEqual(s.sources, ['Yahoo!ショッピング']);
  });

  it('hits が無い応答は空', () => {
    assert.deepEqual(parseYahooShopping({ Error: { Message: 'invalid appid' } }, '4901234567894'), []);
  });
});
