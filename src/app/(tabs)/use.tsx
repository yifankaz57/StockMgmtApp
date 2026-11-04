import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { ManualEntryModal } from '@/components/manual-entry-modal';
import { IconButton } from '@/components/ui';
import { UsageConfirmModal } from '@/components/usage-confirm-modal';
import { Colors } from '@/constants/theme';
import { applyStockChange, countUsageToday, findProductByBarcode } from '@/db/database';
import { haptics } from '@/lib/haptics';
import { errorMessage, formatShadeVolume, isLowStock, needsUsageConfirmation, type Product } from '@/lib/inventory';

type Result =
  | { type: 'success'; product: Product; usedToday: number }
  | { type: 'cancelled'; product: Product }
  | { type: 'error'; title: string; message: string; unregisteredCode?: string };

/**
 * 単純利用モード: 登録済み商品のバーコードを読み取るたびに在庫を1減らす。
 * 同じ商品を1日に2個以上使う場合は大きな確認画面を出す。
 */
export default function UseScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<{ product: Product; usedToday: number } | null>(null);
  const [manualVisible, setManualVisible] = useState(false);
  const busy = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <IconButton icon="keypad-outline" label="手入力" onPress={() => setManualVisible(true)} />,
      headerRightContainerStyle: { paddingRight: 16 },
    });
  }, [navigation]);

  const consumeOne = useCallback(
    async (product: Product, usedToday: number) => {
      try {
        const updated = await applyStockChange(db, product.id, 'use', 1, '単純利用');
        haptics.success();
        setResult({ type: 'success', product: updated, usedToday: usedToday + 1 });
      } catch (e) {
        haptics.error();
        setResult({ type: 'error', title: '在庫を減らせませんでした', message: `${product.name}\n${errorMessage(e)}` });
      }
    },
    [db],
  );

  const handleScan = useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const product = await findProductByBarcode(db, code);
        if (!product) {
          haptics.error();
          setResult({
            type: 'error',
            title: '未登録の商品です',
            message: `バーコード: ${code}\n先に商品を登録してください。`,
            unregisteredCode: code,
          });
          return;
        }
        if (product.quantity <= 0) {
          haptics.error();
          setResult({ type: 'error', title: '在庫がありません', message: `${product.name}\n在庫が 0 のため減らせません。` });
          return;
        }
        const usedToday = await countUsageToday(db, product.id);
        if (needsUsageConfirmation(usedToday)) {
          haptics.warning();
          setPending({ product, usedToday });
          return;
        }
        await consumeOne(product, usedToday);
      } catch (e) {
        haptics.error();
        setResult({ type: 'error', title: 'エラー', message: errorMessage(e) });
      } finally {
        busy.current = false;
      }
    },
    [db, consumeOne],
  );

  const confirm = async () => {
    if (!pending) return;
    const { product, usedToday } = pending;
    setPending(null);
    await consumeOne(product, usedToday);
  };

  const cancel = () => {
    if (pending) setResult({ type: 'cancelled', product: pending.product });
    setPending(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.camera}>
        {isFocused ? (
          <BarcodeScanner
            enabled={!pending && !manualVisible}
            onScan={handleScan}
            onManualEntry={() => setManualVisible(true)}
          />
        ) : null}
      </View>

      <View style={styles.panel}>
        <ResultCard result={result} />
      </View>

      <UsageConfirmModal
        product={pending?.product ?? null}
        usedToday={pending?.usedToday ?? 0}
        onConfirm={confirm}
        onCancel={cancel}
      />
      <ManualEntryModal visible={manualVisible} onClose={() => setManualVisible(false)} onSubmit={handleScan} />
    </View>
  );
}

function ResultCard({ result }: { result: Result | null }) {
  if (!result) {
    return (
      <View style={[styles.card, styles.cardIdle]}>
        <Ionicons name="barcode-outline" size={36} color={Colors.tint} />
        <Text style={styles.idleTitle}>使う商品のバーコードを読み取ってください</Text>
        <Text style={styles.idleText}>読み取るたびに在庫が 1 個減ります。</Text>
      </View>
    );
  }

  if (result.type === 'error') {
    return (
      <View style={[styles.card, { backgroundColor: Colors.danger }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="close-circle" size={32} color="#fff" />
          <Text style={styles.cardTitle}>{result.title}</Text>
        </View>
        <Text style={styles.cardMessage}>{result.message}</Text>
        {result.unregisteredCode ? (
          <Pressable
            onPress={() => router.push({ pathname: '/product/edit', params: { barcode: result.unregisteredCode } })}
            style={({ pressed }) => [styles.cardButton, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.cardButtonText, { color: Colors.danger }]}>この商品を登録する</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const { product } = result;
  const detail = [product.manufacturer, formatShadeVolume(product)].filter(Boolean).join('　');

  if (result.type === 'cancelled') {
    return (
      <View style={[styles.card, { backgroundColor: Colors.secondaryText }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="arrow-undo" size={28} color="#fff" />
          <Text style={styles.cardTitle}>取り消しました</Text>
        </View>
        <Text style={styles.cardMessage}>
          {product.name}
          {'\n'}在庫は変わっていません（{product.quantity}）。
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: Colors.success }]}>
      <View style={styles.cardHeader}>
        <Ionicons name="checkmark-circle" size={32} color="#fff" />
        <Text style={styles.cardTitle}>在庫を 1 減らしました</Text>
      </View>
      {detail ? <Text style={styles.cardDetail}>{detail}</Text> : null}
      <Text style={styles.cardProduct} numberOfLines={2}>
        {product.name}
      </Text>
      <View style={styles.numbers}>
        <Text style={styles.number}>残り {product.quantity}</Text>
        <Text style={styles.number}>本日 {result.usedToday} 個目</Text>
      </View>
      {isLowStock(product) ? (
        <View style={styles.lowStock}>
          <Ionicons name="warning" size={16} color={Colors.warning} />
          <Text style={styles.lowStockText}>在庫が少なくなっています（最低在庫数 {product.minQuantity}）</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  camera: { flex: 1, backgroundColor: '#000' },
  panel: { padding: 16 },
  card: { borderRadius: 18, padding: 18, gap: 8 },
  cardIdle: { backgroundColor: Colors.card, alignItems: 'center' },
  idleTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  idleText: { fontSize: 14, color: Colors.secondaryText },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#fff', flexShrink: 1 },
  cardDetail: { fontSize: 15, color: 'rgba(255,255,255,0.9)' },
  cardProduct: { fontSize: 22, fontWeight: '800', color: '#fff' },
  cardMessage: { fontSize: 17, color: '#fff', lineHeight: 24 },
  numbers: { flexDirection: 'row', justifyContent: 'space-between' },
  number: { fontSize: 20, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  lowStock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  lowStockText: { fontSize: 13, fontWeight: '700', color: Colors.warning, flexShrink: 1 },
  cardButton: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cardButtonText: { fontSize: 17, fontWeight: '800' },
});
