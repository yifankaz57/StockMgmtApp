import { useEffect, useState, type InputHTMLAttributes } from 'react'

import { errorMessage, parseQuantity } from '@shared/inventory'
import { Icon } from '@/components/Icon'
import { ProductSuggestions, WebSearchButton } from '@/components/ProductSuggestions'
import { Scanner } from '@/components/Scanner'
import { ErrorText, Page, Section } from '@/components/ui'
import { createProduct, getProduct, updateProduct } from '@/db/database'
import { feedback } from '@/lib/feedback'
import { goBack } from '@/router'

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="row">
      <span className="row-label">{label}</span>
      <input autoComplete="off" {...props} />
    </label>
  )
}

/** 商品の登録（editingId=null）・編集画面 */
export function ProductEditPage({ editingId, initialBarcode }: { editingId: number | null; initialBarcode?: string }) {
  const [barcode, setBarcode] = useState(initialBarcode ?? '')
  const [manufacturer, setManufacturer] = useState('')
  const [name, setName] = useState('')
  const [shade, setShade] = useState('')
  const [volume, setVolume] = useState('')
  const [location, setLocation] = useState('')
  const [initialQuantity, setInitialQuantity] = useState('0')
  const [minQuantity, setMinQuantity] = useState('0')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (editingId === null) return
    void getProduct(editingId).then((p) => {
      if (!p) return
      setBarcode(p.barcode)
      setManufacturer(p.manufacturer)
      setName(p.name)
      setShade(p.shade)
      setVolume(p.volume)
      setLocation(p.location)
      setMinQuantity(String(p.minQuantity))
      setNote(p.note)
    })
  }, [editingId])

  const save = async () => {
    if (saving) return
    setError(null)
    const min = parseQuantity(minQuantity)
    const initial = editingId === null ? parseQuantity(initialQuantity) : 0
    if (min === null || initial === null) {
      setError('数量は0以上の整数で入力してください。')
      feedback.error()
      return
    }
    setSaving(true)
    try {
      const input = { barcode, name, manufacturer, shade, volume, location, note, minQuantity: min }
      if (editingId === null) await createProduct(input, initial)
      else await updateProduct(editingId, input)
      feedback.success()
      goBack('/products')
    } catch (e) {
      feedback.error()
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (scanning) {
    return (
      <Page
        title="バーコードを読み取り"
        left={
          <button type="button" className="link-btn" onClick={() => setScanning(false)}>
            閉じる
          </button>
        }
        fill>
        <Scanner
          enabled
          onScan={(code) => {
            feedback.success()
            setBarcode(code)
            setScanning(false)
          }}
        />
      </Page>
    )
  }

  return (
    <Page
      title={editingId === null ? '商品を登録' : '商品を編集'}
      left={
        <button type="button" className="link-btn" onClick={() => goBack('/products')}>
          キャンセル
        </button>
      }
      right={
        <button type="button" className="link-btn bold" onClick={save} disabled={saving}>
          保存
        </button>
      }>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}>
        <Section title="バーコード">
          <div className="row">
            <input
              className="left"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="JAN / EAN / QR など"
              inputMode="numeric"
              autoComplete="off"
              autoFocus={!barcode && editingId === null}
            />
            <button type="button" className="icon-btn" aria-label="バーコードを読み取る" onClick={() => setScanning(true)}>
              <Icon name="scan" />
            </button>
          </div>
        </Section>

        <ProductSuggestions
          barcode={barcode}
          autoSearch={editingId === null}
          currentName={name}
          currentManufacturer={manufacturer}
          onSelectName={setName}
          onSelectManufacturer={setManufacturer}
        />
        <WebSearchButton barcode={barcode} />

        <Section title="商品情報">
          <Field label="メーカー" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="任意" />
          <Field label="商品名" value={name} onChange={(e) => setName(e.target.value)} placeholder="必須" />
          <Field label="色番号" value={shade} onChange={(e) => setShade(e.target.value)} placeholder="例: 8-NB（任意）" autoCapitalize="characters" />
          <Field label="容量" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="例: 80g（任意）" />
          <Field label="保管場所" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例: 棚A-3" />
        </Section>

        <Section title="在庫" footer="在庫数が最低在庫数以下になると「在庫少」として表示されます。0 の場合は警告しません。">
          {editingId === null ? (
            <Field label="初期在庫数" value={initialQuantity} onChange={(e) => setInitialQuantity(e.target.value)} inputMode="numeric" onFocus={(e) => e.target.select()} />
          ) : null}
          <Field label="最低在庫数" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} inputMode="numeric" onFocus={(e) => e.target.select()} />
        </Section>

        <Section title="メモ">
          <div className="row">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ" />
          </div>
        </Section>

        <ErrorText message={error} />
        <div style={{ margin: '24px 16px 0' }}>
          <button type="submit" className="btn" disabled={saving}>
            <Icon name="check" /> 保存
          </button>
        </div>
      </form>
    </Page>
  )
}
