import { useEffect, useState } from 'react'

import { errorMessage, parseQuantity } from '@shared/inventory'
import {
  STOCK_ALERT_LABELS,
  STOCK_ALERT_PALETTE,
  validateStockAlerts,
  type StockAlertLevelKey,
  type StockAlertSettings,
} from '@shared/stock-alert'
import { ErrorText, Section } from '@/components/ui'
import { getStockAlerts, setStockAlerts } from '@/db/database'
import { useDataVersion } from '@/db/events'

const KEYS: StockAlertLevelKey[] = ['caution', 'warning']

/** 設定タブ「在庫の色分け」: 2段階（注意・警告）の数と背景色 */
export function StockAlertSettingsSection() {
  const version = useDataVersion()
  const [saved, setSaved] = useState<StockAlertSettings | null>(null)
  // 入力中の数（空欄 = 使わない）
  const [texts, setTexts] = useState<Record<StockAlertLevelKey, string>>({ caution: '', warning: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStockAlerts()
      .then((s) => {
        setSaved(s)
        setTexts({ caution: s.caution.threshold?.toString() ?? '', warning: s.warning.threshold?.toString() ?? '' })
      })
      .catch((e) => setError(errorMessage(e)))
  }, [version])

  if (!saved) return null

  const save = (next: StockAlertSettings) => {
    const problem = validateStockAlerts(next)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setSaved(next)
    setStockAlerts(next).catch((e) => setError(errorMessage(e)))
  }

  /** 数の欄を確定する（空欄なら使わない） */
  const commitThreshold = (key: StockAlertLevelKey) => {
    const text = texts[key].trim()
    if (text === '') {
      save({ ...saved, [key]: { ...saved[key], threshold: null } })
      return
    }
    const n = parseQuantity(text)
    if (n === null || n < 1) {
      setError('数は1以上の整数で入力してください（使わない場合は空欄）。')
      return
    }
    save({ ...saved, [key]: { ...saved[key], threshold: n } })
  }

  return (
    <Section
      title="在庫の色分け"
      footer="在庫数が設定した数を下回った（未満になった）商品を、在庫一覧で指定の背景色にします。両方に当てはまるときは「警告」の色になります。数を空欄にするとその段階は使いません。">
      {KEYS.map((key) => (
        <div key={key} className="alert-level" style={{ background: saved[key].threshold !== null ? saved[key].color : undefined }}>
          <div className="row alert-row">
            <span className="row-label">{STOCK_ALERT_LABELS[key]}</span>
            <span className="row-value alert-input">
              在庫が
              <input
                aria-label={`${STOCK_ALERT_LABELS[key]}の数`}
                value={texts[key]}
                onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))}
                onBlur={() => commitThreshold(key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                inputMode="numeric"
                placeholder="なし"
              />
              個未満
            </span>
          </div>
          <div className="swatches" role="radiogroup" aria-label={`${STOCK_ALERT_LABELS[key]}の背景色`}>
            {STOCK_ALERT_PALETTE.map((p) => (
              <button
                key={p.color}
                type="button"
                role="radio"
                aria-checked={saved[key].color === p.color}
                aria-label={p.name}
                title={p.name}
                className={`swatch${saved[key].color === p.color ? ' selected' : ''}`}
                style={{ background: p.color }}
                onClick={() => save({ ...saved, [key]: { ...saved[key], color: p.color } })}
              />
            ))}
            <label className="swatch custom" title="ほかの色" style={{ background: saved[key].color }}>
              <input
                type="color"
                aria-label={`${STOCK_ALERT_LABELS[key]}の背景色をほかの色から選ぶ`}
                value={saved[key].color.toLowerCase()}
                onChange={(e) => save({ ...saved, [key]: { ...saved[key], color: e.target.value.toUpperCase() } })}
              />
              ＋
            </label>
          </div>
        </div>
      ))}
      <ErrorText message={error} />
    </Section>
  )
}
