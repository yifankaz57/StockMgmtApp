/// <reference types="node" />

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildSuggestions,
  extractApiErrorMessage,
  isValidJan,
  normalizeJan,
  parseOpenFoodFacts,
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

describe('extractApiErrorMessage', () => {
  it('Error.Message 形式・error.message 形式・文字列からメッセージを取り出す', () => {
    assert.equal(extractApiErrorMessage({ Error: { Message: 'Your Request is invalid.' } }), 'Your Request is invalid.');
    assert.equal(extractApiErrorMessage({ error: { message: 'forbidden' } }), 'forbidden');
    assert.equal(extractApiErrorMessage('Bad Request'), 'Bad Request');
    assert.equal(extractApiErrorMessage({}), undefined);
  });
});

describe('buildWebSearchUrl', () => {
  it('JAN を完全一致（ダブルクォート）で検索する URL', async () => {
    const { buildWebSearchUrl } = await import('./web-search.ts');
    assert.equal(buildWebSearchUrl(' 4571167058709 '), 'https://www.google.com/search?q=%224571167058709%22');
  });
});
