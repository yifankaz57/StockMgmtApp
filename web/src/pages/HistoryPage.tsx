import { useEffect, useMemo, useState } from 'react'

import { transactionsToCsv } from '@shared/csv'
import { errorMessage, KIND_LABELS, type StockTransaction, type TransactionKind } from '@shared/inventory'
import { TransactionRow } from '@/components/rows'
import { EmptyState, IconButton, Page } from '@/components/ui'
import { listTransactions } from '@/db/database'
import { useDataVersion } from '@/db/events'
import { shareCsv, timestampForFileName } from '@/lib/share'
import { navigate } from '@/router'

const FILTERS: (TransactionKind | 'all')[] = ['all', 'use', 'stockIn', 'stockOut', 'adjustment', 'initial']
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`
}

export function HistoryPage() {
  const version = useDataVersion()
  const [filter, setFilter] = useState<TransactionKind | 'all'>('all')
  const [transactions, setTransactions] = useState<StockTransaction[]>([])

  useEffect(() => {
    listTransactions({ kind: filter === 'all' ? undefined : filter })
      .then(setTransactions)
      .catch((e) => alert(`読み込みエラー: ${errorMessage(e)}`))
  }, [version, filter])

  const groups = useMemo(() => {
    const result: { title: string; items: StockTransaction[] }[] = []
    for (const t of transactions) {
      const title = dayKey(t.createdAt)
      const last = result[result.length - 1]
      if (last && last.title === title) last.items.push(t)
      else result.push({ title, items: [t] })
    }
    return result
  }, [transactions])

  const exportCsv = () => {
    if (transactions.length === 0) {
      alert('出力する履歴がありません')
      return
    }
    const ts = timestampForFileName()
    void shareCsv(`入出庫履歴_${ts}.csv`, transactionsToCsv(transactions), `rireki_${ts}.csv`).catch((e) =>
      alert(`CSV出力に失敗しました: ${errorMessage(e)}`),
    )
  }

  return (
    <Page title="入出庫履歴" right={<IconButton icon="share" label="CSV出力" onClick={exportCsv} />}>
      <div className="chips" style={{ flexWrap: 'nowrap', overflowX: 'auto', padding: '10px 16px' }}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`chip filter${f === filter ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'すべて' : KIND_LABELS[f]}
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        <EmptyState icon="clock" title="履歴がありません" message="入庫・出庫・棚卸・利用を行うとここに表示されます。" />
      ) : (
        groups.map((g) => (
          <div key={g.title}>
            <div className="day-header">{g.title}</div>
            <div className="list">
              {g.items.map((t) => (
                <TransactionRow key={t.id} transaction={t} showProduct onClick={() => navigate(`/product/${t.productId}`)} />
              ))}
            </div>
          </div>
        ))
      )}
    </Page>
  )
}
