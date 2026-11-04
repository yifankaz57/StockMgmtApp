// JAN コードの検証と、外部 API の応答から候補（商品名・メーカー名）を組み立てる純粋関数

/** JAN/EAN-8・EAN-13（UPC-A は先頭 0 を補って EAN-13 扱い）のチェックディジットを検証 */
export function isValidJan(code: string): boolean {
  const digits = normalizeJan(code);
  if (!digits) return false;
  const body = digits.slice(0, -1);
  const check = Number(digits[digits.length - 1]);
  // 右端（チェックディジットの左隣）から奇数桁 ×3、偶数桁 ×1
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const n = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** 数字8桁/13桁に正規化（12桁の UPC-A は先頭に 0 を付ける）。不正なら null */
export function normalizeJan(code: string): string | null {
  const digits = code.trim();
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12) return `0${digits}`;
  if (digits.length === 8 || digits.length === 13) return digits;
  return null;
}

/** 通販サイトの商品名から宣伝文句などを取り除く */
export function cleanProductName(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/≪[^≫]*≫|《[^》]*》|<[^>]*>|★[^★]*★|◆[^◆]*◆/g, ' ')
    .replace(/(送料無料|あす楽|ポイント\d+倍|即納|在庫あり|期間限定|お取り寄せ|メール便|ネコポス|代引不可)/g, ' ')
    .replace(/[★☆◆◇■□●○※]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Suggestion = {
  value: string;
  /** 何件の情報源・出品で見つかったか（多いほど確からしい） */
  count: number;
};

/** 候補を正規化して重複をまとめ、出現回数の多い順（同数なら短い順）に並べる */
export function rankSuggestions(values: string[], limit = 5): Suggestion[] {
  const map = new Map<string, Suggestion>();
  for (const raw of values) {
    const value = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!value || value.length > 80) continue;
    const key = value.toLowerCase();
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { value, count: 1 });
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.value.length - b.value.length)
    .slice(0, limit);
}

export type LookupHit = { name?: string; manufacturer?: string; source: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Open Food Facts（/api/v2/product/{code}.json）の応答を解析
 * 例: { status: 1, product: { product_name_ja, product_name, brands: "A社, B" } }
 */
export function parseOpenFoodFacts(json: unknown): LookupHit[] {
  const root = asRecord(json);
  if (!root || root.status !== 1) return [];
  const product = asRecord(root.product);
  if (!product) return [];
  const name = asString(product.product_name_ja) ?? asString(product.product_name);
  const brands = (asString(product.brands) ?? '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  const hits: LookupHit[] = [];
  if (name || brands.length === 0) hits.push({ name, manufacturer: brands[0], source: 'Open Food Facts' });
  for (const brand of brands.slice(name ? 1 : 0)) hits.push({ manufacturer: brand, source: 'Open Food Facts' });
  return hits.filter((h) => h.name || h.manufacturer);
}

/**
 * Yahoo!ショッピング 商品検索 API (V3) の応答を解析
 * 例: { hits: [{ name: "【送料無料】商品名", brand: { name: "ブランド" }, janCode: "49..." }] }
 */
export function parseYahooShopping(json: unknown, jan: string): LookupHit[] {
  const root = asRecord(json);
  const hits = root && Array.isArray(root.hits) ? root.hits : [];
  const result: LookupHit[] = [];
  for (const item of hits) {
    const hit = asRecord(item);
    if (!hit) continue;
    const janCode = asString(hit.janCode);
    // JAN が明示されていて一致しないものは除外
    if (janCode && normalizeJan(janCode) !== normalizeJan(jan)) continue;
    const rawName = asString(hit.name);
    const name = rawName ? cleanProductName(rawName) : undefined;
    const manufacturer = asString(asRecord(hit.brand)?.name);
    if (name || manufacturer) result.push({ name: name || undefined, manufacturer, source: 'Yahoo!ショッピング' });
  }
  return result;
}

export type ProductSuggestions = {
  names: Suggestion[];
  manufacturers: Suggestion[];
  sources: string[];
};

export function buildSuggestions(hits: LookupHit[]): ProductSuggestions {
  return {
    names: rankSuggestions(hits.flatMap((h) => (h.name ? [h.name] : []))),
    manufacturers: rankSuggestions(hits.flatMap((h) => (h.manufacturer ? [h.manufacturer] : []))),
    sources: [...new Set(hits.map((h) => h.source))],
  };
}

/** API のエラー応答からメッセージを取り出す（Yahoo: { Error: { Message } } など） */
export function extractApiErrorMessage(json: unknown): string | undefined {
  const root = asRecord(json);
  if (!root) return typeof json === 'string' ? asString(json)?.slice(0, 200) : undefined;
  const error = asRecord(root.Error) ?? asRecord(root.error);
  return (
    asString(error?.Message) ??
    asString(error?.message) ??
    asString(root.Error) ??
    asString(root.error) ??
    asString(root.message) ??
    asString(root.status_verbose)
  );
}
