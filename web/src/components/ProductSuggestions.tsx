import { useEffect, useState } from 'react'

import { isValidJan, type Suggestion } from '@shared/jan'
import { errorMessage } from '@shared/inventory'
import { buildWebSearchUrl } from '@shared/web-search'
import { lookupProductByJan, type LookupResult, type SourceStatus } from '@/lib/lookup'
import { Icon } from './Icon'

type State =
  | { status: 'idle' }
  | { status: 'loading'; code: string }
  | { status: 'done'; code: string; result: LookupResult }
  | { status: 'error'; code: string; message: string }

const DEBOUNCE_MS = 500
const STATE_LABELS: Record<SourceStatus['state'], string> = { found: '候補あり', notFound: '該当なし', error: 'エラー', disabled: '未使用' }

/** JAN コードから推定した商品名・メーカー名の候補（タップで入力欄に反映） */
export function ProductSuggestions({
  barcode,
  autoSearch,
  currentName,
  currentManufacturer,
  onSelectName,
  onSelectManufacturer,
}: {
  barcode: string
  autoSearch: boolean
  currentName: string
  currentManufacturer: string
  onSelectName: (v: string) => void
  onSelectManufacturer: (v: string) => void
}) {
  const code = barcode.trim()
  const [state, setState] = useState<State>({ status: 'idle' })
  const [requested, setRequested] = useState<string | null>(autoSearch ? code : null)

  useEffect(() => {
    if (!autoSearch) return
    const timer = setTimeout(() => setRequested(code), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [autoSearch, code])

  useEffect(() => {
    if (!requested || !isValidJan(requested)) return
    const controller = new AbortController()
    let active = true
    Promise.resolve()
      .then(() => {
        if (active) setState({ status: 'loading', code: requested })
        return lookupProductByJan(requested, controller.signal)
      })
      .then((result) => active && setState({ status: 'done', code: requested, result }))
      .catch((e: unknown) => active && setState({ status: 'error', code: requested, message: errorMessage(e) }))
    return () => {
      active = false
      controller.abort()
    }
  }, [requested])

  if (!isValidJan(code)) return null

  if (!autoSearch && requested !== code) {
    return (
      <button type="button" className="outline-btn" onClick={() => setRequested(code)}>
        <Icon name="sparkles" />
        <span>JANコードから商品名・メーカーの候補を検索</span>
      </button>
    )
  }

  if (state.status === 'idle' || state.status === 'loading' || state.code !== code) {
    return (
      <div className="suggest">
        <div className="status">
          <div className="spinner" /> JANコードから候補を検索中…
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="suggest">
        <div className="status">{state.message}</div>
      </div>
    )
  }

  const { names, manufacturers, sources, statuses } = state.result
  if (names.length === 0 && manufacturers.length === 0) {
    return (
      <div className="suggest">
        <div className="status">このJANコードの候補は見つかりませんでした。下の「Webで検索」で調べるか、手入力してください。</div>
        <StatusList statuses={statuses} />
      </div>
    )
  }

  return (
    <div className="suggest">
      <div className="head">✨ 候補（推定）タップで入力</div>
      {manufacturers.length > 0 ? (
        <Group label="メーカー" items={manufacturers} selected={currentManufacturer} onSelect={onSelectManufacturer} />
      ) : null}
      {names.length > 0 ? <Group label="商品名" items={names} selected={currentName} onSelect={onSelectName} /> : null}
      <div className="source">出典: {sources.join('、')}。内容は推定のため確認してください。</div>
      <StatusList statuses={statuses.filter((s) => s.state === 'error')} />
    </div>
  )
}

function Group({ label, items, selected, onSelect }: { label: string; items: Suggestion[]; selected: string; onSelect: (v: string) => void }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="chips">
        {items.map((item) => {
          const active = item.value === selected.trim()
          return (
            <button key={item.value} type="button" className={`chip${active ? ' active' : ''}`} onClick={() => onSelect(item.value)}>
              {active ? <Icon name="check" size={14} /> : null}
              {item.value}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StatusList({ statuses }: { statuses: SourceStatus[] }) {
  if (statuses.length === 0) return null
  return (
    <div className="statuses">
      {statuses.map((s) => (
        <div key={s.source} className={s.state === 'error' ? 'err' : ''}>
          ・{s.source}: {STATE_LABELS[s.state]}
          {s.detail ? `（${s.detail}）` : ''}
        </div>
      ))}
    </div>
  )
}

/** バーコードを新しいタブで Web 検索する（データベースに無い商品の調査用） */
export function WebSearchButton({ barcode }: { barcode: string }) {
  const code = barcode.trim()
  if (!code) return null
  return (
    <>
      <a className="outline-btn" href={buildWebSearchUrl(code)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
        <Icon name="globe" />
        <span>Webで「{code}」を検索</span>
        <Icon name="external" />
      </a>
      <div className="hint">見つけた商品名は長押しでコピーし、下の入力欄に貼り付けてください。</div>
    </>
  )
}
