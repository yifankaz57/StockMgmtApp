import { useEffect, useMemo, useState } from 'react'

import { productsToCsv } from '@shared/csv'
import { errorMessage, formatYen, isLowStock, totalStockValue, type Product } from '@shared/inventory'
import { Icon } from '@/components/Icon'
import { ProductRow } from '@/components/rows'
import { EmptyState, IconButton, Page } from '@/components/ui'
import { listProducts } from '@/db/database'
import { useDataVersion } from '@/db/events'
import { shareCsv, timestampForFileName } from '@/lib/share'
import { navigate } from '@/router'

export function ProductsPage() {
  const version = useDataVersion()
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  useEffect(() => {
    listProducts()
      .then(setProducts)
      .catch((e) => alert(`読み込みエラー: ${errorMessage(e)}`))
  }, [version])

  const valueSummary = useMemo(() => totalStockValue(products), [products])
  const lowCount = useMemo(() => products.filter(isLowStock).length, [products])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (lowOnly && !isLowStock(p)) return false
      if (!q) return true
      return [p.name, p.manufacturer, p.shade, p.barcode, p.location].some((v) => v.toLowerCase().includes(q))
    })
  }, [products, query, lowOnly])

  const exportCsv = () => {
    if (products.length === 0) {
      alert('出力する商品がありません')
      return
    }
    const ts = timestampForFileName()
    void shareCsv(`在庫一覧_${ts}.csv`, productsToCsv(products), `zaiko_${ts}.csv`).catch((e) =>
      alert(`CSV出力に失敗しました: ${errorMessage(e)}`),
    )
  }

  return (
    <Page
      title="在庫一覧"
      right={
        <>
          <IconButton icon="share" label="CSV出力" onClick={exportCsv} />
          <IconButton icon="plus" label="商品を登録" onClick={() => navigate('/product/new')} />
        </>
      }>
      <div className="search">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="商品名・メーカー・色番号など"
          autoComplete="off"
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 16px' }}>
        <button type="button" className={`chip filter warn${lowOnly ? ' active' : ''}`} onClick={() => setLowOnly((v) => !v)}>
          ⚠ 在庫少のみ{lowCount > 0 ? `（${lowCount}）` : ''}
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{filtered.length} 件</span>
      </div>
      {products.length > 0 && valueSummary.unpricedCount < products.length ? (
        <div className="value-summary">
          <span>在庫金額（仕入れ値ベース）</span>
          <strong>{formatYen(valueSummary.total)}</strong>
          {valueSummary.unpricedCount > 0 ? <small>仕入れ値が未登録の {valueSummary.unpricedCount} 件は含みません</small> : null}
        </div>
      ) : null}
      {filtered.length > 0 ? (
        <div className="list">
          {filtered.map((p) => (
            <ProductRow key={p.id} product={p} onClick={() => navigate(`/product/${p.id}`)} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon="box" title="商品がありません" message="「スキャン」タブでバーコードを読み取るか、右上の＋から商品を登録してください。" />
      ) : (
        <EmptyState icon="search" title="該当する商品がありません" />
      )}
    </Page>
  )
}
