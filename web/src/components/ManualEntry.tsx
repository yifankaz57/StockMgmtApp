import { useState } from 'react'

/** バーコードを手入力するダイアログ */
export function ManualEntry({ open, onSubmit, onClose }: { open: boolean; onSubmit: (code: string) => void; onClose: () => void }) {
  const [code, setCode] = useState('')
  if (!open) return null

  const close = () => {
    setCode('')
    onClose()
  }
  const submit = () => {
    const trimmed = code.trim()
    if (!trimmed) return
    close()
    onSubmit(trimmed)
  }

  return (
    <div className="backdrop" onClick={close}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}>
        <h2>バーコードを入力</h2>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="例: 4901234567894"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          enterKeyHint="search"
        />
        <div className="buttons">
          <button type="button" className="btn secondary" onClick={close}>
            キャンセル
          </button>
          <button type="submit" className="btn" disabled={!code.trim()}>
            検索
          </button>
        </div>
      </form>
    </div>
  )
}
