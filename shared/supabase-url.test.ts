/// <reference types="node" />

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { normalizeSupabaseUrl } from './supabase-url.ts';

describe('normalizeSupabaseUrl', () => {
  it('余分なパス・末尾の / ・前後の空白を取り除く', () => {
    assert.equal(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1/'), 'https://abc.supabase.co');
    assert.equal(normalizeSupabaseUrl(' https://abc.supabase.co/ '), 'https://abc.supabase.co');
    assert.equal(normalizeSupabaseUrl('https://abc.supabase.co'), 'https://abc.supabase.co');
    assert.equal(normalizeSupabaseUrl('http://localhost:54321/auth/v1'), 'http://localhost:54321');
  });

  it('空や URL でない値はそのまま（空白だけ除く）', () => {
    assert.equal(normalizeSupabaseUrl(''), '');
    assert.equal(normalizeSupabaseUrl('  '), '');
    assert.equal(normalizeSupabaseUrl('abc.supabase.co'), 'abc.supabase.co');
  });
});
