import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { LangProvider } from './contexts/LangContext'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import { BranchProvider } from './contexts/BranchContext'
import { AppRouter } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

function RootError({ error, resetErrorBoundary }) {
  return (
    <div dir="rtl" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <p style={{ color: '#666', maxWidth: 320 }}>{error?.message || 'שגיאה בטעינת האפליקציה'}</p>
      <button onClick={resetErrorBoundary} style={{ padding: '8px 24px', borderRadius: 999, background: '#FF8500', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
        טען מחדש
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={RootError} onReset={() => window.location.reload()}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LangProvider>
            <AuthProvider>
              <ToastProvider>
                <BranchProvider>
                  <ConfirmProvider>
                    <AppRouter />
                  </ConfirmProvider>
                </BranchProvider>
              </ToastProvider>
            </AuthProvider>
          </LangProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
