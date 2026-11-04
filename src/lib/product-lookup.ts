import {
  buildSuggestions,
  extractApiErrorMessage,
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
const YAHOO_APP_ID = (process.env.EXPO_PUBLIC_YAHOO_APP_ID ?? '').trim();

export const isYahooLookupEnabled = YAHOO_APP_ID.length > 0;

/** 情報源ごとの検索結果（候補が出ない理由を画面に表示するため） */
export type SourceStatus = {
  source: string;
  state: 'found' | 'notFound' | 'error' | 'disabled';
  detail?: string;
};

export type LookupResult = ProductSuggestions & { statuses: SourceStatus[] };

class HttpError extends Error {}

async function fetchJson(url: string, signal: AbortSignal, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json', ...headers } });
  if (response.ok) return response.json();
  // Open Food Facts は未登録商品で 404 を返すので「該当なし」として扱う
  if (response.status === 404) return null;
  let message: string | undefined;
  try {
    const text = await response.text();
    try {
      message = extractApiErrorMessage(JSON.parse(text));
    } catch {
      message = extractApiErrorMessage(text);
    }
  } catch {
    // 本文が読めなくてもステータスコードだけ返す
  }
  throw new HttpError(`HTTP ${response.status}${message ? `: ${message}` : ''}`);
}

type Source = {
  name: string;
  enabled: boolean;
  disabledReason?: string;
  search: (jan: string, signal: AbortSignal) => Promise<LookupHit[]>;
};

const SOURCES: Source[] = [
  {
    name: 'Open Food Facts',
    enabled: true,
    search: async (jan, signal) =>
      parseOpenFoodFacts(
        await fetchJson(
          `https://world.openfoodfacts.org/api/v2/product/${jan}.json?fields=product_name,product_name_ja,brands`,
          signal,
          { 'User-Agent': 'StockMgmtApp/1.0' },
        ),
      ),
  },
  {
    name: 'Yahoo!ショッピング',
    enabled: isYahooLookupEnabled,
    disabledReason: '未設定（.env.local に EXPO_PUBLIC_YAHOO_APP_ID を設定）',
    search: async (jan, signal) => {
      const params = new URLSearchParams({ appid: YAHOO_APP_ID, jan_code: jan, results: '20' });
      const url = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params.toString()}`;
      return parseYahooShopping(await fetchJson(url, signal), jan);
    },
  },
];

function describeError(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error && error.name === 'AbortError') return 'タイムアウト';
  if (error instanceof Error) return `通信エラー（${error.message}）`;
  return String(error);
}

/**
 * JAN コードから商品名・メーカー名の候補を検索する。
 * 情報源ごとの成否を statuses に入れて返す（例外は投げない）。
 */
export async function lookupProductByJan(code: string, signal?: AbortSignal): Promise<LookupResult> {
  const jan = normalizeJan(code);
  if (!jan || !isValidJan(jan)) return { names: [], manufacturers: [], sources: [], statuses: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const results = await Promise.all(
      SOURCES.map(async (source): Promise<{ status: SourceStatus; hits: LookupHit[] }> => {
        if (!source.enabled) {
          return { status: { source: source.name, state: 'disabled', detail: source.disabledReason }, hits: [] };
        }
        try {
          const hits = await source.search(jan, controller.signal);
          return { status: { source: source.name, state: hits.length > 0 ? 'found' : 'notFound' }, hits };
        } catch (error) {
          return { status: { source: source.name, state: 'error', detail: describeError(error) }, hits: [] };
        }
      }),
    );
    return {
      ...buildSuggestions(results.flatMap((r) => r.hits)),
      statuses: results.map((r) => r.status),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
