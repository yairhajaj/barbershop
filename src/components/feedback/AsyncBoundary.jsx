import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { PageSpinner } from '../ui/Spinner'

function FallbackError({ error, resetErrorBoundary }) {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-4xl">⚠️</div>
      <p className="text-muted text-sm max-w-xs">{error?.message || 'משהו השתבש. נסה שוב.'}</p>
      <button onClick={resetErrorBoundary} className="btn-primary text-sm px-5 py-2">
        נסה שוב
      </button>
    </div>
  )
}

export function AsyncBoundary({ children, fallback, FallbackComponent }) {
  return (
    <ErrorBoundary FallbackComponent={FallbackComponent ?? FallbackError}>
      <Suspense fallback={fallback ?? <PageSpinner />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}
