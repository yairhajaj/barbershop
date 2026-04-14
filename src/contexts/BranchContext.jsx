import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const BranchContext = createContext(null)

export function BranchProvider({ children }) {
  const [branches, setBranches] = useState([])
  const [currentBranch, setCurrentBranch] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_branch')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    loadBranches()
  }, [])

  async function loadBranches() {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name')

    const list = data ?? []
    setBranches(list)

    // Auto-select first branch if nothing is saved or saved branch no longer exists
    if (list.length > 0) {
      const stillValid = list.find(b => b.id === currentBranch?.id)
      if (!stillValid) {
        selectBranch(list[0])
      }
    }
  }

  function selectBranch(branch) {
    setCurrentBranch(branch)
    localStorage.setItem('admin_branch', JSON.stringify(branch))
  }

  return (
    <BranchContext.Provider value={{ branches, currentBranch, selectBranch, reload: loadBranches }}>
      {children}
    </BranchContext.Provider>
  )
}

export function useBranch() {
  return useContext(BranchContext)
}
