import { APP_NAME, CONTACT_EMAIL, PRIVACY_POLICY_URL, SUPPORT_URL } from '@shared/app-info'
import { Icon } from '@/components/Icon'
import { Section } from '@/components/ui'

/** 設定タブ「このアプリについて」: プライバシーポリシーと連絡先（App Store 審査で必要） */
export function AboutSection() {
  return (
    <Section title="このアプリについて">
      <a className="row link-row" href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
        <span className="row-label">プライバシーポリシー</span>
        <span className="row-value">
          <Icon name="external" size={16} />
        </span>
      </a>
      <a className="row link-row" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
        <span className="row-label">サポート・よくある質問</span>
        <span className="row-value">
          <Icon name="external" size={16} />
        </span>
      </a>
      <a className="row link-row" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} へのお問い合わせ`)}`}>
        <span className="row-label">お問い合わせ</span>
        <span className="row-value">{CONTACT_EMAIL}</span>
      </a>
    </Section>
  )
}
