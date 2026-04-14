export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white" dir="rtl">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'DM Serif Display, serif', letterSpacing: 2 }}>HAJAJ</h1>
          <p className="text-sm tracking-widest text-gray-400 uppercase mb-6">Where Hair Becomes Art</p>
          <h2 className="text-xl font-semibold text-gray-800">מדיניות פרטיות</h2>
          <p className="text-sm text-gray-400 mt-1">עדכון אחרון: אפריל 2026</p>
        </div>

        <div className="space-y-8 text-gray-700 text-sm leading-relaxed">

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">1. כללי</h3>
            <p>
              אפליקציית HAJAJ ("האפליקציה") מופעלת על ידי מספרת HAJAJ ("אנחנו", "המפעיל").
              מדיניות פרטיות זו מסבירה אילו מידע אנו אוספים, כיצד אנו משתמשים בו וכיצד אנו מגינים עליו.
              שימוש באפליקציה מהווה הסכמה למדיניות זו.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">2. מידע שאנו אוספים</h3>
            <ul className="list-disc list-inside space-y-1 pr-2">
              <li><strong>פרטי זיהוי:</strong> שם, מספר טלפון וכתובת דוא"ל בעת הרשמה</li>
              <li><strong>פרטי תורים:</strong> שירות, תאריך, שעה וספר שנבחר</li>
              <li><strong>מידע טכני:</strong> סוג מכשיר, גרסת מערכת הפעלה ונתוני שימוש בסיסיים</li>
              <li><strong>Token להתראות:</strong> מזהה להתראות Push אם אישרת קבלתן</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">3. שימוש במידע</h3>
            <p>אנו משתמשים במידע אך ורק למטרות הבאות:</p>
            <ul className="list-disc list-inside space-y-1 pr-2 mt-2">
              <li>ניהול וקביעת תורים</li>
              <li>שליחת תזכורות והתראות לגבי התור שלך</li>
              <li>שיפור השירות וחוויית המשתמש</li>
              <li>תקשורת שירות חיונית (אישורים, ביטולים)</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">4. שיתוף מידע עם צדדים שלישיים</h3>
            <p>
              אנו לא מוכרים, משכירים או מעבירים את פרטיך האישיים לצדדים שלישיים לצרכי שיווק.
              ייתכן שנשתף מידע עם ספקי שירות טכנולוגי הפועלים מטעמנו (כגון Supabase לאחסון נתונים)
              בכפוף להסכמי סודיות מחמירים.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">5. אבטחת מידע</h3>
            <p>
              אנו נוקטים באמצעי אבטחה סבירים להגנה על המידע שלך, כולל הצפנת תקשורת (HTTPS/TLS)
              ואחסון מאובטח. עם זאת, אין אבטחה מוחלטת ברשת האינטרנט.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">6. שמירת מידע</h3>
            <p>
              אנו שומרים את המידע שלך כל עוד חשבונך פעיל, או כנדרש לצרכי שירות ועמידה בדרישות חוקיות.
              תוכל לבקש מחיקת חשבונך ומידעך בכל עת.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">7. הזכויות שלך</h3>
            <p>בהתאם לחוק הגנת הפרטיות הישראלי, יש לך זכות:</p>
            <ul className="list-disc list-inside space-y-1 pr-2 mt-2">
              <li>לצפות במידע שנשמר עליך</li>
              <li>לתקן מידע שגוי</li>
              <li>לבקש מחיקת המידע שלך</li>
              <li>לבטל הסכמה לקבלת התראות</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">8. עוגיות ומעקב</h3>
            <p>
              האפליקציה עשויה להשתמש בטכנולוגיות עוגיות (Cookies) ואחסון מקומי למטרות פונקציונליות בלבד,
              כגון שמירת העדפות ומצב כניסה. אין שימוש בעוגיות לצרכי פרסום.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">9. ילדים</h3>
            <p>
              האפליקציה אינה מיועדת לילדים מתחת לגיל 13. אנו לא אוספים ביודעין מידע מילדים.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">10. שינויים במדיניות</h3>
            <p>
              אנו עשויים לעדכן מדיניות זו מעת לעת. עדכונים מהותיים יפורסמו באפליקציה.
              המשך השימוש לאחר פרסום שינויים מהווה הסכמה למדיניות המעודכנת.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 text-base mb-2">11. יצירת קשר</h3>
            <p>
              לשאלות בנוגע למדיניות פרטיות זו או לבקשות הקשורות למידע שלך, ניתן לפנות אלינו:
            </p>
            <div className="mt-2 p-4 bg-gray-50 rounded-xl">
              <p className="font-semibold text-gray-900">מספרת HAJAJ</p>
              <p>דוא"ל: hajajbarbershop@gmail.com</p>
            </div>
          </section>

        </div>

        {/* Back button */}
        <div className="mt-12 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← חזרה לאפליקציה
          </a>
        </div>
      </div>
    </div>
  )
}
