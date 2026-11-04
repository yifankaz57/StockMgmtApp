import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useCallback, useRef } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, EmptyState } from './ui';

/** 読み取り対象のバーコード種別（JAN/EAN, UPC, Code128 など商品用 + QR） */
export const BARCODE_TYPES: BarcodeType[] = [
  'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar', 'qr', 'datamatrix', 'pdf417',
];

/**
 * カメラはバーコードが映っている間ずっと検出イベントを出し続けるため、
 * 同じバーコードはいったん画面から外れて（この時間以上検出されなくなって）から
 * 再度映ったときだけ新しい読み取りとして扱う（ミリ秒）
 */
const SAME_CODE_GAP_MS = 1000;

type Props = {
  /** false の間は読み取り結果を無視する（映っているバーコードの追跡は続ける） */
  enabled: boolean;
  onScan: (code: string) => void;
  /** カメラが使えないときに表示する手入力ボタンの処理 */
  onManualEntry?: () => void;
};

export function BarcodeScanner({ enabled, onScan, onManualEntry }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const handleScanned = useCallback(
    ({ data }: { data: string }) => {
      const code = data.trim();
      if (!code) return;
      const now = Date.now();
      const isSameCodeStillInView = code === last.current.code && now - last.current.at < SAME_CODE_GAP_MS;
      // 一時停止中（確認ダイアログ表示中など）も「映っている」ことは記録し、
      // 再開した瞬間に同じ商品を再検出しないようにする
      last.current = { code, at: now };
      if (!enabled || isSameCodeStillInView) return;
      onScan(code);
    },
    [enabled, onScan],
  );

  if (!permission) {
    return <View style={styles.fill} />;
  }

  if (!permission.granted) {
    return (
      <EmptyState
        icon="camera-outline"
        title="カメラへのアクセスが必要です"
        message="バーコードを読み取るためにカメラを使用します。">
        {permission.canAskAgain ? (
          <Button title="カメラを許可する" icon="camera" onPress={requestPermission} style={styles.button} />
        ) : (
          <Button title="設定を開く" icon="settings-outline" onPress={() => Linking.openSettings()} style={styles.button} />
        )}
        {onManualEntry ? (
          <Button title="バーコードを手入力" icon="keypad-outline" variant="secondary" onPress={onManualEntry} style={styles.button} />
        ) : null}
      </EmptyState>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={handleScanned}
      />
      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.frame} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 },
  frame: {
    width: '78%',
    aspectRatio: 1.8,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
  },
  button: { marginTop: 12, alignSelf: 'stretch' },
});
