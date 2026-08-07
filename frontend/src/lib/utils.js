// frontend/src/lib/utils.js
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000)  return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return d.toLocaleDateString();
}

export function truncate(str, max = 40) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function categoryColor(category) {
  const map = {
    patient:    'text-brand-blue   bg-brand-blue/10   border-brand-blue/30',
    medicine:   'text-brand-teal   bg-brand-teal/10   border-brand-teal/30',
    instrument: 'text-brand-amber  bg-brand-amber/10  border-brand-amber/30',
    inventory:  'text-brand-green  bg-brand-green/10  border-brand-green/30',
  };
  return map[category] ?? 'text-txt-muted bg-white/5 border-white/10';
}

export function categoryIcon(category) {
  const map = {
    patient:    '🏥',
    medicine:   '💊',
    instrument: '🔬',
    inventory:  '📦',
  };
  return map[category] ?? '📋';
}

export function statusColor(status) {
  const s = status?.toLowerCase() ?? '';
  if (s.includes('operational') || s.includes('in stock') || s.includes('ok')) return 'bg-brand-green';
  if (s.includes('low') || s.includes('pending') || s.includes('maintenance')) return 'bg-brand-amber';
  if (s.includes('out') || s.includes('unavailable') || s.includes('fail')) return 'bg-brand-red';
  return 'bg-txt-faint';
}
