import { Alert, Platform } from 'react-native';

/**
 * 理由などの短い文章を入力してもらう。iOS は入力欄付きのダイアログ、それ以外は確認だけ（入力は空）。
 * キャンセルされたら null。
 */
export function askText(title: string, message: string, okLabel: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        title,
        message,
        [
          { text: 'キャンセル', style: 'cancel', onPress: () => resolve(null) },
          { text: okLabel, onPress: (value?: string) => resolve(value ?? '') },
        ],
        'plain-text',
      );
      return;
    }
    Alert.alert(title, message, [
      { text: 'キャンセル', style: 'cancel', onPress: () => resolve(null) },
      { text: okLabel, onPress: () => resolve('') },
    ]);
  });
}

/** はい／いいえの確認。はいなら true */
export function confirmAction(title: string, message: string, okLabel: string, destructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
