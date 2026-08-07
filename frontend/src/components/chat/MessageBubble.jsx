// frontend/src/components/chat/MessageBubble.jsx
// Account 5: added retrieval metadata panel, no-result style, source rendering from real API shape.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, ChevronDown, ChevronUp, SearchX } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils.js';
import { SOAPCard } from './SOAPCard.jsx';
import { DomainCard } from './DomainCard.jsx';

export function MessageBubble({ message }) {
  const isUser   = message.role === 'user';
  const noResult = !isUser && message.retrieval?.noResults === true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('flex gap-3 mb-6', isUser ? 'justify-end' : 'justify-start')}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className={cn(
          'w-8 h-8 rounded-full border flex items-center justify-center shrink-0 mt-1',
          noResult
            ? 'bg-brand-amber/10 border-brand-amber/30'
            : 'bg-accent/20 border-accent/40'
        )}>
          {noResult
            ? <SearchX size={14} className="text-brand-amber" />
            : <Bot size={15} className="text-accent-light" />
          }
        </div>
      )}

      <div className={cn('max-w-[80%] space-y-2', isUser && 'items-end flex flex-col')}>
        {/* Timestamp */}
        <span className="text-xs text-txt-faint px-1">
          {isUser ? 'You' : 'Hospital AI'} · {formatDate(message.created_at)}
        </span>

        {/* User bubble */}
        {isUser && (
          <div className="bg-accent/25 border border-accent/40 rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-txt-primary leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        )}

        {/* Assistant bubble */}
        {!isUser && (
          <>
            {/* Raw text bubble — hidden when a structured card is available.
                Only shown as fallback (no-result, Ollama offline, format failed). */}
            {!message.formatted?.type && (
              <div className={cn(
                'rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
                noResult
                  ? 'bg-brand-amber/5 border border-brand-amber/25 text-txt-muted'
                  : 'glass text-txt-primary'
              )}>
                {message.content}
              </div>
            )}

            {/* Structured SOAP / domain card — rendered instead of raw text */}
            {message.formatted?.type && <StructuredResponse formatted={message.formatted} />}

            {/* Source chips — from DB sources_json or live response */}
            <SourceChips message={message} />

            {/* Retrieval metadata — collapsible */}
            {message.retrieval && <RetrievalDetails retrieval={message.retrieval} />}
          </>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-brand-blue/20 border border-brand-blue/40 flex items-center justify-center shrink-0 mt-1">
          <User size={15} className="text-brand-blue" />
        </div>
      )}
    </motion.div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StructuredResponse({ formatted }) {
  if (!formatted?.type) return null;
  if (formatted.type === 'soap') return <SOAPCard data={formatted} />;
  return <DomainCard data={formatted} />;
}

function SourceChips({ message }) {
  // Sources may come from live response (message.sources_json.ids) or DB storage
  const ids =
    message.sources_json?.ids ??
    (Array.isArray(message.sources_json) ? message.sources_json : null);

  if (!ids?.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {ids.map(id => (
        <span
          key={id}
          className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-txt-faint font-mono"
        >
          {id}
        </span>
      ))}
    </div>
  );
}

function RetrievalDetails({ retrieval }) {
  const [open, setOpen] = useState(false);

  const items = [
    retrieval.category     && `Category: ${retrieval.category}`,
    retrieval.resultCount != null && `Records matched: ${retrieval.resultCount}`,
    retrieval.noResults    && 'No records found',
    retrieval.tokens?.length && `Query tokens: ${retrieval.tokens.join(', ')}`,
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div className="px-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-txt-faint/60 hover:text-txt-faint transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        Retrieval details
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <ul className="mt-1.5 space-y-0.5 text-xs text-txt-faint/70 font-mono">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="opacity-40 shrink-0">›</span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex gap-3 mb-6"
    >
      <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0">
        <Bot size={15} className="text-accent-light" />
      </div>
      <div className="glass rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    </motion.div>
  );
}
