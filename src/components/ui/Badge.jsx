const STATUS_MAP = {
  confirmed:          { label: 'מאושר',     cls: 'badge-confirmed' },
  cancelled:          { label: 'בוטל',      cls: 'badge-cancelled' },
  completed:          { label: 'הושלם',     cls: 'badge-completed' },
  pending_reschedule: { label: 'ממתין להעברה', cls: 'badge-pending' },
}

export function StatusBadge({ status }) {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: '' }
  return <span className={`badge ${cls}`}>{label}</span>
}

export function Badge({ children, className = '' }) {
  return <span className={`badge ${className}`}>{children}</span>
}
