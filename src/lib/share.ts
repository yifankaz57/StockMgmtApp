import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** CSV を一時ファイルに書き出して共有シートを開く（Excel で文字化けしないよう UTF-8 BOM 付き） */
export async function shareCsv(fileName: string, csv: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('この端末では共有機能を利用できません。');
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  const body = new TextEncoder().encode(csv);
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(body, 3);
  await file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: fileName,
  });
}

/** ファイル名用のタイムスタンプ（例: 20261104-1530） */
export function timestampForFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
