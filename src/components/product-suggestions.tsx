import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { errorMessage } from '@/lib/inventory';
import { isValidJan, type ProductSuggestions as Suggestions, type Suggestion } from '@/lib/jan';
import { lookupProductByJan } from '@/lib/product-lookup';

type State =
  | { status: 'idle' }
  | { status: 'loading'; code: string }
  | { status: 'done'; code: string; result: Suggestions }
  | { status: 'error'; code: string; message: string };

const DEBOUNCE_MS = 500;

/**
 * JAN コードから推定した商品名・メーカー名の候補を表示する。
 * 候補をタップすると onSelectName / onSelectManufacturer が呼ばれる（入力欄は上書きしない限り変わらない）。
 */
export function ProductSuggestions({
  barcode,
  autoSearch,
  currentName,
  currentManufacturer,
  onSelectName,
  onSelectManufacturer,
}: {
  barcode: string;
  /** true ならバーコードが変わるたびに自動検索（新規登録時）。false なら検索ボタンを表示（編集時） */
  autoSearch: boolean;
  currentName: string;
  currentManufacturer: string;
  onSelectName: (name: string) => void;
  onSelectManufacturer: (manufacturer: string) => void;
}) {
  const code = barcode.trim();
  const valid = isValidJan(code);
  const [state, setState] = useState<State>({ status: 'idle' });
  const [requestedCode, setRequestedCode] = useState<string | null>(autoSearch ? code : null);

  // 自動検索モードではバーコードの変更に追従（入力途中の連続変更はまとめる）
  useEffect(() => {
    if (!autoSearch) return;
    const timer = setTimeout(() => setRequestedCode(code), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [autoSearch, code]);

  useEffect(() => {
    if (!requestedCode || !isValidJan(requestedCode)) return;
    const controller = new AbortController();
    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) setState({ status: 'loading', code: requestedCode });
        return lookupProductByJan(requestedCode, controller.signal);
      })
      .then((result) => {
        if (active) setState({ status: 'done', code: requestedCode, result });
      })
      .catch((e: unknown) => {
        if (active) setState({ status: 'error', code: requestedCode, message: errorMessage(e) });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [requestedCode]);

  if (!valid) return null;

  const isCurrent = requestedCode === code;

  if (!autoSearch && !isCurrent) {
    return (
      <Pressable onPress={() => setRequestedCode(code)} style={({ pressed }) => [styles.searchButton, pressed && { opacity: 0.6 }]}>
        <Ionicons name="sparkles-outline" size={16} color={Colors.tint} />
        <Text style={styles.searchButtonText}>JANコードから商品名・メーカーの候補を検索</Text>
      </Pressable>
    );
  }

  if (state.status === 'idle' || state.status === 'loading' || state.code !== code) {
    return (
      <View style={styles.box}>
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={Colors.tint} />
          <Text style={styles.statusText}>JANコードから候補を検索中…</Text>
        </View>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.box}>
        <View style={styles.statusRow}>
          <Ionicons name="cloud-offline-outline" size={16} color={Colors.secondaryText} />
          <Text style={styles.statusText}>{state.message}</Text>
        </View>
      </View>
    );
  }

  const { names, manufacturers, sources } = state.result;
  if (names.length === 0 && manufacturers.length === 0) {
    return (
      <View style={styles.box}>
        <View style={styles.statusRow}>
          <Ionicons name="search-outline" size={16} color={Colors.secondaryText} />
          <Text style={styles.statusText}>このJANコードの候補は見つかりませんでした。手入力してください。</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={14} color={Colors.tint} />
        <Text style={styles.headerText}>候補（推定）タップで入力</Text>
      </View>
      {names.length > 0 ? (
        <SuggestionGroup label="商品名" items={names} selected={currentName} onSelect={onSelectName} />
      ) : null}
      {manufacturers.length > 0 ? (
        <SuggestionGroup label="メーカー" items={manufacturers} selected={currentManufacturer} onSelect={onSelectManufacturer} />
      ) : null}
      <Text style={styles.source}>出典: {sources.join('、')}。内容は推定のため確認してください。</Text>
    </View>
  );
}

function SuggestionGroup({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: Suggestion[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chips}>
        {items.map((item) => {
          const active = item.value === selected.trim();
          return (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityLabel={`${label}に「${item.value}」を入力`}
              onPress={() => onSelect(item.value)}
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}>
              {active ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              <Text style={[styles.chipText, active && { color: '#fff' }]} numberOfLines={2}>
                {item.value}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: Colors.tintLight, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 13, color: Colors.secondaryText, flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerText: { fontSize: 13, fontWeight: '700', color: Colors.tint },
  group: { gap: 6 },
  groupLabel: { fontSize: 12, color: Colors.secondaryText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.tint, borderColor: Colors.tint },
  chipText: { fontSize: 14, color: Colors.text, flexShrink: 1 },
  source: { fontSize: 11, color: Colors.secondaryText },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.tintLight,
  },
  searchButtonText: { fontSize: 14, fontWeight: '600', color: Colors.tint, flexShrink: 1 },
});
