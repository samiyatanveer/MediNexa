import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Activity, Menu, Moon, Sun, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { StatusBadge } from '../ui/StatusIndicator.jsx';
import { useHealth } from '../../hooks/useHealth.js';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/about', label: 'About assistant' },
  { to: '/faqs', label: 'FAQs' },
];

export function Navbar({ onMobileMenuToggle, theme = 'dark', onThemeToggle }) {
  const location = useLocation();
  const health = useHealth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAssistant = location.pathname === '/assistant' || location.pathname.startsWith('/chat/');
  const close = () => setMobileOpen(false);

  return (
    <header className="h-16 md:h-[72px] medinexa-nav flex items-center px-4 md:px-8 shrink-0 z-30 relative">
      <Link to="/" className="flex items-center gap-2.5 shrink-0" onClick={close}>
        <span className="medinexa-logo"><Activity size={17} strokeWidth={2.5} /></span>
        <span className="text-lg font-bold tracking-tight medinexa-wordmark">Medi<span>Nexa</span></span>
      </Link>

      <nav className="hidden lg:flex items-center gap-1 ml-7 xl:ml-12" aria-label="Main navigation">
        {LINKS.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('medinexa-link', isActive && 'active')}>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {isAssistant && <div className="hidden xl:flex items-center gap-3 mr-2"><StatusBadge label="Database" ok={health.db?.ok} loading={health.loading} /><StatusBadge label="AI" ok={health.ollama?.ok} loading={health.loading} /></div>}
        <button onClick={onThemeToggle} className="theme-toggle" aria-label="Toggle light and dark mode">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <Link to="/assistant" className="medinexa-assistant-btn hidden sm:inline-flex">Open Assistant</Link>
        <button onClick={() => setMobileOpen(v => !v)} className="lg:hidden theme-toggle" aria-expanded={mobileOpen} aria-label="Toggle navigation">
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="absolute top-full inset-x-0 p-4 medinexa-mobile-menu lg:hidden">
          {LINKS.map(({ to, label, end }) => <NavLink key={to} to={to} end={end} onClick={close} className={({ isActive }) => cn('medinexa-mobile-link', isActive && 'active')}>{label}</NavLink>)}
          <Link to="/assistant" onClick={close} className="medinexa-assistant-btn w-full justify-center mt-2">Open Assistant</Link>
        </div>
      )}
    </header>
  );
}
