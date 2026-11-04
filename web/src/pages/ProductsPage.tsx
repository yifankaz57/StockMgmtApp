import { useEffect, useMemo, useState } from 'react'

import { productsToCsv } from '@shared/csv'
import {
  errorMessage,
  isLowStock,
  formatUsagePeriod,
  sortByUsage,
  usagePeriod,
  type Product,
} from '@shared/inventory'
import { Icon } from '@/components/Icon'
import { ProductRow } from '@/components/rows'
import { EmptyState, IconButton, Page, Segmented } from '@/components/ui'
import { getUsageResetDay, listProducts, setProductAvailable, usageTotals } from '@/db/database'
import { useDataVersion } from '@/db/events'
import { shareCsv, timestampForFileName } from '@/lib/share'
import { navigate } from '@/router'

type SortKey = 'name' | 'usage'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: '名前順' },
  { value: 'usage', label: '消費量の多い順' },
]

/** 並び順はこの端末に覚えておく（保存できない環境でも動くように try/catch） */
const SORT_STORAGE_KEY = 'products-sort'

function loadSort(): SortKey {
  try {
    return localStorage.getItem(SORT_STORAGE_KEY) === 'usage' ? 'usage' : 'name'
  } catch {
    return 'name'
  }
}

export function ProductsPage() {
  const version = useDataVersion()
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>(loadSort)
  // 消費量順のとき: 集計期間（設定タブのリセット日から計算）と商品ごとの消費量
  const [usage, setUsage] = useState<{ totals: Map<number, number>; periodLabel: string; resetDay: number } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sort)
    } catch {
      // 保存できなくても並べ替え自体は使える
    }
  }, [sort])

  // 今期の消費量は、並べ替えと CSV 出力の両方で使うので常に読み込んでおく
  // （CSV 出力のタップ時に読み込むと、iPhone で共有シートが開かないことがあるため）
  useEffect(() => {
    const request = { active: true }
    void (async () => {
      const resetDay = await getUsageResetDay()
      const period = usagePeriod(resetDay)
      const totals = await usageTotals(period.start.toISOString())
      if (request.active) setUsage({ totals, periodLabel: formatUsagePeriod(period), resetDay })
    })().catch((e) => alert(`読み込みエラー: ${errorMessage(e)}`))
    return () => {
      request.active = false
    }
  }, [version])

  useEffect(() => {
    listProducts()
      .then(setProducts)
      .catch((e) => alert(`読み込みエラー: ${errorMessage(e)}`))
  }, [version])

  const lowCount = useMemo(() => products.filter(isLowStock).length, [products])
  const sortingByUsage = sort === 'usage' && usage !== null
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = products.filter((p) => {
      if (lowOnly && !isLowStock(p)) return false
      if (!q) return true
      return [p.name, p.manufacturer, p.shade, p.barcode, p.location].some((v) => v.toLowerCase().includes(q))
    })
    // listProducts は名前順なので、消費量順のときだけ並べ替える
    return sortingByUsage ? sortByUsage(matched, usage.totals) : matched
  }, [products, query, lowOnly, sortingByUsage, usage])

  const toggleAvailable = (product: Product, available: boolean) => {
    // すぐ見た目に反映し、保存後の再読み込みで確定させる
    setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, available } : p)))
    setProductAvailable(product.id, available).catch((e) => {
      alert(`保存に失敗しました: ${errorMessage(e)}`)
      setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, available: product.available } : p)))
    })
  }

  const exportCsv = () => {
    if (products.length === 0) {
      alert('出力する商品がありません')
      return
    }
    const ts = timestampForFileName()
    void shareCsv(`在庫一覧_${ts}.csv`, productsToCsv(products, usage ? { label: usage.periodLabel, totals: usage.totals } : undefined), `zaiko_${ts}.csv`).catch((e) =>
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
      <div className="sort-bar">
        <Segmented options={SORT_OPTIONS} value={sort} onChange={setSort} />
        {sortingByUsage ? (
          <div className="period">
            集計期間 {usage.periodLabel}（毎月{usage.resetDay}日にリセット。
            <button type="button" className="inline-link" onClick={() => navigate('/settings', undefined, { replace: true })}>
              設定で変更
            </button>
            ）
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 16px' }}>
        <button type="button" className={`chip filter warn${lowOnly ? ' active' : ''}`} onClick={() => setLowOnly((v) => !v)}>
          ⚠ 在庫少のみ{lowCount > 0 ? `（${lowCount}）` : ''}
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{filtered.length} 件</span>
      </div>
      {filtered.length > 0 ? (
        <div className="list">
          {filtered.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              onClick={() => navigate(`/product/${p.id}`)}
              onToggleAvailable={(available) => toggleAvailable(p, available)}
              usage={sortingByUsage ? usage.totals.get(p.id) ?? 0 : undefined}
            />
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
