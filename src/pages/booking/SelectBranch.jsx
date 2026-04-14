import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui/Spinner'
import { BookingProgress } from '../../components/booking/BookingProgress'

export function SelectBranch() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedService = searchParams.get('service') // e.g. ?service=<uuid>

  const [branches, setBranches] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    loadBranches()
  }, [])

  async function loadBranches() {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name')

    const list = data ?? []
    setBranches(list)
    setLoading(false)

    // Skip this screen if only one branch
    if (list.length === 1) {
      saveBranch(list[0])
    }
  }

  function saveBranch(branch) {
    const bookingState = JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')
    const updated = {
      ...bookingState,
      branchId:   branch.id,
      branchName: branch.name,
    }
    // If a service was pre-selected from homepage, carry it through
    if (preselectedService) {
      updated.serviceId = preselectedService
    }
    sessionStorage.setItem('booking_state', JSON.stringify(updated))
    // If service already selected, skip to staff; otherwise go to service selection
    navigate(preselectedService ? '/book/staff' : '/book/service')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-surface)' }}>
        <Spinner size="lg" />
      </div>
    )
  }

  // If only one branch — we're navigating away, show spinner
  if (branches.length === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-surface)' }}>
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--color-surface)' }}>
      <div className="container px-4 sm:px-6 max-w-xl mx-auto">
        <BookingProgress currentStep="branch" />

        <div className="text-center mb-10">
          <h1 className="text-3xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            בחר סניף
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>באיזה סניף תרצה לקבוע תור?</p>
        </div>

        <div className="flex flex-col gap-3">
          {branches.map((branch, i) => (
            <motion.button
              key={branch.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => saveBranch(branch)}
              className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer text-right"
              style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--color-gold)'
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(255,122,0,0.12)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: 'var(--color-gold)', color: '#fff' }}
              >
                📍
              </div>
              <div className="flex-1 text-right">
                <div className="font-bold text-base" style={{ color: 'var(--color-text)' }}>{branch.name}</div>
                {branch.address && (
                  <div className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>{branch.address}</div>
                )}
                {branch.phone && (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{branch.phone}</div>
                )}
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                style={{ background: 'var(--color-gold)', color: '#fff' }}
              >←</div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
