/** JAN コードの完全一致検索用の Google 検索 URL */
export function buildWebSearchUrl(code: string): string {
  const query = `"${code.trim()}"`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
