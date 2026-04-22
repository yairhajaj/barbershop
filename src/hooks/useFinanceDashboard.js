import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useBusinessSettings } from './useBusinessSettings'

const METHOD_LABELS = { cash: 'מזומן', bit: 'ביט', credit: 'אשראי', paybox: 'Paybox', transfer: 'העברה' }

export function useFinanceDashboard({ branchId = null } = {}) {
  const { settings } = useBusinessSettings()

  const query = useQuery({
    queryKey: ['finance', 'dashboard', { branchId, businessType: settings?.business_type, vatRate: settings?.vat_rate }],
    enabled: settings !== undefined,
    queryFn: async () => {
      const now = new Date()
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
      const monthEnd   = format(endOfMonth(now),   'yyyy-MM-dd')
      const branchOr   = branchId ? `branch_id.eq.${branchId},branch_id.is.null` : null

      const applyBranch = (q) => branchOr ? q.or(branchOr) : q

      // ── Current month stats ────────────────────────────────
      const [paymentsRes, manualRes, expensesRes, payMethodRes, manualMethodRes, manualSvcRes, apptSvcRes] = await Promise.all([
        applyBranch(supabase.from('payments')
          .select('amount')
          .eq('status', 'paid')
          .gte('created_at', monthStart)
          .lte('created_at', monthEnd + 'T23:59:59')),
        applyBranch(supabase.from('manual_income')
          .select('amount, vat_amount')
          .gte('date', monthStart)
          .lte('date', monthEnd)),
        applyBranch(supabase.from('expenses')
          .select('amount, vat_amount')
          .gte('date', monthStart)
          .lte('date', monthEnd)),
        // payment method breakdown — online payments
        applyBranch(supabase.from('payments')
          .select('payment_method, amount')
          .eq('status', 'paid')
          .gte('created_at', monthStart)
          .lte('created_at', monthEnd + 'T23:59:59')),
        // payment method breakdown — manual income
        applyBranch(supabase.from('manual_income')
          .select('payment_method, amount')
          .gte('date', monthStart)
          .lte('date', monthEnd)),
        // top services — manual income with service join
        applyBranch(supabase.from('manual_income')
          .select('service_id, amount, services(name)')
          .not('service_id', 'is', null)
          .gte('date', monthStart)
          .lte('date', monthEnd)),
        // top services — completed appointments
        applyBranch(supabase.from('appointments')
          .select('service_id, services(name, price)')
          .eq('status', 'completed')
          .gte('start_at', monthStart + 'T00:00:00')
          .lte('start_at', monthEnd + 'T23:59:59')),
      ])

      const vatRate    = Number(settings?.vat_rate ?? 18)
      const isPatur    = settings?.business_type === 'osek_patur'
      const rate       = vatRate / 100
      const calcVatFromAmount = amt => isPatur ? 0 : Math.round(amt - amt / (1 + rate))

      const paymentIncome = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0)
      const manualIncome  = (manualRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0)
      const totalIncome   = paymentIncome + manualIncome
      const transactionCount = (paymentsRes.data ?? []).length + (manualRes.data ?? []).length
      const avgTicket     = transactionCount > 0 ? totalIncome / transactionCount : 0

      const incomeVat     = (paymentsRes.data ?? []).reduce((s, p) => s + calcVatFromAmount(Number(p.amount)), 0)
                          + (manualRes.data ?? []).reduce((s, p) => s + calcVatFromAmount(Number(p.amount)), 0)

      const totalExpenses = (expensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0)
      const expenseVat    = (expensesRes.data ?? []).reduce((s, e) => s + Number(e.vat_amount || 0), 0)

      const profit          = totalIncome - totalExpenses
      const profitMarginPct = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : 0

      const stats = {
        income: totalIncome,
        expenses: totalExpenses,
        profit,
        vatBalance: incomeVat - expenseVat,
        transactionCount,
        avgTicket,
        profitMarginPct,
      }

      // ── Payment method breakdown ───────────────────────────
      const methodMap = {}
      ;[...(payMethodRes.data ?? []), ...(manualMethodRes.data ?? [])].forEach(row => {
        const k = row.payment_method || 'cash'
        methodMap[k] = (methodMap[k] ?? 0) + Number(row.amount)
      })
      const methodTotal = Object.values(methodMap).reduce((s, v) => s + v, 0) || 1
      const paymentBreakdown = Object.entries(methodMap)
        .map(([method, amount]) => ({
          method,
          label: METHOD_LABELS[method] ?? method,
          amount,
          pct: Math.round((amount / methodTotal) * 100),
        }))
        .sort((a, b) => b.amount - a.amount)

      // ── Top services by revenue ────────────────────────────
      const svcMap = {}
      ;(manualSvcRes.data ?? []).forEach(row => {
        const name = row.services?.name
        if (!name) return
        if (!svcMap[name]) svcMap[name] = { name, revenue: 0, count: 0 }
        svcMap[name].revenue += Number(row.amount)
        svcMap[name].count   += 1
      })
      ;(apptSvcRes.data ?? []).forEach(row => {
        const name = row.services?.name
        if (!name) return
        if (!svcMap[name]) svcMap[name] = { name, revenue: 0, count: 0 }
        svcMap[name].revenue += Number(row.services?.price ?? 0)
        svcMap[name].count   += 1
      })
      const topServices = Object.values(svcMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)

      // ── Last 6 months ──────────────────────────────────────
      const months = []
      for (let i = 5; i >= 0; i--) {
        const m     = subMonths(now, i)
        const start = format(startOfMonth(m), 'yyyy-MM-dd')
        const end   = format(endOfMonth(m),   'yyyy-MM-dd')
        months.push({ month: format(m, 'MM/yy'), start, end })
      }

      const monthly = await Promise.all(months.map(async ({ month, start, end }) => {
        const [p, mi, e] = await Promise.all([
          applyBranch(supabase.from('payments').select('amount').eq('status', 'paid')
            .gte('created_at', start).lte('created_at', end + 'T23:59:59')),
          applyBranch(supabase.from('manual_income').select('amount')
            .gte('date', start).lte('date', end)),
          applyBranch(supabase.from('expenses').select('amount')
            .gte('date', start).lte('date', end)),
        ])
        const inc = (p.data ?? []).reduce((s, x) => s + Number(x.amount), 0)
                  + (mi.data ?? []).reduce((s, x) => s + Number(x.amount), 0)
        const exp = (e.data ?? []).reduce((s, x) => s + Number(x.amount), 0)
        return { month, income: inc, expenses: exp }
      }))

      // MoM growth — compare current month (monthly[5]) to previous (monthly[4])
      const curIncome  = monthly[5]?.income  ?? 0
      const prevIncome = monthly[4]?.income  ?? 0
      stats.momGrowthPct = prevIncome > 0
        ? Math.round(((curIncome - prevIncome) / prevIncome) * 100)
        : 0

      // ── Recent activity feed (last 10 items) ───────────────
      const [rPay, rManual, rExp] = await Promise.all([
        applyBranch(supabase.from('payments')
          .select('id, amount, status, created_at, appointments(profiles(name), services(name))')
          .eq('status', 'paid')
          .order('created_at', { ascending: false }).limit(5)),
        applyBranch(supabase.from('manual_income')
          .select('id, description, amount, date, created_at')
          .order('created_at', { ascending: false }).limit(5)),
        applyBranch(supabase.from('expenses')
          .select('id, vendor_name, amount, date, created_at, expense_categories(name, icon)')
          .order('created_at', { ascending: false }).limit(5)),
      ])

      const recent = [
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

      return { stats, monthly, recent, paymentBreakdown, topServices }
    },
  })

  return {
    stats:            query.data?.stats            ?? null,
    monthly:          query.data?.monthly          ?? [],
    recent:           query.data?.recent           ?? [],
    paymentBreakdown: query.data?.paymentBreakdown ?? [],
    topServices:      query.data?.topServices      ?? [],
    loading:          query.isLoading,
    refetch:          query.refetch,
  }
}
