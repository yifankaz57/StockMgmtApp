import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { isLowStock, type Product } from '@/lib/inventory';

export function QuantityBadge({ product, large }: { product: Pick<Product, 'quantity' | 'minQuantity'>; large?: boolean }) {
  const low = isLowStock(product);
  return (
    <View style={[styles.badge, low && styles.badgeLow, large && styles.badgeLarge]} accessibilityLabel={`在庫 ${product.quantity}`}>
      <Text style={[styles.badgeText, low && styles.badgeTextLow, large && styles.badgeTextLarge]}>{product.quantity}</Text>
    </View>
  );
}

export function ProductRow({ product, onPress }: { product: Product; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.fill }]}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        {product.manufacturer ? (
          <Text style={styles.manufacturer} numberOfLines={1}>
            {product.manufacturer}
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
      </View>
      <QuantityBadge product={product} />
      <Ionicons name="chevron-forward" size={18} color="#C4C4C9" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
  },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600', color: Colors.text },
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
