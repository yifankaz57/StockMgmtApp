import { router, useIsFocused, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { ManualEntryModal } from '@/components/manual-entry-modal';
import { IconButton, Segmented } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { applyStockChange, findProductByBarcode } from '@/db/database';
import { haptics } from '@/lib/haptics';
import { errorMessage } from '@/lib/inventory';

type ScanMode = 'lookup' | 'quickIn' | 'quickOut';

const MODE_OPTIONS: { value: ScanMode; label: string }[] = [
  { value: 'lookup', label: '照会・操作' },
  { value: 'quickIn', label: '連続入庫 +1' },
  { value: 'quickOut', label: '連続出庫 −1' },
];

const MODE_DESCRIPTIONS: Record<ScanMode, string> = {
  lookup: '読み取った商品の入庫・出庫・棚卸を行います。未登録なら登録画面を開きます。',
  quickIn: '読み取るたびに在庫を 1 増やします。',
  quickOut: '読み取るたびに在庫を 1 減らします。',
};

type Banner = { id: number; message: string; isError: boolean };

export default function ScanScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [mode, setMode] = useState<ScanMode>('lookup');
  const [manualVisible, setManualVisible] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const busy = useRef(false);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <IconButton icon="keypad-outline" label="手入力" onPress={() => setManualVisible(true)} />,
      headerRightContainerStyle: { paddingRight: 16 },
    });
  }, [navigation]);

  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  const showBanner = useCallback((message: string, isError: boolean) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ id: Date.now(), message, isError });
    bannerTimer.current = setTimeout(() => setBanner(null), 2500);
  }, []);

  const handleScan = useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const product = await findProductByBarcode(db, code);
        if (!product) {
          haptics.warning();
          router.push({ pathname: '/product/edit', params: { barcode: code } });
          return;
        }
        if (mode === 'lookup') {
          haptics.success();
          router.push({ pathname: '/adjust/[id]', params: { id: String(product.id) } });
          return;
        }
        const kind = mode === 'quickIn' ? 'stockIn' : 'stockOut';
        try {
          const updated = await applyStockChange(db, product.id, kind, 1, '連続スキャン');
          haptics.success();
          showBanner(`${product.name} ${mode === 'quickIn' ? '+1' : '−1'} → 在庫 ${updated.quantity}`, false);
        } catch (error) {
          haptics.error();
          showBanner(`${product.name}: ${errorMessage(error)}`, true);
        }
      } finally {
        busy.current = false;
      }
    },
    [db, mode, showBanner],
  );

  return (
    <View style={styles.container}>
      {isFocused ? (
        <BarcodeScanner
          enabled={!manualVisible}
          onScan={handleScan}
          onManualEntry={() => setManualVisible(true)}
        />
      ) : (
        <View style={styles.container} />
      )}

      <View style={styles.bottom} pointerEvents="box-none">
        {banner ? (
          <View key={banner.id} style={[styles.banner, { backgroundColor: banner.isError ? Colors.danger : Colors.success }]}>
            <Ionicons name={banner.isError ? 'warning' : 'checkmark-circle'} size={20} color="#fff" />
            <Text style={styles.bannerText}>{banner.message}</Text>
          </View>
        ) : null}
        <View style={styles.panel}>
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
          <Text style={styles.description}>{MODE_DESCRIPTIONS[mode]}</Text>
        </View>
      </View>

      <ManualEntryModal visible={manualVisible} onClose={() => setManualVisible(false)} onSubmit={handleScan} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 10 },
  panel: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 12, gap: 8 },
  description: { fontSize: 12, color: Colors.secondaryText, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 15, flexShrink: 1 },
});
