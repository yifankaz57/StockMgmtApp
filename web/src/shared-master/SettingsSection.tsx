import { useState } from 'react'

import { errorMessage } from '@shared/inventory'
import { ErrorText, Section } from '@/components/ui'
import { navigate } from '@/router'
import {
  clearBypassKey,
  deleteMyAccount,
  getPostPreference,
  redeemBypassKey,
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
  const { ready, session, linkError } = useSharedSession()
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
        <>
          <ErrorText message={linkError ?? null} />
          <Login />
        </>
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
  const { status, error, reload } = useMyStatus(session)
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
              {status.banned
                ? '利用停止中'
                : status.trust === 'authority'
                  ? '公認（登録がすぐ確定します）'
                  : status.trust === 'trusted'
                    ? '信頼済み（登録がすぐ公開されます）'
                    : '新しい利用者'}
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
      {status && !status.banned ? <BypassKeyRow authority={status.trust === 'authority'} onChange={reload} /> : null}
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
      <div className="row">
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            const ok = window.confirm(
              'アカウントを削除しますか？\n\nメールアドレスと通報が削除され、元に戻せません。\n共有マスタに登録した商品名は、ほかの利用者との合意を保つため、あなたと結び付かない形（退会した利用者）で残ります。\n（この端末の在庫データは消えません）',
            )
            if (!ok) return
            deleteMyAccount()
              .then(() => alert('アカウントを削除しました。'))
              .catch((e) => alert(`アカウントを削除できませんでした: ${errorMessage(e)}`))
          }}>
          アカウントを削除
        </button>
      </div>
    </>
  )
}

/** 認証キー: 運営から受け取ったキーを入れると「公認」になり、登録がすぐ共有マスタに確定する */
function BypassKeyRow({ authority, onChange }: { authority: boolean; onChange: () => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    setMessage(null)
    try {
      setMessage({ text: await fn(), error: false })
      setKey('')
      onChange()
    } catch (e) {
      setMessage({ text: errorMessage(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  if (authority) {
    return (
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="row-label">認証キー</span>
        <span className="row-value">適用済み（公認）</span>
        <button
          type="button"
          className="link-btn"
          disabled={busy}
          onClick={() => {
            if (window.confirm('認証キーを外しますか？外すと、登録は通常どおり5人の合意が必要になります。')) {
              void run(async () => {
                await clearBypassKey()
                return '認証キーを外しました。'
              })
            }
          }}>
          外す
        </button>
        {message ? <div className={`key-message${message.error ? ' bad' : ''}`}>{message.text}</div> : null}
      </div>
    )
  }

  return (
    <form
      className="row"
      style={{ flexWrap: 'wrap' }}
      onSubmit={(e) => {
        e.preventDefault()
        void run(async () => `認証キー「${(await redeemBypassKey(key)) || '（名前なし）'}」を適用しました。登録がすぐ共有マスタに確定します。`)
      }}>
      <span className="row-label">認証キー</span>
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="運営から受け取ったキー"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      <button type="submit" className="link-btn bold" disabled={busy || key.trim().length < 8}>
        適用
      </button>
      {message ? <div className={`key-message${message.error ? ' bad' : ''}`}>{message.text}</div> : null}
    </form>
  )
}
