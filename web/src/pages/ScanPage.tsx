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

type ResultBody =
  | { type: 'success'; product: Product; usedToday: number }
  | { type: 'cancelled'; product: Product }
  | { type: 'error'; title: string; message: string }

type Result = ResultBody & { id: number }

/**
 * スキャン画面:
 * - 商品マスタにないバーコード → 新規登録画面を開く
 * - 登録済みの商品 → 在庫を1個消費する（利用）。同じ商品を1日に2個以上使う場合は大きな確認画面を出す
 * 結果のメッセージは少し表示したあと、だんだん消える。
 */
export function ScanPage() {
  const [result, setResultState] = useState<Result | null>(null)
  const nextId = useRef(0)
  // 同じ内容が続いても毎回アニメーションをやり直すため、表示ごとに id を振る
  const setResult = useCallback((body: ResultBody) => setResultState({ ...body, id: ++nextId.current }), [])
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
  }, [setResult])

  const handleScan = useCallback(
    async (code: string) => {
      if (busy.current) return
      busy.current = true
      try {
        const product = await findProductByBarcode(code)
        if (!product) {
          feedback.warning()
          navigate('/product/new', { barcode: code })
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
    [consumeOne, setResult],
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
    <Page title="スキャン" right={<IconButton icon="keypad" label="手入力" onClick={() => setManualOpen(true)} />} fill>
      <Scanner enabled={!pending && !manualOpen} onScan={handleScan} onManualEntry={() => setManualOpen(true)} />
      <div className="use-panel">
        <IdleCard hidden={result !== null} />
        {result ? (
          <div key={result.id} className="result-fade" onAnimationEnd={() => setResultState((r) => (r?.id === result.id ? null : r))}>
            <ResultCard result={result} />
          </div>
        ) : null}
      </div>
      <UsageConfirm product={pending?.product ?? null} usedToday={pending?.usedToday ?? 0} onConfirm={confirm} onCancel={cancel} />
      <ManualEntry open={manualOpen} onClose={() => setManualOpen(false)} onSubmit={handleScan} />
    </Page>
  )
}

/** 待機中の案内。結果の表示中は場所だけ確保して隠し、結果が消えたらふわっと戻す */
function IdleCard({ hidden }: { hidden: boolean }) {
  return (
    <div className={`result idle ${hidden ? 'placeholder' : 'appear'}`} aria-hidden={hidden}>
      <Icon name="barcode" />
      <strong style={{ fontSize: 18 }}>バーコードを読み取ってください</strong>
      <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
        登録済みの商品は在庫を 1 個消費します。
        <br />
        未登録の商品は登録画面を開きます。
      </span>
    </div>
  )
}

function ResultCard({ result }: { result: Result }) {
  if (result.type === 'error') {
    return (
      <div className="result" style={{ background: 'var(--danger)' }} role="alert">
        <h2>
          <Icon name="closeCircle" />
          {result.title}
        </h2>
        <div className="msg">{result.message}</div>
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
        1 個 消費しました
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
