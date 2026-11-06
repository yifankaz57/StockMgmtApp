import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { NG_WORDS } from '@shared/ng-words'

// supabase/migrations の SQL を、Supabase と同じ役割（anon / authenticated）を用意した PostgreSQL（PGlite）で検証する

const migrations = import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

/** 先頭12桁からチェックディジット付きの JAN-13 を作る */
function jan(first12: string): string {
  const total = [...first12].reduce((sum, d, i) => sum + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return first12 + String((10 - (total % 10)) % 10)
}

const JAN_A = jan('490123456789')
const JAN_B = jan('457116705870')

const users = Array.from({ length: 12 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`)
const ADMIN = users[8]
const KEY_USER = users[9]
const OTHER = users[10]

let db: PGlite

/** uid の利用者として（null ならログインなしの anon として）SQL を実行する */
async function as<T>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
  try {
    return (await db.query<T>(sql, params)).rows
  } finally {
    await db.exec('reset role')
  }
}

async function errorOf(uid: string | null, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await as(uid, sql, params)
    return 'no error'
  } catch (e) {
    return (e as Error).message
  }
}

const submit = (uid: string, code: string, name: string, maker = '') =>
  as<{ result: string; proposals_today: number }>(uid, 'select * from public.submit_proposal($1, $2, $3)', [code, name, maker])
const candidates = (uid: string | null, code: string) =>
  as<{ name_key: string; name: string; manufacturer: string; supporters: number; confirmed: boolean; mine: boolean }>(
    uid,
    'select * from public.get_candidates($1)',
    [code],
  )

beforeAll(async () => {
  db = new PGlite()
  // Supabase が用意しているもの（auth スキーマ・役割）の最小限の代わり
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
  `)
  for (const [i, id] of users.entries()) await db.query('insert into auth.users values ($1, $2)', [id, `user${i + 1}@example.com`])
  for (const file of Object.keys(migrations).sort()) await db.exec(migrations[file])
  // Supabase の既定（public の表は anon / authenticated に全権限が付く）を再現し、RLS だけで守られていることを確かめる
  await db.exec('grant all on all tables in schema public to anon, authenticated')
  await db.exec(`insert into public.profiles (user_id, is_admin) values ('${ADMIN}', true)`)
}, 60_000)

describe('共有マスタ（Supabase）のデータベース', () => {
  it('ログインなしでは候補の閲覧だけでき、投稿・通報・表の直接操作はできない', async () => {
    expect(await candidates(null, JAN_A)).toEqual([])
    expect(await errorOf(null, 'select * from public.submit_proposal($1, $2)', [JAN_A, 'x'])).toMatch(/permission denied/)
    expect(await errorOf(null, 'select public.report_candidate($1, $2)', [JAN_A, 'x'])).toMatch(/permission denied/)
    expect(await as(null, 'select * from public.proposals')).toEqual([])
    expect(await errorOf(null, 'select private.fold($1)', ['x'])).toMatch(/permission denied/)
  })

  it('入力チェック: JAN の形式・店内コード・URL・NG ワード・文字数', async () => {
    const u = users[0]
    expect(await errorOf(u, 'select * from public.submit_proposal($1, $2)', ['4901234567890', 'x'])).toMatch(/JAN コード/)
    expect(await errorOf(u, 'select * from public.submit_proposal($1, $2)', [jan('200000000001'), 'x'])).toMatch(/店内コード/)
    expect(await errorOf(u, 'select * from public.submit_proposal($1, $2)', [JAN_A, '激安 www.spam.example.com'])).toMatch(/URL/)
    expect(await errorOf(u, 'select * from public.submit_proposal($1, $2)', [JAN_A, 'ｈｔｔｐｓ：／／ａ.ｊｐ'])).toMatch(/URL/)
    expect(await errorOf(u, 'select * from public.submit_proposal($1, $2, $3)', [JAN_A, 'お茶', '高 収 入'])).toMatch(/使えない語/)
    expect(await errorOf(u, 'select * from public.submit_proposal($1, $2)', [JAN_A, 'あ'.repeat(101)])).toMatch(/100文字/)
    expect(await errorOf(u, 'select * from public.submit_proposal($1, $2)', [JAN_A, ' '])).toMatch(/商品名を入力/)
    // 容量・色番号の「.」は URL とみなさない
    expect((await submit(u, JAN_B, 'カラー剤 8.0 80g Vol.2'))[0].result).toBe('added')
  })

  it('新しい利用者1人だけの提案は保留（非公開）。別の人が表記ゆれ違いで同じ名前を出すと公開', async () => {
    expect((await submit(users[0], JAN_A, 'お茶 500ml', 'A飲料'))[0].result).toBe('added')
    expect(await candidates(null, JAN_A)).toEqual([])
    const queue = await as<{ kind: string; jan: string }>(ADMIN, 'select * from public.admin_queue()')
    expect(queue).toContainEqual(expect.objectContaining({ kind: 'pending', jan: JAN_A }))

    expect((await submit(users[1], JAN_A, 'ｵ茶　500ML'.replace('ｵ', 'お')))[0].result).toBe('added')
    const list = await candidates(null, JAN_A)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ supporters: 2, confirmed: false, manufacturer: 'A飲料' })
    expect((await candidates(users[0], JAN_A))[0].mine).toBe(true)
  })

  it('同じ人が同じ名前を何度出しても1票。他人の提案は変更・削除できない', async () => {
    expect((await submit(users[0], JAN_A, 'お茶500ml'))[0].result).toBe('already')
    await as(users[2], `update public.proposals set name = '改ざん'`)
    await as(users[2], 'delete from public.proposals')
    const rows = await db.query<{ n: number }>(`select count(*)::int n from public.proposals where name = '改ざん'`)
    expect(rows.rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>('select count(*)::int n from public.proposals')).rows[0].n).toBe(3)
  })

  it('別々の利用者5人が支持すると「確定」。確定が上に並ぶ', async () => {
    await submit(users[2], JAN_A, '緑茶 500ml')
    await submit(users[3], JAN_A, '緑茶 500ml')
    for (const u of users.slice(2, 5)) await submit(u, JAN_A, 'お茶 500ml')
    const list = await candidates(null, JAN_A)
    expect(list.map((c) => [c.name, c.supporters, c.confirmed])).toEqual([
      ['お茶 500ml', 5, true],
      ['緑茶 500ml', 2, false],
    ])
  })

  it('信頼済みの利用者の提案はすぐ公開され、重みが大きい', async () => {
    const code = jan('490000000001')
    await submit(users[5], code, '新人の名前')
    await submit(users[6], code, '新人の名前')
    expect(await errorOf(users[0], 'select public.admin_set_trust($1, $2)', [users[7], 'trusted'])).toMatch(/運営者の権限/)
    await as(ADMIN, 'select public.admin_set_trust($1, $2)', [users[7], 'trusted'])
    await submit(users[7], code, '信頼済みの名前')
    // 支持人数は 2 対 1 だが、重み（新人1・信頼済み2）は同点 → 支持人数の多い順
    expect((await candidates(null, code)).map((c) => c.name)).toEqual(['新人の名前', '信頼済みの名前'])
    const status = await as<{ trust: string }>(users[7], 'select * from public.my_status()')
    expect(status[0].trust).toBe('trusted')
  })

  it('1人あたり1日（24時間）30件まで', async () => {
    const u = users[4]
    const before = (await as<{ proposals_today: number }>(u, 'select * from public.my_status()'))[0].proposals_today
    for (let i = before; i < 30; i++) await submit(u, jan(`4912345${String(i).padStart(5, '0')}`), `商品${i}`)
    expect(await errorOf(u, 'select * from public.submit_proposal($1, $2)', [jan('491234599999'), '31件目'])).toMatch(/30件まで/)
  })

  it('通報 → 確認待ち一覧 → 非表示 → 元に戻す。操作は記録に残る', async () => {
    const [target] = await candidates(null, JAN_A)
    expect(await as(users[5], 'select public.report_candidate($1, $2, $3) r', [JAN_A, target.name_key, '名前が違う'])).toEqual([
      { r: 'reported' },
    ])
    expect(await as(users[5], 'select public.report_candidate($1, $2) r', [JAN_A, target.name_key])).toEqual([{ r: 'already' }])
    const queue = await as<{ kind: string; name_key: string; reasons: string[] }>(ADMIN, 'select * from public.admin_queue()')
    expect(queue[0]).toMatchObject({ kind: 'report', name_key: target.name_key, reasons: ['名前が違う'] })
    expect(await errorOf(users[5], 'select * from public.admin_queue()')).toMatch(/運営者の権限/)

    await as(ADMIN, 'select public.admin_set_candidate($1, $2, $3)', [JAN_A, target.name_key, 'hide'])
    expect((await candidates(null, JAN_A)).map((c) => c.name)).toEqual(['緑茶 500ml'])
    expect((await as<{ kind: string }>(ADMIN, 'select * from public.admin_queue()')).some((q) => q.kind === 'report')).toBe(false)

    await as(ADMIN, 'select public.admin_set_candidate($1, $2, $3)', [JAN_A, target.name_key, 'restore'])
    expect((await candidates(null, JAN_A))[0].name).toBe('お茶 500ml')
    const log = await as<{ action: string }>(ADMIN, 'select * from public.admin_log()')
    expect(log.map((l) => l.action).slice(0, 2)).toEqual(['candidate_restore', 'candidate_hide'])
    const history = await as<{ user_email: string }>(ADMIN, 'select * from public.admin_jan_history($1)', [JAN_A])
    expect(history.length).toBeGreaterThanOrEqual(7)
    expect(history[0].user_email).toMatch(/@example\.com$/)
  })

  it('締め出すと、その人の支持は集計から外れ、投稿もできない。解除すると戻る', async () => {
    const before = (await candidates(null, JAN_A))[0]
    await as(ADMIN, 'select public.admin_set_banned($1, true, $2)', [users[0], '荒らし'])
    expect((await candidates(null, JAN_A))[0].supporters).toBe(before.supporters - 1)
    expect(await errorOf(users[0], 'select * from public.submit_proposal($1, $2)', [JAN_B, 'x'])).toMatch(/停止/)
    expect(await as<{ user_email: string }>(ADMIN, 'select * from public.admin_banned_users()')).toEqual([
      expect.objectContaining({ user_email: 'user1@example.com', banned_reason: '荒らし' }),
    ])
    await as(ADMIN, 'select public.admin_set_banned($1, false)', [users[0]])
    expect((await candidates(null, JAN_A))[0].supporters).toBe(before.supporters)
  })

  it('自分の提案のうち3件が確定した利用者は自動で信頼済みになる', async () => {
    const u = users[5]
    const codes = ['493000000001', '493000000002', '493000000003'].map(jan)
    for (const code of codes) for (const v of [users[1], users[2], users[3], users[5], users[6]]) await submit(v, code, `確定する商品 ${code}`)
    expect((await as<{ trust: string }>(u, 'select * from public.my_status()'))[0].trust).toBe('trusted')
    const solo = jan('493000000009')
    await submit(u, solo, '1人だけの提案')
    expect((await candidates(null, solo)).map((c) => c.name)).toEqual(['1人だけの提案'])
  })

  it('NG ワードはアプリ側（shared/ng-words.ts）と同じ', async () => {
    const rows = await db.query<{ word: string }>('select word from public.ng_words order by word')
    expect(rows.rows.map((r) => r.word)).toEqual([...NG_WORDS].sort())
  })

  it('認証キー: 運営が発行し、適用した人の登録はすぐ公開・確定。無効化で外れる', async () => {
    expect(await errorOf(KEY_USER, 'select public.admin_create_bypass_key($1)', ['x'])).toMatch(/運営者の権限/)
    const [{ key }] = await as<{ key: string }>(ADMIN, 'select public.admin_create_bypass_key($1) as key', ['テスト用'])
    expect(key).toMatch(/^SMK(-[0-9A-F]{4}){6}$/)
    // データベースには平文を保存しない
    const stored = await db.query<{ key_hash: string }>('select key_hash from public.bypass_keys')
    expect(stored.rows.some((r) => r.key_hash.includes(key))).toBe(false)

    const code = jan('495000000001')
    // 公認前: 新しい利用者1人だけの登録は保留
    await submit(OTHER, code, '公認前の名前')
    expect(await candidates(null, code)).toEqual([])

    // 間違ったキーは null（失敗として記録）
    expect(await as(KEY_USER, 'select public.redeem_bypass_key($1) as r', ['SMK-0000-0000-0000-0000-0000-0000'])).toEqual([{ r: null }])
    // 正しいキー（小文字・空白入りでも可）で公認に
    expect(await as(KEY_USER, 'select public.redeem_bypass_key($1) as r', [` ${key.toLowerCase()} `])).toEqual([{ r: 'テスト用' }])
    expect((await as<{ trust: string }>(KEY_USER, 'select * from public.my_status()'))[0].trust).toBe('authority')

    await submit(KEY_USER, code, '公認の名前')
    const list = await candidates(null, code)
    expect(list.map((c) => [c.name, c.supporters, c.confirmed])).toEqual([['公認の名前', 1, true]])

    // 無効化すると効果が外れる（1人だけの登録は保留に戻る）
    const [{ id }] = await as<{ id: number }>(ADMIN, 'select id from public.admin_list_bypass_keys()')
    await as(ADMIN, 'select public.admin_revoke_bypass_key($1)', [id])
    expect(await candidates(null, code)).toEqual([])
    expect((await as<{ trust: string }>(KEY_USER, 'select * from public.my_status()'))[0].trust).toBe('new')
    expect(await as(KEY_USER, 'select public.redeem_bypass_key($1) as r', [key])).toEqual([{ r: null }])
    const keys = await as<{ active: boolean; users: number }>(ADMIN, 'select * from public.admin_list_bypass_keys()')
    expect(keys[0]).toMatchObject({ active: false, users: 1 })
  })

  it('認証キー: 間違いが24時間で10回を超えると入力できない', async () => {
    const u = users[11]
    for (let i = 0; i < 10; i++) await as(u, 'select public.redeem_bypass_key($1)', [`WRONG-${i}`])
    expect(await errorOf(u, 'select public.redeem_bypass_key($1)', ['WRONG-x'])).toMatch(/24時間は入力できません/)
    expect(await errorOf(null, 'select public.redeem_bypass_key($1)', ['x'])).toMatch(/permission denied/)
  })
})
