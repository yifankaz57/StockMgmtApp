// メールのリンク（Supabase の「Confirm sign up」「Magic link」の既定のメール）から開かれたときの処理。
// リンクは「…/#access_token=…&refresh_token=…」の形で戻ってくるが、この形は画面の切り替え（#/settings など）と
// 衝突するので、画面の切り替えが住所を読む前（main.tsx の最初の import）にログイン情報を取り出し、
// 住所を「#/settings」に置き換える。取り出した情報は api.ts がログインに使う。
// ログイン情報は住所の「#」以降にだけ載り、サーバーには送られない。

export type AuthRedirect = { accessToken: string; refreshToken: string } | { error: string }

let pending: AuthRedirect | null = null

function capture(): void {
  const hash = window.location.hash.replace(/^#/, '')
  if (!/(^|&)(access_token|error_description|error_code)=/.test(hash)) return
  const params = new URLSearchParams(hash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken && refreshToken) {
    pending = { accessToken, refreshToken }
  } else {
    const code = params.get('error_code') ?? ''
    const description = params.get('error_description') ?? params.get('error') ?? ''
    pending = {
      error: /expired/i.test(`${code} ${description}`)
        ? 'メールのリンクの有効期限が切れています。もう一度「確認コードを送る」からやり直してください。'
        : `メールのリンクからログインできませんでした（${description || code}）。`,
    }
  }
  // ログイン情報を住所から消し、設定画面を開く（戻るボタンで token 付きの住所に戻らないよう置き換える）
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/settings`)
}

capture()

/** メールのリンクから受け取ったログイン情報（1回だけ取り出せる） */
export function takeAuthRedirect(): AuthRedirect | null {
  const value = pending
  pending = null
  return value
}
