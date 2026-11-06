import { useState } from 'react'

import { errorMessage } from '@shared/inventory'
import { ErrorText, Section } from '@/components/ui'
import { navigate } from '@/router'
import {
  getPostPreference,
  sendLoginCode,
  setPostPreference,
  sharedMasterEnabled,
  signOut,
  useMyStatus,
  useSharedSession,
  verifyLoginCode,
} from './api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 設定タブの「共有マスタ」: メールでのログイン、投稿のオン/オフ、自分の状態 */
export function SharedMasterSettings() {
  const { ready, session } = useSharedSession()
  if (!sharedMasterEnabled) return null
  return (
    <Section
      title="共有マスタ"
      footer="JANコードと商品名の対応を、利用者みんなで共有する仕組みです。候補を見るだけならログイン不要です。登録・通報にはメールアドレスでのログインが必要です。在庫数や履歴は共有されず、この端末にだけ保存されます。">
      {!ready ? (
        <div className="row" style={{ color: 'var(--text-2)' }}>
          読み込み中…
        </div>
      ) : session ? (
        <LoggedIn email={session.user.email ?? ''} />
      ) : (
        <Login />
      )}
    </Section>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => verifyLoginCode(sentTo, code))
        }}>
        <div className="row" style={{ fontSize: 14, color: 'var(--text-2)' }}>
          {sentTo} に確認コードを送りました。メールに書かれた数字を入力してください。
        </div>
        <label className="row">
          <span className="row-label">確認コード</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={10}
            autoFocus
          />
        </label>
        <ErrorText message={error} />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn secondary" onClick={() => setSentTo(null)} disabled={busy}>
            戻る
          </button>
          <button type="submit" className="btn" disabled={busy || code.length < 6}>
            ログイン
          </button>
        </div>
      </form>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const target = email.trim()
        void run(async () => {
          await sendLoginCode(target)
          setSentTo(target)
        })
      }}>
      <label className="row">
        <span className="row-label">メール</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
      </label>
      <ErrorText message={error} />
      <div className="row">
        <button type="submit" className="btn" disabled={busy || !EMAIL_RE.test(email.trim())}>
          確認コードを送る
        </button>
      </div>
    </form>
  )
}

function LoggedIn({ email }: { email: string }) {
  const { session } = useSharedSession()
  const { status, error } = useMyStatus(session)
  const [posting, setPosting] = useState(getPostPreference)

  return (
    <>
      <div className="row">
        <span className="row-label">ログイン中</span>
        <span className="row-value">{email}</span>
      </div>
      {status ? (
        <>
          <div className="row">
            <span className="row-label">信頼度</span>
            <span className="row-value">
              {status.banned ? '利用停止中' : status.trust === 'trusted' ? '信頼済み（登録がすぐ公開されます）' : '新しい利用者'}
            </span>
          </div>
          <div className="row">
            <span className="row-label">今日の登録</span>
            <span className="row-value">
              {status.proposals_today} / {status.proposal_limit} 件（24時間）
            </span>
          </div>
        </>
      ) : null}
      <ErrorText message={error} />
      <label className="row">
        <span className="row-label">登録時に共有する</span>
        <span style={{ flex: 1 }} />
        <input
          type="checkbox"
          className="switch"
          checked={posting}
          onChange={(e) => {
            setPosting(e.target.checked)
            setPostPreference(e.target.checked)
          }}
        />
      </label>
      {status?.is_admin ? (
        <button type="button" className="row link-row" onClick={() => navigate('/admin')}>
          <span className="row-label">運営の管理画面</span>
          <span className="row-value">開く ›</span>
        </button>
      ) : null}
      <div className="row">
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            if (window.confirm('共有マスタからログアウトしますか？（端末の在庫データはそのまま残ります）')) {
              signOut().catch((e) => alert(errorMessage(e)))
            }
          }}>
          ログアウト
        </button>
      </div>
    </>
  )
}
