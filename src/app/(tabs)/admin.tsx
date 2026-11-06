import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorText, Section, Segmented } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { formatDateTime } from '@/lib/csv';
import { errorMessage } from '@/lib/inventory';
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
} from '@/shared-master/api';
import { askText, confirmAction } from '@/shared-master/ask';

type Tab = 'queue' | 'history' | 'banned' | 'keys' | 'log';

const TABS: { value: Tab; label: string }[] = [
  { value: 'queue', label: '確認待ち' },
  { value: 'history', label: 'JAN履歴' },
  { value: 'banned', label: '締め出し' },
  { value: 'keys', label: 'キー' },
  { value: 'log', label: '操作記録' },
];

const STATUS_LABELS: Record<HistoryItem['status'], string> = { active: '通常', approved: '承認済み', hidden: '非表示' };

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
};

const when = (iso: string) => formatDateTime(iso).slice(0, 16);

/** 運営の管理画面（運営者としてログインしたときだけタブが出る） */
export default function AdminScreen() {
  const { ready, session } = useSharedSession();
  const { status } = useMyStatus(session);
  const [tab, setTab] = useState<Tab>('queue');
  const [historyJan, setHistoryJan] = useState('');

  if (!ready || (session && !status)) return null;
  if (!status?.is_admin) {
    return <EmptyState icon="shield-outline" title="運営者の権限がありません" message="運営者のアカウントで設定タブからログインしてください。" />;
  }

  const openHistory = (jan: string) => {
    setHistoryJan(jan);
    setTab('history');
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ marginHorizontal: 16, marginTop: 12 }}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </View>
      {tab === 'queue' ? <Queue onOpenHistory={openHistory} /> : null}
      {tab === 'history' ? <History key={historyJan} initialJan={historyJan} /> : null}
      {tab === 'banned' ? <Banned /> : null}
      {tab === 'keys' ? <Keys /> : null}
      {tab === 'log' ? <Log /> : null}
    </View>
  );
}

/** 読み込み・再読み込み・エラー表示の共通処理 */
function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    load()
      .then((d) => {
        if (!active) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [load, version]);

  const reload = useCallback(() => {
    setRefreshing(true);
    setVersion((v) => v + 1);
  }, []);
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        reload();
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [reload],
  );
  return { data, error, reload, run, refreshing };
}

function MiniButton({ title, kind, onPress }: { title: string; kind?: 'ok' | 'danger'; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.mini, kind === 'ok' && styles.miniOk, kind === 'danger' && styles.miniDanger, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.miniText, kind === 'ok' && { color: '#fff' }, kind === 'danger' && { color: Colors.danger }]}>{title}</Text>
    </Pressable>
  );
}

function Tag({ text, kind }: { text: string; kind: 'danger' | 'warning' | 'ok' | 'plain' }) {
  const palette = {
    danger: { color: Colors.danger, backgroundColor: '#FDECEA' },
    warning: { color: Colors.warning, backgroundColor: Colors.warningLight },
    ok: { color: Colors.success, backgroundColor: '#E6F4EA' },
    plain: { color: Colors.secondaryText, backgroundColor: Colors.fill },
  }[kind];
  return <Text style={[styles.tag, palette]}>{text}</Text>;
}

function Item({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return <View style={[styles.item, dim && { opacity: 0.55 }]}>{children}</View>;
}

function Queue({ onOpenHistory }: { onOpenHistory: (jan: string) => void }) {
  const { data, error, run, reload, refreshing } = useLoad(adminApi.queue);

  const act = async (item: QueueItem, action: ModerationAction | 'dismiss') => {
    const label = { approve: '承認', hide: '非表示に', restore: '元に戻し', dismiss: '通報を却下し' }[action];
    if (!(await confirmAction(`「${item.name}」（${item.jan}）を${label}ますか？`, '', 'はい', action === 'hide'))) return;
    void run(() => (action === 'dismiss' ? adminApi.dismissReports(item.jan, item.name_key) : adminApi.setCandidate(item.jan, item.name_key, action)));
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <ErrorText message={error} />
      {data === null ? null : data.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title="確認待ちはありません" />
      ) : (
        <Section footer="「保留」は新しい利用者1人だけが登録した候補です。承認すると公開されます（別の人が同じ名前を登録しても公開されます）。">
          {data.map((item) => (
            <Item key={`${item.jan}/${item.name_key}`}>
              <View style={styles.titleRow}>
                {item.kind === 'report' ? <Tag text={`通報 ${item.open_reports}件`} kind="danger" /> : <Tag text="保留" kind="warning" />}
                <Text style={styles.title}>{item.name}</Text>
              </View>
              <Text style={styles.meta}>
                {item.jan}
                {item.manufacturer ? `・${item.manufacturer}` : ''}・{item.supporters}人が登録・{when(item.first_at)}
              </Text>
              {item.reasons.length > 0 ? <Text style={styles.reasons}>理由: {item.reasons.join(' ／ ')}</Text> : null}
              <View style={styles.actions}>
                {item.kind === 'pending' ? (
                  <MiniButton title="承認" kind="ok" onPress={() => void act(item, 'approve')} />
                ) : (
                  <MiniButton title="却下" onPress={() => void act(item, 'dismiss')} />
                )}
                <MiniButton title="非表示" kind="danger" onPress={() => void act(item, 'hide')} />
                <MiniButton title="履歴" onPress={() => onOpenHistory(item.jan)} />
              </View>
            </Item>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function History({ initialJan }: { initialJan: string }) {
  const [input, setInput] = useState(initialJan);
  const [jan, setJan] = useState(initialJan);
  const load = useCallback(() => (jan ? adminApi.janHistory(jan) : Promise.resolve([] as HistoryItem[])), [jan]);
  const { data, error, run } = useLoad(load);

  const setProposal = (item: HistoryItem, action: ModerationAction) => void run(() => adminApi.setProposal(item.proposal_id, action));
  const ban = async (item: HistoryItem) => {
    const who = item.user_email ?? item.user_id;
    if (item.user_banned) {
      if (await confirmAction(`${who} の締め出しを解除しますか？`, '', '解除')) void run(() => adminApi.setBanned(item.user_id, false));
      return;
    }
    const reason = await askText(`${who} を締め出します`, 'この人の登録はすべて集計から外れます（解除で戻ります）。理由:', '締め出す');
    if (reason !== null) void run(() => adminApi.setBanned(item.user_id, true, reason));
  };
  const trust = (item: HistoryItem) => void run(() => adminApi.setTrust(item.user_id, item.user_trusted ? 'new' : 'trusted'));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={styles.search}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="JANコードで検索"
          placeholderTextColor="#A0A0A6"
          keyboardType="number-pad"
          returnKeyType="search"
          onSubmitEditing={() => setJan(input.trim())}
          style={styles.searchInput}
        />
        <Text style={styles.link} onPress={() => setJan(input.trim())}>
          検索
        </Text>
      </View>
      <ErrorText message={error} />
      {!jan ? null : data && data.length === 0 ? (
        <EmptyState icon="search" title="このJANコードの登録はありません" />
      ) : (
        <Section title={jan} footer="提案ごとに 承認 / 非表示 / 元に戻す ができます。締め出すと、その人の登録はすべて集計から外れます（解除で戻ります）。">
          {(data ?? []).map((item) => (
            <Item key={item.proposal_id} dim={item.status === 'hidden'}>
              <View style={styles.titleRow}>
                <Tag text={STATUS_LABELS[item.status]} kind={item.status === 'hidden' ? 'danger' : item.status === 'approved' ? 'ok' : 'plain'} />
                <Text style={styles.title}>{item.name}</Text>
              </View>
              <Text style={styles.meta}>
                {item.manufacturer ? `${item.manufacturer}・` : ''}
                {when(item.created_at)}
              </Text>
              <Text style={styles.meta}>
                {item.user_email ?? '（退会した利用者）'}
                {item.user_trusted ? '・信頼済み' : ''}
                {item.user_banned ? '・締め出し中' : ''}
              </Text>
              <View style={styles.actions}>
                {item.status === 'hidden' ? (
                  <MiniButton title="元に戻す" onPress={() => setProposal(item, 'restore')} />
                ) : (
                  <>
                    {item.status === 'active' ? <MiniButton title="承認" kind="ok" onPress={() => setProposal(item, 'approve')} /> : null}
                    <MiniButton title="非表示" kind="danger" onPress={() => setProposal(item, 'hide')} />
                  </>
                )}
                {item.user_email !== null ? (
                  <>
                    <MiniButton title={item.user_trusted ? '信頼を外す' : '信頼する'} onPress={() => trust(item)} />
                    <MiniButton title={item.user_banned ? '解除' : '締め出す'} kind={item.user_banned ? undefined : 'danger'} onPress={() => void ban(item)} />
                  </>
                ) : null}
              </View>
            </Item>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Banned() {
  const { data, error, run, reload, refreshing } = useLoad(adminApi.bannedUsers);
  const unban = async (u: BannedUser) => {
    if (await confirmAction(`${u.user_email ?? u.user_id} の締め出しを解除しますか？`, '', '解除')) void run(() => adminApi.setBanned(u.user_id, false));
  };
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <ErrorText message={error} />
      {data === null ? null : data.length === 0 ? (
        <EmptyState icon="people-outline" title="締め出し中の利用者はいません" message="締め出すには「JAN履歴」で対象の登録を開いてください。" />
      ) : (
        <Section footer="締め出すには「JAN履歴」で対象の登録を開いてください。">
          {data.map((u) => (
            <Item key={u.user_id}>
              <Text style={styles.title}>{u.user_email ?? u.user_id}</Text>
              <Text style={styles.meta}>
                登録 {u.proposals}件{u.banned_reason ? `・理由: ${u.banned_reason}` : ''}
              </Text>
              <View style={styles.actions}>
                <MiniButton title="解除" onPress={() => void unban(u)} />
              </View>
            </Item>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Log() {
  const load = useCallback(() => adminApi.log(200), []);
  const { data, error, reload, refreshing } = useLoad<LogItem[]>(load);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <ErrorText message={error} />
      {data === null ? null : data.length === 0 ? (
        <EmptyState icon="time-outline" title="操作の記録はまだありません" />
      ) : (
        <Section>
          {data.map((l) => (
            <Item key={l.id}>
              <Text style={styles.title}>{ACTION_LABELS[l.action] ?? l.action}</Text>
              <Text style={styles.meta}>{l.target}</Text>
              <Text style={styles.meta}>
                {when(l.created_at)}・{l.admin_email ?? '（削除された運営者）'}
                {typeof l.detail.reason === 'string' && l.detail.reason ? `・理由: ${l.detail.reason}` : ''}
              </Text>
            </Item>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Keys() {
  const { data, error, run, reload, refreshing } = useLoad<BypassKey[]>(adminApi.listKeys);
  const [label, setLabel] = useState('');
  const [issued, setIssued] = useState<{ key: string; label: string } | null>(null);

  const create = () =>
    void run(async () => {
      const key = await adminApi.createKey(label);
      setIssued({ key, label });
      setLabel('');
    });

  const revoke = async (k: BypassKey) => {
    if (
      await confirmAction(
        `認証キー「${k.label || '（名前なし）'}」を無効にしますか？`,
        `このキーで公認になった ${k.users} 人の効果がすぐ外れます。`,
        '無効にする',
        true,
      )
    ) {
      void run(() => adminApi.revokeKey(k.id));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <Section
        title="認証キーを発行"
        footer="発行したキーを設定画面で入力した利用者は「公認」になり、その人の登録は5人の合意を待たずにすぐ共有マスタに確定します。キーは発行時に一度だけ表示されます（データベースには保存されません）。">
        <View style={[styles.item, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="用途の名前（例: 〇〇サロン用）"
            placeholderTextColor="#A0A0A6"
            maxLength={100}
            style={[styles.searchInput, { paddingVertical: 4 }]}
          />
          <Text style={[styles.link, { fontWeight: '700' }]} onPress={create}>
            発行
          </Text>
        </View>
        {issued ? (
          <View style={[styles.item, { backgroundColor: '#EEF4EC' }]}>
            <Text style={styles.meta}>{issued.label || '（名前なし）'} のキー（この画面を離れると二度と表示されません。長押しでコピー）</Text>
            <Text selectable style={styles.issuedKey}>
              {issued.key}
            </Text>
          </View>
        ) : null}
      </Section>
      <ErrorText message={error} />
      {data && data.length > 0 ? (
        <Section title="発行済みのキー">
          {data.map((k) => (
            <Item key={k.id} dim={!k.active}>
              <View style={styles.titleRow}>
                <Tag text={k.active ? '有効' : '無効'} kind={k.active ? 'ok' : 'danger'} />
                <Text style={styles.title}>{k.label || '（名前なし）'}</Text>
              </View>
              <Text style={styles.meta}>
                公認 {k.users}人・発行 {when(k.created_at)}
                {k.revoked_at ? `・無効化 ${when(k.revoked_at)}` : ''}
              </Text>
              {k.active ? (
                <View style={styles.actions}>
                  <MiniButton title="無効にする" kind="danger" onPress={() => void revoke(k)} />
                </View>
              ) : null}
            </Item>
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: { paddingHorizontal: 16, paddingVertical: 12, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  meta: { fontSize: 12, color: Colors.secondaryText },
  reasons: { fontSize: 12, color: Colors.danger },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  mini: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.fill },
  miniOk: { backgroundColor: Colors.success },
  miniDanger: { backgroundColor: '#FDECEA' },
  miniText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  tag: { fontSize: 11, fontWeight: '700', borderRadius: 6, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.fill,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 9, color: Colors.text },
  link: { color: Colors.tint, fontSize: 16 },
  issuedKey: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5, color: Colors.text, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
});
