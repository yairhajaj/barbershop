import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Unified source of truth for product sales.
 *
 * Unions two sources:
 *  1. `manual_income` rows with `product_id IS NOT NULL` — walk-in / quick receipts
 *  2. `invoice_items` rows with `kind = 'product'` — products attached to an invoice (usually sold alongside a service)
 *
 * Both are returned in a normalized shape so callers (IncomeTab, StaffPayments, Customer history)
 * don't need to know which table a sale came from.
 */
export async function fetchProductSales({ from, to, staffId, customerId } = {}) {
  // --- 1. manual_income (walk-in + quick receipts) ---
  let miQ = supabase
    .from('manual_income')
    .select('id, amount, date, payment_method, staff_id, customer_id, product_id, products(name, price)')
    .not('product_id', 'is', null)
  if (from) miQ = miQ.gte('date', from)
  if (to)   miQ = miQ.lte('date', to)
  if (staffId)    miQ = miQ.eq('staff_id', staffId)
  if (customerId) miQ = miQ.eq('customer_id', customerId)

  // --- 2. invoice_items (products on an invoice) ---
  let iiQ = supabase
    .from('invoice_items')
    .select('id, quantity, unit_price, line_total, staff_id, product_id, name, created_at, invoice_id, invoices!inner(id, service_date, is_cancelled, customer_name, customer_phone, notes)')
    .eq('kind', 'product')
    .eq('invoices.is_cancelled', false)
  if (from) iiQ = iiQ.gte('invoices.service_date', from)
  if (to)   iiQ = iiQ.lte('invoices.service_date', to)
  if (staffId) iiQ = iiQ.eq('staff_id', staffId)

  const [miRes, iiRes] = await Promise.all([miQ, iiQ])
  if (miRes.error) throw miRes.error
  if (iiRes.error) throw iiRes.error

  const fromMi = (miRes.data ?? []).map(r => ({
    id: `mi-${r.id}`,
    source: 'manual_income',
    raw_id: r.id,
    product_id: r.product_id,
    product_name: r.products?.name || 'מוצר',
    staff_id: r.staff_id,
    customer_id: r.customer_id,
    customer_name: null,
    quantity: 1,
    amount: Number(r.amount || 0),
    date: r.date,
    payment_method: r.payment_method,
  }))

  const fromIi = (iiRes.data ?? []).map(r => ({
    id: `ii-${r.id}`,
    source: 'invoice_items',
    raw_id: r.id,
    invoice_id: r.invoice_id,
    product_id: r.product_id,
    product_name: r.name,
    staff_id: r.staff_id,
    customer_id: null,
    customer_name: r.invoices?.customer_name ?? null,
    quantity: Number(r.quantity || 1),
    amount: Number(r.line_total || 0),
    date: (r.invoices?.service_date || r.created_at || '').slice(0, 10),
    payment_method: r.invoices?.notes || null,
  }))

  return [...fromMi, ...fromIi].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

export function useProductSales({ from, to, staffId, customerId } = {}) {
  const q = useQuery({
    queryKey: ['product-sales', { from, to, staffId, customerId }],
    queryFn: () => fetchProductSales({ from, to, staffId, customerId }),
  })
  return { sales: q.data ?? [], loading: q.isLoading, refetch: q.refetch }
}
