import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStaff } from '../../hooks/useStaff'
import { useServices } from '../../hooks/useServices'
import { useStaffPortfolio } from '../../hooks/useStaffPortfolio'
import { useBranch } from '../../contexts/BranchContext'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { ImageUpload } from '../../components/ui/ImageUpload'
import { dayName } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const DEFAULT_STAFF_HOURS = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i,
  start_time: '09:00',
  end_time: '19:00',
  is_working: i !== 6,
}))

const DEFAULT_BRANCH_HOURS = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i,
  open_time: '09:00',
  close_time: '19:00',
  is_closed: i === 6,
}))

const EMPTY_BRANCH = { name: '', address: '', phone: '', is_active: true }

// ─── Main Component ────────────────────────────────────────────────────────────
export function Staff() {
  const { branches, currentBranch, reload: reloadBranches } = useBranch()
  const { fetchBranchHours, saveBranchHours } = useBusinessSettings()
  const multiBranch = branches.length > 1

  const { staff, loading, upsertStaffMember, deleteStaffMember, refetch } = useStaff({
    branchId: multiBranch ? null : (currentBranch?.id ?? null),
  })
  const { services } = useServices()
  const toast = useToast()

  // Staff state
  const [editMember, setEditMember]         = useState(null)
  const [saving, setSaving]                 = useState(false)
  const [portfolioMember, setPortfolioMember] = useState(null)
  const [movingStaff, setMovingStaff]       = useState(null)

  // Branch state
  const [branchModal, setBranchModal]       = useState(false)
  const [editingBranch, setEditingBranch]   = useState(null)
  const [branchForm, setBranchForm]         = useState(EMPTY_BRANCH)
  const [branchHours, setBranchHours]       = useState(DEFAULT_BRANCH_HOURS)
  const [savingBranch, setSavingBranch]     = useState(false)
  const [deleteConfirm, setDeleteConfirm]   = useState(null)

  // ── Branch management ────────────────────────────────────────────────────────
  function openNewBranch() {
    setEditingBranch(null)
    setBranchForm(EMPTY_BRANCH)
    setBranchHours(DEFAULT_BRANCH_HOURS)
    setBranchModal(true)
  }

  async function openEditBranch(branch) {
    setEditingBranch(branch)
    setBranchForm({ name: branch.name, address: branch.address ?? '', phone: branch.phone ?? '', is_active: branch.is_active })
    const hrs = await fetchBranchHours(branch.id)
    const filled = DEFAULT_BRANCH_HOURS.map(def => {
      const found = hrs.find(h => h.day_of_week === def.day_of_week)
      return found
        ? { day_of_week: found.day_of_week, open_time: found.open_time?.slice(0, 5), close_time: found.close_time?.slice(0, 5), is_closed: found.is_closed }
        : def
    })
    setBranchHours(filled)
    setBranchModal(true)
  }

  async function handleSaveBranch() {
    if (!branchForm.name.trim()) { toast({ message: 'חובה למלא שם סניף', type: 'error' }); return }
    setSavingBranch(true)
    try {
      let branchId
      if (editingBranch) {
        await supabase.from('branches').update(branchForm).eq('id', editingBranch.id)
        branchId = editingBranch.id
      } else {
        const { data } = await supabase.from('branches').insert(branchForm).select().single()
        branchId = data.id
      }
      await saveBranchHours(branchId, branchHours.map(h => ({ ...h, branch_id: branchId })))
      toast({ message: editingBranch ? 'הסניף עודכן' : 'הסניף נוצר', type: 'success' })
      setBranchModal(false)
      reloadBranches()
    } catch (err) {
      toast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setSavingBranch(false)
    }
  }

  async function handleDeleteBranch(branch) {
    await supabase.from('branches').update({ is_active: false }).eq('id', branch.id)
    toast({ message: 'הסניף הוסר', type: 'success' })
    setDeleteConfirm(null)
    reloadBranches()
  }

  function updateBranchHour(dayIndex, field, value) {
    setBranchHours(prev => prev.map(h =>
      h.day_of_week === dayIndex ? { ...h, [field]: value } : h
    ))
  }

  // ── Staff management ─────────────────────────────────────────────────────────
  function openNew(branchId = null) {
    const defaultBranches = branchId
      ? [branchId]
      : (currentBranch?.id ? [currentBranch.id] : [])
    setEditMember({
      name: '', bio: '', photo_url: '', video_url: '', is_active: true,
      staff_branches: defaultBranches,
      staff_hours: DEFAULT_STAFF_HOURS,
      staff_services: services.map(s => s.id),
      commission_type: 'inherit',
      commission_rate: null,
      monthly_salary: null,
    })
  }

  function openEdit(member) {
    setEditMember({
      ...member,
      staff_hours: member.staff_hours?.length ? member.staff_hours : DEFAULT_STAFF_HOURS,
      staff_services: member.staff_services?.map(ss => ss.service_id) ?? [],
      // staff_branches from DB: [{branch_id: uuid}, ...] → flatten to [uuid, ...]
      staff_branches: member.staff_branches?.map(sb => sb.branch_id) ?? [],
      commission_type: member.commission_type ?? 'inherit',
      commission_rate: member.commission_rate ?? null,
      monthly_salary: member.monthly_salary ?? null,
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await upsertStaffMember(editMember)
      toast({ message: 'נשמר בהצלחה', type: 'success' })
      setEditMember(null)
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('למחוק ספר זה?')) return
    try {
      await deleteStaffMember(id)
      toast({ message: 'ספר נמחק', type: 'success' })
    } catch (err) {
      const msg = err?.message ?? ''
      if (msg.includes('foreign key') || msg.includes('violates')) {
        toast({ message: 'לספר זה יש תורים — סמן אותו כ"לא פעיל" במקום למחוק', type: 'error' })
      } else {
        toast({ message: msg || 'שגיאה במחיקה', type: 'error' })
      }
    }
  }

  // Toggle a branch assignment for a staff member (add/remove from staff_branches)
  async function toggleStaffBranch(staffId, branchId) {
    const currentBranchIds = movingStaff?.staff_branches?.map(sb =>
      typeof sb === 'string' ? sb : sb.branch_id
    ) ?? []

    let newIds
    if (currentBranchIds.includes(branchId)) {
      newIds = currentBranchIds.filter(id => id !== branchId)
    } else {
      newIds = [...currentBranchIds, branchId]
    }

    // Update DB
    await supabase.from('staff_branches').delete().eq('staff_id', staffId)
    if (newIds.length > 0) {
      await supabase.from('staff_branches').insert(newIds.map(bid => ({ staff_id: staffId, branch_id: bid })))
    }

    // Update local state so toggles are instant without closing modal
    setMovingStaff(prev => ({ ...prev, staff_branches: newIds.map(bid => ({ branch_id: bid })) }))
    await refetch()
    toast({ message: 'עודכן', type: 'success' })
  }

  function toggleHour(day, field, value) {
    setEditMember(m => ({
      ...m,
      staff_hours: m.staff_hours.map(h =>
        h.day_of_week === day ? { ...h, [field]: value } : h
      ),
    }))
  }

  function toggleService(sid) {
    setEditMember(m => ({
      ...m,
      staff_services: m.staff_services.includes(sid)
        ? m.staff_services.filter(x => x !== sid)
        : [...m.staff_services, sid],
    }))
  }

  // ── Grouping — staff can appear under multiple branches ──────────────────────
  const groupedByBranch = multiBranch
    ? branches.map(branch => ({
        branch,
        members: staff.filter(s =>
          s.staff_branches?.some(sb => sb.branch_id === branch.id)
        ),
      }))
    : null

  const unassigned = multiBranch
    ? staff.filter(s => !s.staff_branches || s.staff_branches.length === 0)
    : []

  const activeBranches = branches.filter(b => b.is_active)

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>ספרים</h1>
          {multiBranch && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {staff.length} ספרים · {activeBranches.length} סניפים
            </p>
          )}
        </div>
        {!multiBranch && (
          <button onClick={() => openNew()} className="btn-primary text-sm">+ הוסף ספר</button>
        )}
      </div>

      {/* ── Branches management strip ── */}
      <div className="mb-8 rounded-2xl p-4" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>🏪 סניפים</span>
          <button
            onClick={openNewBranch}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            style={{ background: 'var(--color-gold)', color: '#fff' }}
          >
            + הוסף סניף
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {branches.map(branch => (
            <motion.div
              key={branch.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                opacity: branch.is_active ? 1 : 0.5,
              }}
            >
              <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                {branch.name}
              </span>
              {branch.address && (
                <span className="text-xs hidden sm:inline" style={{ color: 'var(--color-muted)' }}>
                  · {branch.address}
                </span>
              )}
              {!branch.is_active && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">מושבת</span>
              )}
              {/* Edit */}
              <button
                onClick={() => openEditBranch(branch)}
                className="text-xs px-2 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--color-muted)', background: 'transparent' }}
                title="עריכה"
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-muted)'}
              >
                ✏
              </button>
              {/* Delete — only if more than 1 active branch */}
              {activeBranches.length > 1 && branch.is_active && (
                <button
                  onClick={() => setDeleteConfirm(branch)}
                  className="text-xs px-2 py-1 rounded-lg transition-colors text-red-400 hover:text-red-600"
                  title="הסר סניף"
                >
                  🗑
                </button>
              )}
            </motion.div>
          ))}

          {branches.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>אין סניפים עדיין — הוסף את הראשון</p>
          )}
        </div>
      </div>

      {/* ── Staff list ── */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : multiBranch ? (
        <div className="space-y-6">
          {groupedByBranch.map(({ branch, members }, gi) => (
            <motion.div
              key={branch.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.06 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black" style={{ color: 'var(--color-text)' }}>
                    🏪 {branch.name}
                  </span>
                  {branch.address && (
                    <span className="text-xs hidden sm:inline" style={{ color: 'var(--color-muted)' }}>· {branch.address}</span>
                  )}
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)' }}
                  >
                    {members.length} ספרים
                  </span>
                </div>
                <button
                  onClick={() => openNew(branch.id)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-gold)', border: '1px solid var(--color-border)' }}
                >
                  + הוסף ספר
                </button>
              </div>

              {members.length === 0 ? (
                <div
                  className="rounded-2xl p-6 text-center text-sm border-2 border-dashed"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                >
                  אין ספרים בסניף זה — לחץ "+ הוסף ספר" להוספה
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {members.map((member, i) => (
                    <StaffCard
                      key={member.id}
                      member={member}
                      index={i}
                      multiBranch={true}
                      onEdit={() => openEdit(member)}
                      onDelete={() => handleDelete(member.id)}
                      onPortfolio={() => setPortfolioMember(member)}
                      onMove={() => setMovingStaff(member)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ))}

          {unassigned.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base font-black" style={{ color: 'var(--color-muted)' }}>⚠ ללא סניף</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{unassigned.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {unassigned.map((member, i) => (
                  <StaffCard
                    key={member.id}
                    member={member}
                    index={i}
                    multiBranch={true}
                    onEdit={() => openEdit(member)}
                    onDelete={() => handleDelete(member.id)}
                    onPortfolio={() => setPortfolioMember(member)}
                    onMove={() => setMovingStaff(member)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((member, i) => (
            <StaffCard
              key={member.id}
              member={member}
              index={i}
              multiBranch={false}
              onEdit={() => openEdit(member)}
              onDelete={() => handleDelete(member.id)}
              onPortfolio={() => setPortfolioMember(member)}
              onMove={null}
            />
          ))}
        </div>
      )}

      {/* ── Branch modal (add / edit) ── */}
      <Modal
        open={branchModal}
        onClose={() => setBranchModal(false)}
        title={editingBranch ? `עריכת סניף — ${editingBranch.name}` : 'סניף חדש'}
        size="lg"
      >
        <div className="space-y-5 max-h-[75vh] overflow-y-auto pb-2">
          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>שם סניף *</label>
              <input
                value={branchForm.name}
                onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))}
                placeholder="לדוגמה: HAJAJ - תל מונד"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>כתובת</label>
              <input
                value={branchForm.address}
                onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))}
                placeholder="דולב 46, תל מונד"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>טלפון</label>
              <input
                value={branchForm.phone}
                onChange={e => setBranchForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="054-946-0556"
                className="input w-full"
              />
            </div>
          </div>

          {/* Hours */}
          <div>
            <p className="text-xs font-bold mb-3 tracking-wide" style={{ color: 'var(--color-muted)' }}>שעות פעילות</p>
            <div className="space-y-2">
              {branchHours.map(h => (
                <div key={h.day_of_week} className="flex items-center gap-3">
                  <div className="w-14 text-sm font-medium text-right flex-shrink-0" style={{ color: 'var(--color-text)' }}>
                    {DAY_NAMES[h.day_of_week]}
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={!h.is_closed}
                      onChange={e => updateBranchHour(h.day_of_week, 'is_closed', !e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>פתוח</span>
                  </label>
                  {!h.is_closed ? (
                    <>
                      <input
                        type="time"
                        value={h.open_time}
                        onChange={e => updateBranchHour(h.day_of_week, 'open_time', e.target.value)}
                        className="input py-1 text-sm flex-1 min-w-0"
                      />
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-muted)' }}>עד</span>
                      <input
                        type="time"
                        value={h.close_time}
                        onChange={e => updateBranchHour(h.day_of_week, 'close_time', e.target.value)}
                        className="input py-1 text-sm flex-1 min-w-0"
                      />
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">סגור</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setBranchForm(p => ({ ...p, is_active: !p.is_active }))}
              className="relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0"
              style={{ background: branchForm.is_active ? 'var(--color-gold)' : '#d1d5db' }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
                style={{ right: branchForm.is_active ? '2px' : 'calc(100% - 22px)' }}
              />
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>סניף פעיל</span>
          </label>

          <button
            onClick={handleSaveBranch}
            disabled={savingBranch}
            className="btn-primary w-full py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2"
          >
            {savingBranch ? <><Spinner size="sm" /> שומר...</> : (editingBranch ? 'שמור שינויים' : 'צור סניף')}
          </button>
        </div>
      </Modal>

      {/* ── Delete branch confirm ── */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="הסרת סניף" size="sm">
        <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>
          הסניף <strong>{deleteConfirm?.name}</strong> יוסתר. הספרים והתורים שלו ישמרו במערכת.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => handleDeleteBranch(deleteConfirm)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
          >
            כן, הסר
          </button>
          <button
            onClick={() => setDeleteConfirm(null)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            ביטול
          </button>
        </div>
      </Modal>

      {/* ── Assign branches modal (multi-select via toggles) ── */}
      <Modal open={!!movingStaff} onClose={() => setMovingStaff(null)} title={`סניפים — ${movingStaff?.name}`} size="sm">
        <div className="space-y-2 pb-2">
          <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
            בחר את הסניפים שבהם הספר עובד (אפשר לסמן כמה):
          </p>
          {branches.map(branch => {
            const assigned = movingStaff?.staff_branches?.some(sb =>
              (typeof sb === 'string' ? sb : sb.branch_id) === branch.id
            )
            return (
              <button
                key={branch.id}
                onClick={() => toggleStaffBranch(movingStaff.id, branch.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-right"
                style={{
                  background: assigned ? 'rgba(201,169,110,0.12)' : 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1.5px solid ' + (assigned ? 'var(--color-gold)' : 'var(--color-border)'),
                }}
              >
                {/* Checkbox visual */}
                <div
                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ background: assigned ? 'var(--color-gold)' : 'transparent', border: '2px solid ' + (assigned ? 'var(--color-gold)' : '#ccc') }}
                >
                  {assigned && <span className="text-white text-xs font-bold">✓</span>}
                </div>
                <span className="flex-1">📍 {branch.name}</span>
                {branch.address && (
                  <span className="text-xs hidden sm:inline" style={{ color: 'var(--color-muted)' }}>{branch.address}</span>
                )}
              </button>
            )
          })}
          <p className="text-xs pt-2 text-center" style={{ color: 'var(--color-muted)' }}>
            השינויים נשמרים מיידית
          </p>
        </div>
      </Modal>

      {/* ── Portfolio modal ── */}
      {portfolioMember && (
        <PortfolioModal
          member={portfolioMember}
          onClose={() => setPortfolioMember(null)}
          toast={toast}
        />
      )}

      {/* ── Edit / New staff modal ── */}
      <Modal open={!!editMember} onClose={() => setEditMember(null)} title={editMember?.id ? 'עריכת ספר' : 'ספר חדש'} size="lg">
        {editMember && (
          <div className="space-y-5 overflow-y-auto max-h-[70vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">שם *</label>
                <input
                  className="input"
                  value={editMember.name}
                  onChange={e => setEditMember(m => ({ ...m, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">תמונת פרופיל</label>
                <ImageUpload
                  value={editMember.photo_url}
                  onUrl={url => setEditMember(m => ({ ...m, photo_url: url }))}
                  folder="staff"
                  label="העלאת תמונה"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">וידאו פרופיל</label>
                <ImageUpload
                  value={editMember.video_url}
                  onUrl={url => setEditMember(m => ({ ...m, video_url: url }))}
                  folder="staff-videos"
                  label="העלאת וידאו"
                  accept="video/*"
                />
                {editMember.video_url && (
                  <button
                    type="button"
                    className="text-xs mt-1 underline"
                    style={{ color: 'var(--color-muted)' }}
                    onClick={() => setEditMember(m => ({ ...m, video_url: '' }))}
                  >
                    הסר וידאו
                  </button>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">ביוגרפיה</label>
                <textarea
                  className="input resize-none h-16"
                  value={editMember.bio || ''}
                  onChange={e => setEditMember(m => ({ ...m, bio: e.target.value }))}
                />
              </div>

              {/* Branch multi-select — only when multi-branch */}
              {multiBranch && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-2">🏪 סניפים</label>
                  <div className="flex flex-wrap gap-2">
                    {branches.map(b => {
                      const selected = (editMember.staff_branches ?? []).includes(b.id)
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setEditMember(m => ({
                            ...m,
                            staff_branches: selected
                              ? (m.staff_branches ?? []).filter(id => id !== b.id)
                              : [...(m.staff_branches ?? []), b.id],
                          }))}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all"
                          style={{
                            background: selected ? 'var(--color-gold)' : 'var(--color-surface)',
                            borderColor: selected ? 'var(--color-gold)' : 'var(--color-border)',
                            color: selected ? '#fff' : 'var(--color-text)',
                          }}
                        >
                          {selected && <span className="text-xs">✓</span>}
                          📍 {b.name}
                        </button>
                      )
                    })}
                  </div>
                  {(editMember.staff_branches ?? []).length === 0 && (
                    <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted)' }}>לא משויך לסניף</p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={editMember.is_active}
                  onChange={e => setEditMember(m => ({ ...m, is_active: e.target.checked }))}
                />
                <label htmlFor="is_active" className="text-sm font-medium">פעיל</label>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">שירותים</p>
              <div className="flex flex-wrap gap-2">
                {services.map(s => (
                  <button
                    key={s.id}
                    onClick={() => toggleService(s.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-colors ${
                      editMember.staff_services.includes(s.id)
                        ? 'bg-[var(--color-gold)] text-white border-[var(--color-gold)]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">שעות עבודה</p>
              <div className="space-y-2">
                {editMember.staff_hours.map(h => (
                  <div key={h.day_of_week} className="flex items-center gap-3 text-sm">
                    <div className="w-16 font-medium">{dayName(h.day_of_week)}</div>
                    <input
                      type="checkbox"
                      checked={h.is_working}
                      onChange={e => toggleHour(h.day_of_week, 'is_working', e.target.checked)}
                    />
                    {h.is_working ? (
                      <>
                        <input type="time" className="input w-28 py-1" value={h.start_time || '09:00'}
                          onChange={e => toggleHour(h.day_of_week, 'start_time', e.target.value)} />
                        <span className="text-muted">—</span>
                        <input type="time" className="input w-28 py-1" value={h.end_time || '19:00'}
                          onChange={e => toggleHour(h.day_of_week, 'end_time', e.target.value)} />
                      </>
                    ) : (
                      <span className="text-muted">סגור</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Commission section */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <p className="text-sm font-bold">💰 תגמול</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 'inherit', label: 'לפי הגדרות ראשיות' },
                  { value: 'percentage', label: 'אחוזים %' },
                  { value: 'fixed', label: 'סכום קבוע ₪ לשירות' },
                  { value: 'salary', label: 'משכורת חודשית ₪' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditMember(m => ({ ...m, commission_type: opt.value }))}
                    className="px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all text-center"
                    style={{
                      background: editMember.commission_type === opt.value ? 'var(--color-gold)' : 'var(--color-card)',
                      borderColor: editMember.commission_type === opt.value ? 'var(--color-gold)' : 'var(--color-border)',
                      color: editMember.commission_type === opt.value ? '#fff' : 'var(--color-text)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {(editMember.commission_type === 'percentage' || editMember.commission_type === 'fixed') && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>
                    {editMember.commission_type === 'percentage' ? 'אחוז עמלה (%)' : 'סכום קבוע לתור (₪)'}
                  </label>
                  <input
                    type="number"
                    inputMode={editMember.commission_type === 'percentage' ? 'decimal' : 'numeric'}
                    min="0"
                    step={editMember.commission_type === 'percentage' ? '0.1' : '1'}
                    className="input w-40"
                    value={editMember.commission_rate ?? ''}
                    onChange={e => setEditMember(m => ({ ...m, commission_rate: e.target.value === '' ? null : Number(e.target.value) }))}
                    placeholder={editMember.commission_type === 'percentage' ? 'לדוגמה: 30' : 'לדוגמה: 50'}
                  />
                </div>
              )}

              {editMember.commission_type === 'salary' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>משכורת חודשית (₪)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="100"
                    className="input w-40"
                    value={editMember.monthly_salary ?? ''}
                    onChange={e => setEditMember(m => ({ ...m, monthly_salary: e.target.value === '' ? null : Number(e.target.value) }))}
                    placeholder="לדוגמה: 8000"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? 'שומר...' : 'שמור'}
              </button>
              <button onClick={() => setEditMember(null)} className="btn-outline flex-1 justify-center">
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Staff Card ────────────────────────────────────────────────────────────────
function StaffCard({ member, index, multiBranch, onEdit, onDelete, onPortfolio, onMove }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`card p-5 ${!member.is_active ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-[var(--color-gold)]/10 flex items-center justify-center text-[var(--color-gold)] font-bold text-lg flex-shrink-0 overflow-hidden">
          {member.photo_url
            ? <img src={member.photo_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
            : member.name[0]
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{member.name}</p>
          {!member.is_active && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">לא פעיל</span>
          )}
          {member.bio && (
            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-muted)' }}>{member.bio}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={onEdit} className="btn-ghost text-sm flex-1 justify-center border border-gray-200">עריכה</button>
        <button
          onClick={onPortfolio}
          className="btn-ghost text-sm px-3 py-2 border border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-amber-50 rounded-lg transition-colors"
        >
          פורטפוליו
        </button>
        {multiBranch && onMove && (
          <button
            onClick={onMove}
            title="שנה סניף"
            className="px-3 py-2 text-sm rounded-lg transition-colors"
            style={{ color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
          >
            🏪
          </button>
        )}
        <button onClick={onDelete} className="px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          מחק
        </button>
      </div>
    </motion.div>
  )
}

// ─── Portfolio Modal ───────────────────────────────────────────────────────────
function PortfolioModal({ member, onClose, toast }) {
  const { photos, loading, addPhoto, deletePhoto } = useStaffPortfolio(member.id)
  const [urlInput, setUrlInput] = useState('')
  const [adding, setAdding]     = useState(false)

  async function addSingle(url) {
    if (!url?.trim()) return
    setAdding(true)
    try {
      await addPhoto(url.trim(), '')
      toast({ message: 'תמונה נוספה', type: 'success' })
    } catch (err) {
      toast({ message: err.message || 'שגיאה בהוספת תמונה', type: 'error' })
    } finally {
      setAdding(false)
    }
  }

  async function handleAddUrl(e) {
    e.preventDefault()
    await addSingle(urlInput)
    setUrlInput('')
  }

  async function handleUploadedUrls(urls) {
    for (const url of urls) await addSingle(url)
  }

  async function handleDelete(id) {
    if (!confirm('למחוק תמונה זו?')) return
    await deletePhoto(id)
    toast({ message: 'תמונה נמחקה', type: 'success' })
  }

  return (
    <Modal open={true} onClose={onClose} title={`פורטפוליו — ${member.name}`} size="lg">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto">
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm font-semibold">הוסף תמונות</p>
          <ImageUpload value={null} onUrls={handleUploadedUrls} folder="portfolio" label="העלאת תמונות (ניתן לבחור כמה)" multiple={true} />
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            <span>או הדבק קישור</span>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
          </div>
          <form onSubmit={handleAddUrl} className="flex gap-2">
            <input type="url" className="input flex-1 text-sm" placeholder="https://..." value={urlInput} onChange={e => setUrlInput(e.target.value)} />
            <button type="submit" disabled={adding || !urlInput.trim()} className="btn-primary text-sm px-4">
              {adding ? '...' : '+ הוסף'}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : photos.length === 0 ? (
          <div className="text-center py-10 text-muted"><div className="text-4xl mb-3">📷</div><p>אין תמונות בפורטפוליו עדיין</p></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo, i) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className="relative group rounded-xl overflow-hidden bg-gray-100 aspect-square"
              >
                <img src={photo.image_url} alt={photo.caption || ''} className="w-full h-full object-cover" onError={e => { e.target.style.opacity = '0.3' }} />
                {photo.caption && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs p-2 truncate">{photo.caption}</div>
                )}
                <button
                  onClick={() => handleDelete(photo.id)}
                  className="absolute top-2 left-2 min-w-11 min-h-11 w-11 h-11 bg-red-500 text-white rounded-full text-base flex items-center justify-center shadow-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                >×</button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
