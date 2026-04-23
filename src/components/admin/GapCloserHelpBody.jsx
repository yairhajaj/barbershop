const STEPS = [
  { n: '1', t: 'מזהה את החור',  d: 'מיד כשתור מתבטל, המערכת מחשבת את גודל החור שנוצר.' },
  { n: '2', t: 'מחפש מועמדים', d: 'מחפש לקוחות עם תורים מאוחרים יותר באותו יום ואותו ספר, שאפשר להקדים אותם לחור.' },
  { n: '3', t: 'שולח הצעה',    d: 'שולח ללקוח הודעה: "יש אפשרות להקדים את התור שלך". הלקוח מאשר או דוחה.' },
  { n: '4', t: 'סוגר את החור', d: 'אם הלקוח מאשר — התור מוקדם, החור סגור, ואתה מרוויח זמן עבודה.' },
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
          דוד יש לו תור ב-<strong>17:00</strong> — אבל אפשר להקדים אותו ל-15:00 ולחסוך לו שעתיים המתנה.
          <br /><br />
          Gap Closer שולח לדוד הודעת Push:<br />
          <em className="font-medium">"📅 יש אפשרות להקדים את התור שלך ל-15:00 במקום 17:00"</em>
          <br /><br />
          דוד לחץ על ההודעה, ראה את הפרטים ואישר — התור הוקדם, החור סגור ✅
        </p>
      </div>

      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
        <strong>מצב ידני:</strong> אתה רואה את ההצעה ושולח בלחיצה.{' '}
        <strong>מצב אוטומטי:</strong> נשלח לבד ללא אישורך.
      </p>
    </div>
  )
}
