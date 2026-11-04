import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { formatShadeVolume, type Product } from '@/lib/inventory';

/** 1日に2個目以降を使うときの大きな確認画面 */
export function UsageConfirmModal({
  product,
  usedToday,
  onConfirm,
  onCancel,
}: {
  /** null なら非表示 */
  product: Product | null;
  usedToday: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const detail = product ? [product.manufacturer, formatShadeVolume(product)].filter(Boolean).join('　') : '';
  return (
    <Modal visible={product !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={onCancel}>
      {product ? (
        <SafeAreaView style={styles.container}>
          <View style={styles.body}>
            <Ionicons name="warning" size={72} color="#fff" />
            <Text style={styles.title}>本日{usedToday + 1}個目の使用です</Text>
            <View style={styles.productBox}>
              {detail ? <Text style={styles.detail}>{detail}</Text> : null}
              <Text style={styles.productName} numberOfLines={3}>
                {product.name}
              </Text>
            </View>
            <Text style={styles.message}>
              今日すでに {usedToday} 個使っています。{'\n'}在庫から 1 個減らしてよいですか？
            </Text>
            <Text style={styles.stock}>
              在庫 {product.quantity} → {product.quantity - 1}
            </Text>
          </View>
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [styles.button, styles.confirm, pressed && { opacity: 0.8 }]}>
              <Text style={[styles.buttonText, { color: Colors.warning }]}>減らす（使用する）</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.button, styles.cancel, pressed && { opacity: 0.8 }]}>
              <Text style={[styles.buttonText, { color: '#fff' }]}>やめる</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.warning },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  title: { fontSize: 34, fontWeight: '900', color: '#fff', textAlign: 'center' },
  productBox: { alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 20, gap: 6 },
  detail: { fontSize: 18, color: Colors.secondaryText, textAlign: 'center' },
  productName: { fontSize: 28, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  message: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 32 },
  stock: { fontSize: 20, color: '#fff', fontVariant: ['tabular-nums'] },
  buttons: { padding: 20, gap: 14 },
  button: { minHeight: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  confirm: { backgroundColor: '#fff' },
  cancel: { borderWidth: 3, borderColor: '#fff' },
  buttonText: { fontSize: 24, fontWeight: '800' },
});
