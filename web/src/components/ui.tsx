import type { ReactNode } from 'react'

import { isLowStock, type Product } from '@shared/inventory'
import { Icon, type IconName } from './Icon'

export function Page({
  title,
  left,
  right,
  children,
  fill,
}: {
  title: string
  left?: ReactNode
  right?: ReactNode
  children: ReactNode
  /** true ならスクロールせず高さいっぱいに使う（カメラ画面など） */
  fill?: boolean
}) {
  return (
    <>
      <header className="header">
        <div className="header-side">{left}</div>
        <h1>{title}</h1>
        <div className="header-side right">{right}</div>
      </header>
      <main className={fill ? 'content no-pad' : 'content'}>{children}</main>
    </>
  )
}

export function IconButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  )
}

export function Section({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {title ? <div className="section-title">{title}</div> : null}
      <div className="card">{children}</div>
      {footer ? <div className="section-footer">{footer}</div> : null}
    </section>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'selected' : ''}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, message, children }: { icon: IconName; title: string; message?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
      {children}
    </div>
  )
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="error-text" role="alert">
      <Icon name="closeCircle" size={18} />
      {message}
    </div>
  )
}

export function QuantityBadge({ product, large }: { product: Pick<Product, 'quantity' | 'minQuantity'>; large?: boolean }) {
  return (
    <span className={`badge${isLowStock(product) ? ' low' : ''}${large ? ' large' : ''}`} aria-label={`在庫 ${product.quantity}`}>
      {product.quantity}
    </span>
  )
}
