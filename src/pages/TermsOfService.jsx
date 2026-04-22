import { Link } from 'react-router-dom'
import { BUSINESS } from '../config/business'

export default function TermsOfService() {
  return (
    <div className="min-h-screen px-5 py-10 max-w-2xl mx-auto" style={{ color: 'var(--color-text)' }}>
      <Link to="/" style={{ fontSize: 13, color: 'var(--color-gold)', textDecoration: 'none', display: 'block', marginBottom: 24 }}>← חזרה לדף הבית</Link>

      <h1 style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: 8 }}>תנאי שימוש</h1>
      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 28 }}>עדכון אחרון: ינואר 2025</p>

      <Section title="1. כללי">
        השימוש באפליקציית {BUSINESS.name} מהווה הסכמה לתנאים אלו.
      </Section>

      <Section title="2. קביעת תורים">
        <ul style={{ paddingRight: 18, lineHeight: 2 }}>
          <li>ניתן לבטל תור עד 2 שעות לפני מועד הפגישה</li>
          <li>איחור של מעל 10 דקות עלול לגרום לביטול התור</li>
          <li>תזכורות לתור יישלחו כהתראת Push באפליקציה</li>
        </ul>
      </Section>

      <Section title="3. תשלומים">
        תשלום מקדמה נדרש לחלק מהשירותים. ביטול לאחר חיוב — ההחזר על פי מדיניות העסק.
      </Section>

      <Section title="4. הגבלת אחריות">
        {BUSINESS.name} שומרת לעצמה את הזכות לשנות מועדים או לבטל תורים במקרים חריגים, בהודעה מוקדמת ככל האפשר.
      </Section>

      <Section title="5. יצירת קשר">
        <a href={`https://wa.me/${BUSINESS.whatsapp}`} style={{ color: 'var(--color-gold)' }}>{BUSINESS.phone}</a>
        {' | '}{BUSINESS.address}
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>{title}</h2>
      <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--color-muted)' }}>{children}</p>
    </div>
  )
}
