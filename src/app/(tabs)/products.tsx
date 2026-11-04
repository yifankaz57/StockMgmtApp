import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProductRow } from '@/components/product-row';
import { EmptyState, IconButton } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { listProducts } from '@/db/database';
import { useDataVersion } from '@/db/events';
import { productsToCsv } from '@/lib/csv';
import { errorMessage, isLowStock, type Product } from '@/lib/inventory';
import { shareCsv, timestampForFileName } from '@/lib/share';

export default function ProductsScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const version = useDataVersion();

  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  useEffect(() => {
    listProducts(db).then(setProducts).catch((e) => Alert.alert('読み込みエラー', errorMessage(e)));
  }, [db, version]);

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
              shareCsv(`在庫一覧_${timestampForFileName()}.csv`, productsToCsv(products)).catch((e) =>
                Alert.alert('CSV出力に失敗しました', errorMessage(e)),
              );
            }}
          />
          <IconButton icon="add" label="商品を登録" onPress={() => router.push('/product/edit')} />
        </View>
      ),
      headerRightContainerStyle: { paddingRight: 16 },
    });
  }, [navigation, products]);

  const lowCount = useMemo(() => products.filter(isLowStock).length, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (lowOnly && !isLowStock(p)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.location.toLowerCase().includes(q)
      );
    });
  }, [products, query, lowOnly]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.secondaryText} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="商品名・メーカー・バーコード・保管場所"
          placeholderTextColor="#A0A0A6"
          style={styles.searchInput}
          clearButtonMode="while-editing"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <View style={styles.filters}>
        <Pressable onPress={() => setLowOnly((v) => !v)} style={[styles.chip, lowOnly && styles.chipActive]}>
          <Ionicons name="warning-outline" size={14} color={lowOnly ? '#fff' : Colors.warning} />
          <Text style={[styles.chipText, lowOnly && { color: '#fff' }]}>在庫少のみ{lowCount > 0 ? `（${lowCount}）` : ''}</Text>
        </Pressable>
        <Text style={styles.count}>{filtered.length} 件</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ProductRow product={item} onPress={() => router.push({ pathname: '/product/[id]', params: { id: String(item.id) } })} />
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
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 16 },
});
