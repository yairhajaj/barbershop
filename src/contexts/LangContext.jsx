import { createContext, useContext, useState } from 'react'

const translations = {
  he: {
    bookNow: 'קבע תור עכשיו',
    myAppointments: 'התורים שלי',
    login: 'כניסה',
    logout: 'יציאה',
    admin: 'ניהול',
    services: 'שירותים',
    team: 'הצוות',
    contact: 'צור קשר',
    selectService: 'בחר שירות',
    selectStaff: 'בחר ספר',
    selectDateTime: 'בחר תאריך ושעה',
    confirm: 'אישור',
    back: '← חזרה',
    anyStaff: 'כל ספר פנוי',
    noSlots: 'אין שעות פנויות ביום זה',
    bookingConfirmed: 'התור נקבע בהצלחה!',
    addToCalendar: 'הוסף תזכורת ביומן',
    recurringBooking: 'תור קבוע שבועי',
    recurringDesc: 'קבע את אותו תור כל שבוע',
    confirmBooking: 'אשר הזמנה',
    service: 'שירות',
    barber: 'ספר',
    date: 'תאריך',
    time: 'שעה',
    price: 'מחיר',
    minutes: 'דקות',
    free: 'חינם',
  },
  en: {
    bookNow: 'Book Now',
    myAppointments: 'My Appointments',
    login: 'Login',
    logout: 'Logout',
    admin: 'Admin',
    services: 'Services',
    team: 'Team',
    contact: 'Contact',
    selectService: 'Select Service',
    selectStaff: 'Select Barber',
    selectDateTime: 'Select Date & Time',
    confirm: 'Confirm',
    back: '← Back',
    anyStaff: 'Any Available Barber',
    noSlots: 'No available slots on this day',
    bookingConfirmed: 'Appointment Confirmed!',
    addToCalendar: 'Add Reminder to Calendar',
    recurringBooking: 'Weekly Recurring',
    recurringDesc: 'Book the same slot every week',
    confirmBooking: 'Confirm Booking',
    service: 'Service',
    barber: 'Barber',
    date: 'Date',
    time: 'Time',
    price: 'Price',
    minutes: 'min',
    free: 'Free',
  },
}

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('app_lang') || 'he')

  function toggleLang() {
    const next = lang === 'he' ? 'en' : 'he'
    setLang(next)
    localStorage.setItem('app_lang', next)
    document.documentElement.dir = next === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = next
  }

  const t = translations[lang]

  return (
    <LangContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
