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

/** アプリ内で進んだ画面の数（戻るボタンで履歴を戻ってよいかの判定に使う） */
let depth = 0

/** 画面遷移。params は ?key=value として付く */
export function navigate(path: string, params?: Record<string, string | undefined>, options: { replace?: boolean } = {}) {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) search.set(k, v)
  const hash = `#${path}${search.size ? `?${search.toString()}` : ''}`
  if (options.replace) {
    window.location.replace(hash)
  } else {
    depth += 1
    window.location.hash = hash
  }
}

/** 前の画面に戻る。アプリ内の履歴が無い（URL を直接開いた）場合は fallback へ */
export function goBack(fallback = '/scan') {
  if (depth > 0) {
    depth -= 1
    window.history.back()
  } else {
    navigate(fallback, undefined, { replace: true })
  }
}
