/// <reference types="node" />

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { APP_NAME, CONTACT_EMAIL, PRIVACY_POLICY_URL, SUPPORT_URL } from './app-info.ts';

const page = (name: string) => readFileSync(new URL(`../web/public/${name}`, import.meta.url), 'utf8');

describe('公開情報（連絡先・プライバシーポリシー）', () => {
  it('プライバシーポリシーとサポートのページに、同じ連絡先とアプリ名が書かれている', () => {
    for (const name of ['privacy.html', 'support.html']) {
      const html = page(name);
      assert.ok(html.includes(`mailto:${CONTACT_EMAIL}`), `${name} の連絡先が shared/app-info.ts の CONTACT_EMAIL と違います`);
      assert.ok(html.includes(APP_NAME), `${name} にアプリ名がありません`);
      // 仮のアドレスなど、別のアドレスが混ざっていない
      const others = [...html.matchAll(/mailto:([^"?]+)/g)].map((m) => m[1]).filter((m) => m !== CONTACT_EMAIL);
      assert.deepEqual(others, [], `${name} に別の連絡先が残っています`);
    }
  });

  it('URL は公開サイトのファイルを指す', () => {
    assert.match(PRIVACY_POLICY_URL, /\/StockMgmtApp\/privacy\.html$/);
    assert.match(SUPPORT_URL, /\/StockMgmtApp\/support\.html$/);
  });
});
