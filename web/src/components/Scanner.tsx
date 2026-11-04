import { useEffect, useRef, useState } from 'react'

import { getBarcodeDetector } from '@/lib/barcode'
import { Icon } from './Icon'

/**
 * カメラは映っている間ずっとバーコードを検出し続けるため、同じバーコードは
 * いったん画面から外れて（この時間以上検出されなくなって）から再度映ったときだけ新しい読み取りとする
 */
const SAME_CODE_GAP_MS = 1000
const SCAN_INTERVAL_MS = 150

type Status = 'starting' | 'running' | 'denied' | 'error'

const isSecure = typeof window !== 'undefined' && window.isSecureContext
const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export function Scanner({
  enabled,
  onScan,
  onManualEntry,
}: {
  /** false の間は読み取り結果を無視する（映っているバーコードの追跡は続ける） */
  enabled: boolean
  onScan: (code: string) => void
  onManualEntry?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<Status>('starting')
  const [detail, setDetail] = useState('')
  const [attempt, setAttempt] = useState(0)
  const enabledRef = useRef(enabled)
  const onScanRef = useRef(onScan)
  const last = useRef({ code: '', at: 0 })

  useEffect(() => {
    enabledRef.current = enabled
    onScanRef.current = onScan
  }, [enabled, onScan])

  useEffect(() => {
    if (!isSecure || !hasCamera) return
    const media: { stream?: MediaStream } = {}
    const run = { stopped: false }
    const timer: { id?: ReturnType<typeof setTimeout> } = {}

    const handle = (code: string) => {
      const now = Date.now()
      const stillInView = code === last.current.code && now - last.current.at < SAME_CODE_GAP_MS
      last.current = { code, at: now }
      if (!enabledRef.current || stillInView) return
      onScanRef.current(code)
    }

    const loop = async () => {
      if (run.stopped) return
      const video = videoRef.current
      if (video && video.readyState >= 2 && !document.hidden) {
        try {
          const codes = await getBarcodeDetector().detect(video)
          const value = codes[0]?.rawValue.trim()
          if (value && !run.stopped) handle(value)
        } catch {
          // 1フレームの解析失敗は無視して次へ
        }
      }
      timer.id = setTimeout(loop, SCAN_INTERVAL_MS)
    }

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (run.stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        media.stream = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setStatus('running')
        void loop()
      } catch (error) {
        if (run.stopped) return
        if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
          setStatus('denied')
        } else {
          setStatus('error')
          setDetail(error instanceof Error ? error.message : String(error))
        }
      }
    }

    void start()

    // ホーム画面に戻るなどでカメラが止まった場合は、戻ってきたときに再起動する
    const onVisible = () => {
      if (document.visibilityState === 'visible' && media.stream?.getVideoTracks().some((t) => t.readyState === 'ended')) {
        setAttempt((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      run.stopped = true
      clearTimeout(timer.id)
      document.removeEventListener('visibilitychange', onVisible)
      media.stream?.getTracks().forEach((t) => t.stop())
    }
  }, [attempt])

  const retry = () => {
    setStatus('starting')
    setAttempt((n) => n + 1)
  }

  let message: { title: string; text: string; retry?: boolean } | null = null
  if (!isSecure) {
    message = { title: 'カメラを使えません', text: 'カメラは https のページでのみ使えます。' }
  } else if (!hasCamera) {
    message = { title: 'カメラを使えません', text: 'このブラウザはカメラに対応していません。' }
  } else if (status === 'denied') {
    message = {
      title: 'カメラへのアクセスが許可されていません',
      text: 'iPhone の場合: 設定 → アプリ → Safari → カメラ を「許可」にするか、アドレスバーの「ぁあ」→ Webサイトの設定 → カメラ を「許可」にしてください。',
      retry: true,
    }
  } else if (status === 'error') {
    message = { title: 'カメラを起動できませんでした', text: detail, retry: true }
  }

  return (
    <div className="scanner">
      <video ref={videoRef} playsInline muted autoPlay />
      {status === 'running' ? <div className="frame" /> : null}
      {message ? (
        <div className="message">
          <Icon name="camera" size={48} />
          <strong>{message.title}</strong>
          <span style={{ fontSize: 14, lineHeight: 1.5 }}>{message.text}</span>
          {message.retry ? (
            <button type="button" className="btn" onClick={retry}>
              もう一度試す
            </button>
          ) : null}
          {onManualEntry ? (
            <button type="button" className="btn secondary" onClick={onManualEntry}>
              バーコードを手入力
            </button>
          ) : null}
        </div>
      ) : status === 'starting' ? (
        <div className="message">カメラを起動しています…</div>
      ) : null}
    </div>
  )
}
