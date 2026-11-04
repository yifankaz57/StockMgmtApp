import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages では https://<user>.github.io/<repo>/ 配下に置くため、ビルド時に BASE_PATH で指定する
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  resolve: {
    alias: {
      // Expo 版と共有する純粋なロジック（在庫計算・CSV・JAN）
      '@shared': fileURLToPath(new URL('../src/lib', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: '在庫スキャン',
        short_name: '在庫スキャン',
        description: 'バーコードで在庫を管理するWebアプリ',
        lang: 'ja',
        theme_color: '#006B88',
        background_color: '#F2F2F7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // バーコード読み取り用の wasm（約1MB）もオフライン用にキャッシュする
        globPatterns: ['**/*.{js,css,html,png,svg,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
