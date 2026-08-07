// frontend/src/components/kb/KBSearchBar.jsx
import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function KBSearchBar({ onSearch, placeholder = 'Search records…', className }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(query.trim());
  };

  const handleClear = () => {
    setQuery('');
    onSearch('');
  };

  return (
    <form onSubmit={handleSubmit} className={cn('relative', className)}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-faint" />
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        className="input-base pl-9 pr-9"
        aria-label="Search"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-faint hover:text-txt-muted"
          aria-label="Clear search"
        >
          <X size={13} />
        </button>
      )}
    </form>
  );
}
