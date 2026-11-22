import React from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  CalendarRange,
  FileSpreadsheet,
  Table2,
  Settings,
  X,
  Building2,
  Landmark,
  ShieldCheck,
  Wallet,
  Lock,
  LogOut,
  KeyRound,
  CircleDollarSign,
} from 'lucide-react';
import { NavSection } from '../types';

interface SidebarProps {
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  unloggedTodayCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  companyName?: string;
  companyLogo?: string;
  isAdminMode: boolean;
  onOpenAdminModeModal: () => void;
  onExitAdminMode: () => void;
}

const NAV_GROUPS: {
  groupLabel: string;
  items: {
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}[] = [
  {
    groupLabel: 'Pusat Kendali',
    items: [
      { id: 'ringkasan', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'absensi', label: 'Absensi Manual', icon: ClipboardCheck },
    ],
  },
  {
    groupLabel: 'Jadwal & Pelaporan',
    items: [
      { id: 'matriks', label: 'Matriks Daftar Hadir', icon: Table2 },
      { id: 'jadwal-libur', label: 'Jadwal Libur', icon: CalendarRange },
      { id: 'rekap', label: 'Rekap Bulanan', icon: FileSpreadsheet },
      { id: 'keuangan', label: 'Keuangan Perusahaan', icon: CircleDollarSign },
      { id: 'rekap-gaji', label: 'Rekap Gaji', icon: Wallet },
    ],
  },
  {
    groupLabel: 'Organisasi & Sistem',
    items: [
      { id: 'profil-perusahaan', label: 'Profil Perusahaan', icon: Landmark },
      { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  onSelectNav,
  unloggedTodayCount,
  mobileOpen,
  onCloseMobile,
  companyName,
  companyLogo,
  isAdminMode,
  onOpenAdminModeModal,
  onExitAdminMode,
}) => {
  const handleNavClick = (id: NavSection) => {
    onSelectNav(id);
    onCloseMobile();
  };

  const displayBrand = companyName && companyName.trim() ? companyName.trim() : 'KaryaPresensi';

  const sidebarContent = (
    <div className="h-full flex flex-col bg-slate-950 text-slate-300 border-r border-slate-800 w-64 select-none">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 overflow-hidden shadow-xs">
            {companyLogo ? (
              <img
                src={companyLogo}
                alt={displayBrand}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain bg-white p-0.5"
              />
            ) : (
              <Building2 className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <span className="block font-display text-sm font-bold tracking-tight text-white whitespace-nowrap truncate">
              {displayBrand}
            </span>
            <span className="block text-[10px] font-medium text-slate-400 tracking-wide truncate">
              Enterprise Portal
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Tutup menu"
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3.5 space-y-5" aria-label="Menu utama">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              isAdminMode ||
              (item.id !== 'rekap-gaji' &&
                item.id !== 'keuangan' &&
                item.id !== 'pengaturan')
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.groupLabel}>
              <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.groupLabel}
              </div>
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-white' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.id === 'absensi' && unloggedTodayCount > 0 && (
                        <span
                          title="Karyawan wajib masuk belum diabsen hari ini"
                          className={`font-mono text-[11px] tabular-nums font-semibold px-1.5 py-0.5 rounded ${
                            isActive
                              ? 'bg-blue-800 text-white'
                              : 'bg-slate-800 text-amber-400'
                          }`}
                        >
                          {unloggedTodayCount}
                        </span>
                      )}
                      {(item.id === 'rekap-gaji' ||
                        item.id === 'keuangan' ||
                        item.id === 'pengaturan') && (
                        <Lock
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-blue-200' : 'text-amber-400/80'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80 space-y-3 shrink-0 bg-slate-950">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
              isAdminMode
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400'
                : 'bg-slate-900 border-slate-700 text-blue-400'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              {isAdminMode ? 'Mode Admin Aktif' : 'Mode Biasa'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {isAdminMode ? 'Keuangan, Gaji & Pengaturan' : 'Operasional Harian'}
            </div>
          </div>
        </div>

        {isAdminMode ? (
          <button
            type="button"
            onClick={() => {
              onExitAdminMode();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Mode Admin</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onOpenAdminModeModal();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Masuk Mode Admin</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 no-print sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
