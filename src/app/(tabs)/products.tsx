import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProductRow } from '@/components/product-row';
import { EmptyState, IconButton, Segmented } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { getSetting, getStockAlerts, getUsageResetDay, listProducts, setProductAvailable, setSetting, usageByAllPeriods } from '@/db/database';
import { useDataVersion } from '@/db/events';
import { productsToCsv } from '@/lib/csv';
import {
  errorMessage,
  formatUsagePeriod,
  isLowStock,
  sortByUsage,
  type PeriodUsage,
  type Product,
} from '@/lib/inventory';
import { shareCsv, timestampForFileName } from '@/lib/share';
import { STOCK_ALERT_LABELS, stockAlertColor, type StockAlertSettings } from '@/lib/stock-alert';

type SortKey = 'name' | 'usage';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: '名前順' },
  { value: 'usage', label: '消費量の多い順' },
];

/** 並び順はこの端末に覚えておく */
const SORT_SETTING_KEY = 'productsSort';

type Usage = { periods: PeriodUsage[]; periodLabel: string; resetDay: number };

export default function ProductsScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const version = useDataVersion();

  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [sort, setSortState] = useState<SortKey>('name');
  // 月ごとの消費量（新しい順。先頭が今月）。並べ替えには今月、CSV には全期間を使う
  const [usage, setUsage] = useState<Usage | null>(null);
  const [alerts, setAlerts] = useState<StockAlertSettings | null>(null);

  useEffect(() => {
    getStockAlerts(db)
      .then(setAlerts)
      .catch(() => {});
  }, [db, version]);

  useEffect(() => {
    listProducts(db).then(setProducts).catch((e) => Alert.alert('読み込みエラー', errorMessage(e)));
  }, [db, version]);

  useEffect(() => {
    getSetting(db, SORT_SETTING_KEY)
      .then((v) => setSortState(v === 'usage' ? 'usage' : 'name'))
      .catch(() => {});
  }, [db]);

  // CSV 出力のタップ時に読み込むと共有シートの表示が遅れるので、先に読み込んでおく
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resetDay = await getUsageResetDay(db);
      const periods = await usageByAllPeriods(db, resetDay);
      if (!cancelled) setUsage({ periods, periodLabel: formatUsagePeriod(periods[0]), resetDay });
    })().catch((e) => Alert.alert('読み込みエラー', errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [db, version]);

  const setSort = (next: SortKey) => {
    setSortState(next);
    setSetting(db, SORT_SETTING_KEY, next).catch(() => {});
  };

  const toggleAvailable = (product: Product, available: boolean) => {
    // すぐ見た目に反映し、保存後の再読み込みで確定させる
    setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, available } : p)));
    setProductAvailable(db, product.id, available).catch((e) => {
      Alert.alert('保存に失敗しました', errorMessage(e));
      setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, available: product.available } : p)));
    });
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <IconButton
            icon="share-outline"
            label="CSV出力"
            onPress={() => {
              if (products.length === 0) {
                Alert.alert('出力する商品がありません');
                return;
              }
              shareCsv(`在庫一覧_${timestampForFileName()}.csv`, productsToCsv(products, usage?.periods ?? [])).catch((e) =>
                Alert.alert('CSV出力に失敗しました', errorMessage(e)),
              );
            }}
          />
          <IconButton icon="add" label="商品を登録" onPress={() => router.push('/product/edit')} />
        </View>
      ),
      headerRightContainerStyle: { paddingRight: 16 },
    });
  }, [navigation, products, usage]);

  const lowCount = useMemo(() => products.filter(isLowStock).length, [products]);

  const currentTotals = sort === 'usage' && usage ? usage.periods[0].totals : null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = products.filter((p) => {
      if (lowOnly && !isLowStock(p)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q) ||
        p.shade.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.location.toLowerCase().includes(q)
      );
    });
    // listProducts は名前順なので、消費量順のときだけ並べ替える
    return currentTotals ? sortByUsage(matched, currentTotals) : matched;
  }, [products, query, lowOnly, currentTotals]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.secondaryText} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="商品名・メーカー・色番号・バーコード等"
          placeholderTextColor="#A0A0A6"
          style={styles.searchInput}
          clearButtonMode="while-editing"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <View style={styles.sortBar}>
        <Segmented options={SORT_OPTIONS} value={sort} onChange={setSort} />
        {currentTotals && usage ? (
          <Text style={styles.period}>
            今月の集計期間 {usage.periodLabel}（毎月{usage.resetDay}日にリセット。
            <Text style={styles.link} onPress={() => router.navigate('/settings')}>
              設定で変更
            </Text>
            ）
          </Text>
        ) : null}
      </View>

      <View style={styles.filters}>
        <Pressable onPress={() => setLowOnly((v) => !v)} style={[styles.chip, lowOnly && styles.chipActive]}>
          <Ionicons name="warning-outline" size={14} color={lowOnly ? '#fff' : Colors.warning} />
          <Text style={[styles.chipText, lowOnly && { color: '#fff' }]}>在庫少のみ{lowCount > 0 ? `（${lowCount}）` : ''}</Text>
        </Pressable>
        <Text style={styles.count}>{filtered.length} 件</Text>
      </View>

      {alerts && (alerts.caution.threshold !== null || alerts.warning.threshold !== null) ? (
        <View style={styles.legend}>
          {(['caution', 'warning'] as const).map((key) =>
            alerts[key].threshold !== null ? (
              <View key={key} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: alerts[key].color }]} />
                <Text style={styles.legendText}>
                  {STOCK_ALERT_LABELS[key]}: {alerts[key].threshold}個未満
                </Text>
              </View>
            ) : null,
          )}
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: String(item.id) } })}
            onToggleAvailable={(available) => toggleAvailable(item, available)}
            usage={currentTotals ? (currentTotals.get(item.id) ?? 0) : undefined}
            background={alerts ? stockAlertColor(item.quantity, alerts) : null}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          products.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="商品がありません"
              message="「スキャン」タブでバーコードを読み取るか、右上の＋から商品を登録してください。"
            />
          ) : (
            <EmptyState icon="search" title="該当する商品がありません" />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerButtons: { flexDirection: 'row', gap: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.fill,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 10,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 9, color: Colors.text },
  sortBar: { marginHorizontal: 16, marginTop: 10, gap: 6 },
  period: { fontSize: 12, color: Colors.secondaryText, marginHorizontal: 4, lineHeight: 18 },
  link: { color: Colors.tint, textDecorationLine: 'underline' },
  filters: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginVertical: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.warningLight,
  },
  chipActive: { backgroundColor: Colors.warning },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.warning },
  count: { fontSize: 13, color: Colors.secondaryText },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginHorizontal: 16, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.2)' },
  legendText: { fontSize: 12, color: Colors.secondaryText },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 16 },
});
