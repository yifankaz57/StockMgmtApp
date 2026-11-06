import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { StockAlertSettingsSection } from '@/components/stock-alert-settings';
import { LabeledRow, Row, Section } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { getUsageResetDay, setUsageResetDay } from '@/db/database';
import { useDataVersion } from '@/db/events';
import { APP_NAME, CONTACT_EMAIL, PRIVACY_POLICY_URL, SUPPORT_URL } from '@/lib/app-info';
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

      <Section title="このアプリについて">
        <LinkRow label="プライバシーポリシー" onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)} />
        <LinkRow label="サポート・よくある質問" onPress={() => void WebBrowser.openBrowserAsync(SUPPORT_URL)} />
        <LinkRow
          label="お問い合わせ"
          value={CONTACT_EMAIL}
          last
          onPress={() =>
            void Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} へのお問い合わせ`)}`).catch(() =>
              Alert.alert('メールアプリを開けませんでした', `次のアドレスまでご連絡ください。\n${CONTACT_EMAIL}`),
            )
          }
        />
      </Section>
    </ScrollView>
  );
}

function LinkRow({ label, value, onPress, last }: { label: string; value?: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: Colors.fill }}>
      <Row last={last}>
        <Text style={styles.label}>{label}</Text>
        {value ? <Text style={styles.linkValue}>{value}</Text> : <Ionicons name="open-outline" size={18} color={Colors.tint} />}
      </Row>
    </Pressable>
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
  linkValue: { fontSize: 15, color: Colors.tint },
  day: { fontSize: 20, fontWeight: '700', color: Colors.text, minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
