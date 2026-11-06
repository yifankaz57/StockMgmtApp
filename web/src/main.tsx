// メールのリンクで開かれたときのログイン情報を、画面の切り替えより先に取り出す（必ず最初に import する）
import './shared-master/auth-redirect'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
