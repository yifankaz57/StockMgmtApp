import { useEffect, useState } from 'react'

import { errorMessage, formatUsagePeriod, usagePeriod } from '@shared/inventory'
import { Page, Section } from '@/components/ui'
import { getUsageResetDay, setUsageResetDay } from '@/db/database'
import { useDataVersion } from '@/db/events'
import { SharedMasterSettings } from '@/shared-master/SettingsSection'
import { StockAlertSettingsSection } from './StockAlertSettings'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export function SettingsPage() {
  const version = useDataVersion()
  const [resetDay, setResetDay] = useState<number | null>(null)

  useEffect(() => {
    getUsageResetDay()
      .then(setResetDay)
      .catch((e) => alert(`読み込みエラー: ${errorMessage(e)}`))
  }, [version])

  const change = (day: number) => {
    setResetDay(day)
    setUsageResetDay(day).catch((e) => alert(`保存に失敗しました: ${errorMessage(e)}`))
  }

  return (
    <Page title="設定">
      <Section
        title="消費量の集計"
        footer="在庫一覧の「消費量の多い順」は、毎月この日の0時から数え直した消費量（スキャンで消費した個数と、手動で出庫した個数の合計）で並べます。29〜31日を選ぶと、その日がない月は月末に数え直します。">
        <label className="row">
          <span className="row-label">リセット日</span>
          <span className="row-value">
            毎月{' '}
            <select
              className="select"
              aria-label="リセット日"
              value={resetDay ?? ''}
              disabled={resetDay === null}
              onChange={(e) => change(Number(e.target.value))}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}日
                </option>
              ))}
            </select>
          </span>
        </label>
        {resetDay !== null ? (
          <div className="row">
            <span className="row-label">現在の集計期間</span>
            <span className="row-value">{formatUsagePeriod(usagePeriod(resetDay))}</span>
          </div>
        ) : null}
      </Section>
      <StockAlertSettingsSection />
      <SharedMasterSettings />
    </Page>
  )
}
