// frontend/src/App.jsx
// Account 5: page title tracking, DB offline banner, Navbar hamburger wiring.
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Navbar } from './components/layout/Navbar.jsx';
import { useHealth } from './hooks/useHealth.js';
import ChatPage        from './pages/ChatPage.jsx';
import PatientsPage    from './pages/PatientsPage.jsx';
import MedicinesPage   from './pages/MedicinesPage.jsx';
import InstrumentsPage from './pages/InstrumentsPage.jsx';
import InventoryPage   from './pages/InventoryPage.jsx';

// ── Page title updater ─────────────────────────────────────────────────────
const PAGE_TITLES = {
  '/':            'Chat',
  '/patients':    'Patients',
  '/medicines':   'Medicines',
  '/instruments': 'Instruments',
  '/inventory':   'Inventory',
};

function TitleTracker() {
  const location = useLocation();
  useEffect(() => {
    const key = Object.keys(PAGE_TITLES).find(k =>
      k === '/' ? location.pathname === '/' || location.pathname.startsWith('/chat/')
                : location.pathname.startsWith(k)
    );
    document.title = `${PAGE_TITLES[key] ?? 'HospitalRAG'} — HospitalRAG`;
  }, [location.pathname]);
  return null;
}

// ── DB offline banner ──────────────────────────────────────────────────────
function DBOfflineBanner({ health }) {
  const [dismissed, setDismissed] = useState(false);
  const offline = !health.loading && health.db?.ok === false;

  // toast once when Ollama goes offline
  const [ollamaWasOk, setOllamaWasOk] = useState(null);
  useEffect(() => {
    if (health.loading) return;
    const ollamaOk = health.ollama?.ok ?? false;
    if (ollamaWasOk === true && !ollamaOk) {
      toast.warning('Ollama went offline. Responses will use fallback mode.', { duration: 6000 });
    }
    setOllamaWasOk(ollamaOk);
  }, [health.ollama?.ok, health.loading]);

  if (!offline || dismissed) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden shrink-0 z-10"
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-brand-red/10 border-b border-brand-red/30 text-xs text-brand-red">
        <AlertTriangle size={13} />
        <span>PostgreSQL is offline. Chat history and session management unavailable.</span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto opacity-70 hover:opacity-100 text-xs underline"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}

// ── App layout ─────────────────────────────────────────────────────────────
function AppLayout({ children }) {
  const health = useHealth(30_000);
  // ChatPage manages its own mobile sidebar; we pass a noop for KB pages
  // The hamburger in Navbar dispatches a custom event that ChatPage listens to.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      <Navbar onMobileMenuToggle={() => setMobileSidebarOpen(o => !o)} />
      <DBOfflineBanner health={health} />
      <div className="flex-1 flex overflow-hidden relative z-0">
        {/* Pass mobileSidebarOpen to children via context would be ideal;
            for now ChatPage manages its own state via its own hamburger button */}
        {children}
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <TitleTracker />
      <AppLayout>
        <Routes>
          <Route path="/"             element={<ChatPage />} />
          <Route path="/chat/:chatId" element={<ChatPage />} />
          <Route path="/patients"     element={<PatientsPage />} />
          <Route path="/medicines"    element={<MedicinesPage />} />
          <Route path="/instruments"  element={<InstrumentsPage />} />
          <Route path="/inventory"    element={<InventoryPage />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#13131f',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#f1f5f9',
          },
        }}
      />
    </BrowserRouter>
  );
}
