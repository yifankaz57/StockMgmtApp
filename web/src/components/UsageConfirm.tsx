import { needsUsageConfirmation, type Product } from '@shared/inventory'
import { Icon } from './Icon'
import { productSubtitle } from '@/lib/display'

/**
 * スキャンで1個消費する前の大きな確認画面。
 * その日の1個目は落ち着いた色、同じ商品の2個目以降はオレンジの警告で出す
 */
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
  const repeated = needsUsageConfirmation(usedToday)
  return (
    <div className={`confirm${repeated ? '' : ' first'}`} role="alertdialog" aria-modal="true" aria-labelledby="usage-confirm-title">
      <div className="body">
        <Icon name={repeated ? 'warning' : 'drop'} />
        <h2 id="usage-confirm-title">{repeated ? `本日${usedToday + 1}個目の使用です` : '1個消費しますか？'}</h2>
        <div className="product-box">
          {sub ? <div className="detail">{sub}</div> : null}
          <div className="name">{product.name}</div>
        </div>
        <div className="msg">
          {repeated ? (
            <>
              今日すでに {usedToday} 個使っています。
              <br />
            </>
          ) : null}
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
