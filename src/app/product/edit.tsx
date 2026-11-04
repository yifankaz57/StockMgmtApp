import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { ProductSuggestions } from '@/components/product-suggestions';
import { WebSearchButton } from '@/components/web-search-button';
import { ErrorText, FieldRow, Row, Section, styles as ui } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { createProduct, getProduct, updateProduct } from '@/db/database';
import { haptics } from '@/lib/haptics';
import { errorMessage, parseQuantity } from '@/lib/inventory';

/**
 * 商品の登録・編集画面
 * - /product/edit?id=1 … 編集
 * - /product/edit?barcode=4901234567894 … バーコードを指定して新規登録
 * - /product/edit … 新規登録
 */
export default function ProductEditScreen() {
  const params = useLocalSearchParams<{ id?: string; barcode?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const db = useSQLiteContext();

  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [shade, setShade] = useState('');
  const [volume, setVolume] = useState('');
  const [location, setLocation] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [minQuantity, setMinQuantity] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  useEffect(() => {
    if (editingId === null) return;
    getProduct(db, editingId).then((p) => {
      if (!p) return;
      setBarcode(p.barcode);
      setName(p.name);
      setManufacturer(p.manufacturer);
      setShade(p.shade);
      setVolume(p.volume);
      setLocation(p.location);
      setMinQuantity(String(p.minQuantity));
      setNote(p.note);
    });
  }, [db, editingId]);

  const save = async () => {
    if (saving) return;
    setError(null);
    const min = parseQuantity(minQuantity);
    const initial = editingId === null ? parseQuantity(initialQuantity) : 0;
    if (min === null || initial === null) {
      setError('数量は0以上の整数で入力してください。');
      haptics.error();
      return;
    }
    setSaving(true);
    try {
      const input = { barcode, name, manufacturer, shade, volume, location, note, minQuantity: min };
      if (editingId === null) {
        await createProduct(db, input, initial);
      } else {
        await updateProduct(db, editingId, input);
      }
      haptics.success();
      router.back();
    } catch (e) {
      haptics.error();
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: editingId === null ? '商品を登録' : '商品を編集',
          headerLeft: () => (
            <Pressable hitSlop={10} onPress={() => router.back()}>
              <Text style={styles.headerButton}>キャンセル</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable hitSlop={10} onPress={save} disabled={saving}>
              <Text style={[styles.headerButton, { fontWeight: '700' }]}>保存</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <Section title="バーコード">
          <Row last>
            <TextInput
              value={barcode}
              onChangeText={setBarcode}
              placeholder="JAN / EAN / QR など"
              placeholderTextColor="#A0A0A6"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={!barcode && editingId === null}
              style={[ui.input, { textAlign: 'left' }]}
            />
            <Pressable accessibilityLabel="バーコードを読み取る" hitSlop={10} onPress={() => setScannerVisible(true)}>
              <Ionicons name="scan-outline" size={24} color={Colors.tint} />
            </Pressable>
          </Row>
        </Section>

        <ProductSuggestions
          barcode={barcode}
          autoSearch={editingId === null}
          currentName={name}
          currentManufacturer={manufacturer}
          onSelectName={setName}
          onSelectManufacturer={setManufacturer}
        />

        <WebSearchButton barcode={barcode} />

        <Section title="商品情報">
          <FieldRow
            label="商品名"
            value={name}
            onChangeText={setName}
            placeholder="必須"
            autoFocus={!!barcode && editingId === null}
          />
          <FieldRow label="メーカー" value={manufacturer} onChangeText={setManufacturer} placeholder="任意" />
          <FieldRow
            label="色番号"
            value={shade}
            onChangeText={setShade}
            placeholder="例: 8-NB（任意）"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <FieldRow label="容量" value={volume} onChangeText={setVolume} placeholder="例: 80g（任意）" autoCorrect={false} />
          <FieldRow label="保管場所" value={location} onChangeText={setLocation} placeholder="例: 棚A-3" last />
        </Section>

        <Section title="在庫" footer="在庫数が最低在庫数以下になると「在庫少」として表示されます。0 の場合は警告しません。">
          {editingId === null ? (
            <FieldRow
              label="初期在庫数"
              value={initialQuantity}
              onChangeText={setInitialQuantity}
              keyboardType="number-pad"
              selectTextOnFocus
            />
          ) : null}
          <FieldRow
            label="最低在庫数"
            value={minQuantity}
            onChangeText={setMinQuantity}
            keyboardType="number-pad"
            selectTextOnFocus
            last
          />
        </Section>

        <Section title="メモ">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="メモ"
            placeholderTextColor="#A0A0A6"
            multiline
            style={styles.note}
          />
        </Section>

        <ErrorText message={error} />
      </ScrollView>

      <Modal visible={scannerVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerHeader}>
          <Text style={styles.scannerTitle}>バーコードを読み取り</Text>
          <Pressable hitSlop={10} onPress={() => setScannerVisible(false)}>
            <Text style={styles.headerButton}>閉じる</Text>
          </Pressable>
        </View>
        <BarcodeScanner
          enabled={scannerVisible}
          onScan={(code) => {
            haptics.success();
            setBarcode(code);
            setScannerVisible(false);
          }}
        />
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerButton: { color: Colors.tint, fontSize: 17 },
  note: { minHeight: 88, padding: 16, fontSize: 16, color: Colors.text, textAlignVertical: 'top' },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.card,
  },
  scannerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
});
