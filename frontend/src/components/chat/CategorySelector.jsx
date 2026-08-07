// frontend/src/components/chat/CategorySelector.jsx
import { cn } from '../../lib/utils.js';

const CATEGORIES = [
  { value: 'auto',       label: 'Auto',       icon: '🔍' },
  { value: 'patient',    label: 'Patients',   icon: '🏥' },
  { value: 'medicine',   label: 'Medicines',  icon: '💊' },
  { value: 'instrument', label: 'Instruments',icon: '🔬' },
  { value: 'inventory',  label: 'Inventory',  icon: '📦' },
];

export function CategorySelector({ value, onChange, className }) {
  return (
    <div className={cn('flex items-center gap-1 p-1 glass rounded-lg border border-white/8', className)}>
      {CATEGORIES.map(cat => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          aria-pressed={value === cat.value}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
            value === cat.value
              ? 'bg-accent/30 text-accent-light border border-accent/40'
              : 'text-txt-faint hover:text-txt-muted hover:bg-white/5'
          )}
        >
          <span>{cat.icon}</span>
          <span className="hidden sm:inline">{cat.label}</span>
        </button>
      ))}
    </div>
  );
}
