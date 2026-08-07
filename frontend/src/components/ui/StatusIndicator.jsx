// frontend/src/components/ui/StatusIndicator.jsx
import { cn, statusColor } from '../../lib/utils.js';

export function StatusDot({ ok, loading, className }) {
  if (loading) return <span className={cn('status-dot bg-txt-faint animate-pulse', className)} />;
  return (
    <span
      className={cn(
        'status-dot',
        ok ? 'bg-brand-green' : 'bg-brand-red',
        ok && 'animate-pulse-glow',
        className
      )}
    />
  );
}

export function StatusBadge({ label, ok, loading }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-txt-muted">
      <StatusDot ok={ok} loading={loading} />
      <span>{label}</span>
    </div>
  );
}
