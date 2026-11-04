import { useCallback, useEffect, useRef, useState } from 'react'

import { errorMessage } from '@shared/inventory'
import { Icon } from '@/components/Icon'
import { ManualEntry } from '@/components/ManualEntry'
import { Scanner } from '@/components/Scanner'
import { IconButton, Page, Segmented } from '@/components/ui'
import { applyStockChange, findProductByBarcode } from '@/db/database'
import { feedback } from '@/lib/feedback'
import { navigate } from '@/router'

type ScanMode = 'lookup' | 'quickIn' | 'quickOut'

const MODE_OPTIONS: { value: ScanMode; label: string }[] = [
  { value: 'lookup', label: '照会・操作' },
  { value: 'quickIn', label: '連続入庫 +1' },
  { value: 'quickOut', label: '連続出庫 −1' },
]

const MODE_DESCRIPTIONS: Record<ScanMode, string> = {
  lookup: '読み取った商品の入庫・出庫・棚卸を行います。未登録なら登録画面を開きます。',
  quickIn: '読み取るたびに在庫を 1 増やします。',
  quickOut: '読み取るたびに在庫を 1 減らします。',
}

export function ScanPage() {
  const [mode, setMode] = useState<ScanMode>('lookup')
  const [manualOpen, setManualOpen] = useState(false)
  const [banner, setBanner] = useState<{ id: number; message: string; isError: boolean } | null>(null)
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const showBanner = useCallback((message: string, isError: boolean) => {
    clearTimeout(timer.current)
    setBanner({ id: Date.now(), message, isError })
    timer.current = setTimeout(() => setBanner(null), 2500)
  }, [])

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
        if (mode === 'lookup') {
          feedback.success()
          navigate(`/adjust/${product.id}`)
          return
        }
        try {
          const updated = await applyStockChange(product.id, mode === 'quickIn' ? 'stockIn' : 'stockOut', 1, '連続スキャン')
          feedback.success()
          showBanner(`${product.name} ${mode === 'quickIn' ? '+1' : '−1'} → 在庫 ${updated.quantity}`, false)
        } catch (e) {
          feedback.error()
          showBanner(`${product.name}: ${errorMessage(e)}`, true)
        }
      } finally {
        busy.current = false
      }
    },
    [mode, showBanner],
  )

  return (
    <Page title="スキャン" right={<IconButton icon="keypad" label="手入力" onClick={() => setManualOpen(true)} />} fill>
      <Scanner enabled={!manualOpen} onScan={handleScan} onManualEntry={() => setManualOpen(true)} />
      <div className="scan-overlay">
        {banner ? (
          <div key={banner.id} className="banner" style={{ background: banner.isError ? 'var(--danger)' : 'var(--success)' }}>
            <Icon name={banner.isError ? 'warning' : 'checkCircle'} />
            {banner.message}
          </div>
        ) : null}
        <div className="panel">
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
          <p>{MODE_DESCRIPTIONS[mode]}</p>
        </div>
      </div>
      <ManualEntry open={manualOpen} onClose={() => setManualOpen(false)} onSubmit={handleScan} />
    </Page>
  )
}
