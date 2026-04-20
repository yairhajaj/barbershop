import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function phoneToEmail(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '')
  return `${clean}@barbershop.users`
}

function cleanPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '')
  // Normalize Israeli: +972501234567 → 0501234567
  if (digits.startsWith('972')) return '0' + digits.slice(3)
  return digits
}

async function derivePassword(firebaseUid: string, phone: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(salt)
  const msgData = encoder.encode(firebaseUid + ':' + phone)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig  = await crypto.subtle.sign('HMAC', key, msgData)
  return btoa(String.fromCharCode(...new Uint8Array(sig))).slice(0, 32)
}

async function verifyFirebaseToken(idToken: string, projectId: string) {
  // Verify via Firebase REST API
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${Deno.env.get('FIREBASE_WEB_API_KEY')}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  )
  if (!res.ok) throw new Error('Firebase token verification failed')
  const data = await res.json()
  const user = data.users?.[0]
  if (!user) throw new Error('Firebase user not found')
  return { uid: user.localId, phone: user.phoneNumber }
}

async function signInToSupabase(email: string, password: string, supabaseUrl: string, serviceKey: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) return null
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { idToken, profileData } = await req.json()
    if (!idToken) return new Response(JSON.stringify({ error: 'idToken required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const salt        = Deno.env.get('AUTH_SALT')!
    const projectId   = Deno.env.get('FIREBASE_PROJECT_ID')!

    // 1. Verify Firebase token
    const { uid: firebaseUid, phone: firebasePhone } = await verifyFirebaseToken(idToken, projectId)
    if (!firebasePhone) throw new Error('No phone number in Firebase token')

    const normalizedPhone = cleanPhone(firebasePhone)
    const email    = phoneToEmail(normalizedPhone)
    const password = await derivePassword(firebaseUid, normalizedPhone, salt)

    const admin = createClient(supabaseUrl, serviceKey)

    // 2. Check if profile exists (by phone)
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, is_guest')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (existingProfile && !existingProfile.is_guest) {
      // Existing registered user — update their Supabase password to derived one (migration)
      await admin.auth.admin.updateUserById(existingProfile.id, { password })
      const session = await signInToSupabase(email, password, supabaseUrl, serviceKey)
      if (session?.access_token) {
        return new Response(JSON.stringify(session), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // 3. Try normal sign in (already migrated user)
    const session = await signInToSupabase(email, password, supabaseUrl, serviceKey)
    if (session?.access_token) {
      return new Response(JSON.stringify(session), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 4. New user — create Supabase auth user
    const { data: { user }, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr) throw createErr

    // 5. Handle guest profile migration or create new profile
    if (existingProfile?.is_guest) {
      // Migrate guest: update id to new auth user id
      await admin.from('appointments').update({ customer_id: user!.id }).eq('customer_id', existingProfile.id)
      await admin.from('customer_debts').update({ customer_id: user!.id }).eq('customer_id', existingProfile.id)
      await admin.from('profiles').delete().eq('id', existingProfile.id)
    }

    // 6. Create profile for new user
    if (profileData || existingProfile?.is_guest) {
      await admin.from('profiles').insert({
        id:   user!.id,
        name: profileData?.name ?? existingProfile?.name ?? 'לקוח',
        phone: normalizedPhone,
        role: 'customer',
        birth_date:       profileData?.birthDate ?? null,
        gender:           profileData?.gender ?? null,
        terms_accepted:   profileData?.termsAccepted ?? false,
        terms_accepted_at: profileData?.termsAccepted ? new Date().toISOString() : null,
      })
    }

    // 7. Sign in and return session
    const newSession = await signInToSupabase(email, password, supabaseUrl, serviceKey)
    if (!newSession?.access_token) throw new Error('Failed to create session')

    return new Response(JSON.stringify(newSession), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
