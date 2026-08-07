// frontend/src/components/chat/ChatSidebar.jsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquare, Pencil, Trash2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { cn, formatDate, truncate } from '../../lib/utils.js';
import { Skeleton } from '../ui/Skeleton.jsx';

export function ChatSidebar({ sessions, loading, error, onNew, onRename, onDelete, activeChatId }) {
  const navigate = useNavigate();

  const handleNew = async () => {
    const session = await onNew();
    if (session) navigate(`/chat/${session.id}`);
  };

  // Group sessions by time
  const groups = groupSessions(sessions);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/8">
        <button
          onClick={handleNew}
          className="w-full flex items-center justify-center gap-2 btn-primary py-2.5 text-sm"
          aria-label="New chat"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 space-y-4 px-2">
        {loading && (
          <div className="space-y-2 px-2">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        )}

        {!loading && error && (
          <div className="px-3 py-4 text-center">
            <AlertCircle size={20} className="mx-auto mb-2 text-txt-faint" />
            <p className="text-xs text-txt-faint">Backend offline</p>
            <p className="text-xs text-txt-faint/70 mt-1">Start the server to load chats</p>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="px-3 py-8 text-center">
            <MessageSquare size={24} className="mx-auto mb-2 text-txt-faint opacity-50" />
            <p className="text-xs text-txt-faint">No chats yet</p>
            <p className="text-xs text-txt-faint/60 mt-1">Click New Chat to start</p>
          </div>
        )}

        {!loading && groups.map(group => (
          <div key={group.label}>
            <p className="px-3 text-xs font-medium text-txt-faint/70 uppercase tracking-wider mb-1">
              {group.label}
            </p>
            <AnimatePresence initial={false}>
              {group.items.map(session => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeChatId}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionItem({ session, active, onRename, onDelete }) {
  const [editing, setEditing]   = useState(false);
  const [title,   setTitle]     = useState(session.title);
  const [confirm, setConfirm]   = useState(false);
  const [saving,  setSaving]    = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const submitRename = async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === session.title) { setEditing(false); setTitle(session.title); return; }
    setSaving(true);
    const ok = await onRename(session.id, trimmed);
    if (!ok) setTitle(session.title);
    setSaving(false);
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') submitRename();
    if (e.key === 'Escape') { setEditing(false); setTitle(session.title); }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className={cn(
          'group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150',
          active
            ? 'bg-accent/15 border border-accent/30 text-txt-primary'
            : 'hover:bg-white/5 text-txt-muted hover:text-txt-primary'
        )}
      >
        <MessageSquare size={14} className="shrink-0 opacity-60" />

        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={submitRename}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm outline-none border-b border-accent/50 text-txt-primary"
            disabled={saving}
          />
        ) : (
          <Link
            to={`/chat/${session.id}`}
            className="flex-1 text-sm truncate outline-none"
            title={session.title}
          >
            {truncate(session.title, 32)}
          </Link>
        )}

        {/* Action buttons — shown on hover */}
        {!editing && !confirm && (
          <div className="absolute right-2 hidden group-hover:flex items-center gap-1">
            <button
              onClick={e => { e.preventDefault(); setEditing(true); }}
              className="p-1 rounded hover:bg-white/10 text-txt-faint hover:text-txt-muted transition-colors"
              aria-label="Rename chat"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={e => { e.preventDefault(); setConfirm(true); }}
              className="p-1 rounded hover:bg-brand-red/20 text-txt-faint hover:text-brand-red transition-colors"
              aria-label="Delete chat"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}

        {/* Delete confirm */}
        {confirm && (
          <div className="absolute right-2 flex items-center gap-1">
            <button
              onClick={e => { e.preventDefault(); onDelete(session.id); }}
              className="p-1 rounded bg-brand-red/20 hover:bg-brand-red/40 text-brand-red transition-colors"
              aria-label="Confirm delete"
            >
              <Check size={11} />
            </button>
            <button
              onClick={e => { e.preventDefault(); setConfirm(false); }}
              className="p-1 rounded hover:bg-white/10 text-txt-faint transition-colors"
              aria-label="Cancel delete"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function groupSessions(sessions) {
  const now = Date.now();
  const DAY = 86400_000;
  const groups = { Today: [], 'This Week': [], Older: [] };

  for (const s of sessions) {
    const diff = now - new Date(s.updated_at).getTime();
    if (diff < DAY)       groups.Today.push(s);
    else if (diff < 7*DAY) groups['This Week'].push(s);
    else                   groups.Older.push(s);
  }

  return Object.entries(groups)
    .filter(([,items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
