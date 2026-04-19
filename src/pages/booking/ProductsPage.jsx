import { motion } from 'framer-motion'
import { useProducts } from '../../hooks/useProducts'
import { Spinner } from '../../components/ui/Spinner'
import { useTheme } from '../../contexts/ThemeContext'

const WHATSAPP = '972549460556'

function ProductCard({ product, isDark }) {
  const handleOrder = () => {
    const msg = encodeURIComponent(`היי, אני מעוניין במוצר: ${product.name}`)
    window.open(`https://wa.me/${WHATSAPP}?text=${msg}`, '_blank')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--color-card)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {product.image_url ? (
        <div style={{ aspectRatio: '4/3', overflow: 'hidden', background: 'var(--color-surface)' }}>
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      ) : (
        <div style={{
          aspectRatio: '4/3',
          background: 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 40,
        }}>
          🛍️
        </div>
      )}

      <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)', lineHeight: 1.3 }}>
            {product.name}
          </span>
          {product.is_featured && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
              background: 'var(--color-gold)', color: '#fff', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              מומלץ
            </span>
          )}
        </div>

        {product.description && (
          <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
            {product.description}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--color-gold)' }}>
            ₪{Number(product.price).toLocaleString('he-IL')}
          </span>
          {product.stock !== null && product.stock <= 0 ? (
            <span style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>אזל המלאי</span>
          ) : (
            <button
              onClick={handleOrder}
              style={{
                background: '#25D366',
                color: '#fff',
                border: 'none',
                borderRadius: 22,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.534 5.854L.054 23.25l5.558-1.458A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.795 9.795 0 01-5.003-1.373l-.357-.213-3.702.97.988-3.607-.233-.37A9.793 9.793 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/>
              </svg>
              הזמן
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export function ProductsPage() {
  const { products, loading } = useProducts({ activeOnly: true })
  const { isDark } = useTheme()

  const featured = products.filter(p => p.is_featured)
  const rest = products.filter(p => !p.is_featured)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-surface)', paddingBottom: 100 }} dir="rtl">
      {/* Header */}
      <div style={{
        padding: '28px 20px 20px',
        background: 'var(--color-card)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--color-text)' }}>
          חנות מוצרים
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--color-muted)' }}>
          מוצרי טיפוח וסטיילינג מקצועיים
        </p>
      </div>

      <div style={{ padding: '20px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <Spinner />
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--color-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛍️</div>
            <p style={{ fontSize: 16, fontWeight: 600 }}>אין מוצרים כרגע</p>
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  ⭐ מוצרים מומלצים
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                  {featured.map((p, i) => (
                    <motion.div key={p.id} transition={{ delay: i * 0.05 }}>
                      <ProductCard product={p} isDark={isDark} />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {rest.length > 0 && (
              <section>
                {featured.length > 0 && (
                  <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    כל המוצרים
                  </h2>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                  {rest.map((p, i) => (
                    <motion.div key={p.id} transition={{ delay: i * 0.05 }}>
                      <ProductCard product={p} isDark={isDark} />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
