import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { formatDateTime } from '@/lib/csv';
import { KIND_LABELS, type StockTransaction, type TransactionKind } from '@/lib/inventory';
import type { IconName } from './ui';

export const KIND_ICONS: Record<TransactionKind, IconName> = {
  initial: 'sparkles-outline',
  stockIn: 'arrow-down-circle-outline',
  stockOut: 'arrow-up-circle-outline',
  adjustment: 'clipboard-outline',
};

export function TransactionRow({
  transaction,
  showProduct,
  onPress,
}: {
  transaction: StockTransaction;
  showProduct: boolean;
  onPress?: () => void;
}) {
  const color = transaction.delta > 0 ? Colors.success : transaction.delta < 0 ? Colors.danger : Colors.secondaryText;
  const deltaText = transaction.delta > 0 ? `+${transaction.delta}` : String(transaction.delta);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.fill }]}>
      <Ionicons name={KIND_ICONS[transaction.kind]} size={24} color={color} />
      <View style={styles.info}>
        {showProduct ? (
          <Text style={styles.name} numberOfLines={1}>
            {transaction.productName}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {KIND_LABELS[transaction.kind]}　{formatDateTime(transaction.createdAt).slice(showProduct ? 11 : 0, 16)}
        </Text>
        {transaction.note ? (
          <Text style={styles.meta} numberOfLines={1}>
            {transaction.note}
          </Text>
        ) : null}
      </View>
      <View style={styles.numbers}>
        <Text style={[styles.delta, { color }]}>{deltaText}</Text>
        <Text style={styles.meta}>→ {transaction.quantityAfter}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.card,
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: Colors.text },
  meta: { fontSize: 12, color: Colors.secondaryText, fontVariant: ['tabular-nums'] },
  numbers: { alignItems: 'flex-end', gap: 2 },
  delta: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
