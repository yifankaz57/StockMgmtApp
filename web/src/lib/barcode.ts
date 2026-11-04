import { BarcodeDetector, prepareZXingModule, type BarcodeFormat } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// バーコード読み取りエンジン（ZXing の WebAssembly 版。iPhone の Safari でも動く）
// wasm は CDN ではなくこのサイト自身から配信する（オフラインでも動くように）
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
})

/** 読み取り対象（JAN/EAN, UPC, Code128 など商品用 + QR） */
const FORMATS: BarcodeFormat[] = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'codabar',
  'qr_code',
  'data_matrix',
]

let detector: BarcodeDetector | null = null

export function getBarcodeDetector(): BarcodeDetector {
  detector ??= new BarcodeDetector({ formats: FORMATS })
  return detector
}
