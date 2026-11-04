import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Button } from './ui';

/** バーコードを手入力するダイアログ（カメラが使えない時・読み取れない時用） */
export function ManualEntryModal({
  visible,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  onSubmit: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');

  const close = () => {
    setCode('');
    onClose();
  };

  const submit = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    close();
    onSubmit(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={styles.dialog}>
          <Text style={styles.title}>バーコードを入力</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="例: 4901234567894"
            placeholderTextColor="#A0A0A6"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="search"
            onSubmitEditing={submit}
            style={styles.input}
          />
          <View style={styles.buttons}>
            <Button title="キャンセル" variant="secondary" onPress={close} style={{ flex: 1 }} />
            <Button title="検索" onPress={submit} disabled={!code.trim()} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  dialog: { backgroundColor: Colors.card, borderRadius: 16, padding: 20, gap: 16 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center', color: Colors.text },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: Colors.text,
  },
  buttons: { flexDirection: 'row', gap: 12 },
});
