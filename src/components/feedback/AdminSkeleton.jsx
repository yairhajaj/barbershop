export function AdminSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      {/* Page header */}
      <div className="h-8 w-48 rounded-xl bg-gray-200 dark:bg-gray-700" />
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
      {/* Content rows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-gray-200 dark:bg-gray-700" />
      ))}
    </div>
  )
}
