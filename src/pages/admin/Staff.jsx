import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStaff } from '../../hooks/useStaff'
import { useServices } from '../../hooks/useServices'
import { useStaffPortfolio } from '../../hooks/useStaffPortfolio'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { ImageUpload } from '../../components/ui/ImageUpload'
import { dayName } from '../../lib/utils'

const DEFAULT_HOURS = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i,
  start_time: '09:00',
  end_time: '19:00',
  is_working: i !== 6, // שבת סגור
}))

export function Staff() {
  const { staff, loading, upsertStaffMember, deleteStaffMember } = useStaff()
  const { services } = useServices()
  const toast = useToast()
  const [editMember, setEditMember] = useState(null)
  const [saving, setSaving] = useState(false)
  const [portfolioMember, setPortfolioMember] = useState(null)

  function openNew() {
    setEditMember({
      name: '', bio: '', photo_url: '', is_active: true,
      staff_hours: DEFAULT_HOURS,
      staff_services: services.map(s => s.id),
    })
  }

  function openEdit(member) {
    setEditMember({
      ...member,
      staff_hours: member.staff_hours?.length ? member.staff_hours : DEFAULT_HOURS,
      staff_services: member.staff_services?.map(ss => ss.service_id) ?? [],
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
        toast({ message: 'לספר זה יש תורים — הרץ migration 008 כדי לאפשר מחיקה, או סמן אותו כ"לא פעיל"', type: 'error' })
      } else {
        toast({ message: msg || 'שגיאה במחיקה', type: 'error' })
      }
    }
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>ספרים</h1>
        <button onClick={openNew} className="btn-primary text-sm">+ הוסף ספר</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`card p-5 ${!member.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[var(--color-gold)]/10 flex items-center justify-center text-[var(--color-gold)] font-bold text-lg flex-shrink-0">
                  {member.photo_url
                    ? <img src={member.photo_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
                    : member.name[0]
                  }
                </div>
                <div>
                  <p className="font-semibold">{member.name}</p>
                  {!member.is_active && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">לא פעיל</span>}
                </div>
              </div>
              {member.bio && <p className="text-sm text-muted mb-4">{member.bio}</p>}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => openEdit(member)} className="btn-ghost text-sm flex-1 justify-center border border-gray-200">
                  עריכה
                </button>
                <button
                  onClick={() => setPortfolioMember(member)}
                  className="btn-ghost text-sm px-3 py-2 border border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-amber-50 rounded-lg transition-colors"
                >
                  פורטפוליו
                </button>
                <button
                  onClick={() => handleDelete(member.id)}
                  className="px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  מחק
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Portfolio Modal */}
      {portfolioMember && (
        <PortfolioModal
          member={portfolioMember}
          onClose={() => setPortfolioMember(null)}
          toast={toast}
        />
      )}

      {/* Edit / New Modal */}
      <Modal
        open={!!editMember}
        onClose={() => setEditMember(null)}
        title={editMember?.id ? 'עריכת ספר' : 'ספר חדש'}
        size="lg"
      >
        {editMember && (
          <div className="space-y-5 overflow-y-auto max-h-[70vh]">
            {/* Basic info */}
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
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">ביוגרפיה</label>
                <textarea
                  className="input resize-none h-16"
                  value={editMember.bio || ''}
                  onChange={e => setEditMember(m => ({ ...m, bio: e.target.value }))}
                />
              </div>
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

            {/* Services */}
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

            {/* Hours */}
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
                        <input
                          type="time"
                          className="input w-28 py-1"
                          value={h.start_time || '09:00'}
                          onChange={e => toggleHour(h.day_of_week, 'start_time', e.target.value)}
                        />
                        <span className="text-muted">—</span>
                        <input
                          type="time"
                          className="input w-28 py-1"
                          value={h.end_time || '19:00'}
                          onChange={e => toggleHour(h.day_of_week, 'end_time', e.target.value)}
                        />
                      </>
                    ) : (
                      <span className="text-muted">סגור</span>
                    )}
                  </div>
                ))}
              </div>
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

function PortfolioModal({ member, onClose, toast }) {
  const { photos, loading, addPhoto, deletePhoto } = useStaffPortfolio(member.id)
  const [urlInput, setUrlInput] = useState('')
  const [adding,   setAdding]   = useState(false)

  async function addSingle(url) {
    if (!url?.trim()) return
    setAdding(true)
    try {
      await addPhoto(url.trim(), '')
      toast({ message: 'תמונה נוספה', type: 'success' })
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('staff_portfolio') || msg.includes('does not exist')) {
        toast({ message: 'טבלת staff_portfolio חסרה — הרץ migration 006 ב-Supabase SQL Editor', type: 'error' })
      } else {
        toast({ message: msg || 'שגיאה בהוספת תמונה', type: 'error' })
      }
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
    for (const url of urls) {
      await addSingle(url)
    }
  }

  async function handleDelete(id) {
    if (!confirm('למחוק תמונה זו?')) return
    await deletePhoto(id)
    toast({ message: 'תמונה נמחקה', type: 'success' })
  }

  return (
    <Modal open={true} onClose={onClose} title={`פורטפוליו — ${member.name}`} size="lg">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto">
        {/* Add photo form */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm font-semibold">הוסף תמונות</p>

          {/* Multi-file upload */}
          <ImageUpload
            value={null}
            onUrls={handleUploadedUrls}
            folder="portfolio"
            label="העלאת תמונות (ניתן לבחור כמה)"
            multiple={true}
          />

          {/* OR: paste URL */}
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            <span>או הדבק קישור</span>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
          </div>
          <form onSubmit={handleAddUrl} className="flex gap-2">
            <input
              type="url"
              className="input flex-1 text-sm"
              placeholder="https://... (קישור לתמונה)"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
            />
            <button type="submit" disabled={adding || !urlInput.trim()} className="btn-primary text-sm px-4">
              {adding ? '...' : '+ הוסף'}
            </button>
          </form>
        </div>

        {/* Photos grid */}
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : photos.length === 0 ? (
          <div className="text-center py-10 text-muted">
            <div className="text-4xl mb-3">📷</div>
            <p>אין תמונות בפורטפוליו עדיין</p>
          </div>
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
                <img
                  src={photo.image_url}
                  alt={photo.caption || ''}
                  className="w-full h-full object-cover"
                  onError={e => { e.target.style.opacity = '0.3' }}
                />
                {photo.caption && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs p-2 truncate">
                    {photo.caption}
                  </div>
                )}
                <button
                  onClick={() => handleDelete(photo.id)}
                  className="absolute top-2 left-2 w-7 h-7 bg-red-500 text-white rounded-full text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  title="מחק"
                >
                  ×
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
