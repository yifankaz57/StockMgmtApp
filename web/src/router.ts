import { useSyncExternalStore } from 'react'

// ハッシュ（#/products など）で画面を切り替える小さなルーター。
// GitHub Pages のような静的ホスティングでもリロードで 404 にならない。

export type Route = { path: string; segments: string[]; query: URLSearchParams }

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/scan'
  const [path, search = ''] = raw.split('?')
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(search) }
}

let current = parse(window.location.hash)
const listeners = new Set<() => void>()

window.addEventListener('hashchange', () => {
  current = parse(window.location.hash)
  listeners.forEach((l) => l())
})

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

// ---------- 画面遷移と「戻る」 ----------
// 「戻る」で確実に元の画面へ帰れるよう、どの画面から来たか（trail）をアプリ自身で覚えておく。
// iPhone の Safari（特にホーム画面に追加したアプリ）では、ブラウザの履歴とアプリの想定がずれることがあるため、
// ブラウザの履歴で戻ったあと、着いた画面が覚えていた画面と違えば正しい画面に置き換える。
// 再読み込みしても続けられるよう、trail はこのタブの sessionStorage にも保存する。

const TRAIL_KEY = 'router-trail'

function loadTrail(): string[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TRAIL_KEY) ?? '[]') as unknown
    return Array.isArray(saved) ? saved.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

let trail: string[] = loadTrail()

function saveTrail() {
  try {
    sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail.slice(-50)))
  } catch {
    // 保存できなくても、このページを開いている間は動く
  }
}

/** 今の画面の住所（#/products など）。空なら最初の画面 */
function currentHash(): string {
  return window.location.hash || '#/scan'
}

/**
 * 画面遷移。params は ?key=value として付く。
 * replace: 今の画面を置き換える（戻る先を増やさない） / root: 下のタブの切り替え（戻る先の記録をリセット）
 */
export function navigate(
  path: string,
  params?: Record<string, string | undefined>,
  options: { replace?: boolean; root?: boolean } = {},
) {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) search.set(k, v)
  const hash = `#${path}${search.size ? `?${search.toString()}` : ''}`
  if (options.root) trail = []
  if (options.replace) {
    window.location.replace(hash)
  } else {
    trail.push(currentHash())
    window.location.hash = hash
  }
  saveTrail()
}

/** 前の画面に戻る。どこから来たか分からない（URL を直接開いた）場合は fallback へ */
export function goBack(fallback = '/scan') {
  const expected = trail.pop()
  saveTrail()
  if (!expected) {
    window.location.replace(`#${fallback}`)
    return
  }
  const before = currentHash()
  const settle = (moved: boolean) => {
    window.removeEventListener('hashchange', onHashChange)
    clearTimeout(timer)
    // 履歴で戻れなかった、または違う画面に着いたときは、覚えていた画面に置き換える
    if (!moved || currentHash() !== expected) window.location.replace(expected)
  }
  const onHashChange = () => settle(true)
  window.addEventListener('hashchange', onHashChange)
  const timer = setTimeout(() => settle(currentHash() !== before), 800)
  window.history.back()
}
