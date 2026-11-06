import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { errorMessage } from '@/lib/inventory';
import { askText } from './ask';
import {
  getCandidates,
  getPostPreference,
  isShareableJan,
  reportCandidate,
  sharedMasterEnabled,
  useSharedSession,
  type SharedCandidate,
} from './api';

type State =
  | { code: string; status: 'loading' }
  | { code: string; status: 'done'; items: SharedCandidate[] }
  | { code: string; status: 'error'; message: string };

const DEBOUNCE_MS = 400;

/** 共有マスタの候補（みんなが登録した商品名）。タップで入力欄に反映。ログイン中は通報できる */
export function SharedCandidates({
  barcode,
  currentName,
  onSelect,
}: {
  barcode: string;
  currentName: string;
  onSelect: (name: string, manufacturer: string) => void;
}) {
  const code = barcode.trim();
  const shareable = sharedMasterEnabled && isShareableJan(code);
  const { session } = useSharedSession();
  const [state, setState] = useState<State | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!shareable) return;
    let active = true;
    const timer = setTimeout(() => {
      setState({ code, status: 'loading' });
      getCandidates(code)
        .then((items) => {
          if (active) setState({ code, status: 'done', items });
        })
        .catch((e: unknown) => {
          if (active) setState({ code, status: 'error', message: errorMessage(e) });
        });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [shareable, code, reloadKey, session?.user.id]);

  if (!shareable) return null;

  const report = async (item: SharedCandidate) => {
    const reason = await askText(
      `「${item.name}」を運営に通報`,
      '内容がおかしい・宣伝や不適切な文字列など、理由を入力してください（任意・200文字まで）。',
      '通報する',
    );
    if (reason === null) return;
    try {
      const result = await reportCandidate(code, item.name_key, reason);
      setNotice(result === 'reported' ? '通報しました。運営が確認します。' : 'この候補はすでに通報済みです。');
    } catch (e) {
      setNotice(`通報できませんでした: ${errorMessage(e)}`);
    }
  };

  const current: State = state?.code === code ? state : { code, status: 'loading' };
  const posting = session && getPostPreference();

  return (
    <View style={styles.box}>
      <View style={styles.headRow}>
        <Ionicons name="people-outline" size={16} color={Colors.success} />
        <Text style={styles.head}>共有マスタ（みんなの登録）</Text>
      </View>
      {current.status === 'loading' ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.status}>検索中…</Text>
        </View>
      ) : current.status === 'error' ? (
        <View style={styles.statusRow}>
          <Text style={[styles.status, { color: Colors.danger, flexShrink: 1 }]}>{current.message}</Text>
          <Text style={styles.link} onPress={() => setReloadKey((k) => k + 1)}>
            再試行
          </Text>
        </View>
      ) : current.items.length === 0 ? (
        <Text style={styles.status}>まだ登録がありません。</Text>
      ) : (
        <View style={{ gap: 6 }}>
          {current.items.map((item) => {
            const active = item.name === currentName.trim();
            return (
              <View key={item.name_key} style={[styles.item, active && styles.itemActive]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onSelect(item.name, item.manufacturer)}
                  style={({ pressed }) => [styles.pick, pressed && { opacity: 0.6 }]}>
                  <View style={styles.nameRow}>
                    {active ? <Ionicons name="checkmark" size={15} color={Colors.success} /> : null}
                    <Text style={styles.name}>{item.name}</Text>
                  </View>
                  <Text style={styles.meta}>
                    {item.manufacturer ? `${item.manufacturer}・` : ''}
                    {item.supporters}人が登録
                    {item.mine ? '（あなたも）' : ''}
                  </Text>
                </Pressable>
                {item.confirmed ? <Text style={styles.confirmed}>確定</Text> : null}
                {session ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`「${item.name}」を運営に通報`}
                    hitSlop={8}
                    onPress={() => void report(item)}
                    style={({ pressed }) => [styles.reportBtn, pressed && { backgroundColor: '#FDECEA' }]}>
                    <Ionicons name="flag-outline" size={18} color={Colors.danger} />
                    <Text style={styles.reportText}>通報</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      {notice ? <Text style={styles.status}>{notice}</Text> : null}
      <Text style={styles.source}>
        {posting ? (
          '保存すると、この商品名を共有マスタにも登録します（設定で変更できます）。'
        ) : session ? (
          '共有マスタへの登録はオフです。'
        ) : (
          <>
            <Text style={styles.link} onPress={() => router.navigate('/settings')}>
              設定でログイン
            </Text>
            すると、共有マスタへの登録や通報ができます。
          </>
        )}
        5人が同じ名前で登録すると「確定」になります。
        {session ? '内容がおかしい候補は、右の「通報」から運営に知らせられます。' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#EEF4EC', gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  head: { fontSize: 13, fontWeight: '700', color: Colors.success },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 13, color: Colors.secondaryText },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingRight: 6,
  },
  itemActive: { borderColor: Colors.success, borderWidth: 1.5 },
  pick: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  meta: { fontSize: 12, color: Colors.secondaryText },
  confirmed: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: Colors.success,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reportBtn: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  reportText: { fontSize: 10, fontWeight: '700', color: Colors.danger },
  source: { fontSize: 11, color: Colors.secondaryText, lineHeight: 16 },
  link: { color: Colors.tint, textDecorationLine: 'underline' },
});
