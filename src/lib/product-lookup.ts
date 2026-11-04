import {
  buildSuggestions,
  isValidJan,
  normalizeJan,
  parseOpenFoodFacts,
  parseYahooShopping,
  type LookupHit,
  type ProductSuggestions,
} from './jan';

const TIMEOUT_MS = 8000;

/**
 * Yahoo!デベロッパーネットワークの Client ID（アプリケーションID）。
 * `.env.local` に EXPO_PUBLIC_YAHOO_APP_ID=... を書くと有効になる（未設定なら Yahoo は使わない）
 */
const YAHOO_APP_ID = process.env.EXPO_PUBLIC_YAHOO_APP_ID ?? '';

export const isYahooLookupEnabled = YAHOO_APP_ID.length > 0;

async function fetchJson(url: string, signal: AbortSignal, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json', ...headers } });
  if (!response.ok) {
    // Open Food Facts は未登録商品で 404 を返すので「該当なし」として扱う
    if (response.status === 404) return null;
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fromOpenFoodFacts(jan: string, signal: AbortSignal): Promise<LookupHit[]> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${jan}.json?fields=product_name,product_name_ja,brands`;
  return parseOpenFoodFacts(await fetchJson(url, signal, { 'User-Agent': 'StockMgmtApp/1.0' }));
}

async function fromYahooShopping(jan: string, signal: AbortSignal): Promise<LookupHit[]> {
  const params = new URLSearchParams({ appid: YAHOO_APP_ID, jan_code: jan, results: '20' });
  const url = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params.toString()}`;
  return parseYahooShopping(await fetchJson(url, signal), jan);
}

/**
 * JAN コードから商品名・メーカー名の候補を検索する。
 * どれかの情報源が失敗しても、他の情報源の結果を返す。全て失敗した場合のみ例外。
 */
export async function lookupProductByJan(code: string, signal?: AbortSignal): Promise<ProductSuggestions> {
  const jan = normalizeJan(code);
  if (!jan || !isValidJan(jan)) return { names: [], manufacturers: [], sources: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const tasks = [fromOpenFoodFacts(jan, controller.signal)];
    if (isYahooLookupEnabled) tasks.push(fromYahooShopping(jan, controller.signal));
    const results = await Promise.allSettled(tasks);
    const hits = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (hits.length === 0 && results.every((r) => r.status === 'rejected')) {
      throw new Error('候補の検索に失敗しました。通信状態を確認してください。');
    }
    return buildSuggestions(hits);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
