import { useEffect } from 'react'

import { Icon, type IconName } from '@/components/Icon'
import { unlockAudio } from '@/lib/feedback'
import { AdjustPage } from '@/pages/AdjustPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { ProductEditPage } from '@/pages/ProductEditPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ScanPage } from '@/pages/ScanPage'
import { navigate, useRoute, type Route } from '@/router'

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: '/scan', label: 'スキャン', icon: 'barcode' },
  { path: '/products', label: '在庫一覧', icon: 'box' },
  { path: '/history', label: '履歴', icon: 'clock' },
]

function Screen({ route }: { route: Route }) {
  const [first, second, third] = route.segments
  const id = Number(second)
  switch (first) {
    case 'products':
      return <ProductsPage />
    case 'history':
      return <HistoryPage />
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
  const tab = TABS.find((t) => route.path === t.path)

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
          {TABS.map((t) => (
            <button
              key={t.path}
              type="button"
              className={`tab${t.path === tab.path ? ' active' : ''}`}
              aria-current={t.path === tab.path ? 'page' : undefined}
              onClick={() => navigate(t.path, undefined, { replace: true })}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
