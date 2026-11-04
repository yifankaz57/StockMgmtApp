import { useEffect, useState } from 'react'

import { formatDateTime } from '@shared/csv'
import {
  errorMessage,
  formatYen,
  isLowStock,
  KIND_LABELS,
  SELECTABLE_KINDS,
  stockValue,
  type Product,
  type StockTransaction,
} from '@shared/inventory'
import { Icon } from '@/components/Icon'
import { TransactionRow } from '@/components/rows'
import { KIND_ICONS } from '@/lib/display'
import { EmptyState, Page, Section } from '@/components/ui'
import { deleteProduct, getProduct, listTransactions } from '@/db/database'
import { useDataVersion } from '@/db/events'
import { goBack, navigate } from '@/router'

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{value}</span>
    </div>
  )
}

export function ProductDetailPage({ id }: { id: number }) {
  const version = useDataVersion()
  const [product, setProduct] = useState<Product | null | undefined>(undefined)
  const [transactions, setTransactions] = useState<StockTransaction[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([getProduct(id), listTransactions({ productId: id, limit: 200 })])
      .then(([p, t]) => {
        if (cancelled) return
        setProduct(p)
        setTransactions(t)
      })
      .catch((e) => alert(`読み込みエラー: ${errorMessage(e)}`))
    return () => {
      cancelled = true
    }
  }, [id, version])

  const back = (
    <button type="button" className="link-btn" onClick={() => goBack('/products')}>
      ‹ 戻る
    </button>
  )

  if (product === undefined) return <Page title="商品詳細" left={back}>{null}</Page>
  if (product === null) {
    return (
      <Page title="商品詳細" left={back}>
        <EmptyState icon="box" title="商品が見つかりません" message="削除された可能性があります。" />
      </Page>
    )
  }

  const low = isLowStock(product)
  const value = stockValue(product)

  const remove = async () => {
    if (!window.confirm(`「${product.name}」を削除しますか？\n入出庫履歴もすべて削除されます。この操作は取り消せません。`)) return
    try {
      await deleteProduct(product.id)
      goBack('/products')
    } catch (e) {
      alert(`削除に失敗しました: ${errorMessage(e)}`)
    }
  }

  return (
    <Page
      title={product.name}
      left={back}
      right={
        <button type="button" className="link-btn" onClick={() => navigate(`/product/${product.id}/edit`)}>
          編集
        </button>
      }>
      <div className="hero">
        <div className={`qty${low ? ' low' : ''}`}>{product.quantity}</div>
        <div className="caption">現在の在庫数</div>
        {low ? <div className="low-msg">⚠ 最低在庫数（{product.minQuantity}）以下です</div> : null}
      </div>

      <div className="actions3">
        {SELECTABLE_KINDS.map((kind) => (
          <button key={kind} type="button" onClick={() => navigate(`/adjust/${product.id}`, { kind })}>
            <Icon name={KIND_ICONS[kind]} />
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <Section title="商品情報">
        <InfoRow label="バーコード" value={product.barcode} />
        {product.manufacturer ? <InfoRow label="メーカー" value={product.manufacturer} /> : null}
        {product.shade ? <InfoRow label="色番号" value={product.shade} /> : null}
        {product.volume ? <InfoRow label="容量" value={product.volume} /> : null}
        {product.location ? <InfoRow label="保管場所" value={product.location} /> : null}
        <InfoRow label="仕入れ値" value={product.purchasePrice === null ? '未登録' : formatYen(product.purchasePrice)} />
        {value !== null ? <InfoRow label="在庫金額" value={formatYen(value)} /> : null}
        <InfoRow label="最低在庫数" value={product.minQuantity} />
        <InfoRow label="登録日時" value={formatDateTime(product.createdAt).slice(0, 16)} />
        <InfoRow label="更新日時" value={formatDateTime(product.updatedAt).slice(0, 16)} />
        {product.note ? <InfoRow label="メモ" value={product.note} /> : null}
      </Section>

      <Section title={`入出庫履歴${transactions.length >= 200 ? '（最新200件）' : ''}`}>
        {transactions.length === 0 ? (
          <div className="row" style={{ color: 'var(--text-2)' }}>
            履歴はありません
          </div>
        ) : (
          transactions.map((t) => <TransactionRow key={t.id} transaction={t} showProduct={false} />)
        )}
      </Section>

      <div style={{ margin: '28px 16px 0' }}>
        <button type="button" className="btn danger" onClick={remove}>
          <Icon name="trash" /> この商品を削除
        </button>
      </div>
    </Page>
  )
}
