import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorText, Section } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { getStockAlerts, setStockAlerts } from '@/db/database';
import { useDataVersion } from '@/db/events';
import { errorMessage, parseQuantity } from '@/lib/inventory';
import {
  STOCK_ALERT_LABELS,
  STOCK_ALERT_PALETTE,
  validateStockAlerts,
  type StockAlertLevelKey,
  type StockAlertSettings,
} from '@/lib/stock-alert';

const KEYS: StockAlertLevelKey[] = ['caution', 'warning'];

/** 設定タブ「在庫の色分け」: 2段階（注意・警告）の数と背景色 */
export function StockAlertSettingsSection() {
  const db = useSQLiteContext();
  const version = useDataVersion();
  const [saved, setSaved] = useState<StockAlertSettings | null>(null);
  // 入力中の数（空欄 = 使わない）
  const [texts, setTexts] = useState<Record<StockAlertLevelKey, string>>({ caution: '', warning: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStockAlerts(db)
      .then((s) => {
        setSaved(s);
        setTexts({ caution: s.caution.threshold?.toString() ?? '', warning: s.warning.threshold?.toString() ?? '' });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [db, version]);

  if (!saved) return null;

  const save = (next: StockAlertSettings) => {
    const problem = validateStockAlerts(next);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaved(next);
    setStockAlerts(db, next).catch((e) => setError(errorMessage(e)));
  };

  /** 数の欄を確定する（空欄なら使わない） */
  const commitThreshold = (key: StockAlertLevelKey) => {
    const text = texts[key].trim();
    if (text === '') {
      save({ ...saved, [key]: { ...saved[key], threshold: null } });
      return;
    }
    const n = parseQuantity(text);
    if (n === null || n < 1) {
      setError('数は1以上の整数で入力してください（使わない場合は空欄）。');
      return;
    }
    save({ ...saved, [key]: { ...saved[key], threshold: n } });
  };

  return (
    <Section
      title="在庫の色分け"
      footer="在庫数が設定した数を下回った（未満になった）商品を、在庫一覧で指定の背景色にします。両方に当てはまるときは「警告」の色になります。数を空欄にするとその段階は使いません。">
      {KEYS.map((key, i) => (
        <View
          key={key}
          style={[
            styles.level,
            i > 0 && styles.levelBorder,
            saved[key].threshold !== null && { backgroundColor: saved[key].color },
          ]}>
          <View style={styles.row}>
            <Text style={styles.label}>{STOCK_ALERT_LABELS[key]}</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.muted}>在庫が</Text>
              <TextInput
                accessibilityLabel={`${STOCK_ALERT_LABELS[key]}の数`}
                value={texts[key]}
                onChangeText={(t) => setTexts((prev) => ({ ...prev, [key]: t }))}
                onEndEditing={() => commitThreshold(key)}
                keyboardType="number-pad"
                returnKeyType="done"
                placeholder="なし"
                placeholderTextColor="#A0A0A6"
                style={styles.input}
              />
              <Text style={styles.muted}>個未満</Text>
            </View>
          </View>
          <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel={`${STOCK_ALERT_LABELS[key]}の背景色`}>
            {STOCK_ALERT_PALETTE.map((p) => {
              const selected = saved[key].color === p.color;
              return (
                <Pressable
                  key={p.color}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={p.name}
                  hitSlop={4}
                  onPress={() => save({ ...saved, [key]: { ...saved[key], color: p.color } })}
                  style={[styles.swatch, { backgroundColor: p.color }, selected && styles.swatchSelected]}
                />
              );
            })}
          </View>
        </View>
      ))}
      <ErrorText message={error} />
    </Section>
  );
}

const styles = StyleSheet.create({
  level: { paddingBottom: 12 },
  levelBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 48, paddingVertical: 8, gap: 12 },
  label: { fontSize: 16, color: Colors.text, flex: 1 },
  inputGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontSize: 15, color: Colors.secondaryText },
  input: {
    width: 64,
    textAlign: 'center',
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 5,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  swatchSelected: { borderWidth: 3, borderColor: Colors.tint },
});
