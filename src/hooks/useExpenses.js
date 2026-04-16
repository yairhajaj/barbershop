import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useExpenses({ startDate, endDate, categoryId } = {}) {
  const [expenses, setExpenses]       = useState([])
  const [categories, setCategories]   = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => { fetchExpenses() }, [startDate, endDate, categoryId])
  useEffect(() => { fetchCategories() }, [])

  async function fetchExpenses() {
    setLoading(true)
    let query = supabase
      .from('expenses')
      .select('*, expense_categories(id, name, icon)')
      .order('date', { ascending: false })

    if (startDate) query = query.gte('date', startDate)
    if (endDate)   query = query.lte('date', endDate)
    if (categoryId) query = query.eq('category_id', categoryId)

    const { data, error } = await query
    if (!error) setExpenses(data ?? [])
    setLoading(false)
  }

  async function fetchCategories() {
    const { data } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
    setCategories(data ?? [])
  }

  async function createExpense(expense) {
    const { data, error } = await supabase.from('expenses').insert(expense).select().single()
    if (error) throw error
    await fetchExpenses()
    return data
  }

  async function updateExpense(id, updates) {
    const { error } = await supabase.from('expenses').update(updates).eq('id', id)
    if (error) throw error
    await fetchExpenses()
  }

  async function deleteExpense(id) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw error
    await fetchExpenses()
  }

  // Category management
  async function createCategory(cat) {
    const { data, error } = await supabase.from('expense_categories').insert(cat).select().single()
    if (error) throw error
    await fetchCategories()
    return data
  }

  async function updateCategory(id, updates) {
    const { error } = await supabase.from('expense_categories').update(updates).eq('id', id)
    if (error) throw error
    await fetchCategories()
  }

  return {
    expenses, categories, loading,
    refetch: fetchExpenses, refetchCategories: fetchCategories,
    createExpense, updateExpense, deleteExpense,
    createCategory, updateCategory,
  }
}
