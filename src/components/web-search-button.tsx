import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { errorMessage } from '@/lib/inventory';
import { buildWebSearchUrl } from '@/lib/web-search';

/**
 * バーコードをアプリ内ブラウザで Web 検索するボタン。
 * データベースに無い商品（業務用品など）の商品名を調べて手入力するために使う。
 */
export function WebSearchButton({ barcode }: { barcode: string }) {
  const code = barcode.trim();
  if (!code) return null;

  const open = async () => {
    try {
      await WebBrowser.openBrowserAsync(buildWebSearchUrl(code), {
        controlsColor: Colors.tint,
        dismissButtonStyle: 'close',
      });
    } catch (e) {
      Alert.alert('ブラウザを開けませんでした', errorMessage(e));
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={open}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}>
        <Ionicons name="globe-outline" size={16} color={Colors.tint} />
        <Text style={styles.text} numberOfLines={1}>
          Webで「{code}」を検索
        </Text>
        <Ionicons name="open-outline" size={14} color={Colors.tint} />
      </Pressable>
      <Text style={styles.hint}>見つけた商品名は長押しでコピーし、下の入力欄に貼り付けてください。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 10, gap: 4 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.tint,
    backgroundColor: Colors.card,
  },
  text: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.tint },
  hint: { fontSize: 11, color: Colors.secondaryText, marginHorizontal: 4 },
});
