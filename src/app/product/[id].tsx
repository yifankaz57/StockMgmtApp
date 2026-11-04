import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { KIND_ICONS, TransactionRow } from '@/components/transaction-row';
import { Button, EmptyState, LabeledRow, Section } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { deleteProduct, getProduct, listTransactions } from '@/db/database';
import { useDataVersion } from '@/db/events';
import { formatDateTime } from '@/lib/csv';
import { errorMessage, isLowStock, KIND_LABELS, SELECTABLE_KINDS, type Product, type StockTransaction } from '@/lib/inventory';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const db = useSQLiteContext();
  const version = useDataVersion();

  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProduct(db, productId), listTransactions(db, { productId, limit: 200 })])
      .then(([p, t]) => {
        if (cancelled) return;
        setProduct(p);
        setTransactions(t);
      })
      .catch((e) => Alert.alert('読み込みエラー', errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [db, productId, version]);

  if (product === undefined) return null;
  if (product === null) {
    return <EmptyState icon="cube-outline" title="商品が見つかりません" message="削除された可能性があります。" />;
  }

  const low = isLowStock(product);

  const confirmDelete = () => {
    Alert.alert(`「${product.name}」を削除しますか？`, '入出庫履歴もすべて削除されます。この操作は取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            router.back();
            await deleteProduct(db, product.id);
          } catch (e) {
            Alert.alert('削除に失敗しました', errorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: product.name,
          headerRight: () => (
            <Pressable
              hitSlop={10}
              onPress={() => router.push({ pathname: '/product/edit', params: { id: String(product.id) } })}>
              <Text style={styles.headerButton}>編集</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <Text style={[styles.quantity, low && { color: Colors.warning }]}>{product.quantity}</Text>
          <Text style={styles.quantityLabel}>現在の在庫数</Text>
          {low ? (
            <View style={styles.lowRow}>
              <Ionicons name="warning" size={14} color={Colors.warning} />
              <Text style={styles.lowText}>最低在庫数（{product.minQuantity}）以下です</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          {SELECTABLE_KINDS.map((kind) => (
            <Pressable
              key={kind}
              onPress={() => router.push({ pathname: '/adjust/[id]', params: { id: String(product.id), kind } })}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
              <Ionicons name={KIND_ICONS[kind]} size={26} color={Colors.tint} />
              <Text style={styles.actionText}>{KIND_LABELS[kind]}</Text>
            </Pressable>
          ))}
        </View>

        <Section title="商品情報">
          <LabeledRow label="バーコード" value={product.barcode} />
          {product.location ? <LabeledRow label="保管場所" value={product.location} /> : null}
          <LabeledRow label="最低在庫数" value={product.minQuantity} />
          <LabeledRow label="登録日時" value={formatDateTime(product.createdAt).slice(0, 16)} />
          <LabeledRow label="更新日時" value={formatDateTime(product.updatedAt).slice(0, 16)} last={!product.note} />
          {product.note ? <LabeledRow label="メモ" value={product.note} last /> : null}
        </Section>

        <Section title={`入出庫履歴${transactions.length >= 200 ? '（最新200件）' : ''}`}>
          {transactions.length === 0 ? (
            <Text style={styles.noHistory}>履歴はありません</Text>
          ) : (
            transactions.map((t, i) => (
              <View key={t.id} style={i > 0 && styles.separator}>
                <TransactionRow transaction={t} showProduct={false} />
              </View>
            ))
          )}
        </Section>

        <View style={{ marginHorizontal: 16, marginTop: 28 }}>
          <Button title="この商品を削除" icon="trash-outline" variant="danger" onPress={confirmDelete} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  headerButton: { color: Colors.tint, fontSize: 17 },
  hero: { alignItems: 'center', paddingTop: 24, gap: 4 },
  quantity: { fontSize: 64, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  quantityLabel: { fontSize: 14, color: Colors.secondaryText },
  lowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  lowText: { fontSize: 13, fontWeight: '700', color: Colors.warning },
  actions: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 20 },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.card,
  },
  actionText: { fontSize: 13, fontWeight: '700', color: Colors.tint },
  noHistory: { padding: 16, color: Colors.secondaryText },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
