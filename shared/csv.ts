import { stockValue, type Product, type StockTransaction } from './inventory.ts';

const KIND_LABELS_FOR_CSV: Record<StockTransaction['kind'], string> = {
  initial: '初期登録',
  stockIn: '入庫',
  stockOut: '出庫',
  adjustment: '棚卸',
  use: '利用',
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
    ['バーコード', 'メーカー', '商品名', '色番号', '容量', '利用', '在庫数', '仕入れ値', '在庫金額', '最低在庫数', '保管場所', 'メモ', '更新日時'],
    ...products.map((p) => [
      p.barcode,
      p.manufacturer,
      p.name,
      p.shade,
      p.volume,
      p.available ? '可' : '不可',
      p.quantity,
      p.purchasePrice ?? '',
      stockValue(p) ?? '',
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
