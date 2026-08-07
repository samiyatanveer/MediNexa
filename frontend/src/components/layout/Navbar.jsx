// frontend/src/components/layout/Navbar.jsx
// Account 5: added mobile hamburger button, DB offline sticky banner.
import { Link, useLocation } from 'react-router-dom';
import { Activity, Menu } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { StatusBadge } from '../ui/StatusIndicator.jsx';
import { useHealth } from '../../hooks/useHealth.js';

const NAV_LINKS = [
  { to: '/',            label: 'Chat',        icon: '💬' },
  { to: '/patients',    label: 'Patients',    icon: '🏥' },
  { to: '/medicines',   label: 'Medicines',   icon: '💊' },
  { to: '/instruments', label: 'Instruments', icon: '🔬' },
  { to: '/inventory',   label: 'Inventory',   icon: '📦' },
];

export function Navbar({ onMobileMenuToggle }) {
  const location = useLocation();
  const health   = useHealth();

  return (
    <header className="h-14 glass-strong border-b border-white/8 flex items-center px-4 gap-4 shrink-0 z-10 relative">
      {/* Mobile hamburger — only on chat pages */}
      {(location.pathname === '/' || location.pathname.startsWith('/chat/')) && (
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden btn-ghost p-1.5 shrink-0"
          aria-label="Toggle chat list"
        >
          <Menu size={18} />
        </button>
      )}

      {/* Branding */}
      <Link to="/" className="flex items-center gap-2.5 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-accent/30 border border-accent/50 flex items-center justify-center">
          <Activity size={14} className="text-accent-light" />
        </div>
        <div className="hidden sm:flex flex-col leading-none">
          <span className="text-sm font-semibold text-txt-primary">HospitalRAG</span>
          <span className="text-xs text-txt-faint">Houston Memorial</span>
        </div>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1" aria-label="Main navigation">
        {NAV_LINKS.map(({ to, label, icon }) => {
          const isActive = to === '/'
            ? location.pathname === '/' || location.pathname.startsWith('/chat/')
            : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-150',
                isActive
                  ? 'bg-accent/20 text-txt-primary font-medium'
                  : 'text-txt-muted hover:text-txt-primary hover:bg-white/5'
              )}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="hidden lg:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Health indicators */}
      <div className="hidden md:flex items-center gap-4">
        <StatusBadge label="PostgreSQL" ok={health.db?.ok}     loading={health.loading} />
        <StatusBadge label="Ollama"     ok={health.ollama?.ok} loading={health.loading} />
      </div>
    </header>
  );
}
