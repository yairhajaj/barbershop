const STEPS = [
  { n: '1', t: 'מזהה את החור',        d: 'מיד כשתור מתבטל, המערכת מחשבת את גודל החור שנוצר ביומן.' },
  { n: '2', t: 'בדיקת רשימת המתנה',  d: 'שולח הודעת פוש לראשון בתור ומחכה 2 דקות. לא ענה? עובר לבא בתור. כך עד שמישהו מאשר — או שהרשימה נגמרת. הראשון שלוחץ "אישור" מקבל את התור — גם אם כבר קיבלו אחרים הודעה.' },
  { n: '3', t: 'הקדמת תורים קיימים',  d: 'אם הרשימה לא סגרה את החור — מחפש לקוחות עם תורים מאוחרים יותר באותו יום שאפשר להקדים, ושולח להם הצעה.' },
  { n: '4', t: 'החור נסגר',           d: 'אם לקוח מאשר את ההצעה — התור מוקדם, החור סגור, ואתה מרוויח זמן עבודה ✅' },
]

export function GapCloserHelpBody() {
  return (
    <div className="space-y-4 text-sm" style={{ color: 'var(--color-text)' }}>
      <p style={{ color: 'var(--color-muted)' }}>
        כשלקוח מבטל תור, נוצר "חור" פנוי ביומן — שעה שנשארת ריקה ולא מניבה. Gap Closer מנסה לסגור את החור אוטומטית.
      </p>

      <div>
        <p className="font-bold mb-2">איך זה עובד?</p>
        <div className="space-y-2">
          {STEPS.map(s => (
            <div key={s.n} className="flex gap-3 p-3 rounded-xl" style={{ background: 'var(--color-surface)' }}>
              <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-black mt-0.5"
                style={{ background: 'var(--color-gold)', color: '#fff' }}>{s.n}</div>
              <div>
                <p className="font-bold text-[13px]">{s.t}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: 'var(--color-gold-tint)', border: '1px solid var(--color-gold)' }}>
        <p className="font-bold text-[13px] mb-2" style={{ color: 'var(--color-gold)' }}>📌 דוגמה</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text)' }}>
          שרה ביטלה את התור שלה ב-<strong>15:00</strong>. נוצר חור של שעה ביומן.
          <br /><br />
          ברשימת המתנה יש 3 אנשים שביקשו תור ב-15:00:
          <br />
          המערכת שולחת פוש ל<strong>מוחמד</strong>. הוא לא רואה בטלפון. אחרי 2 דקות שולחים גם ל<strong>רות</strong>, ואחרי עוד 2 דקות גם ל<strong>דוד</strong>. הקישור של מוחמד עדיין פעיל — אבל דוד לוחץ ראשון:
          <br /><br />
          <em className="font-medium">"🗓 התפנה תור! שירות X ב-15:00 — לחץ לאישור"</em>
          <br /><br />
          דוד לוחץ, רואה את הפרטים ומאשר — התור נקבע, החור סגור ✅<br /><br />
          מוחמד לוחץ בינתיים על ההודעה שלו — רואה "התור כבר נתפס, אתה עדיין ברשימת המתנה"
        </p>
      </div>

      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
        שליחת ההודעות לרשימת המתנה פועלת תמיד (כשיש ממתינים).{' '}
        <strong>מצב ידני:</strong> הקדמת תורים — אתה שולח בלחיצה.{' '}
        <strong>מצב אוטומטי:</strong> הכל נשלח לבד ללא אישורך.
      </p>
    </div>
  )
}
