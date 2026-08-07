// frontend/src/components/chat/DomainCard.jsx
import { motion } from 'framer-motion';
import { Pill, Wrench, Package } from 'lucide-react';
import { Badge } from '../ui/Badge.jsx';
import { cn } from '../../lib/utils.js';

const CONFIGS = {
  medicine: {
    icon: Pill,
    label: 'Medicine Record',
    color: 'text-brand-teal',
    fields: [
      { key: 'medicine',          label: 'Medicine' },
      { key: 'dosage',            label: 'Dosage' },
      { key: 'form',              label: 'Form' },
      { key: 'indications',       label: 'Indications' },
      { key: 'contraindications', label: 'Contraindications' },
      { key: 'stock',             label: 'Stock' },
      { key: 'batch',             label: 'Batch' },
    ],
  },
  instrument: {
    icon: Wrench,
    label: 'Instrument Record',
    color: 'text-brand-amber',
    fields: [
      { key: 'instrument',        label: 'Instrument' },
      { key: 'category',          label: 'Category' },
      { key: 'department',        label: 'Department' },
      { key: 'operationalStatus', label: 'Status' },
      { key: 'maintenance',       label: 'Maintenance' },
      { key: 'calibration',       label: 'Calibration' },
    ],
  },
  inventory: {
    icon: Package,
    label: 'Inventory Record',
    color: 'text-brand-green',
    fields: [
      { key: 'item',         label: 'Item' },
      { key: 'category',     label: 'Category' },
      { key: 'quantity',     label: 'Quantity' },
      { key: 'location',     label: 'Location' },
      { key: 'reorderLevel', label: 'Reorder Level' },
      { key: 'status',       label: 'Status' },
    ],
  },
};

export function DomainCard({ data }) {
  const cfg = CONFIGS[data.type];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="glass rounded-xl p-4 space-y-3 border border-white/8"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Icon size={14} className={cfg.color} />
          <span className={cn('text-xs font-semibold uppercase tracking-wider', cfg.color)}>
            {cfg.label}
          </span>
        </div>
        <div className="flex gap-2">
          {data.repaired && <Badge variant="warning">Repaired</Badge>}
          {data.valid    && <Badge variant="success">Valid</Badge>}
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-3">
        {cfg.fields.map(({ key, label }) =>
          data[key] ? (
            <div key={key}>
              <span className="soap-label text-txt-faint">{label}</span>
              <p className="soap-value text-xs">{data[key]}</p>
            </div>
          ) : null
        )}
      </div>

      {/* Sources */}
      {data.sources && (
        <div className="pt-2 border-t border-white/8">
          <span className="soap-label text-txt-faint">Sources</span>
          <p className="text-xs text-txt-faint font-mono">{data.sources}</p>
        </div>
      )}
    </motion.div>
  );
}
