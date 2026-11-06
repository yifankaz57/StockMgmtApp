// Supabase の接続先 URL を整える（Web 版・アプリ版で共通）

/**
 * 「https://xxxx.supabase.co/rest/v1/」のように余分なパスや末尾の / が付いていても、
 * 「https://xxxx.supabase.co」（スキームとホストだけ）にする。URL として読めなければ前後の空白を除いてそのまま返す。
 */
export function normalizeSupabaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return value;
    return url.origin;
  } catch {
    return value;
  }
}
