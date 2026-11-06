/// <reference types="node" />

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { DEFAULT_STOCK_ALERTS, normalizeStockAlerts, stockAlertColor, stockAlertLevel, validateStockAlerts } from './stock-alert.ts';

const settings = normalizeStockAlerts({ caution: { threshold: 5, color: '#fff4cc' }, warning: { threshold: 2, color: '#FDE2E1' } });

describe('在庫の色分け', () => {
  it('初期設定はどちらも未設定で、色分けしない', () => {
    assert.equal(DEFAULT_STOCK_ALERTS.caution.threshold, null);
    assert.equal(DEFAULT_STOCK_ALERTS.warning.threshold, null);
    assert.equal(stockAlertColor(0, DEFAULT_STOCK_ALERTS), null);
  });

  it('設定した数「未満」で色が付き、両方当てはまるときは警告を優先', () => {
    assert.equal(stockAlertLevel(5, settings), null);
    assert.equal(stockAlertLevel(4, settings), 'caution');
    assert.equal(stockAlertLevel(2, settings), 'caution');
    assert.equal(stockAlertLevel(1, settings), 'warning');
    assert.equal(stockAlertLevel(0, settings), 'warning');
    assert.equal(stockAlertColor(4, settings), '#FFF4CC');
    assert.equal(stockAlertColor(0, settings), '#FDE2E1');
  });

  it('片方だけの設定でも使える', () => {
    const onlyWarning = normalizeStockAlerts({ warning: { threshold: 3, color: '#FDE2E1' } });
    assert.equal(stockAlertLevel(10, onlyWarning), null);
    assert.equal(stockAlertLevel(2, onlyWarning), 'warning');
  });

  it('警告の数が注意以上なら設定エラー', () => {
    assert.equal(validateStockAlerts(settings), null);
    assert.match(
      validateStockAlerts(normalizeStockAlerts({ caution: { threshold: 3, color: '#FFF4CC' }, warning: { threshold: 3, color: '#FDE2E1' } })) ?? '',
      /小さく/,
    );
  });

  it('壊れた値は既定値に戻す', () => {
    assert.deepEqual(normalizeStockAlerts('broken'), DEFAULT_STOCK_ALERTS);
    assert.deepEqual(normalizeStockAlerts({ caution: { threshold: -1, color: 'red' } }).caution, DEFAULT_STOCK_ALERTS.caution);
    assert.equal(normalizeStockAlerts({ caution: { threshold: 2.5 } }).caution.threshold, null);
  });
});
