import { formatDateTime } from '@shared/csv'
import { KIND_LABELS, type Product, type StockTransaction } from '@shared/inventory'
import { KIND_ICONS, productSubtitle } from '@/lib/display'
import { Icon } from './Icon'
import { QuantityBadge } from './ui'

export function ProductRow({
  product,
  onClick,
  onToggleAvailable,
  usage,
}: {
  product: Product
  onClick: () => void
  /** 指定すると、行の左に利用可能／不可の切り替えボタンを出す */
  onToggleAvailable?: (available: boolean) => void
  /** 消費量順のときに表示する、集計期間内の消費量 */
  usage?: number
}) {
  const sub = productSubtitle(product)
  return (
    <div className={`list-row${product.available ? '' : ' unavailable'}`}>
      {onToggleAvailable ? <AvailabilityToggle available={product.available} onChange={onToggleAvailable} /> : null}
      <button type="button" className="list-item" onClick={onClick}>
        <div className="item-main">
          <div className="item-title">
            {product.available ? null : <span className="tag-unavailable">利用不可</span>}
            {product.name}
          </div>
          {sub ? <div className="item-sub">{sub}</div> : null}
          <div className="item-meta">
            {product.barcode}
            {product.location ? `　📍${product.location}` : ''}
          </div>
          {usage !== undefined ? (
            <div className={`item-usage${usage > 0 ? '' : ' zero'}`}>今期の消費 {usage} 個</div>
          ) : null}
        </div>
        <QuantityBadge product={product} />
        <Icon name="chevron" className="chevron" />
      </button>
    </div>
  )
}

/** 利用可能（緑のチェック）／利用不可（赤の禁止マーク）を1タップで切り替える */
export function AvailabilityToggle({ available, onChange }: { available: boolean; onChange: (available: boolean) => void }) {
  return (
    <button
      type="button"
      className={`avail-toggle${available ? ' on' : ' off'}`}
      role="switch"
      aria-checked={available}
      aria-label={available ? '利用可能（タップで利用不可にする）' : '利用不可（タップで利用可能にする）'}
      title={available ? '利用可能' : '利用不可'}
      onClick={() => onChange(!available)}>
      <Icon name={available ? 'checkCircle' : 'ban'} />
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
