// frontend/src/components/chat/SOAPCard.jsx
import { motion } from 'framer-motion';
import { ClipboardList } from 'lucide-react';
import { Badge } from '../ui/Badge.jsx';

const SOAP_SECTIONS = [
  { key: 'subjective',  label: 'Subjective',  color: 'text-brand-blue' },
  { key: 'objective',   label: 'Objective',   color: 'text-brand-teal' },
  { key: 'assessment',  label: 'Assessment',  color: 'text-brand-amber' },
  { key: 'plan',        label: 'Plan',        color: 'text-brand-green' },
];

export function SOAPCard({ data }) {
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
          <ClipboardList size={14} className="text-accent-light" />
          <span className="text-xs font-semibold text-accent-light uppercase tracking-wider">SOAP Note</span>
        </div>
        <div className="flex gap-2">
          {data.repaired && <Badge variant="warning">Repaired</Badge>}
          {data.valid    && <Badge variant="success">Valid</Badge>}
        </div>
      </div>

      {/* SOAP sections */}
      {SOAP_SECTIONS.map(({ key, label, color }) => (
        data[key] && (
          <div key={key} className="soap-field">
            <span className={`soap-label ${color}`}>{label}</span>
            <p className="soap-value">{data[key]}</p>
          </div>
        )
      ))}

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
