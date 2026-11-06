import { useEffect } from 'react'

import { Icon, type IconName } from '@/components/Icon'
import { unlockAudio } from '@/lib/feedback'
import { AdjustPage } from '@/pages/AdjustPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { ProductEditPage } from '@/pages/ProductEditPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ScanPage } from '@/pages/ScanPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { navigate, useRoute, type Route } from '@/router'
import { AdminPage } from '@/shared-master/AdminPage'
import { useMyStatus, useSharedSession } from '@/shared-master/api'

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: '/scan', label: 'スキャン', icon: 'barcode' },
  { path: '/products', label: '在庫一覧', icon: 'box' },
  { path: '/history', label: '履歴', icon: 'clock' },
  { path: '/settings', label: '設定', icon: 'settings' },
]

function Screen({ route }: { route: Route }) {
  const [first, second, third] = route.segments
  const id = Number(second)
  switch (first) {
    case 'products':
      return <ProductsPage />
    case 'history':
      return <HistoryPage />
    case 'settings':
      return <SettingsPage />
    case 'admin':
      return <AdminPage />
    case 'product':
      if (second === 'new') return <ProductEditPage key={`new-${route.query.get('barcode') ?? ''}`} editingId={null} initialBarcode={route.query.get('barcode') ?? undefined} />
      if (Number.isInteger(id) && third === 'edit') return <ProductEditPage key={`edit-${id}`} editingId={id} />
      if (Number.isInteger(id)) return <ProductDetailPage id={id} />
      break
    case 'adjust':
      if (Number.isInteger(id)) return <AdjustPage key={id} id={id} initialKind={route.query.get('kind')} />
      break
    case 'scan':
      return <ScanPage />
  }
  return <ScanPage />
}

export default function App() {
  const route = useRoute()
  // 運営者としてログインしたときだけ「管理」タブを出す
  const { session } = useSharedSession()
  const { status } = useMyStatus(session)
  const tabs = status?.is_admin ? [...TABS, { path: '/admin', label: '管理', icon: 'shield' as IconName }] : TABS
  const tab = tabs.find((t) => route.path === t.path)

  // 旧「利用」タブ（スキャンに統合）の URL はスキャンへ
  useEffect(() => {
    if (route.path === '/use') navigate('/scan', undefined, { replace: true })
  }, [route.path])

  // iOS では最初のタップで音声を有効化しておく（読み取り音のため）
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  return (
    <div className="app">
      <Screen route={route} />
      {tab ? (
        <nav className="tabbar">
          {tabs.map((t) => (
            <button
              key={t.path}
              type="button"
              className={`tab${t.path === tab.path ? ' active' : ''}`}
              aria-current={t.path === tab.path ? 'page' : undefined}
              onClick={() => navigate(t.path, undefined, { replace: true, root: true })}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
