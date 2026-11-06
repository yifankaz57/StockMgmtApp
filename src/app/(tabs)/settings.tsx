import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { StockAlertSettingsSection } from '@/components/stock-alert-settings';
import { LabeledRow, Row, Section } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { getUsageResetDay, setUsageResetDay } from '@/db/database';
import { useDataVersion } from '@/db/events';
import { errorMessage, formatUsagePeriod, usagePeriod } from '@/lib/inventory';
import { SharedMasterSettings } from '@/shared-master/settings-section';

/** 設定タブ: 消費量を数え直す日（毎月何日か）と、共有マスタ */
export default function SettingsScreen() {
  const db = useSQLiteContext();
  const version = useDataVersion();
  const [resetDay, setResetDay] = useState<number | null>(null);

  useEffect(() => {
    getUsageResetDay(db)
      .then(setResetDay)
      .catch((e) => Alert.alert('読み込みエラー', errorMessage(e)));
  }, [db, version]);

  const change = (day: number) => {
    const next = ((day - 1 + 31) % 31) + 1; // 1〜31 で循環
    setResetDay(next);
    setUsageResetDay(db, next).catch((e) => Alert.alert('保存に失敗しました', errorMessage(e)));
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Section
        title="消費量の集計"
        footer="在庫一覧の「消費量の多い順」と CSV の月ごとの消費数は、毎月この日の0時で区切って数えます（スキャンでの消費と手動の出庫の合計）。29〜31日を選ぶと、その日がない月は月末で区切ります。">
        <Row>
          <Text style={styles.label}>リセット日</Text>
          <View style={styles.stepper}>
            <Text style={styles.monthly}>毎月</Text>
            <StepButton icon="remove-circle-outline" label="1日前にする" disabled={resetDay === null} onPress={() => resetDay && change(resetDay - 1)} />
            <Text style={styles.day} accessibilityLabel={`リセット日 ${resetDay ?? ''}日`}>
              {resetDay ?? '–'}日
            </Text>
            <StepButton icon="add-circle-outline" label="1日後にする" disabled={resetDay === null} onPress={() => resetDay && change(resetDay + 1)} />
          </View>
        </Row>
        <LabeledRow label="現在の集計期間" value={resetDay ? formatUsagePeriod(usagePeriod(resetDay)) : ''} last />
      </Section>

      <StockAlertSettingsSection />

      <SharedMasterSettings />
    </ScrollView>
  );
}

function StepButton({ icon, label, onPress, disabled }: { icon: 'add-circle-outline' | 'remove-circle-outline'; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} disabled={disabled} style={({ pressed }) => pressed && { opacity: 0.5 }}>
      <Ionicons name={icon} size={30} color={Colors.tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, color: Colors.text, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthly: { fontSize: 16, color: Colors.secondaryText },
  day: { fontSize: 20, fontWeight: '700', color: Colors.text, minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
