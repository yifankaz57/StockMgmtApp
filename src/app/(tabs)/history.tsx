import { router, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';

import { TransactionRow } from '@/components/transaction-row';
import { EmptyState, IconButton } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { listTransactions } from '@/db/database';
import { useDataVersion } from '@/db/events';
import { transactionsToCsv } from '@/lib/csv';
import { errorMessage, KIND_LABELS, type StockTransaction, type TransactionKind } from '@/lib/inventory';
import { shareCsv, timestampForFileName } from '@/lib/share';

const FILTERS: (TransactionKind | 'all')[] = ['all', 'stockIn', 'stockOut', 'adjustment', 'initial'];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const version = useDataVersion();

  const [filter, setFilter] = useState<TransactionKind | 'all'>('all');
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);

  useEffect(() => {
    listTransactions(db, { kind: filter === 'all' ? undefined : filter })
      .then(setTransactions)
      .catch((e) => Alert.alert('読み込みエラー', errorMessage(e)));
  }, [db, version, filter]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="share-outline"
          label="CSV出力"
          onPress={() => {
            if (transactions.length === 0) {
              Alert.alert('出力する履歴がありません');
              return;
            }
            shareCsv(`入出庫履歴_${timestampForFileName()}.csv`, transactionsToCsv(transactions)).catch((e) =>
              Alert.alert('CSV出力に失敗しました', errorMessage(e)),
            );
          }}
        />
      ),
      headerRightContainerStyle: { paddingRight: 16 },
    });
  }, [navigation, transactions]);

  const sections = useMemo(() => {
    const groups: { title: string; data: StockTransaction[] }[] = [];
    for (const t of transactions) {
      const title = dayKey(t.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.title === title) last.data.push(t);
      else groups.push({ title, data: [t] });
    }
    return groups;
  }, [transactions]);

  return (
    <View style={styles.container}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && { color: '#fff' }]}>{f === 'all' ? 'すべて' : KIND_LABELS[f]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => (
          <TransactionRow
            transaction={item}
            showProduct
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: String(item.productId) } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        stickySectionHeadersEnabled
        contentContainerStyle={sections.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        ListEmptyComponent={
          <EmptyState icon="time-outline" title="履歴がありません" message="入庫・出庫・棚卸を行うとここに表示されます。" />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filters: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: Colors.fill },
  chipActive: { backgroundColor: Colors.tint },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.secondaryText,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 52 },
});
