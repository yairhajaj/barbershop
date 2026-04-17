import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useBusinessSettings } from './useBusinessSettings'

/**
 * Aggregation hook for the finance dashboard.
 * Fetches monthly income, expenses, and profit data.
 */
export function useFinanceDashboard() {
  const [stats, setStats]       = useState(null)
  const [monthly, setMonthly]   = useState([]) // last 6 months
  const [recent, setRecent]     = useState([]) // recent feed
  const [loading, setLoading]   = useState(true)
  const { settings } = useBusinessSettings()

  useEffect(() => { if (settings !== undefined) fetchAll() }, [settings])

  async function fetchAll() {
    setLoading(true)
    const now = new Date()
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
    const monthEnd   = format(endOfMonth(now),   'yyyy-MM-dd')

    // ── Current month stats ────────────────────────────────
    const [paymentsRes, manualRes, expensesRes] = await Promise.all([
      supabase.from('payments')
        .select('amount')
        .eq('status', 'paid')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd + 'T23:59:59'),
      supabase.from('manual_income')
        .select('amount, vat_amount')
        .gte('date', monthStart)
        .lte('date', monthEnd),
      supabase.from('expenses')
        .select('amount, vat_amount')
        .gte('date', monthStart)
        .lte('date', monthEnd),
    ])

    const vatRate    = Number(settings?.vat_rate ?? 18)
    const isPatur    = settings?.business_type === 'osek_patur'
    const rate       = vatRate / 100
    const calcVatFromAmount = amt => isPatur ? 0 : Math.round(amt - amt / (1 + rate))

    const paymentIncome = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const manualIncome  = (manualRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const totalIncome   = paymentIncome + manualIncome
    const incomeVat     = (paymentsRes.data ?? []).reduce((s, p) => s + calcVatFromAmount(Number(p.amount)), 0)
                        + (manualRes.data ?? []).reduce((s, p) => s + calcVatFromAmount(Number(p.amount)), 0)

    const totalExpenses = (expensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0)
    const expenseVat    = (expensesRes.data ?? []).reduce((s, e) => s + Number(e.vat_amount || 0), 0)

    setStats({
      income:     totalIncome,
      expenses:   totalExpenses,
      profit:     totalIncome - totalExpenses,
      vatBalance: incomeVat - expenseVat,
    })

    // ── Last 6 months ──────────────────────────────────────
    const months = []
    for (let i = 5; i >= 0; i--) {
      const m     = subMonths(now, i)
      const start = format(startOfMonth(m), 'yyyy-MM-dd')
      const end   = format(endOfMonth(m),   'yyyy-MM-dd')
      months.push({ month: format(m, 'MM/yy'), start, end })
    }

    const monthlyData = await Promise.all(months.map(async ({ month, start, end }) => {
      const [p, mi, e] = await Promise.all([
        supabase.from('payments').select('amount').eq('status', 'paid')
          .gte('created_at', start).lte('created_at', end + 'T23:59:59'),
        supabase.from('manual_income').select('amount')
          .gte('date', start).lte('date', end),
        supabase.from('expenses').select('amount')
          .gte('date', start).lte('date', end),
      ])
      const inc = (p.data ?? []).reduce((s, x) => s + Number(x.amount), 0)
                + (mi.data ?? []).reduce((s, x) => s + Number(x.amount), 0)
      const exp = (e.data ?? []).reduce((s, x) => s + Number(x.amount), 0)
      return { month, income: inc, expenses: exp }
    }))
    setMonthly(monthlyData)

    // ── Recent activity feed (last 10 items) ───────────────
    const [rPay, rManual, rExp] = await Promise.all([
      supabase.from('payments')
        .select('id, amount, status, created_at, appointments(profiles(name), services(name))')
        .eq('status', 'paid')
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('manual_income')
        .select('id, description, amount, date, created_at')
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('expenses')
        .select('id, vendor_name, amount, date, created_at, expense_categories(name, icon)')
        .order('created_at', { ascending: false }).limit(5),
    ])

    const feed = [
      ...(rPay.data ?? []).map(p => ({
        id: p.id, type: 'payment', amount: Number(p.amount),
        label: p.appointments?.services?.name || 'תשלום',
        date: p.created_at,
      })),
      ...(rManual.data ?? []).map(m => ({
        id: m.id, type: 'manual', amount: Number(m.amount),
        label: m.description,
        date: m.created_at || m.date,
      })),
      ...(rExp.data ?? []).map(e => ({
        id: e.id, type: 'expense', amount: -Number(e.amount),
        label: e.vendor_name || e.expense_categories?.name || 'הוצאה',
        icon: e.expense_categories?.icon,
        date: e.created_at || e.date,
      })),
    ]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10)

    setRecent(feed)
    setLoading(false)
  }

  return { stats, monthly, recent, loading, refetch: fetchAll }
}
