import { useEffect, useState } from 'react'

import { errorMessage } from '@shared/inventory'
import { Icon } from '@/components/Icon'
import { navigate } from '@/router'
import {
  getCandidates,
  getPostPreference,
  isShareableJan,
  reportCandidate,
  sharedMasterEnabled,
  useSharedSession,
  type SharedCandidate,
} from './api'

type State =
  | { code: string; status: 'loading' }
  | { code: string; status: 'done'; items: SharedCandidate[] }
  | { code: string; status: 'error'; message: string }

const DEBOUNCE_MS = 400

/** 共有マスタの候補（みんなが登録した商品名）。タップで入力欄に反映。ログイン中は通報できる */
export function SharedCandidates({
  barcode,
  currentName,
  onSelect,
}: {
  barcode: string
  currentName: string
  onSelect: (name: string, manufacturer: string) => void
}) {
  const code = barcode.trim()
  const shareable = sharedMasterEnabled && isShareableJan(code)
  const { session } = useSharedSession()
  const [state, setState] = useState<State | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!shareable) return
    const request = { active: true }
    const timer = setTimeout(() => {
      setState({ code, status: 'loading' })
      getCandidates(code)
        .then((items) => request.active && setState({ code, status: 'done', items }))
        .catch((e: unknown) => request.active && setState({ code, status: 'error', message: errorMessage(e) }))
    }, DEBOUNCE_MS)
    return () => {
      request.active = false
      clearTimeout(timer)
    }
  }, [shareable, code, reloadKey, session?.user.id])

  if (!shareable) return null

  const report = async (item: SharedCandidate) => {
    const reason = window.prompt(`「${item.name}」を通報します。理由を入力してください（任意・200文字まで）`, '')
    if (reason === null) return
    try {
      const result = await reportCandidate(code, item.name_key, reason)
      setNotice(result === 'reported' ? '通報しました。運営が確認します。' : 'この候補はすでに通報済みです。')
    } catch (e) {
      setNotice(`通報できませんでした: ${errorMessage(e)}`)
    }
  }

  const current = state?.code === code ? state : { code, status: 'loading' as const }
  const posting = session && getPostPreference()

  return (
    <div className="suggest shared">
      <div className="head">
        <Icon name="users" size={14} /> 共有マスタ（みんなの登録）
      </div>
      {current.status === 'loading' ? (
        <div className="status">
          <div className="spinner" /> 検索中…
        </div>
      ) : current.status === 'error' ? (
        <div className="status err">
          {current.message}
          <button type="button" className="inline-link" onClick={() => setReloadKey((k) => k + 1)}>
            再試行
          </button>
        </div>
      ) : current.items.length === 0 ? (
        <div className="status">まだ登録がありません。</div>
      ) : (
        <div className="shared-list">
          {current.items.map((item) => {
            const active = item.name === currentName.trim()
            return (
              <div key={item.name_key} className={`shared-item${active ? ' active' : ''}`}>
                <button type="button" className="shared-pick" onClick={() => onSelect(item.name, item.manufacturer)}>
                  <span className="shared-name">
                    {active ? <Icon name="check" size={14} /> : null}
                    {item.name}
                  </span>
                  <span className="shared-meta">
                    {item.manufacturer ? `${item.manufacturer}・` : ''}
                    {item.supporters}人が登録
                    {item.mine ? '（あなたも）' : ''}
                  </span>
                </button>
                {item.confirmed ? <span className="tag-confirmed">確定</span> : null}
                {session ? (
                  <button type="button" className="icon-btn report-btn" aria-label={`「${item.name}」を通報`} onClick={() => void report(item)}>
                    <Icon name="flag" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      {notice ? <div className="status">{notice}</div> : null}
      <div className="source">
        {posting ? (
          <>保存すると、この商品名を共有マスタにも登録します（設定で変更できます）。</>
        ) : session ? (
          <>共有マスタへの登録はオフです。</>
        ) : (
          <>
            <button type="button" className="inline-link" onClick={() => navigate('/settings')}>
              設定でログイン
            </button>
            すると、共有マスタへの登録や通報ができます。
          </>
        )}
        5人が同じ名前で登録すると「確定」になります。
      </div>
    </div>
  )
}
