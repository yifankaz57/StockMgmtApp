import { useCallback, useEffect, useState } from 'react'

import { formatDateTime } from '@shared/csv'
import { errorMessage } from '@shared/inventory'
import { EmptyState, ErrorText, Page, Section, Segmented } from '@/components/ui'
import { goBack } from '@/router'
import {
  adminApi,
  useMyStatus,
  useSharedSession,
  type BannedUser,
  type BypassKey,
  type HistoryItem,
  type LogItem,
  type ModerationAction,
  type QueueItem,
} from './api'

type Tab = 'queue' | 'history' | 'banned' | 'keys' | 'log'

const TABS: { value: Tab; label: string }[] = [
  { value: 'queue', label: '確認待ち' },
  { value: 'history', label: 'JAN履歴' },
  { value: 'banned', label: '締め出し' },
  { value: 'keys', label: 'キー' },
  { value: 'log', label: '操作記録' },
]

const STATUS_LABELS: Record<HistoryItem['status'], string> = { active: '通常', approved: '承認済み', hidden: '非表示' }

const ACTION_LABELS: Record<string, string> = {
  candidate_approve: '候補を承認',
  candidate_hide: '候補を非表示',
  candidate_restore: '候補を元に戻す',
  proposal_approve: '提案を承認',
  proposal_hide: '提案を非表示',
  proposal_restore: '提案を元に戻す',
  reports_dismiss: '通報を却下',
  user_ban: '利用者を締め出し',
  user_unban: '締め出しを解除',
  user_trust: '信頼度を変更',
  key_create: '認証キーを発行',
  key_revoke: '認証キーを無効化',
  key_redeem: '認証キーを適用',
}

const when = (iso: string) => formatDateTime(iso).slice(0, 16)

/** 運営の管理画面（運営者としてログインしたときだけ使える） */
export function AdminPage() {
  const { ready, session } = useSharedSession()
  const { status } = useMyStatus(session)
  const [tab, setTab] = useState<Tab>('queue')
  const [historyJan, setHistoryJan] = useState('')

  const back = (
    <button type="button" className="link-btn" onClick={() => goBack('/settings')}>
      ‹ 戻る
    </button>
  )

  if (!ready || (session && !status)) return <Page title="管理" left={back}>{null}</Page>
  if (!status?.is_admin) {
    return (
      <Page title="管理" left={back}>
        <EmptyState icon="shield" title="運営者の権限がありません" message="運営者のアカウントで設定タブからログインしてください。" />
      </Page>
    )
  }

  const openHistory = (jan: string) => {
    setHistoryJan(jan)
    setTab('history')
  }

  return (
    <Page title="管理" left={back}>
      <div style={{ margin: '12px 16px 0' }}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'queue' ? <Queue onOpenHistory={openHistory} /> : null}
      {tab === 'history' ? <History key={historyJan} initialJan={historyJan} /> : null}
      {tab === 'banned' ? <Banned onOpenHistory={openHistory} /> : null}
      {tab === 'keys' ? <Keys /> : null}
      {tab === 'log' ? <Log /> : null}
    </Page>
  )
}

/** 読み込み・再読み込み・エラー表示の共通処理 */
function useLoad<T>(load: () => Promise<T>): { data: T | null; error: string | null; reload: () => void; run: (fn: () => Promise<unknown>) => Promise<void> } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    load()
      .then((d) => {
        if (!active) return
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => active && setError(errorMessage(e)))
    return () => {
      active = false
    }
  }, [load, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn()
        reload()
      } catch (e) {
        setError(errorMessage(e))
      }
    },
    [reload],
  )
  return { data, error, reload, run }
}

function Queue({ onOpenHistory }: { onOpenHistory: (jan: string) => void }) {
  const { data, error, run } = useLoad(adminApi.queue)

  const act = (item: QueueItem, action: ModerationAction | 'dismiss') => {
    const label = { approve: '承認', hide: '非表示に', restore: '元に戻し', dismiss: '通報を却下し' }[action]
    if (!window.confirm(`「${item.name}」（${item.jan}）を${label}ますか？`)) return
    void run(() => (action === 'dismiss' ? adminApi.dismissReports(item.jan, item.name_key) : adminApi.setCandidate(item.jan, item.name_key, action)))
  }

  return (
    <>
      <ErrorText message={error} />
      {data === null ? null : data.length === 0 ? (
        <EmptyState icon="checkCircle" title="確認待ちはありません" />
      ) : (
        <Section footer="「保留」は新しい利用者1人だけが登録した候補です。承認すると公開されます（別の人が同じ名前を登録しても公開されます）。">
          {data.map((item) => (
            <div key={`${item.jan}/${item.name_key}`} className="row admin-item">
              <div className="admin-main">
                <div>
                  <span className={`tag-kind ${item.kind}`}>{item.kind === 'report' ? `通報 ${item.open_reports}件` : '保留'}</span>
                  <strong>{item.name}</strong>
                </div>
                <div className="item-meta">
                  {item.jan}
                  {item.manufacturer ? `・${item.manufacturer}` : ''}・{item.supporters}人が登録・{when(item.first_at)}
                </div>
                {item.reasons.length > 0 ? <div className="admin-reasons">理由: {item.reasons.join(' ／ ')}</div> : null}
              </div>
              <div className="admin-actions">
                {item.kind === 'pending' ? (
                  <button type="button" className="mini-btn ok" onClick={() => act(item, 'approve')}>
                    承認
                  </button>
                ) : (
                  <button type="button" className="mini-btn" onClick={() => act(item, 'dismiss')}>
                    却下
                  </button>
                )}
                <button type="button" className="mini-btn danger" onClick={() => act(item, 'hide')}>
                  非表示
                </button>
                <button type="button" className="mini-btn" onClick={() => onOpenHistory(item.jan)}>
                  履歴
                </button>
              </div>
            </div>
          ))}
        </Section>
      )}
    </>
  )
}

function History({ initialJan }: { initialJan: string }) {
  const [input, setInput] = useState(initialJan)
  const [jan, setJan] = useState(initialJan)
  const load = useCallback(() => (jan ? adminApi.janHistory(jan) : Promise.resolve([] as HistoryItem[])), [jan])
  const { data, error, run } = useLoad(load)

  const setProposal = (item: HistoryItem, action: ModerationAction) => void run(() => adminApi.setProposal(item.proposal_id, action))
  const ban = (item: HistoryItem) => {
    if (item.user_banned) {
      if (window.confirm(`${item.user_email ?? item.user_id} の締め出しを解除しますか？`)) void run(() => adminApi.setBanned(item.user_id, false))
      return
    }
    const reason = window.prompt(`${item.user_email ?? item.user_id} を締め出します。この人の登録はすべて集計から外れます。理由:`, '')
    if (reason !== null) void run(() => adminApi.setBanned(item.user_id, true, reason))
  }
  const trust = (item: HistoryItem) => void run(() => adminApi.setTrust(item.user_id, item.user_trusted ? 'new' : 'trusted'))

  return (
    <>
      <form
        className="search"
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault()
          setJan(input.trim())
        }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="JANコードで検索" inputMode="numeric" />
        <button type="submit" className="link-btn">
          検索
        </button>
      </form>
      <ErrorText message={error} />
      {!jan ? null : data && data.length === 0 ? (
        <EmptyState icon="search" title="このJANコードの登録はありません" />
      ) : (
        <Section title={jan} footer="提案ごとに 承認 / 非表示 / 元に戻す ができます。締め出すと、その人の登録はすべて集計から外れます（解除で戻ります）。">
          {(data ?? []).map((item) => (
            <div key={item.proposal_id} className={`row admin-item${item.status === 'hidden' ? ' dim' : ''}`}>
              <div className="admin-main">
                <div>
                  <span className={`tag-kind ${item.status}`}>{STATUS_LABELS[item.status]}</span>
                  <strong>{item.name}</strong>
                </div>
                <div className="item-meta">
                  {item.manufacturer ? `${item.manufacturer}・` : ''}
                  {when(item.created_at)}
                </div>
                <div className="item-meta">
                  {item.user_email ?? item.user_id}
                  {item.user_trusted ? '・信頼済み' : ''}
                  {item.user_banned ? '・締め出し中' : ''}
                </div>
              </div>
              <div className="admin-actions">
                {item.status === 'hidden' ? (
                  <button type="button" className="mini-btn" onClick={() => setProposal(item, 'restore')}>
                    元に戻す
                  </button>
                ) : (
                  <>
                    {item.status === 'active' ? (
                      <button type="button" className="mini-btn ok" onClick={() => setProposal(item, 'approve')}>
                        承認
                      </button>
                    ) : null}
                    <button type="button" className="mini-btn danger" onClick={() => setProposal(item, 'hide')}>
                      非表示
                    </button>
                  </>
                )}
                <button type="button" className="mini-btn" onClick={() => trust(item)}>
                  {item.user_trusted ? '信頼を外す' : '信頼する'}
                </button>
                <button type="button" className={`mini-btn${item.user_banned ? '' : ' danger'}`} onClick={() => ban(item)}>
                  {item.user_banned ? '解除' : '締め出す'}
                </button>
              </div>
            </div>
          ))}
        </Section>
      )}
    </>
  )
}

function Banned({ onOpenHistory }: { onOpenHistory: (jan: string) => void }) {
  const { data, error, run } = useLoad(adminApi.bannedUsers)
  const unban = (u: BannedUser) => {
    if (window.confirm(`${u.user_email ?? u.user_id} の締め出しを解除しますか？`)) void run(() => adminApi.setBanned(u.user_id, false))
  }
  return (
    <>
      <ErrorText message={error} />
      {data === null ? null : data.length === 0 ? (
        <EmptyState icon="users" title="締め出し中の利用者はいません" />
      ) : (
        <Section>
          {data.map((u) => (
            <div key={u.user_id} className="row admin-item">
              <div className="admin-main">
                <strong>{u.user_email ?? u.user_id}</strong>
                <div className="item-meta">
                  登録 {u.proposals}件{u.banned_reason ? `・理由: ${u.banned_reason}` : ''}
                </div>
              </div>
              <div className="admin-actions">
                <button type="button" className="mini-btn" onClick={() => unban(u)}>
                  解除
                </button>
              </div>
            </div>
          ))}
        </Section>
      )}
      <div className="hint" style={{ margin: '8px 20px' }}>
        利用者を締め出すには「JAN履歴」で対象の登録を開いてください。
        <button type="button" className="inline-link" onClick={() => onOpenHistory('')}>
          JAN履歴へ
        </button>
      </div>
    </>
  )
}

function Log() {
  const load = useCallback(() => adminApi.log(200), [])
  const { data, error } = useLoad<LogItem[]>(load)
  return (
    <>
      <ErrorText message={error} />
      {data === null ? null : data.length === 0 ? (
        <EmptyState icon="clock" title="操作の記録はまだありません" />
      ) : (
        <Section>
          {data.map((l) => (
            <div key={l.id} className="row admin-item">
              <div className="admin-main">
                <strong>{ACTION_LABELS[l.action] ?? l.action}</strong>
                <div className="item-meta">{l.target}</div>
                <div className="item-meta">
                  {when(l.created_at)}・{l.admin_email ?? '（削除された運営者）'}
                  {typeof l.detail.reason === 'string' && l.detail.reason ? `・理由: ${l.detail.reason}` : ''}
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}
    </>
  )
}

function Keys() {
  const { data, error, run } = useLoad<BypassKey[]>(adminApi.listKeys)
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<{ key: string; label: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const create = () =>
    void run(async () => {
      const key = await adminApi.createKey(label)
      setIssued({ key, label })
      setCopied(false)
      setLabel('')
    })

  const revoke = (k: BypassKey) => {
    if (window.confirm(`認証キー「${k.label || '（名前なし）'}」を無効にしますか？このキーで公認になった ${k.users} 人の効果がすぐ外れます。`)) {
      void run(() => adminApi.revokeKey(k.id))
    }
  }

  return (
    <>
      <Section
        title="認証キーを発行"
        footer="発行したキーを設定画面で入力した利用者は「公認」になり、その人の登録は5人の合意を待たずにすぐ共有マスタに確定します。キーは発行時に一度だけ表示されます（データベースには保存されません）。">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}>
          <input className="left" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="用途の名前（例: 〇〇サロン用）" maxLength={100} />
          <button type="submit" className="link-btn bold">
            発行
          </button>
        </form>
        {issued ? (
          <div className="row issued-key">
            <div className="admin-main">
              <div className="item-meta">{issued.label || '（名前なし）'} のキー（この画面を離れると二度と表示されません）</div>
              <code>{issued.key}</code>
            </div>
            <button
              type="button"
              className="mini-btn ok"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(issued.key)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
              }}>
              {copied ? 'コピー済み' : 'コピー'}
            </button>
          </div>
        ) : null}
      </Section>
      <ErrorText message={error} />
      {data === null ? null : data.length === 0 ? null : (
        <Section title="発行済みのキー">
          {data.map((k) => (
            <div key={k.id} className={`row admin-item${k.active ? '' : ' dim'}`}>
              <div className="admin-main">
                <div>
                  <span className={`tag-kind ${k.active ? 'approved' : 'hidden'}`}>{k.active ? '有効' : '無効'}</span>
                  <strong>{k.label || '（名前なし）'}</strong>
                </div>
                <div className="item-meta">
                  公認 {k.users}人・発行 {when(k.created_at)}
                  {k.revoked_at ? `・無効化 ${when(k.revoked_at)}` : ''}
                </div>
              </div>
              {k.active ? (
                <div className="admin-actions">
                  <button type="button" className="mini-btn danger" onClick={() => revoke(k)}>
                    無効にする
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </Section>
      )}
    </>
  )
}
