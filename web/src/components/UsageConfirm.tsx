import type { Product } from '@shared/inventory'
import { Icon } from './Icon'
import { productSubtitle } from '@/lib/display'

/** 1日に2個目以降を使うときの大きな確認画面 */
export function UsageConfirm({
  product,
  usedToday,
  onConfirm,
  onCancel,
}: {
  product: Product | null
  usedToday: number
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!product) return null
  const sub = productSubtitle(product)
  return (
    <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="usage-confirm-title">
      <div className="body">
        <Icon name="warning" />
        <h2 id="usage-confirm-title">本日{usedToday + 1}個目の使用です</h2>
        <div className="product-box">
          {sub ? <div className="detail">{sub}</div> : null}
          <div className="name">{product.name}</div>
        </div>
        <div className="msg">
          今日すでに {usedToday} 個使っています。
          <br />
          在庫から 1 個減らしてよいですか？
        </div>
        <div className="stock">
          在庫 {product.quantity} → {product.quantity - 1}
        </div>
      </div>
      <div className="actions">
        <button type="button" className="yes" onClick={onConfirm}>
          減らす（使用する）
        </button>
        <button type="button" className="no" onClick={onCancel}>
          やめる
        </button>
      </div>
    </div>
  )
}
