// 読み取り結果の音・振動フィードバック（iPhone の Safari は振動に非対応のため音で知らせる）

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  audioContext ??= new AudioContext()
  return audioContext
}

/** iOS では音を鳴らす前にユーザー操作で AudioContext を有効にする必要がある */
export function unlockAudio(): void {
  const ctx = getAudioContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

function beep(frequencies: number[], duration = 0.09): void {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running') return
  let t = ctx.currentTime
  for (const frequency of frequencies) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(0.2, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + duration)
    t += duration + 0.03
  }
}

function vibrate(pattern: number | number[]): void {
  navigator.vibrate?.(pattern)
}

export const feedback = {
  success: () => {
    beep([1320])
    vibrate(40)
  },
  warning: () => {
    beep([880, 880])
    vibrate([60, 60, 60])
  },
  error: () => {
    beep([330, 220], 0.15)
    vibrate([120, 60, 120])
  },
}
