/** ファイル名用のタイムスタンプ（例: 20261104-1530） */
export function timestampForFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

/**
 * CSV を書き出す（Excel で文字化けしないよう UTF-8 BOM 付き）。
 * iPhone などファイル共有に対応したブラウザでは共有シート、それ以外はダウンロード。
 * ※ 共有シートはタップ操作の中で同期的に呼ぶ必要があるため、await を挟まずに呼び出すこと
 * @param downloadName ダウンロード時のファイル名（ブラウザによっては日本語名が無視されるため英数字を推奨）
 */
export async function shareCsv(fileName: string, csv: string, downloadName = fileName): Promise<void> {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const file = new File([blob], fileName, { type: 'text/csv' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return // ユーザーがキャンセル
      // 共有に失敗したらダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
