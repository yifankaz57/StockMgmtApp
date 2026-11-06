import {
  buildSuggestions,
  extractApiErrorMessage,
  isValidJan,
  normalizeJan,
  parseOpenFoodFacts,
  type LookupHit,
  type ProductSuggestions,
} from '@shared/jan'

// JAN コードから商品名・メーカー名の候補を検索する（ブラウザ版）

const TIMEOUT_MS = 8000

export type SourceStatus = {
  source: string
  state: 'found' | 'notFound' | 'error' | 'disabled'
  detail?: string
}

export type LookupResult = ProductSuggestions & { statuses: SourceStatus[] }

class HttpError extends Error {}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (response.ok) return response.json()
  if (response.status === 404) return null
  let message: string | undefined
  try {
    const text = await response.text()
    try {
      message = extractApiErrorMessage(JSON.parse(text))
    } catch {
      message = extractApiErrorMessage(text)
    }
  } catch {
    // 本文が読めなくてもステータスだけ返す
  }
  throw new HttpError(`HTTP ${response.status}${message ? `: ${message}` : ''}`)
}

type Source = {
  name: string
  enabled: boolean
  disabledReason?: string
  search: (jan: string, signal: AbortSignal) => Promise<LookupHit[]>
}

const SOURCES: Source[] = [
  {
    name: 'Open Food Facts',
    enabled: true,
    search: async (jan, signal) =>
      parseOpenFoodFacts(
        await fetchJson(
          `https://world.openfoodfacts.org/api/v2/product/${jan}.json?fields=product_name,product_name_ja,brands`,
          signal,
        ),
      ),
  },
]

function describeError(error: unknown): string {
  if (error instanceof HttpError) return error.message
  if (error instanceof DOMException && error.name === 'AbortError') return 'タイムアウト'
  if (error instanceof TypeError) return '通信エラー（オフライン、またはブラウザから利用できないAPI）'
  if (error instanceof Error) return error.message
  return String(error)
}

export async function lookupProductByJan(code: string, signal?: AbortSignal): Promise<LookupResult> {
  const jan = normalizeJan(code)
  if (!jan || !isValidJan(jan)) return { names: [], manufacturers: [], sources: [], statuses: [] }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const results = await Promise.all(
      SOURCES.map(async (source): Promise<{ status: SourceStatus; hits: LookupHit[] }> => {
        if (!source.enabled) {
          return { status: { source: source.name, state: 'disabled', detail: source.disabledReason }, hits: [] }
        }
        try {
          const hits = await source.search(jan, controller.signal)
          return { status: { source: source.name, state: hits.length > 0 ? 'found' : 'notFound' }, hits }
        } catch (error) {
          return { status: { source: source.name, state: 'error', detail: describeError(error) }, hits: [] }
        }
      }),
    )
    return { ...buildSuggestions(results.flatMap((r) => r.hits)), statuses: results.map((r) => r.status) }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
