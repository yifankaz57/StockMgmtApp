import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { formatShadeVolume, isLowStock, type Product } from '@/lib/inventory';

export function QuantityBadge({ product, large }: { product: Pick<Product, 'quantity' | 'minQuantity'>; large?: boolean }) {
  const low = isLowStock(product);
  return (
    <View style={[styles.badge, low && styles.badgeLow, large && styles.badgeLarge]} accessibilityLabel={`在庫 ${product.quantity}`}>
      <Text style={[styles.badgeText, low && styles.badgeTextLow, large && styles.badgeTextLarge]}>{product.quantity}</Text>
    </View>
  );
}

export function ProductRow({
  product,
  onPress,
  onToggleAvailable,
  usage,
}: {
  product: Product;
  onPress: () => void;
  /** 指定すると、行の左に利用可能／不可の切り替えボタンを出す */
  onToggleAvailable?: (available: boolean) => void;
  /** 消費量順のときに表示する、今期の消費量 */
  usage?: number;
}) {
  const unavailable = !product.available;
  return (
    <View style={styles.wrap}>
      {onToggleAvailable ? <AvailabilityToggle available={product.available} onChange={onToggleAvailable} /> : null}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, onToggleAvailable && { paddingLeft: 4 }, pressed && { backgroundColor: Colors.fill }]}>
        <View style={styles.info}>
          <View style={styles.titleRow}>
            {unavailable ? <Text style={styles.tagUnavailable}>利用不可</Text> : null}
            <Text style={[styles.name, unavailable && { color: Colors.secondaryText }]} numberOfLines={1}>
              {product.name}
            </Text>
          </View>
          {product.manufacturer || product.shade || product.volume ? (
            <Text style={styles.manufacturer} numberOfLines={1}>
              {[product.manufacturer, formatShadeVolume(product)].filter(Boolean).join('　')}
            </Text>
          ) : null}
          <View style={styles.meta}>
            <Ionicons name="barcode-outline" size={13} color={Colors.secondaryText} />
            <Text style={styles.metaText} numberOfLines={1}>
              {product.barcode}
            </Text>
            {product.location ? (
              <>
                <Ionicons name="location-outline" size={13} color={Colors.secondaryText} style={{ marginLeft: 8 }} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {product.location}
                </Text>
              </>
            ) : null}
          </View>
          {usage !== undefined ? (
            <Text style={[styles.usage, usage === 0 && styles.usageZero]}>今期の消費 {usage} 個</Text>
          ) : null}
        </View>
        <View style={unavailable && { opacity: 0.55 }}>
          <QuantityBadge product={product} />
        </View>
        <Ionicons name="chevron-forward" size={18} color="#C4C4C9" />
      </Pressable>
    </View>
  );
}

/** 利用可能（緑のチェック）／利用不可（赤の禁止マーク）を1タップで切り替える */
export function AvailabilityToggle({ available, onChange, size = 26 }: { available: boolean; onChange: (available: boolean) => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: available }}
      accessibilityLabel={available ? '利用可能（タップで利用不可にする）' : '利用不可（タップで利用可能にする）'}
      hitSlop={6}
      onPress={() => onChange(!available)}
      style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.5 }]}>
      <Ionicons
        name={available ? 'checkmark-circle-outline' : 'ban-outline'}
        size={size}
        color={available ? Colors.success : Colors.danger}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: Colors.card },
  toggle: { width: 48, alignItems: 'center', justifyContent: 'center', paddingLeft: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagUnavailable: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.danger,
    backgroundColor: '#FDECEA',
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  usage: { fontSize: 12, fontWeight: '700', color: Colors.tint },
  usageZero: { color: Colors.secondaryText, fontWeight: '400' },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
  },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  manufacturer: { fontSize: 13, color: Colors.secondaryText },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: Colors.secondaryText, flexShrink: 1 },
  badge: { minWidth: 44, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.fill, alignItems: 'center' },
  badgeLow: { backgroundColor: Colors.warning },
  badgeLarge: { paddingHorizontal: 14, paddingVertical: 6 },
  badgeText: { fontSize: 17, fontWeight: '700', color: Colors.text, fontVariant: ['tabular-nums'] },
  badgeTextLow: { color: '#FFFFFF' },
  badgeTextLarge: { fontSize: 20 },
});
