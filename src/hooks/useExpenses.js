import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useExpenses({ startDate, endDate, categoryId, branchId = null } = {}) {
  const qc = useQueryClient()

  const expensesQuery = useQuery({
    queryKey: ['expenses', { startDate, endDate, categoryId, branchId }],
    queryFn: async () => {
      let q = supabase
        .from('expenses')
        .select('*, expense_categories(id, name, icon)')
        .neq('is_cancelled', true)
        .order('date', { ascending: false })
      if (startDate)  q = q.gte('date', startDate)
      if (endDate)    q = q.lte('date', endDate)
      if (categoryId) q = q.eq('category_id', categoryId)
      if (branchId)   q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order')
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  const invalidateFinance = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] })
    qc.invalidateQueries({ queryKey: ['finance'] })
  }

  const createMut = useMutation({
    mutationFn: async (expense) => {
      const { data, error } = await supabase.from('expenses').insert(expense).select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidateFinance,
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { error } = await supabase.from('expenses').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateFinance,
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('expenses').update({
        is_cancelled: true,
        cancelled_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateFinance,
  })

  const createCatMut = useMutation({
    mutationFn: async (cat) => {
      const { data, error } = await supabase.from('expense_categories').insert(cat).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-categories'] }),
  })

  const updateCatMut = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { error } = await supabase.from('expense_categories').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-categories'] }),
  })

  return {
    expenses: expensesQuery.data ?? [],
    categories: categoriesQuery.data ?? [],
    loading: expensesQuery.isLoading,
    refetch: expensesQuery.refetch,
    refetchCategories: categoriesQuery.refetch,
    createExpense: createMut.mutateAsync,
    updateExpense: (id, updates) => updateMut.mutateAsync({ id, updates }),
    deleteExpense: deleteMut.mutateAsync,
    createCategory: createCatMut.mutateAsync,
    updateCategory: (id, updates) => updateCatMut.mutateAsync({ id, updates }),
  }
}
