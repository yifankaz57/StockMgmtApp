import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { isInStoreCode } from '@shared/inventory'
import { isValidJan } from '@shared/jan'
import { normalizeSupabaseUrl } from '@shared/supabase-url'
import { takeAuthRedirect } from './auth-redirect'

// 共有マスタ（Supabase）との通信。
// ビルド時に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定したときだけ有効になる（未設定なら画面にも出ない）。
// anon key は公開して良い鍵。データの保護はデータベース側の権限（supabase/migrations）で行う。

// 「…supabase.co/rest/v1/」のように余分なパスが付いていても、ホストだけにして使う
const SUPABASE_URL = normalizeSupabaseUrl(String(import.meta.env.VITE_SUPABASE_URL ?? ''))
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const sharedMasterEnabled = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== ''

let clientPromise: Promise<SupabaseClient> | null = null

/** Supabase のライブラリは、共有マスタを使うときだけ読み込む（アプリ本体を軽く保つ） */
function sb(): Promise<SupabaseClient> {
  if (!sharedMasterEnabled) return Promise.reject(new Error('共有マスタは設定されていません。'))
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'stock-scan-shared-master' },
    }),
  )
  return clientPromise
}

function toMessage(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? '不明なエラー'
  if (/failed to fetch|networkerror|load failed/i.test(message)) return '通信できませんでした。電波の良い場所でもう一度お試しください。'
  if (/rate limit|too many/i.test(message)) return '短時間に操作が集中しました。少し待ってからお試しください。'
  if (/token has expired|invalid.*(otp|token)/i.test(message)) return '確認コードが正しくないか、有効期限が切れています。'
  return message
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (await sb()).rpc(fn, args)
  if (error) throw new Error(toMessage(error))
  return data as T
}

// ---------- ログイン状態 ----------

type SessionState = { ready: boolean; session: Session | null; /** メールのリンクからのログインに失敗したときの理由 */ linkError?: string }

let sessionState: SessionState = { ready: !sharedMasterEnabled, session: null }
const listeners = new Set<() => void>()
let started = false

function setSession(next: SessionState) {
  sessionState = next
  listeners.forEach((l) => l())
}

function startSessionTracking() {
  if (started || !sharedMasterEnabled) return
  started = true
  sb()
    .then(async (client) => {
      client.auth.onAuthStateChange((_event, session) => setSession({ ready: true, session, linkError: sessionState.linkError }))
      // メールのリンクから開かれた場合は、そのログイン情報でログインする
      const redirect = takeAuthRedirect()
      if (redirect && 'accessToken' in redirect) {
        const { data, error } = await client.auth.setSession({ access_token: redirect.accessToken, refresh_token: redirect.refreshToken })
        if (!error) {
          setSession({ ready: true, session: data.session })
          return
        }
        sessionState = { ...sessionState, linkError: `メールのリンクからログインできませんでした（${toMessage(error)}）。` }
      } else if (redirect) {
        sessionState = { ...sessionState, linkError: redirect.error }
      }
      const { data } = await client.auth.getSession()
      setSession({ ready: true, session: data.session, linkError: sessionState.linkError })
    })
    .catch(() => setSession({ ready: true, session: null }))
}

/** ログイン中のセッション（未ログインなら null） */
export function useSharedSession(): SessionState {
  useEffect(startSessionTracking, [])
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => sessionState,
  )
}

/** メールに確認コードを送る（初めてのアドレスなら利用者を作る） */
export async function sendLoginCode(email: string): Promise<void> {
  const { error } = await (await sb()).auth.signInWithOtp({
    email: email.trim(),
    // メールのリンクを押したときの戻り先。いま開いているアプリの URL（Supabase の Redirect URLs に登録が必要。
    // 未登録なら Supabase は Site URL に戻す）
    options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
  })
  if (error) throw new Error(toMessage(error))
}

/** メールで届いた確認コードでログインする */
export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const { error } = await (await sb()).auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
  if (error) throw new Error(toMessage(error))
}

export async function signOut(): Promise<void> {
  const { error } = await (await sb()).auth.signOut()
  if (error) throw new Error(toMessage(error))
}

// ---------- 自分の状態 ----------

export type MyStatus = { trust: 'new' | 'trusted'; banned: boolean; is_admin: boolean; proposals_today: number; proposal_limit: number }

/** ログイン中の利用者の状態（信頼度・運営者か・今日の投稿数）。reload で取り直す */
export function useMyStatus(session: Session | null): { status: MyStatus | null; error: string | null; reload: () => void } {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{ userId: string; status: MyStatus | null; error: string | null } | null>(null)
  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) return
    let active = true
    rpc<MyStatus[]>('my_status')
      .then((rows) => active && setResult({ userId, status: rows[0] ?? null, error: null }))
      .catch((e: Error) => active && setResult({ userId, status: null, error: e.message }))
    return () => {
      active = false
    }
  }, [userId, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  if (!userId || result?.userId !== userId) return { status: null, error: null, reload }
  return { status: result.status, error: result.error, reload }
}

// ---------- 候補・投稿・通報 ----------

export type SharedCandidate = {
  name_key: string
  name: string
  manufacturer: string
  supporters: number
  confirmed: boolean
  mine: boolean
}

/** 共有マスタに投稿できるコードか（JAN の形式が正しく、店内コードでない） */
export function isShareableJan(code: string): boolean {
  const c = code.trim()
  return isValidJan(c) && !isInStoreCode(c)
}

export async function getCandidates(jan: string): Promise<SharedCandidate[]> {
  return rpc<SharedCandidate[]>('get_candidates', { p_jan: jan.trim() })
}

const POST_PREF_KEY = 'shared-master-post'

/** 登録時に共有マスタへ投稿するか（端末ごとの設定。既定は投稿する） */
export function getPostPreference(): boolean {
  try {
    return localStorage.getItem(POST_PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setPostPreference(on: boolean): void {
  try {
    localStorage.setItem(POST_PREF_KEY, on ? 'on' : 'off')
  } catch {
    // 保存できなくても今回の操作には影響しない
  }
}

export type SubmitResult = { result: 'added' | 'already'; proposals_today: number; proposal_limit: number }

export async function submitProposal(jan: string, name: string, manufacturer: string): Promise<SubmitResult> {
  const rows = await rpc<SubmitResult[]>('submit_proposal', { p_jan: jan.trim(), p_name: name.trim(), p_manufacturer: manufacturer.trim() })
  return rows[0]
}

/**
 * 商品を端末に保存したあとに呼ぶ。ログイン中で、投稿する設定で、共有できるコードなら共有マスタに提案する。
 * 投稿しなかった場合は null。失敗したら例外。
 */
export async function shareAfterSave(jan: string, name: string, manufacturer: string): Promise<SubmitResult | null> {
  if (!sharedMasterEnabled || !sessionState.session || !getPostPreference() || !isShareableJan(jan)) return null
  return submitProposal(jan, name, manufacturer)
}

export async function reportCandidate(jan: string, nameKey: string, reason: string): Promise<'reported' | 'already'> {
  return rpc<'reported' | 'already'>('report_candidate', { p_jan: jan.trim(), p_name_key: nameKey, p_reason: reason })
}

// ---------- 運営 ----------

export type QueueItem = {
  kind: 'report' | 'pending'
  jan: string
  name_key: string
  name: string
  manufacturer: string
  supporters: number
  open_reports: number
  reasons: string[]
  first_at: string
}

export type HistoryItem = {
  proposal_id: number
  name: string
  name_key: string
  manufacturer: string
  status: 'active' | 'approved' | 'hidden'
  user_id: string
  user_email: string | null
  user_trusted: boolean
  user_banned: boolean
  created_at: string
}

export type BannedUser = { user_id: string; user_email: string | null; banned_reason: string; proposals: number }
export type LogItem = { id: number; admin_email: string | null; action: string; target: string; detail: Record<string, unknown>; created_at: string }
export type ModerationAction = 'approve' | 'hide' | 'restore'

export const adminApi = {
  queue: () => rpc<QueueItem[]>('admin_queue'),
  janHistory: (jan: string) => rpc<HistoryItem[]>('admin_jan_history', { p_jan: jan.trim() }),
  setCandidate: (jan: string, nameKey: string, action: ModerationAction) =>
    rpc<number>('admin_set_candidate', { p_jan: jan, p_name_key: nameKey, p_action: action }),
  setProposal: (id: number, action: ModerationAction) => rpc<void>('admin_set_proposal', { p_id: id, p_action: action }),
  dismissReports: (jan: string, nameKey: string) => rpc<number>('admin_dismiss_reports', { p_jan: jan, p_name_key: nameKey }),
  setBanned: (userId: string, banned: boolean, reason = '') =>
    rpc<void>('admin_set_banned', { p_user_id: userId, p_banned: banned, p_reason: reason }),
  setTrust: (userId: string, trust: 'new' | 'trusted') => rpc<void>('admin_set_trust', { p_user_id: userId, p_trust: trust }),
  bannedUsers: () => rpc<BannedUser[]>('admin_banned_users'),
  log: (limit = 100) => rpc<LogItem[]>('admin_log', { p_limit: limit }),
}
