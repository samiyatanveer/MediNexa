// frontend/src/components/ui/Skeleton.jsx
import { cn } from '../../lib/utils.js';

export function Skeleton({ className }) {
  return (
    <div
      className={cn(
        'bg-white/5 rounded animate-pulse',
        className
      )}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

export function SkeletonMessage({ role = 'assistant' }) {
  return (
    <div className={cn('flex gap-3', role === 'user' ? 'justify-end' : 'justify-start')}>
      {role === 'assistant' && <Skeleton className="w-8 h-8 rounded-full shrink-0" />}
      <div className="space-y-2 max-w-xs">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}
