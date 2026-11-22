import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Users, X } from 'lucide-react';

export interface SearchableEmployeeOption {
  id: string;
  code: string;
  name: string;
  department: string;
  subtitle?: string;
  badgeText?: string;
  badgeTone?: 'amber' | 'emerald' | 'slate';
}

interface SearchableEmployeeSelectProps {
  options: SearchableEmployeeOption[];
  value: string;
  onChange: (value: string) => void;
  allowAll?: boolean;
  allLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const SearchableEmployeeSelect: React.FC<SearchableEmployeeSelectProps> = ({
  options,
  value,
  onChange,
  allowAll = false,
  allLabel = 'Semua Karyawan',
  placeholder = 'Pilih karyawan...',
  disabled = false,
  className = '',
}) => {
  const [open, setOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
    }
  }, [open]);

  const selectedOption = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q) ||
        o.department.toLowerCase().includes(q) ||
        (o.subtitle && o.subtitle.toLowerCase().includes(q))
    );
  }, [options, query]);

  const triggerText =
    allowAll && value === 'all'
      ? allLabel
      : selectedOption
      ? `${selectedOption.name} (${selectedOption.code})`
      : placeholder;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left bg-white border rounded-lg transition-colors cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
          open
            ? 'border-blue-600 ring-2 ring-blue-600/20'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <span className="truncate font-medium text-slate-800">{triggerText}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[260px]">
          <div className="p-2 border-b border-slate-100 bg-slate-50/80">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama, kode, atau divisi..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {allowAll && (
              <button
                type="button"
                onClick={() => {
                  onChange('all');
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                  value === 'all'
                    ? 'bg-blue-50 text-blue-900 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>{allLabel}</span>
                </span>
                {value === 'all' && <Check className="w-3.5 h-3.5 text-blue-700 shrink-0" />}
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-5 text-center text-xs text-slate-500">
                Tidak ada karyawan cocok dengan &ldquo;{query}&rdquo;.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.id === value;
                const badgeClass =
                  opt.badgeTone === 'emerald'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : opt.badgeTone === 'amber'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200';

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 text-blue-950'
                        : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {opt.name}{' '}
                        <span className="font-mono font-normal text-slate-500">
                          ({opt.code})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {opt.subtitle || opt.department}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badgeText && (
                        <span
                          className={`px-1.5 py-0.5 font-mono text-[10px] font-semibold border rounded ${badgeClass}`}
                        >
                          {opt.badgeText}
                        </span>
                      )}
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-700" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
