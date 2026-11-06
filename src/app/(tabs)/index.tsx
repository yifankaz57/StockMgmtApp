import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { ManualEntryModal } from '@/components/manual-entry-modal';
import { IconButton } from '@/components/ui';
import { UsageConfirmModal } from '@/components/usage-confirm-modal';
import { Colors } from '@/constants/theme';
import { applyStockChange, countUsageToday, findProductByBarcode } from '@/db/database';
import { haptics } from '@/lib/haptics';
import {
  errorMessage,
  formatShadeVolume,
  IN_STORE_CODE_MESSAGE,
  isInStoreCode,
  isLowStock,
  needsUsageConfirmation,
  type Product,
} from '@/lib/inventory';

type ResultBody =
  | { type: 'success'; product: Product; usedToday: number }
  | { type: 'cancelled'; product: Product }
  | { type: 'error'; title: string; message: string };

type Result = ResultBody & { id: number };

/** 結果のメッセージを表示しておく時間と、消えていく時間（ミリ秒） */
const RESULT_HOLD_MS = 1800;
const RESULT_FADE_MS = 2200;

/**
 * スキャン画面:
 * - 商品マスタにないバーコード → 新規登録画面を開く
 * - 登録済みの商品 → 大きな確認画面で「減らす」を押すと在庫を1個消費する（利用）
 *   （その日の1個目は落ち着いた色、同じ商品の2個目以降はオレンジの警告）
 * 結果のメッセージは少し表示したあと、だんだん消える。
 */
export default function ScanScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [result, setResultState] = useState<Result | null>(null);
  const [pending, setPending] = useState<{ product: Product; usedToday: number } | null>(null);
  const [manualVisible, setManualVisible] = useState(false);
  const busy = useRef(false);
  const nextId = useRef(0);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <IconButton icon="keypad-outline" label="手入力" onPress={() => setManualVisible(true)} />,
      headerRightContainerStyle: { paddingRight: 16 },
    });
  }, [navigation]);

  // 同じ内容が続いても毎回フェードをやり直すため、表示ごとに id を振る
  const setResult = useCallback((body: ResultBody) => setResultState({ ...body, id: ++nextId.current }), []);
  const clearResult = useCallback((id: number) => setResultState((r) => (r?.id === id ? null : r)), []);

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
    [db, setResult],
  );

  const handleScan = useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const product = await findProductByBarcode(db, code);
        if (!product) {
          if (isInStoreCode(code)) {
            haptics.error();
            setResult({ type: 'error', title: '店内コードは登録できません', message: `バーコード: ${code}\n${IN_STORE_CODE_MESSAGE}` });
            return;
          }
          haptics.warning();
          router.push({ pathname: '/product/edit', params: { barcode: code } });
          return;
        }
        if (!product.available) {
          haptics.error();
          setResult({
            type: 'error',
            title: '利用不可の商品です',
            message: `${product.name}\nこの商品は「利用不可」に設定されているため、在庫を消費しません。`,
          });
          return;
        }
        if (product.quantity <= 0) {
          haptics.error();
          setResult({ type: 'error', title: '在庫がありません', message: `${product.name}\n在庫が 0 のため減らせません。` });
          return;
        }
        // 消費する前に必ず大きな確認画面を出す（同じ日の2個目以降は警告色）
        const usedToday = await countUsageToday(db, product.id);
        if (needsUsageConfirmation(usedToday)) haptics.warning();
        else haptics.success();
        setPending({ product, usedToday });
      } catch (e) {
        haptics.error();
        setResult({ type: 'error', title: 'エラー', message: errorMessage(e) });
      } finally {
        busy.current = false;
      }
    },
    [db, setResult],
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
          <BarcodeScanner enabled={!pending && !manualVisible} onScan={handleScan} onManualEntry={() => setManualVisible(true)} />
        ) : null}
      </View>

      <View style={styles.panel}>
        <IdleCard hidden={result !== null} />
        {result ? <FadingResult key={result.id} result={result} onDone={() => clearResult(result.id)} /> : null}
      </View>

      <UsageConfirmModal product={pending?.product ?? null} usedToday={pending?.usedToday ?? 0} onConfirm={confirm} onCancel={cancel} />
      <ManualEntryModal visible={manualVisible} onClose={() => setManualVisible(false)} onSubmit={handleScan} />
    </View>
  );
}

/** 待機中の案内。結果の表示中は場所だけ確保して隠し、結果が消えたらふわっと戻す */
function IdleCard({ hidden }: { hidden: boolean }) {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (hidden) {
      opacity.setValue(0);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [hidden, opacity]);

  return (
    <Animated.View style={[styles.card, styles.cardIdle, { opacity }]} accessibilityElementsHidden={hidden}>
      <Ionicons name="barcode-outline" size={36} color={Colors.tint} />
      <Text style={styles.idleTitle}>バーコードを読み取ってください</Text>
      <Text style={styles.idleText}>
        登録済みの商品は在庫を 1 個消費します。{'\n'}未登録の商品は登録画面を開きます。
      </Text>
    </Animated.View>
  );
}

/** 結果のメッセージ。少し表示したあと、だんだん消えて onDone を呼ぶ */
function FadingResult({ result, onDone }: { result: Result; onDone: () => void }) {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(RESULT_HOLD_MS),
      Animated.timing(opacity, { toValue: 0, duration: RESULT_FADE_MS, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => animation.stop();
    // 表示ごとに1回だけ動かす（key で作り直す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
      <ResultCard result={result} />
    </Animated.View>
  );
}

function ResultCard({ result }: { result: Result }) {
  if (result.type === 'error') {
    return (
      <View style={[styles.card, { backgroundColor: Colors.danger }]} accessibilityRole="alert">
        <View style={styles.cardHeader}>
          <Ionicons name="close-circle" size={32} color="#fff" />
          <Text style={styles.cardTitle}>{result.title}</Text>
        </View>
        <Text style={styles.cardMessage}>{result.message}</Text>
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
        <Text style={styles.cardTitle}>1 個 消費しました</Text>
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
  // 結果は待機カードの上に重ね、下端をそろえる（結果のほうが高いときは上に伸びる）
  overlay: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  card: { borderRadius: 18, padding: 18, gap: 8 },
  cardIdle: { backgroundColor: Colors.card, alignItems: 'center' },
  idleTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  idleText: { fontSize: 14, color: Colors.secondaryText, textAlign: 'center', lineHeight: 20 },
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
});
