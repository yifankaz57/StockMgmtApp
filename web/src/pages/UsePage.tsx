import { useCallback, useRef, useState } from 'react'

import { errorMessage, isLowStock, needsUsageConfirmation, type Product } from '@shared/inventory'
import { Icon } from '@/components/Icon'
import { ManualEntry } from '@/components/ManualEntry'
import { productSubtitle } from '@/lib/display'
import { Scanner } from '@/components/Scanner'
import { IconButton, Page } from '@/components/ui'
import { UsageConfirm } from '@/components/UsageConfirm'
import { applyStockChange, countUsageToday, findProductByBarcode } from '@/db/database'
import { feedback } from '@/lib/feedback'
import { navigate } from '@/router'

type Result =
  | { type: 'success'; product: Product; usedToday: number }
  | { type: 'cancelled'; product: Product }
  | { type: 'error'; title: string; message: string; unregisteredCode?: string }

/**
 * 単純利用モード: 登録済み商品のバーコードを読み取るたびに在庫を1減らす。
 * 同じ商品を1日に2個以上使う場合は大きな確認画面を出す。
 */
export function UsePage() {
  const [result, setResult] = useState<Result | null>(null)
  const [pending, setPending] = useState<{ product: Product; usedToday: number } | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const busy = useRef(false)

  const consumeOne = useCallback(async (product: Product, usedToday: number) => {
    try {
      const updated = await applyStockChange(product.id, 'use', 1, '単純利用')
      feedback.success()
      setResult({ type: 'success', product: updated, usedToday: usedToday + 1 })
    } catch (e) {
      feedback.error()
      setResult({ type: 'error', title: '在庫を減らせませんでした', message: `${product.name}\n${errorMessage(e)}` })
    }
  }, [])

  const handleScan = useCallback(
    async (code: string) => {
      if (busy.current) return
      busy.current = true
      try {
        const product = await findProductByBarcode(code)
        if (!product) {
          feedback.error()
          setResult({
            type: 'error',
            title: '未登録の商品です',
            message: `バーコード: ${code}\n先に商品を登録してください。`,
            unregisteredCode: code,
          })
          return
        }
        if (product.quantity <= 0) {
          feedback.error()
          setResult({ type: 'error', title: '在庫がありません', message: `${product.name}\n在庫が 0 のため減らせません。` })
          return
        }
        const usedToday = await countUsageToday(product.id)
        if (needsUsageConfirmation(usedToday)) {
          feedback.warning()
          setPending({ product, usedToday })
          return
        }
        await consumeOne(product, usedToday)
      } catch (e) {
        feedback.error()
        setResult({ type: 'error', title: 'エラー', message: errorMessage(e) })
      } finally {
        busy.current = false
      }
    },
    [consumeOne],
  )

  const confirm = async () => {
    if (!pending) return
    const { product, usedToday } = pending
    setPending(null)
    await consumeOne(product, usedToday)
  }

  const cancel = () => {
    if (pending) setResult({ type: 'cancelled', product: pending.product })
    setPending(null)
  }

  return (
    <Page title="単純利用" right={<IconButton icon="keypad" label="手入力" onClick={() => setManualOpen(true)} />} fill>
      <Scanner enabled={!pending && !manualOpen} onScan={handleScan} onManualEntry={() => setManualOpen(true)} />
      <div className="use-panel">
        <ResultCard result={result} />
      </div>
      <UsageConfirm product={pending?.product ?? null} usedToday={pending?.usedToday ?? 0} onConfirm={confirm} onCancel={cancel} />
      <ManualEntry open={manualOpen} onClose={() => setManualOpen(false)} onSubmit={handleScan} />
    </Page>
  )
}

function ResultCard({ result }: { result: Result | null }) {
  if (!result) {
    return (
      <div className="result idle">
        <Icon name="barcode" />
        <strong style={{ fontSize: 18 }}>使う商品のバーコードを読み取ってください</strong>
        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>読み取るたびに在庫が 1 個減ります。</span>
      </div>
    )
  }

  if (result.type === 'error') {
    return (
      <div className="result" style={{ background: 'var(--danger)' }} role="alert">
        <h2>
          <Icon name="closeCircle" />
          {result.title}
        </h2>
        <div className="msg">{result.message}</div>
        {result.unregisteredCode ? (
          <button
            type="button"
            className="btn"
            style={{ color: 'var(--danger)' }}
            onClick={() => navigate('/product/new', { barcode: result.unregisteredCode })}>
            この商品を登録する
          </button>
        ) : null}
      </div>
    )
  }

  const { product } = result
  const sub = productSubtitle(product)

  if (result.type === 'cancelled') {
    return (
      <div className="result" style={{ background: 'var(--text-2)' }}>
        <h2>
          <Icon name="undo" />
          取り消しました
        </h2>
        <div className="msg">
          {product.name}
          {'\n'}在庫は変わっていません（{product.quantity}）。
        </div>
      </div>
    )
  }

  return (
    <div className="result" style={{ background: 'var(--success)' }} role="status">
      <h2>
        <Icon name="checkCircle" />
        在庫を 1 減らしました
      </h2>
      {sub ? <div className="detail">{sub}</div> : null}
      <div className="product">{product.name}</div>
      <div className="numbers">
        <span>残り {product.quantity}</span>
        <span>本日 {result.usedToday} 個目</span>
      </div>
      {isLowStock(product) ? <div className="low">⚠ 在庫が少なくなっています（最低在庫数 {product.minQuantity}）</div> : null}
    </div>
  )
}
