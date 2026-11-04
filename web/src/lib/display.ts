import { formatShadeVolume, type Product, type TransactionKind } from '@shared/inventory'
import type { IconName } from '@/components/Icon'

export const KIND_ICONS: Record<TransactionKind, IconName> = {
  initial: 'sparkles',
  stockIn: 'arrowIn',
  stockOut: 'arrowOut',
  adjustment: 'clipboard',
  use: 'drop',
}

/** 「メーカー 色番号 / 容量」の表示文字列（全角スペース区切り） */
export function productSubtitle(product: Product): string {
  return [product.manufacturer, formatShadeVolume(product)].filter(Boolean).join('\u3000')
}
