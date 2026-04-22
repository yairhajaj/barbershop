import { useState } from 'react'

const SECTIONS = [
  {
    id: 'basics',
    icon: '📋',
    title: 'חובות בסיסיות — מי חייב ומה חייב',
    items: [
      {
        title: 'כל בעל עסק חייב בניהול פנקסים',
        body: 'כל עסק שמפיק הכנסות חייב לנהל פנקסי חשבונות לפי הוראות ניהול פנקסים של רשות המיסים. גם עוסק פטור וגם עוסק מורשה.',
      },
      {
        title: 'חשבוניות וקבלות — חובה לכל עסקה',
        body: 'יש להוציא חשבונית מס או קבלה על כל תשלום שמתקבל, ללא יוצא מן הכלל. אי הנפקת מסמך היא עבירה פלילית.',
      },
      {
        title: 'עוסק מורשה מול עוסק פטור',
        body: 'עוסק מורשה — פותח חשבונית מס הכוללת מע"מ. עוסק פטור — פותח קבלה בלבד ללא מע"מ. כל מסמך חייב להתאים לסוג העוסק.',
      },
    ],
  },
  {
    id: 'docs',
    icon: '🧾',
    title: 'מסמכים — מה כל חשבונית חייבת לכלול',
    items: [
      {
        title: 'פרטי חובה בכל מסמך',
        body: [
          'שם העסק ומספר עוסק מורשה',
          'כתובת העסק',
          'תאריך הוצאת המסמך',
          'מספר סידורי עולה ורציף',
          'שם הלקוח (ועבור עסקאות מעל ₪5,000 — מספר ת.ז. / ח.פ.)',
          'תיאור השירות או המוצר',
          'סכום לפני מע"מ, שיעור מע"מ, סכום מע"מ, וסה"כ לתשלום',
        ],
        isList: true,
      },
      {
        title: 'סוגי מסמכים ומתי משתמשים בכל אחד',
        body: [
          'חשבונית מס (305) — עבור לקוח שלא שילם עדיין',
          'חשבונית מס/קבלה (320) — כשהלקוח שילם באותו רגע',
          'קבלה (400) — קבלת תשלום על חשבונית קיימת',
          'זיכוי (330) — ביטול חשבונית. לא ניתן למחוק — רק לזכות!',
        ],
        isList: true,
      },
      {
        title: 'עותק חשבונית — חייב להיות מסומן',
        body: 'כשמדפיסים עותק נוסף של חשבונית — חייב להיות רשום עליו "העתק" בצורה בולטת. המקור ניתן פעם אחת בלבד.',
      },
    ],
  },
  {
    id: 'numbering',
    icon: '🔢',
    title: 'מספור סדרתי — כלל קריטי',
    items: [
      {
        title: 'מספור עולה ורציף — ללא יוצא מן הכלל',
        body: 'כל חשבונית מקבלת מספר סידורי עוקב. אסור לדלג, אסור לחזור אחורה, ואסור להשתמש באותו מספר פעמיים. פערים ברצף הם דגל אדום בביקורת.',
      },
      {
        title: 'ביטול — לא מחיקה',
        body: 'חשבונית שנפתחה בטעות לא נמחקת — מוציאים לה חשבונית זיכוי (330). הרשומה המקורית נשארת במערכת לתמיד.',
      },
      {
        title: 'בדיקת רצף',
        body: 'מומלץ לבדוק אחת לרבעון שאין פערים ברצף המספרים. בלשונית "מס הכנסה" יש כפתור "בדיקת רצף" שעושה זאת אוטומטית.',
      },
    ],
  },
  {
    id: 'retention',
    icon: '🗄️',
    title: 'שמירת מסמכים',
    items: [
      {
        title: '7 שנים — חובת שמירה',
        body: 'כל מסמך כספי — חשבונית, קבלה, תלוש שכר, דו"ח — חייב להישמר למשך 7 שנים ממועד הגשת הדוח השנתי. זו חובה חוקית.',
      },
      {
        title: 'גיבוי רבעוני',
        body: 'מי שמנהל פנקסים ממוחשבים חייב לבצע גיבוי של הנתונים לפחות אחת לרבעון. יש לשמור את הגיבוי במקום נפרד מהמחשב הראשי.',
      },
      {
        title: 'שמירה דיגיטלית',
        body: 'מותר לשמור חשבוניות ספקים דיגיטלית (סריקה) במקום מסמך מודפס, בתנאי שניתן לאחזר ולהדפיס אותן בכל עת.',
      },
    ],
  },
  {
    id: 'openformat',
    icon: '💾',
    title: 'ייצוא שנתי לרשות המיסים',
    items: [
      {
        title: 'מהו מבנה אחיד (OPENFRMT)?',
        body: 'עסק שמנהל פנקסים ממוחשבים חייב לספק לרשות המיסים, על פי דרישה, קבצים בפורמט אחיד שמסכמים את כל הפעילות הכספית. הייצוא כולל את כל החשבוניות, הקבלות והזיכויים.',
      },
      {
        title: 'מתי מגישים?',
        body: 'לפי דרישת פקיד השומה — בדרך כלל בעת ביקורת. חשוב שהנתונים יהיו מוכנים לייצוא בכל רגע. מומלץ לייצא בסוף כל שנת מס כגיבוי.',
      },
      {
        title: 'אני יכול לייצא מהאפליקציה?',
        body: 'כן. בלשונית "מס הכנסה" → "ייצוא לרשות המיסים" — בחר טווח תאריכים ולחץ "הפק קבצים במבנה אחיד". הקבצים ייורדו לטלפון/מחשב שלך.',
      },
    ],
  },
  {
    id: 'vat',
    icon: '💰',
    title: 'מע"מ ודיווחים תקופתיים',
    items: [
      {
        title: 'דוח מע"מ תקופתי',
        body: 'עוסק מורשה מגיש דוח מע"מ כל חודש או כל חודשיים (לפי מחזור העסקאות). יש להגיש ולשלם עד ה-15 לחודש העוקב.',
      },
      {
        title: 'שיעור מע"מ נוכחי',
        body: 'שיעור המע"מ הנוכחי הוא 18%. יש לוודא שהמערכת מוגדרת לשיעור הנכון בהגדרות המס.',
      },
      {
        title: 'דוח שנתי לרשות המיסים',
        body: 'בנוסף למע"מ, יש להגיש דוח הכנסות שנתי. מועד ההגשה בדרך כלל עד 30 באפריל לשנה הקודמת (עם הארכות אפשריות דרך רואה חשבון).',
      },
    ],
  },
  {
    id: 'app',
    icon: '✅',
    title: 'מה האפליקציה עושה בשבילך',
    items: [
      {
        title: 'אוטומטי — לא צריך לדאוג',
        body: [
          'מספור חשבוניות סדרתי ורציף — אוטומטי',
          'הפקת PDF לכל חשבונית עם כל הפרטים הנדרשים',
          'סימון "העתק" על הדפסות חוזרות',
          'ביטול חשבוניות רק דרך חשבונית זיכוי (ללא מחיקה)',
          'ייצוא קבצי מבנה אחיד לרשות המיסים',
          'בדיקת רצף מספרים',
        ],
        isList: true,
      },
      {
        title: 'עליך לדאוג בעצמך',
        body: [
          'הגשת דוח מע"מ חודשי/דו-חודשי',
          'הגשת דוח הכנסות שנתי',
          'שמירת חשבוניות ספקים (הוצאות) — 7 שנים',
          'גיבוי חיצוני רבעוני — חובה חוקית לפי הוראות ניהול פנקסים',
          'עדכון שיעור מע"מ אם ישתנה',
        ],
        isList: true,
      },
    ],
  },
]

export function ComplianceGuideModal({ onClose }) {
  const [openSection, setOpenSection] = useState('basics')

  function handlePrint() {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}>
      <div
        className="card flex flex-col max-w-2xl w-full max-h-[92vh]"
        style={{ background: 'var(--color-card)', border: '2px solid var(--color-gold)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3 border-b"
          style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="font-bold text-lg" style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>
              📋 מדריך ציות לרשות המיסים
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              כל מה שבעל עסק צריך לדעת כדי לעמוד בדרישות החוק
            </p>
          </div>
          <button onClick={onClose}
            className="text-2xl leading-none px-2"
            style={{ color: 'var(--color-muted)' }}>×</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-2" dir="rtl">
          {SECTIONS.map(sec => (
            <Accordion
              key={sec.id}
              icon={sec.icon}
              title={sec.title}
              open={openSection === sec.id}
              onToggle={() => setOpenSection(openSection === sec.id ? null : sec.id)}>
              <div className="space-y-4 pt-2">
                {sec.items.map((item, i) => (
                  <div key={i}>
                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
                      {item.title}
                    </p>
                    {item.isList ? (
                      <ul className="text-xs space-y-1 pr-4" style={{ color: 'var(--color-muted)' }}>
                        {item.body.map((line, j) => (
                          <li key={j} className="flex gap-1.5">
                            <span className="mt-0.5 shrink-0" style={{ color: 'var(--color-gold)' }}>✓</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                        {item.body}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Accordion>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-3 items-center" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--color-gold)', color: '#fff' }}>
            🖨 הדפס מדריך
          </button>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
            סגור
          </button>
          <p className="text-xs mr-auto" style={{ color: 'var(--color-muted)' }}>
            עודכן: ינואר 2025 | מבוסס על הוראות רשות המיסים
          </p>
        </div>
      </div>
    </div>
  )
}

function Accordion({ icon, title, open, onToggle, children }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--color-border)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-right transition-all"
        style={{ background: open ? 'var(--color-surface)' : 'transparent', color: 'var(--color-text)' }}>
        <span>{icon} {title}</span>
        <span className="text-lg leading-none transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none', color: 'var(--color-muted)' }}>
          ›
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4" style={{ background: 'var(--color-surface)' }}>
          {children}
        </div>
      )}
    </div>
  )
}
