import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Navbar } from './components/layout/Navbar.jsx';
import { useHealth } from './hooks/useHealth.js';
import ChatPage from './pages/ChatPage.jsx';
import PatientsPage from './pages/PatientsPage.jsx';
import MedicinesPage from './pages/MedicinesPage.jsx';
import InstrumentsPage from './pages/InstrumentsPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import { AboutPage, FAQsPage, HomePage, HowItWorksPage } from './pages/MarketingPages.jsx';

const WORKSPACE_PATHS = ['/assistant', '/patients', '/medicines', '/instruments', '/inventory'];
const TITLES = { '/': 'MediNexa — Hospital intelligence', '/how-it-works': 'How it works — MediNexa', '/about': 'About MediNexa', '/faqs': 'FAQs — MediNexa', '/assistant': 'Assistant — MediNexa', '/patients': 'Patients — MediNexa', '/medicines': 'Medicines — MediNexa', '/instruments': 'Instruments — MediNexa', '/inventory': 'Inventory — MediNexa' };

function TitleTracker() {
  const { pathname } = useLocation();
  useEffect(() => { document.title = TITLES[pathname] || (pathname.startsWith('/chat/') ? 'Assistant — MediNexa' : 'MediNexa'); }, [pathname]);
  return null;
}

function DBOfflineBanner({ health }) {
  const [dismissed, setDismissed] = useState(false);
  const offline = !health.loading && health.db?.ok === false;
  if (!offline || dismissed) return null;
  return <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden shrink-0 z-10"><div className="flex items-center gap-2 px-4 py-2 bg-brand-red/10 border-b border-brand-red/30 text-xs text-brand-red"><AlertTriangle size={13} /><span>PostgreSQL is offline. Chat history and session management unavailable.</span><button onClick={() => setDismissed(true)} className="ml-auto opacity-70 hover:opacity-100 text-xs underline">Dismiss</button></div></motion.div>;
}

function WorkspaceLayout({ theme, onThemeToggle }) {
  const health = useHealth(30_000);
  return (
    <div className={`medinexa ${theme} flex flex-col h-screen overflow-hidden relative`}>
      <Navbar theme={theme} onThemeToggle={onThemeToggle} />
      <DBOfflineBanner health={health} />
      <div className="flex-1 min-h-0 flex overflow-hidden relative z-0">
        <Routes>
          <Route path="/assistant" element={<ChatPage />} />
          <Route path="/chat/:chatId" element={<ChatPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/medicines" element={<MedicinesPage />} />
          <Route path="/instruments" element={<InstrumentsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
        </Routes>
      </div>
    </div>
  );
}

function MarketingLayout({ theme, onThemeToggle }) {
  return <div className={`medinexa ${theme}`}><Navbar theme={theme} onThemeToggle={onThemeToggle} /><Routes><Route path="/" element={<Page><HomePage /></Page>} /><Route path="/how-it-works" element={<Page><HowItWorksPage /></Page>} /><Route path="/about" element={<Page><AboutPage /></Page>} /><Route path="/faqs" element={<Page><FAQsPage /></Page>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></div>;
}
function Page({ children }) { return <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .25 }}>{children}</motion.main>; }

function AppShell() {
  const { pathname } = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('medinexa-theme') || 'dark');
  useEffect(() => localStorage.setItem('medinexa-theme', theme), [theme]);
  const workspace = WORKSPACE_PATHS.includes(pathname) || pathname.startsWith('/chat/');
  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark');
  return workspace ? <WorkspaceLayout theme={theme} onThemeToggle={toggleTheme} /> : <MarketingLayout theme={theme} onThemeToggle={toggleTheme} />;
}

export default function App() {
  return <BrowserRouter><TitleTracker /><AppShell /><Toaster position="bottom-right" toastOptions={{ style: { background: '#13131f', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9' } }} /></BrowserRouter>;
}
