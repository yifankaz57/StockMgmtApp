import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { isInStoreCode } from '@/lib/inventory';
import { isValidJan } from '@/lib/jan';
import { normalizeSupabaseUrl } from '../../shared/supabase-url';

// 共有マスタ（Supabase）との通信（アプリ版）。
// .env.local（または EAS の環境変数）に EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定したときだけ有効。
// anon key は公開して良い鍵。データの保護はデータベース側の権限（supabase/migrations）で行う。
// ログイン状態は expo-sqlite の key-value ストアに保存する。

// 「…supabase.co/rest/v1/」のように余分なパスが付いていても、ホストだけにして使う
const SUPABASE_URL = normalizeSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const sharedMasterEnabled = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

let client: SupabaseClient | null = null;

function sb(): SupabaseClient {
  if (!sharedMasterEnabled) throw new Error('共有マスタは設定されていません。');
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: Storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'stock-scan-shared-master' },
    });
    // アプリが前面にあるときだけログインの自動更新を動かす（React Native での推奨）
    const current = client;
    if (AppState.currentState === 'active') current.auth.startAutoRefresh();
    AppState.addEventListener('change', (state) => {
      if (state === 'active') current.auth.startAutoRefresh();
      else current.auth.stopAutoRefresh();
    });
  }
  return client;
}

function toMessage(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? '不明なエラー';
  if (/network request failed|failed to fetch|networkerror/i.test(message)) return '通信できませんでした。電波の良い場所でもう一度お試しください。';
  if (/rate limit|too many/i.test(message)) return '短時間に操作が集中しました。少し待ってからお試しください。';
  if (/token has expired|invalid.*(otp|token)/i.test(message)) return '確認コードが正しくないか、有効期限が切れています。';
  return message;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(toMessage(error));
  return data as T;
}

// ---------- ログイン状態 ----------

type SessionState = { ready: boolean; session: Session | null };

let sessionState: SessionState = { ready: !sharedMasterEnabled, session: null };
const listeners = new Set<() => void>();
let started = false;

function setSession(next: SessionState) {
  sessionState = next;
  listeners.forEach((l) => l());
}

function startSessionTracking() {
  if (started || !sharedMasterEnabled) return;
  started = true;
  const c = sb();
  c.auth.onAuthStateChange((_event, session) => setSession({ ready: true, session }));
  c.auth
    .getSession()
    .then(({ data }) => setSession({ ready: true, session: data.session }))
    .catch(() => setSession({ ready: true, session: null }));
}

/** ログイン中のセッション（未ログインなら null） */
export function useSharedSession(): SessionState {
  useEffect(startSessionTracking, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sessionState,
  );
}

/** メールに確認コードを送る（初めてのアドレスなら利用者を作る） */
export async function sendLoginCode(email: string): Promise<void> {
  const { error } = await sb().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw new Error(toMessage(error));
}

/** メールで届いた確認コードでログインする */
export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const { error } = await sb().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error) throw new Error(toMessage(error));
}

export async function signOut(): Promise<void> {
  const { error } = await sb().auth.signOut();
  if (error) throw new Error(toMessage(error));
}

// ---------- 自分の状態 ----------

export type MyStatus = { trust: 'new' | 'trusted' | 'authority'; banned: boolean; is_admin: boolean; proposals_today: number; proposal_limit: number };

/** ログイン中の利用者の状態（信頼度・運営者か・今日の投稿数）。reload で取り直す */
export function useMyStatus(session: Session | null): { status: MyStatus | null; error: string | null; reload: () => void } {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ userId: string; status: MyStatus | null; error: string | null } | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    rpc<MyStatus[]>('my_status')
      .then((rows) => {
        if (active) setResult({ userId, status: rows[0] ?? null, error: null });
      })
      .catch((e: Error) => {
        if (active) setResult({ userId, status: null, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [userId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  if (!userId || result?.userId !== userId) return { status: null, error: null, reload };
  return { status: result.status, error: result.error, reload };
}

// ---------- 認証キー（公認） ----------

/** 認証キーを適用して公認になる。成功したらキーの名前を返す。キーが違えば例外 */
export async function redeemBypassKey(key: string): Promise<string> {
  const label = await rpc<string | null>('redeem_bypass_key', { p_key: key });
  if (label === null) throw new Error('認証キーが正しくないか、無効になっています。');
  return label;
}

/** 自分の認証キーを外す（公認をやめる） */
export async function clearBypassKey(): Promise<void> {
  await rpc<void>('clear_bypass_key');
}

// ---------- 候補・投稿・通報 ----------

export type SharedCandidate = {
  name_key: string;
  name: string;
  manufacturer: string;
  supporters: number;
  confirmed: boolean;
  mine: boolean;
};

/** 共有マスタに投稿できるコードか（JAN の形式が正しく、店内コードでない） */
export function isShareableJan(code: string): boolean {
  const c = code.trim();
  return isValidJan(c) && !isInStoreCode(c);
}

export async function getCandidates(jan: string): Promise<SharedCandidate[]> {
  return rpc<SharedCandidate[]>('get_candidates', { p_jan: jan.trim() });
}

const POST_PREF_KEY = 'shared-master-post';

/** 登録時に共有マスタへ投稿するか（端末ごとの設定。既定は投稿する） */
export function getPostPreference(): boolean {
  try {
    return Storage.getItemSync(POST_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setPostPreference(on: boolean): void {
  try {
    Storage.setItemSync(POST_PREF_KEY, on ? 'on' : 'off');
  } catch {
    // 保存できなくても今回の操作には影響しない
  }
}

export type SubmitResult = { result: 'added' | 'already'; proposals_today: number; proposal_limit: number };

export async function submitProposal(jan: string, name: string, manufacturer: string): Promise<SubmitResult> {
  const rows = await rpc<SubmitResult[]>('submit_proposal', { p_jan: jan.trim(), p_name: name.trim(), p_manufacturer: manufacturer.trim() });
  return rows[0];
}

/**
 * 商品を端末に保存したあとに呼ぶ。ログイン中で、投稿する設定で、共有できるコードなら共有マスタに提案する。
 * 投稿しなかった場合は null。失敗したら例外。
 */
export async function shareAfterSave(jan: string, name: string, manufacturer: string): Promise<SubmitResult | null> {
  if (!sharedMasterEnabled || !sessionState.session || !getPostPreference() || !isShareableJan(jan)) return null;
  return submitProposal(jan, name, manufacturer);
}

export async function reportCandidate(jan: string, nameKey: string, reason: string): Promise<'reported' | 'already'> {
  return rpc<'reported' | 'already'>('report_candidate', { p_jan: jan.trim(), p_name_key: nameKey, p_reason: reason });
}

// ---------- 運営 ----------

export type QueueItem = {
  kind: 'report' | 'pending';
  jan: string;
  name_key: string;
  name: string;
  manufacturer: string;
  supporters: number;
  open_reports: number;
  reasons: string[];
  first_at: string;
};

export type HistoryItem = {
  proposal_id: number;
  name: string;
  name_key: string;
  manufacturer: string;
  status: 'active' | 'approved' | 'hidden';
  user_id: string;
  user_email: string | null;
  user_trusted: boolean;
  user_banned: boolean;
  created_at: string;
};

export type BannedUser = { user_id: string; user_email: string | null; banned_reason: string; proposals: number };
export type LogItem = { id: number; admin_email: string | null; action: string; target: string; detail: Record<string, unknown>; created_at: string };
export type ModerationAction = 'approve' | 'hide' | 'restore';
export type BypassKey = { id: number; label: string; active: boolean; users: number; created_at: string; revoked_at: string | null };

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
  createKey: (label: string) => rpc<string>('admin_create_bypass_key', { p_label: label }),
  listKeys: () => rpc<BypassKey[]>('admin_list_bypass_keys'),
  revokeKey: (id: number) => rpc<void>('admin_revoke_bypass_key', { p_id: id }),
};
