import { formatDateTime } from '@shared/csv'
import { KIND_LABELS, type Product, type StockTransaction } from '@shared/inventory'
import { KIND_ICONS, productSubtitle } from '@/lib/display'
import { Icon } from './Icon'
import { QuantityBadge } from './ui'

export function ProductRow({ product, onClick }: { product: Product; onClick: () => void }) {
  const sub = productSubtitle(product)
  return (
    <button type="button" className="list-item" onClick={onClick}>
      <div className="item-main">
        <div className="item-title">{product.name}</div>
        {sub ? <div className="item-sub">{sub}</div> : null}
        <div className="item-meta">
          {product.barcode}
          {product.location ? `　📍${product.location}` : ''}
        </div>
      </div>
      <QuantityBadge product={product} />
      <Icon name="chevron" className="chevron" />
    </button>
  )
}

export function TransactionRow({
  transaction,
  showProduct,
  onClick,
}: {
  transaction: StockTransaction
  showProduct: boolean
  onClick?: () => void
}) {
  const color = transaction.delta > 0 ? 'var(--success)' : transaction.delta < 0 ? 'var(--danger)' : 'var(--text-2)'
  const when = formatDateTime(transaction.createdAt).slice(showProduct ? 11 : 0, 16)
  return (
    <button type="button" className="list-item" onClick={onClick} disabled={!onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ color, display: 'inline-flex' }}>
        <Icon name={KIND_ICONS[transaction.kind]} size={24} />
      </span>
      <div className="item-main">
        {showProduct ? <div className="item-title">{transaction.productName}</div> : null}
        <div className="item-meta">
          {KIND_LABELS[transaction.kind]}　{when}
        </div>
        {transaction.note ? <div className="item-meta">{transaction.note}</div> : null}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color, fontWeight: 700, fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>
          {transaction.delta > 0 ? `+${transaction.delta}` : transaction.delta}
        </div>
        <div className="item-meta">→ {transaction.quantityAfter}</div>
      </div>
    </button>
  )
}
