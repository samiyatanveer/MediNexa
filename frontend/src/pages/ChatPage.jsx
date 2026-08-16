// frontend/src/pages/ChatPage.jsx
// Account 5: Full backend integration — history restore, real sendMessage, SOAP/domain cards,
//            Ollama fallback, no-result, auto-resize, mobile sidebar drawer.
import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, Sparkles, Menu, X, AlertTriangle, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils.js';
import { sendMessage, getMessages } from '../services/api.js';
import { useChats } from '../hooks/useChats.js';
import { ChatSidebar } from '../components/chat/ChatSidebar.jsx';
import { MessageBubble, TypingIndicator } from '../components/chat/MessageBubble.jsx';
import { CategorySelector } from '../components/chat/CategorySelector.jsx';

const EXAMPLE_QUERIES = [
  { text: 'Patient with hypertension and chest pain',   category: 'patient' },
  { text: 'Lisinopril dosage and contraindications',    category: 'medicine' },
  { text: 'MRI machine maintenance and calibration',    category: 'instrument' },
  { text: 'PPE gloves stock level and reorder',         category: 'inventory' },
];

export default function ChatPage() {
  const { chatId } = useParams();
  const navigate   = useNavigate();
  const chats      = useChats();

  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState('');
  const [category,     setCategory]     = useState('auto');
  const [sending,      setSending]      = useState(false);
  const [loadingHist,  setLoadingHist]  = useState(false);
  const [loadingMsg,   setLoadingMsg]   = useState(false);
  const [ollamaWarn,   setOllamaWarn]   = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // ── Auto-scroll on new messages ──────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingMsg]);

  // ── Focus input when session changes ────────────────────────────────────
  useEffect(() => { inputRef.current?.focus(); }, [chatId]);

  // ── History restore on chatId change ────────────────────────────────────
  useEffect(() => {
    if (!chatId) { setMessages([]); return; }

    let cancelled = false;
    setMessages([]);
    setLoadingHist(true);

    getMessages(chatId)
      .then(data => {
        if (cancelled) return;
        // Reattach formatted from retrieval_metadata for existing messages
        const msgs = (data.messages ?? []).map(m => {
          // sources_json may be stored as a string in older rows
          let sj = m.sources_json;
          if (typeof sj === 'string') {
            try { sj = JSON.parse(sj); } catch { sj = null; }
          }
          return { ...m, sources_json: sj };
        });
        setMessages(msgs);
      })
      .catch(err => {
        if (cancelled) return;
        // Silently ignore 404 (brand-new chat, no messages yet)
        if (err.status !== 404) toast.error(`Failed to load history: ${err.message}`);
      })
      .finally(() => { if (!cancelled) setLoadingHist(false); });

    return () => { cancelled = true; };
  }, [chatId]);

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    // Create session if none active
    let activeChatId = chatId;
    if (!activeChatId) {
      const session = await chats.createChat(text);
      if (!session) return; // error toasted inside hook
      activeChatId = session.id;
      navigate(`/chat/${session.id}`, { replace: false });
    }

    // Optimistic user bubble
    const tempId = `temp-${Date.now()}`;
    const tempUser = {
      id:         tempId,
      role:       'user',
      content:    text,
      created_at: new Date().toISOString(),
    };

    setInput('');
    // Reset textarea height
    if (inputRef.current) { inputRef.current.style.height = 'auto'; }
    setSending(true);
    setLoadingMsg(true);
    setOllamaWarn(false);
    setMessages(prev => [...prev, tempUser]);

    try {
      const data = await sendMessage(activeChatId, text, category);
      // data = { userMessage, assistantMessage, formatted, retrieval, ollamaAvailable }

      setMessages(prev => [
        ...prev.filter(m => m.id !== tempId),  // replace optimistic
        data.userMessage,
        {
          ...data.assistantMessage,
          formatted:    data.formatted   ?? null,
          retrieval:    data.retrieval   ?? null,
          ollamaAvailable: data.ollamaAvailable ?? true,
        },
      ]);

      // Warn if Ollama was unavailable (fallback response shown)
      if (data.ollamaAvailable === false) {
        setOllamaWarn(true);
        toast.warning('Ollama is offline — showing retrieval-only response', { duration: 5000 });
      }

      // Refresh sidebar titles after first message
      if (chats.sessions.find(s => s.id === activeChatId)?.title === 'New Chat') {
        chats.reload();
      }
    } catch (err) {
      // Remove optimistic bubble on error
      setMessages(prev => prev.filter(m => m.id !== tempId));

      if (err.status === 503) {
        toast.error('Backend unavailable. Is the server running?', { duration: 8000 });
      } else if (err.status === 404) {
        toast.error('Chat session not found. It may have been deleted.');
        navigate('/assistant');
      } else {
        toast.error(`Send failed: ${err.message}`);
      }
    } finally {
      setSending(false);
      setLoadingMsg(false);
    }
  }, [input, sending, chatId, category, chats, navigate]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExampleQuery = ({ text: exText, category: exCat }) => {
    setCategory(exCat);
    setInput(exText);
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 144)}px`;
    }
  };

  const isLoading = loadingHist || (loadingMsg && messages.length === 0);

  return (
    <div className="flex flex-1 min-w-0 w-full h-full relative z-0">

      {/* ── Mobile sidebar overlay ─────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-30 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              key="drawer"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed left-0 top-14 bottom-0 w-64 z-40 glass border-r border-white/8 lg:hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/8">
                <span className="text-sm font-medium text-txt-muted">Chats</span>
                <button onClick={() => setSidebarOpen(false)} className="btn-ghost p-1">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatSidebar
                  sessions={chats.sessions}
                  loading={chats.loading}
                  error={chats.error}
                  activeChatId={chatId}
                  onNew={async () => { const s = await chats.createChat(); setSidebarOpen(false); return s; }}
                  onRename={chats.renameChat}
                  onDelete={async (id) => { const ok = await chats.deleteChat(id); if (ok && id === chatId) navigate('/assistant'); setSidebarOpen(false); return ok; }}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Desktop sidebar ────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 glass border-r border-white/8 overflow-hidden flex-col hidden lg:flex">
        <ChatSidebar
          sessions={chats.sessions}
          loading={chats.loading}
          error={chats.error}
          activeChatId={chatId}
          onNew={chats.createChat}
          onRename={chats.renameChat}
          onDelete={async (id) => {
            const ok = await chats.deleteChat(id);
            if (ok && id === chatId) navigate('/assistant');
            return ok;
          }}
        />
      </aside>

      {/* ── Main chat area ──────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 w-full flex flex-col">

        {/* Mobile header bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/8 lg:hidden shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn-ghost p-1.5"
            aria-label="Open chat list"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-medium text-txt-muted truncate">
            {chatId
              ? (chats.sessions.find(s => s.id === chatId)?.title ?? 'Chat')
              : 'New Chat'}
          </span>
        </div>

        {/* Ollama offline banner */}
        <AnimatePresence>
          {ollamaWarn && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden shrink-0"
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-brand-amber/10 border-b border-brand-amber/30 text-xs text-brand-amber">
                <AlertTriangle size={13} />
                <span>Ollama is offline. Response generated from retrieval only.</span>
                <button
                  onClick={() => setOllamaWarn(false)}
                  className="ml-auto opacity-70 hover:opacity-100"
                  aria-label="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages scroll area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {isLoading ? (
            <LoadingHistory />
          ) : messages.length === 0 ? (
            <ChatEmptyState onExample={handleExampleQuery} />
          ) : (
            <div className="w-full">
              <AnimatePresence initial={false}>
                {messages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {loadingMsg && <TypingIndicator key="typing" />}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 md:px-8 py-4 border-t border-white/8 glass-strong shrink-0">
          <div className="w-full space-y-3">
            <CategorySelector value={category} onChange={setCategory} />
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKey}
                  placeholder="Ask about patients, medicines, instruments, or inventory…"
                  rows={1}
                  style={{ resize: 'none', overflow: 'hidden' }}
                  className={cn(
                    'input-base py-3 pr-4 min-h-[48px] max-h-36 leading-relaxed',
                    'rounded-2xl text-sm'
                  )}
                  aria-label="Chat input"
                  disabled={sending || loadingHist}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending || loadingHist}
                className={cn(
                  'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                  'bg-accent hover:bg-accent-light transition-all duration-200',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'focus:outline-none focus:ring-2 focus:ring-accent/50',
                  input.trim() && !sending && 'shadow-glow'
                )}
                aria-label="Send message"
              >
                {sending
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Send size={17} className="text-white" />
                }
              </button>
            </div>
            <p className="text-center text-xs text-txt-faint">
              Press <kbd className="px-1 py-0.5 rounded bg-white/10 text-xs">Enter</kbd> to send ·{' '}
              <kbd className="px-1 py-0.5 rounded bg-white/10 text-xs">Shift+Enter</kbd> for newline
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function LoadingHistory() {
  return (
    <div className="w-full space-y-6 animate-fade-in">
      {[80, 55, 90, 40].map((w, i) => (
        <div key={i} className={cn('flex gap-3', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
          {i % 2 === 0 && <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse shrink-0" />}
          <div className={cn('space-y-2', i % 2 !== 0 && 'items-end flex flex-col')}>
            <div className="h-3 w-12 bg-white/5 rounded animate-pulse" />
            <div className={`h-12 bg-white/5 rounded-2xl animate-pulse`} style={{ width: `${w * 3}px` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatEmptyState({ onExample }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] px-4">
      <div className="w-16 h-16 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center mb-6 animate-pulse-glow">
        <Sparkles size={28} className="text-accent-light" />
      </div>
      <h2 className="text-2xl font-semibold text-txt-primary mb-2 text-center">
        Houston Memorial Hospital AI
      </h2>
      <p className="text-txt-muted text-center max-w-md text-sm leading-relaxed mb-8">
        Ask clinical questions about patients, medications, instruments, and inventory.
        All answers are retrieved from the hospital knowledge base.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {EXAMPLE_QUERIES.map((q, i) => (
          <button
            key={i}
            onClick={() => onExample(q)}
            className="glass border border-white/10 hover:border-accent/30 rounded-xl px-4 py-3 text-left text-sm text-txt-muted hover:text-txt-primary transition-all duration-200 hover:bg-accent/5"
          >
            <span className="block text-xs text-txt-faint mb-1">
              {q.category === 'patient' ? '🏥' : q.category === 'medicine' ? '💊' : q.category === 'instrument' ? '🔬' : '📦'}
              &nbsp;{q.category}
            </span>
            {q.text}
          </button>
        ))}
      </div>
    </div>
  );
}
