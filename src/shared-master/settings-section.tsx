import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button, ErrorText, LabeledRow, Row, Section } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { errorMessage } from '@/lib/inventory';
import {
  clearBypassKey,
  getPostPreference,
  redeemBypassKey,
  sendLoginCode,
  setPostPreference,
  sharedMasterEnabled,
  signOut,
  useMyStatus,
  useSharedSession,
  verifyLoginCode,
} from './api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 設定タブの「共有マスタ」: メールでのログイン、投稿のオン/オフ、自分の状態 */
export function SharedMasterSettings() {
  const { ready, session } = useSharedSession();
  if (!sharedMasterEnabled) return null;
  return (
    <Section
      title="共有マスタ"
      footer="JANコードと商品名の対応を、利用者みんなで共有する仕組みです。候補を見るだけならログイン不要です。登録・通報にはメールアドレスでのログインが必要です。在庫数や履歴は共有されず、この端末にだけ保存されます。">
      {!ready ? (
        <Row last>
          <Text style={styles.muted}>読み込み中…</Text>
        </Row>
      ) : session ? (
        <LoggedIn email={session.user.email ?? ''} />
      ) : (
        <Login />
      )}
    </Section>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <>
        <Row>
          <Text style={styles.muted}>{sentTo} に確認コードを送りました。メールに書かれた数字を入力してください。</Text>
        </Row>
        <Row>
          <Text style={styles.label}>確認コード</Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            placeholder="123456"
            placeholderTextColor="#A0A0A6"
            maxLength={10}
            autoFocus
            style={styles.input}
          />
        </Row>
        <ErrorText message={error} />
        <Row last style={{ gap: 8 }}>
          <Button title="戻る" variant="secondary" onPress={() => setSentTo(null)} disabled={busy} style={{ flex: 1 }} />
          <Button title="ログイン" onPress={() => void run(() => verifyLoginCode(sentTo, code))} disabled={busy || code.length < 6} style={{ flex: 1 }} />
        </Row>
      </>
    );
  }

  return (
    <>
      <Row>
        <Text style={styles.label}>メール</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="you@example.com"
          placeholderTextColor="#A0A0A6"
          style={styles.input}
        />
      </Row>
      <ErrorText message={error} />
      <Row last>
        <Button
          title="確認コードを送る"
          style={{ flex: 1 }}
          disabled={busy || !EMAIL_RE.test(email.trim())}
          onPress={() => {
            const target = email.trim();
            void run(async () => {
              await sendLoginCode(target);
              setSentTo(target);
            });
          }}
        />
      </Row>
    </>
  );
}

function LoggedIn({ email }: { email: string }) {
  const { session } = useSharedSession();
  const { status, error, reload } = useMyStatus(session);
  const [posting, setPosting] = useState(getPostPreference);

  return (
    <>
      <LabeledRow label="ログイン中" value={email} />
      {status ? (
        <>
          <LabeledRow
            label="信頼度"
            value={
              status.banned
                ? '利用停止中'
                : status.trust === 'authority'
                  ? '公認（登録がすぐ確定）'
                  : status.trust === 'trusted'
                    ? '信頼済み（登録がすぐ公開）'
                    : '新しい利用者'
            }
          />
          <LabeledRow label="今日の登録" value={`${status.proposals_today} / ${status.proposal_limit} 件（24時間）`} />
        </>
      ) : null}
      <ErrorText message={error} />
      <Row>
        <Text style={[styles.label, { flex: 1 }]}>登録時に共有する</Text>
        <Switch
          value={posting}
          onValueChange={(on) => {
            setPosting(on);
            setPostPreference(on);
          }}
          trackColor={{ true: Colors.tint }}
        />
      </Row>
      {status && !status.banned ? <BypassKeyRow authority={status.trust === 'authority'} onChange={reload} /> : null}
      {status?.is_admin ? (
        <Pressable onPress={() => router.navigate('/admin')} style={({ pressed }) => pressed && { backgroundColor: Colors.fill }}>
          <Row>
            <Text style={[styles.label, { flex: 1 }]}>運営の管理画面</Text>
            <Text style={styles.link}>開く ›</Text>
          </Row>
        </Pressable>
      ) : null}
      <Row last>
        <Button
          title="ログアウト"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() =>
            Alert.alert('共有マスタからログアウトしますか？', '端末の在庫データはそのまま残ります。', [
              { text: 'キャンセル', style: 'cancel' },
              { text: 'ログアウト', onPress: () => signOut().catch((e) => Alert.alert('ログアウトできませんでした', errorMessage(e))) },
            ])
          }
        />
      </Row>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, color: Colors.text },
  input: { flex: 1, fontSize: 16, color: Colors.text, textAlign: 'right', paddingVertical: 4 },
  muted: { fontSize: 14, color: Colors.secondaryText, flex: 1, lineHeight: 20 },
  link: { fontSize: 16, color: Colors.tint },
  keyMessage: { fontSize: 13, color: Colors.success },
});


/** 認証キー: 運営から受け取ったキーを入れると「公認」になり、登録がすぐ共有マスタに確定する */
function BypassKeyRow({ authority, onChange }: { authority: boolean; onChange: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await fn(), error: false });
      setKey('');
      onChange();
    } catch (e) {
      setMessage({ text: errorMessage(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const messageView = message ? (
    <Text style={[styles.keyMessage, message.error && { color: Colors.danger }]}>{message.text}</Text>
  ) : null;

  if (authority) {
    return (
      <Row>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.label, { flex: 1 }]}>認証キー</Text>
            <Text style={styles.muted}>適用済み（公認）</Text>
            <Text
              style={[styles.link, { marginLeft: 12 }]}
              onPress={() =>
                Alert.alert('認証キーを外しますか？', '外すと、登録は通常どおり5人の合意が必要になります。', [
                  { text: 'キャンセル', style: 'cancel' },
                  {
                    text: '外す',
                    style: 'destructive',
                    onPress: () =>
                      void run(async () => {
                        await clearBypassKey();
                        return '認証キーを外しました。';
                      }),
                  },
                ])
              }>
              外す
            </Text>
          </View>
          {messageView}
        </View>
      </Row>
    );
  }

  return (
    <Row>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.label}>認証キー</Text>
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder="運営から受け取ったキー"
            placeholderTextColor="#A0A0A6"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />
          <Text
            style={[styles.link, { fontWeight: '700' }, (busy || key.trim().length < 8) && { opacity: 0.4 }]}
            onPress={() => {
              if (busy || key.trim().length < 8) return;
              void run(async () => `認証キー「${(await redeemBypassKey(key)) || '（名前なし）'}」を適用しました。登録がすぐ共有マスタに確定します。`);
            }}>
            適用
          </Text>
        </View>
        {messageView}
      </View>
    </Row>
  );
}
