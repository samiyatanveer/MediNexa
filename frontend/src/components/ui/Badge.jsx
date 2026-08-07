// frontend/src/components/ui/Badge.jsx
import { cn, categoryColor } from '../../lib/utils.js';

export function Badge({ children, variant = 'default', className }) {
  const variants = {
    default:    'bg-white/10 text-txt-muted border border-white/10',
    accent:     'bg-accent/15 text-accent-light border border-accent/30',
    success:    'bg-brand-green/10 text-brand-green border border-brand-green/30',
    warning:    'bg-brand-amber/10 text-brand-amber border border-brand-amber/30',
    danger:     'bg-brand-red/10 text-brand-red border border-brand-red/30',
    blue:       'bg-brand-blue/10 text-brand-blue border border-brand-blue/30',
  };
  return (
    <span className={cn('badge', variants[variant] ?? variants.default, className)}>
      {children}
    </span>
  );
}

export function CategoryBadge({ category }) {
  return (
    <span className={cn('badge border', categoryColor(category))}>
      {category}
    </span>
  );
}
