import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'
import { firebaseAuth } from '../lib/firebase'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

function formatPhoneForFirebase(phone) {
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.startsWith('0')) return '+972' + digits.slice(1)
  if (digits.startsWith('972')) return '+' + digits
  return '+' + digits
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const recaptchaRef          = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  function getRecaptchaVerifier() {
    if (recaptchaRef.current) return recaptchaRef.current
    let container = document.getElementById('firebase-recaptcha')
    if (!container) {
      container = document.createElement('div')
      container.id = 'firebase-recaptcha'
      document.body.appendChild(container)
    }
    recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, container, { size: 'invisible' })
    return recaptchaRef.current
  }

  async function sendOtp(phone) {
    const formatted = formatPhoneForFirebase(phone)
    const verifier  = getRecaptchaVerifier()
    const confirmation = await signInWithPhoneNumber(firebaseAuth, formatted, verifier)
    return confirmation
  }

  async function verifyOtpAndLogin(confirmationResult, code, profileData = null) {
    const { user: fbUser } = await confirmationResult.confirm(code)
    const idToken = await fbUser.getIdToken()

    const { data, error } = await supabase.functions.invoke('firebase-verify', {
      body: { idToken, profileData },
    })
    if (error) {
      let msg = 'שגיאת התחברות'
      try { const b = await error.context?.json(); msg = b?.error || msg } catch {}
      throw new Error(msg)
    }
    if (data?.error) throw new Error(data.error)

    const { error: sessionErr } = await supabase.auth.setSession({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
    })
    if (sessionErr) throw sessionErr
  }

  async function signOut() {
    await supabase.auth.signOut()
    await firebaseAuth.signOut()
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, sendOtp, verifyOtpAndLogin, signOut, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
