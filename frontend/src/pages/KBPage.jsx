// frontend/src/pages/KBPage.jsx
// Generic KB browse/search page — used by all four category pages.
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn, categoryColor, categoryIcon, statusColor } from '../lib/utils.js';
import { browseKB, searchKB } from '../services/api.js';
import { KBSearchBar } from '../components/kb/KBSearchBar.jsx';
import { Badge, CategoryBadge } from '../components/ui/Badge.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';

export default function KBPage({ category, title, singularLabel, fields }) {
  const [records,    setRecords]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [query,      setQuery]      = useState('');
  const [isSearch,   setIsSearch]   = useState(false);

  const LIMIT = 12;

  const load = useCallback(async (q, p) => {
    setLoading(true);
    setError(null);
    try {
      if (q) {
        const data = await searchKB(category, q, LIMIT);
        setRecords(data.results?.map(r => r.record) ?? []);
        setTotal(data.count ?? 0);
        setTotalPages(1);
        setIsSearch(true);
      } else {
        const data = await browseKB(category, p, LIMIT);
        setRecords(data.records ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setIsSearch(false);
      }
    } catch (err) {
      setError(err.message);
      if (err.status !== 503) toast.error(`Failed to load ${title}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [category, title]);

  useEffect(() => { load(query, page); }, [load, query, page]);

  const handleSearch = (q) => {
    setQuery(q);
    setPage(1);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 relative z-0">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-txt-primary flex items-center gap-2">
              <span>{categoryIcon(category === 'inventory' ? 'inventory' : category.replace(/s$/, ''))}</span>
              {title}
            </h1>
            <p className="text-sm text-txt-muted mt-0.5">
              {isSearch ? `${total} result${total !== 1 ? 's' : ''}` : `${total} records total`}
            </p>
          </div>
          <KBSearchBar onSearch={handleSearch} placeholder={`Search ${title.toLowerCase()}…`} className="w-72" />
        </div>

        {/* Error */}
        {error && !loading && (
          <div className="card border-brand-red/30 text-center py-8">
            <p className="text-txt-muted mb-1">Could not load {title.toLowerCase()}</p>
            <p className="text-xs text-txt-faint">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(LIMIT)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && records.length === 0 && (
          <EmptyState
            icon={categoryIcon(category === 'inventory' ? 'inventory' : category.replace(/s$/, ''))}
            title={query ? `No results for "${query}"` : `No ${title.toLowerCase()} found`}
            description={query ? 'Try different search terms.' : 'The knowledge base appears empty.'}
          />
        )}

        {/* Record grid */}
        {!loading && records.length > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${query}-${page}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {records.map((rec, i) => (
                <RecordCard key={i} record={rec} fields={fields} category={category} singularLabel={singularLabel} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Pagination */}
        {!isSearch && totalPages > 1 && !loading && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-ghost flex items-center gap-1 disabled:opacity-30"
            >
              <ChevronLeft size={15} /> Prev
            </button>
            <span className="text-sm text-txt-muted">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn-ghost flex items-center gap-1 disabled:opacity-30"
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RecordCard({ record, fields, category, singularLabel }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="card cursor-pointer hover:border-white/20 transition-all duration-200"
      onClick={() => setExpanded(e => !e)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && setExpanded(ex => !ex)}
      aria-expanded={expanded}
    >
      {/* ID + category badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-xs font-mono text-txt-faint truncate">
          {fields.id ? record[fields.id] : '—'}
        </span>
        <CategoryBadge category={singularLabel} />
      </div>

      {/* Primary field */}
      {fields.primary && (
        <p className="text-sm font-semibold text-txt-primary mb-2 leading-snug">
          {String(record[fields.primary] ?? '—').slice(0, 80)}
        </p>
      )}

      {/* Key fields (always visible) */}
      <div className="space-y-1">
        {fields.preview?.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="text-txt-faint w-20 shrink-0">{label}</span>
            <span className="text-txt-muted truncate">
              {Array.isArray(record[key]) ? record[key].slice(0, 3).join(', ') : String(record[key] ?? '—').slice(0, 60)}
            </span>
          </div>
        ))}
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && fields.detail?.map(({ key, label }) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 pt-2 border-t border-white/8"
          >
            <span className="text-xs text-txt-faint">{label}: </span>
            <span className="text-xs text-txt-muted">
              {Array.isArray(record[key]) ? record[key].join(', ') : String(record[key] ?? '—')}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Status dot */}
      {fields.status && (
        <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-white/8">
          <span className={cn('status-dot', statusColor(record[fields.status]))} />
          <span className="text-xs text-txt-faint">{record[fields.status] ?? 'Unknown'}</span>
        </div>
      )}
    </motion.div>
  );
}
