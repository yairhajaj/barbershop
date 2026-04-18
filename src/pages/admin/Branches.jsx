import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useBranch } from '../../contexts/BranchContext'
import { useToast } from '../../components/ui/Toast'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const EMPTY_BRANCH = { name: '', address: '', phone: '', is_active: true, payment_mode: 'inherit' }

const DEFAULT_HOURS = DAYS.map((_, i) => ({
  day_of_week: i,
  open_time: '09:00',
  close_time: '19:00',
  is_closed: i === 6, // Saturday closed by default
}))

export function Branches() {
  const { reload: reloadBranches } = useBranch()
  const { settings, fetchBranchHours, saveBranchHours } = useBusinessSettings()
  const paymentEnabled = !!settings?.payment_enabled
  const showToast = useToast()

  const [branches, setBranches]   = useState([])
  const [staffCounts, setStaffCounts] = useState({})
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null) // null = new
  const [form, setForm]           = useState(EMPTY_BRANCH)
  const [branchHours, setBranchHours] = useState(DEFAULT_HOURS)
  const [saving, setSaving]       = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    loadBranches()
  }, [])

  async function loadBranches() {
    setLoading(true)
    const { data } = await supabase
      .from('branches')
      .select('*')
      .order('created_at')

    const list = data ?? []
    setBranches(list)

    // Count staff per branch
    if (list.length > 0) {
      const ids = list.map(b => b.id)
      const { data: staffData } = await supabase
        .from('staff')
        .select('branch_id')
        .in('branch_id', ids)
        .eq('is_active', true)

      const counts = {}
      ;(staffData ?? []).forEach(s => {
        counts[s.branch_id] = (counts[s.branch_id] ?? 0) + 1
      })
      setStaffCounts(counts)
    }

    setLoading(false)
  }

  async function openEdit(branch) {
    setEditing(branch)
    setForm({ name: branch.name, address: branch.address ?? '', phone: branch.phone ?? '', is_active: branch.is_active, payment_mode: branch.payment_mode ?? 'inherit' })
    // Load branch hours
    const hrs = await fetchBranchHours(branch.id)
    // Ensure all 7 days present
    const filled = DEFAULT_HOURS.map(def => {
      const found = hrs.find(h => h.day_of_week === def.day_of_week)
      return found ? { day_of_week: found.day_of_week, open_time: found.open_time?.slice(0,5), close_time: found.close_time?.slice(0,5), is_closed: found.is_closed } : def
    })
    setBranchHours(filled)
    setModalOpen(true)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY_BRANCH)
    setBranchHours(DEFAULT_HOURS)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast({ message: 'חובה למלא שם סניף', type: 'error' }); return }
    setSaving(true)
    try {
      let branchId
      if (editing) {
        await supabase.from('branches').update(form).eq('id', editing.id)
        branchId = editing.id
      } else {
        const { data } = await supabase.from('branches').insert(form).select().single()
        branchId = data.id
      }
      await saveBranchHours(branchId, branchHours.map(h => ({ ...h, branch_id: branchId })))
      showToast({ message: editing ? 'הסניף עודכן' : 'הסניף נוצר', type: 'success' })
      setModalOpen(false)
      await loadBranches()
      reloadBranches()
    } catch (err) {
      showToast({ message: 'שגיאה בשמירה: ' + err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(branch) {
    try {
      await supabase.from('branches').update({ is_active: false }).eq('id', branch.id)
      showToast({ message: 'הסניף הוסתר', type: 'success' })
      setDeleteConfirm(null)
      await loadBranches()
      reloadBranches()
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    }
  }

  function updateHour(dayIndex, field, value) {
    setBranchHours(prev => prev.map(h =>
      h.day_of_week === dayIndex ? { ...h, [field]: value } : h
    ))
  }

  if (loading) return <div className="flex justify-center py-32"><Spinner size="lg" /></div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)' }}>🏪 ניהול סניפים</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {branches.filter(b => b.is_active).length} סניפים פעילים
          </p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold">
          + הוסף סניף
        </button>
      </div>

      {/* Branches list */}
      {branches.length === 0 ? (
        <div className="text-center py-20 rounded-2xl" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-5xl mb-4">🏪</div>
          <p className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>אין סניפים עדיין</p>
          <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>הוסף סניף ראשון כדי להתחיל</p>
          <button onClick={openNew} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-bold">+ הוסף סניף</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {branches.map((branch, i) => (
              <motion.div
                key={branch.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4"
                style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', opacity: branch.is_active ? 1 : 0.5 }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>{branch.name}</span>
                    {!branch.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">מושבת</span>
                    )}
                  </div>
                  <div className="text-sm mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--color-muted)' }}>
                    {branch.address && <span>📍 {branch.address}</span>}
                    {branch.phone   && <span>📞 {branch.phone}</span>}
                    <span>✂ {staffCounts[branch.id] ?? 0} ספרים פעילים</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(branch)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  >
                    ✏ ערוך
                  </button>
                  {branches.filter(b => b.is_active).length > 1 && branch.is_active && (
                    <button
                      onClick={() => setDeleteConfirm(branch)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
                      style={{ border: '1px solid var(--color-danger-ring)' }}
                    >
                      הסתר
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Edit / Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `עריכת סניף — ${editing.name}` : 'סניף חדש'} size="lg">
        <div className="space-y-5 max-h-[75vh] overflow-y-auto pb-2">
          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>שם סניף *</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="לדוגמה: HAJAJ - תל מונד"
                className="w-full px-3 py-2.5 rounded-xl border text-sm"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>כתובת</label>
              <input
                value={form.address}
                onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                placeholder="דולב 46, תל מונד"
                className="w-full px-3 py-2.5 rounded-xl border text-sm"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>טלפון</label>
              <input
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="054-946-0556"
                className="w-full px-3 py-2.5 rounded-xl border text-sm"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
          </div>

          {/* Hours */}
          <div>
            <p className="text-xs font-bold mb-3 tracking-wide" style={{ color: 'var(--color-muted)' }}>שעות פעילות</p>
            <div className="space-y-2">
              {branchHours.map(h => (
                <div key={h.day_of_week} className="flex items-center gap-3">
                  <div className="w-14 text-sm font-medium text-right" style={{ color: 'var(--color-text)' }}>
                    {DAYS[h.day_of_week]}
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!h.is_closed}
                      onChange={e => updateHour(h.day_of_week, 'is_closed', !e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>פתוח</span>
                  </label>
                  {!h.is_closed && (
                    <>
                      <input
                        type="time"
                        value={h.open_time}
                        onChange={e => updateHour(h.day_of_week, 'open_time', e.target.value)}
                        className="px-2 py-1 rounded-lg border text-sm flex-1"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      />
                      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>עד</span>
                      <input
                        type="time"
                        value={h.close_time}
                        onChange={e => updateHour(h.day_of_week, 'close_time', e.target.value)}
                        className="px-2 py-1 rounded-lg border text-sm flex-1"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      />
                    </>
                  )}
                  {h.is_closed && (
                    <span className="text-xs text-gray-400">סגור</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Payment mode — only when payment is enabled */}
          {paymentEnabled && (
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>💳 מצב תשלום לסניף זה</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'inherit',  label: 'לפי הגדרות ראשיות' },
                  { value: 'required', label: '🔒 חובה לשלם' },
                  { value: 'optional', label: '🤝 אופציונלי' },
                  { value: 'disabled', label: '🚫 ללא תשלום' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, payment_mode: opt.value }))}
                    className="py-2 px-3 text-xs rounded-xl border font-medium transition-all text-right"
                    style={{
                      borderColor: (form.payment_mode ?? 'inherit') === opt.value ? 'var(--color-gold)' : 'var(--color-border)',
                      background:  (form.payment_mode ?? 'inherit') === opt.value ? 'var(--color-gold-tint)' : 'var(--color-surface)',
                      color:       (form.payment_mode ?? 'inherit') === opt.value ? 'var(--color-gold)' : 'var(--color-muted)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
              className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
              style={{ background: form.is_active ? 'var(--color-gold)' : '#d1d5db' }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
                style={{ right: form.is_active ? '2px' : 'calc(100% - 22px)' }}
              />
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>סניף פעיל</span>
          </label>

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2"
          >
            {saving ? <><Spinner size="sm" /> שומר...</> : (editing ? 'שמור שינויים' : 'צור סניף')}
          </button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="הסתרת סניף" size="sm">
        <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>
          הסניף <strong>{deleteConfirm?.name}</strong> יוסתר מהמערכת. הספרים והתורים שלו ישמרו.
        </p>
        <div className="flex gap-3">
          <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">
            כן, הסתר
          </button>
          <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
            ביטול
          </button>
        </div>
      </Modal>
    </div>
  )
}
