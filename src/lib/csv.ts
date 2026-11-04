import type { Product, StockTransaction } from './inventory';

const KIND_LABELS_FOR_CSV: Record<StockTransaction['kind'], string> = {
  initial: '初期登録',
  stockIn: '入庫',
  stockOut: '出庫',
  adjustment: '棚卸',
};

export function escapeCsvField(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function csvRow(fields: (string | number)[]): string {
  return fields.map((f) => escapeCsvField(String(f))).join(',');
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map(csvRow).join('\r\n') + '\r\n';
}

/** ISO 文字列を「yyyy/MM/dd HH:mm:ss」（端末のローカル時刻）に変換 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function productsToCsv(products: Product[]): string {
  return toCsv([
    ['バーコード', '商品名', '在庫数', '最低在庫数', '保管場所', 'メモ', '更新日時'],
    ...products.map((p) => [
      p.barcode,
      p.name,
      p.quantity,
      p.minQuantity,
      p.location,
      p.note,
      formatDateTime(p.updatedAt),
    ]),
  ]);
}

export function transactionsToCsv(transactions: StockTransaction[]): string {
  return toCsv([
    ['日時', 'バーコード', '商品名', '種別', '増減', '処理後在庫', 'メモ'],
    ...transactions.map((t) => [
      formatDateTime(t.createdAt),
      t.productBarcode,
      t.productName,
      KIND_LABELS_FOR_CSV[t.kind],
      t.delta,
      t.quantityAfter,
      t.note,
    ]),
  ]);
}
