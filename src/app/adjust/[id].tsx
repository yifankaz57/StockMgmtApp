import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { QuantityBadge } from '@/components/product-row';
import { Button, EmptyState, ErrorText, Row, Section, Segmented } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { applyStockChange, getProduct } from '@/db/database';
import { haptics } from '@/lib/haptics';
import {
  calculateStock,
  errorMessage,
  formatShadeVolume,
  isTransactionKind,
  KIND_LABELS,
  parseQuantity,
  SELECTABLE_KINDS,
  type Product,
  type TransactionKind,
} from '@/lib/inventory';

const KIND_OPTIONS = SELECTABLE_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }));
const STEPS = [1, 5, 10, 50];

/** 入庫・出庫・棚卸の画面（/adjust/1?kind=stockOut） */
export default function AdjustScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string }>();
  const productId = Number(params.id);
  const db = useSQLiteContext();

  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [kind, setKind] = useState<TransactionKind>(
    isTransactionKind(params.kind) && SELECTABLE_KINDS.includes(params.kind) ? params.kind : 'stockIn',
  );
  const [amountText, setAmountText] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProduct(db, productId).then((p) => {
      setProduct(p);
      if (p && kind === 'adjustment') setAmountText(String(p.quantity));
    });
    // 初回のみ読み込む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, productId]);

  const amount = parseQuantity(amountText);

  const preview = useMemo(() => {
    if (!product) return null;
    if (amount === null) return { ok: false as const, message: '数量は0以上の整数で入力してください。' };
    try {
      return { ok: true as const, newQuantity: calculateStock(product.quantity, kind, amount).newQuantity };
    } catch (e) {
      return { ok: false as const, message: errorMessage(e) };
    }
  }, [product, kind, amount]);

  if (product === undefined) return null;
  if (product === null) return <EmptyState icon="cube-outline" title="商品が見つかりません" />;

  const changeKind = (next: TransactionKind) => {
    setKind(next);
    setError(null);
    setAmountText(next === 'adjustment' ? String(product.quantity) : '1');
  };

  const step = (delta: number) => {
    const current = amount ?? 0;
    const min = kind === 'adjustment' ? 0 : 1;
    setAmountText(String(Math.max(min, current + delta)));
  };

  const commit = async () => {
    if (saving || amount === null) return;
    setSaving(true);
    setError(null);
    try {
      await applyStockChange(db, product.id, kind, amount, note);
      haptics.success();
      router.back();
    } catch (e) {
      haptics.error();
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: KIND_LABELS[kind],
          headerLeft: () => (
            <Pressable hitSlop={10} onPress={() => router.back()}>
              <Text style={styles.headerButton}>閉じる</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <Section>
          <Row>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.name}>{product.name}</Text>
              {product.manufacturer || product.shade || product.volume ? (
                <Text style={styles.metaText}>
                  {[product.manufacturer, formatShadeVolume(product)].filter(Boolean).join('　')}
                </Text>
              ) : null}
              <View style={styles.meta}>
                <Ionicons name="barcode-outline" size={14} color={Colors.secondaryText} />
                <Text style={styles.metaText}>{product.barcode}</Text>
              </View>
              {product.location ? (
                <View style={styles.meta}>
                  <Ionicons name="location-outline" size={14} color={Colors.secondaryText} />
                  <Text style={styles.metaText}>{product.location}</Text>
                </View>
              ) : null}
            </View>
          </Row>
          <Row last>
            <Text style={styles.label}>現在の在庫</Text>
            <View style={{ flex: 1 }} />
            <QuantityBadge product={product} large />
          </Row>
        </Section>

        <View style={{ marginHorizontal: 16, marginTop: 20 }}>
          <Segmented options={KIND_OPTIONS} value={kind} onChange={changeKind} />
        </View>

        <Section>
          <Row>
            <Text style={styles.label}>{kind === 'adjustment' ? '実在庫数' : '数量'}</Text>
            <View style={{ flex: 1 }} />
            <Pressable accessibilityLabel="1減らす" hitSlop={8} onPress={() => step(-1)}>
              <Ionicons name="remove-circle" size={34} color={Colors.tint} />
            </Pressable>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="number-pad"
              selectTextOnFocus
              style={styles.amount}
            />
            <Pressable accessibilityLabel="1増やす" hitSlop={8} onPress={() => step(1)}>
              <Ionicons name="add-circle" size={34} color={Colors.tint} />
            </Pressable>
          </Row>
          {kind !== 'adjustment' ? (
            <Row>
              {STEPS.map((s) => (
                <Pressable key={s} onPress={() => step(s)} style={({ pressed }) => [styles.stepButton, pressed && { opacity: 0.6 }]}>
                  <Text style={styles.stepText}>
                    {kind === 'stockOut' ? '−' : '+'}
                    {s}
                  </Text>
                </Pressable>
              ))}
            </Row>
          ) : null}
          <Row last>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="メモ（任意）"
              placeholderTextColor="#A0A0A6"
              style={{ flex: 1, fontSize: 16, color: Colors.text }}
            />
          </Row>
        </Section>

        {preview ? (
          <Text style={[styles.preview, !preview.ok && { color: Colors.danger }]}>
            {preview.ok ? `確定後の在庫: ${product.quantity} → ${preview.newQuantity}` : preview.message}
          </Text>
        ) : null}

        <ErrorText message={error} />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={`${KIND_LABELS[kind]}を確定`}
          icon="checkmark"
          onPress={commit}
          disabled={!preview?.ok || saving}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerButton: { color: Colors.tint, fontSize: 17 },
  name: { fontSize: 18, fontWeight: '700', color: Colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: Colors.secondaryText },
  label: { fontSize: 16, color: Colors.text },
  amount: {
    minWidth: 80,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    paddingVertical: 4,
  },
  stepButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.tintLight },
  stepText: { fontSize: 15, fontWeight: '700', color: Colors.tint },
  preview: { marginHorizontal: 28, marginTop: 10, fontSize: 14, color: Colors.secondaryText, fontVariant: ['tabular-nums'] },
  footer: { padding: 16, paddingBottom: 32, backgroundColor: Colors.background },
});
