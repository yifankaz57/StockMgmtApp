import { useEffect, useMemo, useState } from 'react'

import {
  calculateStock,
  errorMessage,
  isTransactionKind,
  KIND_LABELS,
  parseQuantity,
  SELECTABLE_KINDS,
  type Product,
  type TransactionKind,
} from '@shared/inventory'
import { Icon } from '@/components/Icon'
import { productSubtitle } from '@/lib/display'
import { EmptyState, ErrorText, Page, QuantityBadge, Section, Segmented } from '@/components/ui'
import { applyStockChange, getProduct } from '@/db/database'
import { feedback } from '@/lib/feedback'
import { goBack } from '@/router'

const KIND_OPTIONS = SELECTABLE_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))
const STEPS = [1, 5, 10, 50]

/** 入庫・出庫・棚卸（#/adjust/1?kind=stockOut） */
export function AdjustPage({ id, initialKind }: { id: number; initialKind: string | null }) {
  const [product, setProduct] = useState<Product | null | undefined>(undefined)
  const [kind, setKind] = useState<TransactionKind>(
    isTransactionKind(initialKind) && SELECTABLE_KINDS.includes(initialKind) ? initialKind : 'stockIn',
  )
  const [amountText, setAmountText] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void getProduct(id).then((p) => {
      setProduct(p)
      if (p && kind === 'adjustment') setAmountText(String(p.quantity))
    })
    // 初回のみ読み込む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const amount = parseQuantity(amountText)
  const preview = useMemo(() => {
    if (!product) return null
    if (amount === null) return { ok: false as const, message: '数量は0以上の整数で入力してください。' }
    try {
      return { ok: true as const, newQuantity: calculateStock(product.quantity, kind, amount).newQuantity }
    } catch (e) {
      return { ok: false as const, message: errorMessage(e) }
    }
  }, [product, kind, amount])

  const close = (
    <button type="button" className="link-btn" onClick={() => goBack('/scan')}>
      閉じる
    </button>
  )

  if (product === undefined) return <Page title="在庫操作" left={close}>{null}</Page>
  if (product === null) {
    return (
      <Page title="在庫操作" left={close}>
        <EmptyState icon="box" title="商品が見つかりません" />
      </Page>
    )
  }

  const changeKind = (next: TransactionKind) => {
    setKind(next)
    setError(null)
    setAmountText(next === 'adjustment' ? String(product.quantity) : '1')
  }
  const step = (delta: number) => setAmountText(String(Math.max(kind === 'adjustment' ? 0 : 1, (amount ?? 0) + delta)))

  const commit = async () => {
    if (saving || amount === null) return
    setSaving(true)
    setError(null)
    try {
      await applyStockChange(product.id, kind, amount, note)
      feedback.success()
      goBack('/scan')
    } catch (e) {
      feedback.error()
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const sub = productSubtitle(product)

  return (
    <>
      <Page title={KIND_LABELS[kind]} left={close}>
        <Section>
          <div className="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <strong style={{ fontSize: 18 }}>{product.name}</strong>
            {sub ? <span className="item-sub">{sub}</span> : null}
            <span className="item-meta">
              {product.barcode}
              {product.location ? `　📍${product.location}` : ''}
            </span>
          </div>
          <div className="row">
            <span className="row-label">現在の在庫</span>
            <span style={{ flex: 1 }} />
            <QuantityBadge product={product} large />
          </div>
        </Section>

        <div style={{ margin: '20px 16px 0' }}>
          <Segmented options={KIND_OPTIONS} value={kind} onChange={changeKind} />
        </div>

        <Section>
          <div className="row">
            <span className="row-label">{kind === 'adjustment' ? '実在庫数' : '数量'}</span>
            <span style={{ flex: 1 }} />
            <div className="stepper">
              <button type="button" aria-label="1減らす" onClick={() => step(-1)}>
                <Icon name="minusCircle" />
              </button>
              <input value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="numeric" onFocus={(e) => e.target.select()} />
              <button type="button" aria-label="1増やす" onClick={() => step(1)}>
                <Icon name="plusCircle" />
              </button>
            </div>
          </div>
          {kind !== 'adjustment' ? (
            <div className="row">
              <div className="steps">
                {STEPS.map((s) => (
                  <button key={s} type="button" onClick={() => step(s)}>
                    +{s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="row">
            <input className="left" value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（任意）" />
          </div>
        </Section>

        {preview ? (
          <div className={`preview${preview.ok ? '' : ' bad'}`}>
            {preview.ok ? `確定後の在庫: ${product.quantity} → ${preview.newQuantity}` : preview.message}
          </div>
        ) : null}
        <ErrorText message={error} />
      </Page>
      <div className="footer-bar">
        <button type="button" className="btn" onClick={commit} disabled={!preview?.ok || saving}>
          <Icon name="check" /> {KIND_LABELS[kind]}を確定
        </button>
      </div>
    </>
  )
}
