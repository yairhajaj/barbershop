import { useState } from 'react'
import { motion } from 'framer-motion'
import { useProducts } from '../../hooks/useProducts'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { ImageUpload } from '../../components/ui/ImageUpload'
import { useToast } from '../../components/ui/Toast'

const EMPTY = {
  name: '',
  description: '',
  price: '',
  image_url: '',
  is_active: true,
  is_featured: false,
  display_order: 0,
  stock: '',
}

export function Products() {
  const { products, loading, addProduct, updateProduct, deleteProduct } = useProducts()
  const toast = useToast()
  const [editProduct, setEditProduct] = useState(null)
  const [saving, setSaving] = useState(false)

  function openNew() {
    setEditProduct({ ...EMPTY, _isNew: true })
  }

  async function handleSave() {
    if (!editProduct.name.trim() || !editProduct.price) {
      toast({ message: 'שם ומחיר הם שדות חובה', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: editProduct.name.trim(),
        description: editProduct.description?.trim() || null,
        price: Number(editProduct.price),
        image_url: editProduct.image_url || null,
        is_active: editProduct.is_active,
        is_featured: editProduct.is_featured,
        display_order: Number(editProduct.display_order) || 0,
        stock: editProduct.stock !== '' ? Number(editProduct.stock) : null,
      }
      if (editProduct._isNew) {
        await addProduct(payload)
        toast({ message: 'מוצר נוסף', type: 'success' })
      } else {
        await updateProduct(editProduct.id, payload)
        toast({ message: 'מוצר עודכן', type: 'success' })
      }
      setEditProduct(null)
    } catch (err) {
      toast({ message: err.message || 'שגיאה בשמירה', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('למחוק מוצר זה?')) return
    try {
      await deleteProduct(id)
      toast({ message: 'מוצר נמחק', type: 'success' })
    } catch {
      toast({ message: 'שגיאה במחיקה', type: 'error' })
    }
  }

  async function toggleField(id, field, value) {
    try {
      await updateProduct(id, { [field]: value })
    } catch {
      toast({ message: 'שגיאה בעדכון', type: 'error' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">מוצרים למכירה</h1>
        <button onClick={openNew} className="btn-primary text-sm px-5 py-2.5">+ מוצר חדש</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : products.length === 0 ? (
        <div className="card p-14 text-center" style={{ color: 'var(--color-muted)' }}>
          <div className="text-5xl mb-4">🛍️</div>
          <p className="font-semibold mb-4">אין מוצרים עדיין</p>
          <button onClick={openNew} className="btn-primary text-sm px-5 py-2.5">הוסף מוצר ראשון</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="card overflow-hidden"
            >
              {/* Image */}
              <div className="relative h-40 bg-gray-100 flex items-center justify-center">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl opacity-30">🛍️</span>
                )}
                {/* Badges */}
                <div className="absolute top-2 right-2 flex flex-col gap-1">
                  {product.is_featured && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#FBBF24', color: '#111' }}>
                      ⭐ מומלץ
                    </span>
                  )}
                  {!product.is_active && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-400 text-white">
                      מוסתר
                    </span>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-sm leading-tight">{product.name}</h3>
                  <span className="font-black text-sm shrink-0" style={{ color: 'var(--color-gold)' }}>
                    ₪{product.price}
                  </span>
                </div>
                {product.description && (
                  <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--color-muted)' }}>
                    {product.description}
                  </p>
                )}
                {product.stock !== null && (
                  <p className="text-xs mb-2" style={{ color: product.stock < 5 ? '#ef4444' : 'var(--color-muted)' }}>
                    מלאי: {product.stock}
                  </p>
                )}

                {/* Toggles */}
                <div className="flex gap-2 mb-3 flex-wrap">
                  <button
                    onClick={() => toggleField(product.id, 'is_active', !product.is_active)}
                    className="text-xs px-2.5 py-1 rounded-full font-semibold border transition-all"
                    style={{
                      background: product.is_active ? 'var(--color-success-tint)' : 'rgba(0,0,0,0.05)',
                      borderColor: product.is_active ? '#22c55e' : 'var(--color-border)',
                      color: product.is_active ? '#16a34a' : 'var(--color-muted)',
                    }}
                  >
                    {product.is_active ? '✓ פעיל' : 'מוסתר'}
                  </button>
                  <button
                    onClick={() => toggleField(product.id, 'is_featured', !product.is_featured)}
                    className="text-xs px-2.5 py-1 rounded-full font-semibold border transition-all"
                    style={{
                      background: product.is_featured ? 'rgba(251,191,36,0.15)' : 'rgba(0,0,0,0.05)',
                      borderColor: product.is_featured ? '#FBBF24' : 'var(--color-border)',
                      color: product.is_featured ? '#B45309' : 'var(--color-muted)',
                    }}
                  >
                    {product.is_featured ? '⭐ מומלץ' : 'לא מומלץ'}
                  </button>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditProduct({ ...product })}
                    className="flex-1 text-xs py-1.5 rounded-lg border font-medium transition-all hover:bg-gray-50"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    ✏ עריכה
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="text-xs py-1.5 px-3 rounded-lg font-medium transition-all"
                    style={{ background: 'var(--color-danger-tint)', color: '#ef4444' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Edit / New Modal */}
      <Modal
        open={!!editProduct}
        onClose={() => setEditProduct(null)}
        title={editProduct?._isNew ? 'מוצר חדש' : 'עריכת מוצר'}
      >
        {editProduct && (
          <div className="space-y-4 overflow-y-auto max-h-[70vh]">
            <div>
              <label className="block text-sm font-medium mb-1">שם מוצר *</label>
              <input
                className="input"
                value={editProduct.name}
                onChange={e => setEditProduct(p => ({ ...p, name: e.target.value }))}
                placeholder="שמפו פרימיום..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">תיאור</label>
              <textarea
                className="input resize-none h-16"
                value={editProduct.description || ''}
                onChange={e => setEditProduct(p => ({ ...p, description: e.target.value }))}
                placeholder="תיאור קצר של המוצר..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">מחיר (₪) *</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editProduct.price}
                  onChange={e => setEditProduct(p => ({ ...p, price: e.target.value }))}
                  placeholder="99.90"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">מלאי (ריק = ללא הגבלה)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={editProduct.stock ?? ''}
                  onChange={e => setEditProduct(p => ({ ...p, stock: e.target.value }))}
                  placeholder="100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">תמונת מוצר</label>
              <ImageUpload
                value={editProduct.image_url}
                onUrl={url => setEditProduct(p => ({ ...p, image_url: url }))}
                folder="products"
                label="העלאת תמונה"
              />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editProduct.is_active}
                  onChange={e => setEditProduct(p => ({ ...p, is_active: e.target.checked }))}
                />
                פעיל (מוצג ללקוחות)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editProduct.is_featured}
                  onChange={e => setEditProduct(p => ({ ...p, is_featured: e.target.checked }))}
                />
                מוצג בדף הבית ⭐
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">סדר תצוגה</label>
              <input
                className="input"
                type="number"
                value={editProduct.display_order}
                onChange={e => setEditProduct(p => ({ ...p, display_order: e.target.value }))}
                placeholder="0"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center py-2.5">
                {saving ? 'שומר...' : 'שמור מוצר'}
              </button>
              <button onClick={() => setEditProduct(null)} className="btn-outline flex-1 justify-center py-2.5">
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
