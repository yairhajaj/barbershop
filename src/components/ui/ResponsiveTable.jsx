/**
 * ResponsiveTable — renders a <table> on desktop, card list on mobile.
 *
 * Fixes audit finding P1-2: tables with overflow-x-auto inside a vertical
 * scroll cause "double scroll" on iOS and unreadable 60px columns at 360px.
 *
 * API:
 *   <ResponsiveTable
 *     columns={[{ key, label, render? }]}
 *     rows={[...]}
 *     mobileRowRender={(row) => <ReactNode>}   // optional custom card
 *     getRowId={(row) => row.id}                // optional, falls back to row.id
 *     onRowClick={(row) => void}                // optional
 *     emptyState={<ReactNode>}                  // shown when rows is empty
 *   />
 *
 * Column shape:
 *   { key: string, label: string, render?: (row) => ReactNode }
 *   If render is omitted the value at row[key] is displayed as-is.
 *
 * mobileRowRender:
 *   If omitted a default card is rendered: one `label: value` row per column.
 *   Supply your own for richer mobile UX (e.g. avatar + two-line layout).
 */

import { useMediaQuery } from '../../hooks/useMediaQuery'

export function ResponsiveTable({
  columns = [],
  rows = [],
  mobileRowRender,
  getRowId,
  onRowClick,
  emptyState = null,
}) {
  const isMobile = useMediaQuery('(max-width: 640px)')

  const rowId = (row) => (getRowId ? getRowId(row) : (row.id ?? JSON.stringify(row)))

  /* ── Empty state ─────────────────────────────────────────────────── */
  if (!rows.length) return <>{emptyState}</>

  /* ── Mobile: card list ───────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={rowId(row)}
            className="card p-3"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={onRowClick ? { cursor: 'pointer' } : undefined}
          >
            {mobileRowRender ? (
              mobileRowRender(row)
            ) : (
              <DefaultCard columns={columns} row={row} />
            )}
          </div>
        ))}
      </div>
    )
  }

  /* ── Desktop: regular table ──────────────────────────────────────── */
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-right py-2.5 px-3 font-semibold text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowId(row)}
              className={`border-b border-gray-100 transition-colors ${
                onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
              }`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className="py-2.5 px-3 align-middle">
                  {col.render ? col.render(row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Default mobile card: label / value list ─────────────────────── */
function DefaultCard({ columns, row }) {
  return (
    <dl className="flex flex-col gap-1.5">
      {columns.map((col) => (
        <div key={col.key} className="flex justify-between items-start gap-2 text-sm">
          <dt className="text-gray-500 flex-shrink-0">{col.label}</dt>
          <dd className="font-medium text-left">
            {col.render ? col.render(row) : (row[col.key] ?? '—')}
          </dd>
        </div>
      ))}
    </dl>
  )
}
