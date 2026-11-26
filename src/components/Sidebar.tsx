import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
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
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { NavSection } from '../types';
import { PWAInstallButton } from './PWAInstallControls';

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

const SIDEBAR_COLLAPSED_KEY = 'kp_sidebar_collapsed';

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
      { id: 'matriks', label: 'Matriks Daftar Hadir', icon: Table2 },
    ],
  },
  {
    groupLabel: 'Jadwal & Pelaporan',
    items: [
      { id: 'jadwal-shift', label: 'Jadwal Shift', icon: Clock },
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

interface FloatingTooltipState {
  label: string;
  top: number;
  badge?: number;
  locked?: boolean;
}

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
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [tooltip, setTooltip] = useState<FloatingTooltipState | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // ignore storage failures in restricted contexts
    }
  }, [collapsed]);

  const handleToggleCollapse = () => {
    setTooltip(null);
    setCollapsed((prev) => !prev);
  };

  const handleNavClick = (id: NavSection) => {
    onSelectNav(id);
    onCloseMobile();
  };

  const showFloatingTooltip = (
    target: HTMLElement,
    label: string,
    options?: { badge?: number; locked?: boolean }
  ) => {
    if (!asideRef.current) return;
    const asideRect = asideRef.current.getBoundingClientRect();
    const itemRect = target.getBoundingClientRect();
    setTooltip({
      label,
      top: itemRect.top - asideRect.top + itemRect.height / 2,
      badge: options?.badge,
      locked: options?.locked,
    });
  };

  const displayBrand =
    companyName && companyName.trim() ? companyName.trim() : 'KaryaPresensi';

  const renderSidebarBody = (isCompact: boolean, isMobileDrawer: boolean) => (
    <div
      className={`relative h-full flex flex-col bg-[#090F1D] text-slate-300 border-r border-slate-800/90 select-none pb-safe overflow-hidden transition-[width] duration-200 ease-out ${
        isMobileDrawer ? 'w-72' : isCompact ? 'w-[78px]' : 'w-[264px]'
      }`}
    >
      {/* Subtle architectural top illumination */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.16),_transparent_72%)]"
      />

      {/* Brand Zone */}
      <div
        className={`relative h-[68px] flex items-center border-b border-slate-800/80 shrink-0 ${
          isCompact ? 'justify-center px-3' : 'justify-between px-4'
        }`}
      >
        <div
          className={`flex items-center min-w-0 ${
            isCompact ? 'justify-center' : 'gap-3'
          }`}
          title={isCompact ? displayBrand : undefined}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[1px] shrink-0 shadow-[0_4px_14px_rgba(37,99,235,0.32)]">
            <div className="w-full h-full rounded-[11px] bg-slate-950/20 flex items-center justify-center overflow-hidden text-white">
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt={displayBrand}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain bg-white p-1 rounded-[10px]"
                />
              ) : (
                <Building2 className="w-[18px] h-[18px]" />
              )}
            </div>
          </div>

          {!isCompact && (
            <div className="min-w-0">
              <span className="block font-display text-[14.5px] font-bold tracking-tight text-white whitespace-nowrap truncate">
                {displayBrand}
              </span>
              <span className="block text-[11px] font-medium text-slate-400 tracking-wide truncate">
                Portal Kehadiran
              </span>
            </div>
          )}
        </div>

        {isMobileDrawer && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Tutup menu"
            className="lg:hidden min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav
        className={`relative flex-1 overflow-y-auto overflow-x-hidden ${
          isCompact ? 'px-2.5 py-4 space-y-3' : 'px-3 py-4 space-y-5'
        }`}
        aria-label="Menu utama"
        onMouseLeave={() => isCompact && setTooltip(null)}
      >
        {NAV_GROUPS.map((group, groupIndex) => {
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
              {isCompact ? (
                groupIndex > 0 && (
                  <div
                    aria-hidden="true"
                    className="w-7 h-px bg-slate-800/90 mx-auto mb-3"
                  />
                )
              ) : (
                <div className="px-2.5 mb-2 flex items-center gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-500 whitespace-nowrap">
                    {group.groupLabel}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-px flex-1 bg-slate-800/75"
                  />
                </div>
              )}

              <div className={isCompact ? 'space-y-1.5' : 'space-y-1'}>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  const isAdminGated =
                    item.id === 'rekap-gaji' ||
                    item.id === 'keuangan' ||
                    item.id === 'pengaturan';
                  const badgeCount =
                    item.id === 'matriks' && unloggedTodayCount > 0
                      ? unloggedTodayCount
                      : undefined;

                  if (isCompact) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavClick(item.id)}
                        onMouseEnter={(e) =>
                          showFloatingTooltip(e.currentTarget, item.label, {
                            badge: badgeCount,
                            locked: isAdminGated,
                          })
                        }
                        onFocus={(e) =>
                          showFloatingTooltip(e.currentTarget, item.label, {
                            badge: badgeCount,
                            locked: isAdminGated,
                          })
                        }
                        onBlur={() => setTooltip(null)}
                        aria-label={item.label}
                        aria-current={isActive ? 'page' : undefined}
                        className={`relative w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white icon-cube-3d ring-1 ring-blue-300/40'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent hover:border-slate-700/80'
                        }`}
                      >
                        <Icon className="w-[18px] h-[18px] shrink-0" />
                        {badgeCount !== undefined && (
                          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-bold tabular-nums flex items-center justify-center ring-2 ring-[#090F1D]">
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </button>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group/nav w-full min-h-[42px] lg:min-h-[38px] flex items-center justify-between gap-2 px-2.5 py-1.5 text-[13px] font-medium rounded-xl transition-all duration-150 whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600/25 via-blue-600/12 to-transparent text-white ring-1 ring-inset ring-blue-500/40 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_6px_14px_-8px_rgba(37,99,235,0.45)]'
                          : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-all duration-150 ${
                            isActive
                              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-300/40 icon-cube-3d'
                              : 'bg-slate-900/90 text-slate-400 border-slate-800/80 group-hover/nav:text-slate-100 group-hover/nav:bg-slate-800 group-hover/nav:border-slate-700'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>

                      <span className="flex items-center gap-1.5 shrink-0">
                        {badgeCount !== undefined && (
                          <span
                            title="Karyawan wajib masuk belum diabsen hari ini"
                            className={`font-mono text-[11px] tabular-nums font-semibold px-1.5 py-0.5 rounded-md border ${
                              isActive
                                ? 'bg-blue-500/25 text-blue-100 border-blue-400/40'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {badgeCount}
                          </span>
                        )}
                        {isAdminGated && (
                          <Lock
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-blue-200' : 'text-amber-400/80'
                            }`}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer Zone */}
      <div
        className={`relative border-t border-slate-800/80 shrink-0 bg-[#090F1D]/95 ${
          isCompact ? 'p-2.5 space-y-2' : 'p-3.5 space-y-2.5'
        }`}
      >
        {isCompact ? (
          <div
            onMouseEnter={(e) =>
              showFloatingTooltip(
                e.currentTarget,
                isAdminMode ? 'Mode Admin Aktif' : 'Mode Biasa'
              )
            }
            onMouseLeave={() => setTooltip(null)}
            title={
              isAdminMode
                ? 'Mode Admin Aktif — Keuangan, Gaji & Pengaturan'
                : 'Mode Biasa — Operasional Harian'
            }
            className={`w-11 h-11 mx-auto rounded-xl border flex items-center justify-center ${
              isAdminMode
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400'
                : 'bg-slate-900/90 border-slate-800 text-blue-400'
            }`}
          >
            <ShieldCheck className="w-[18px] h-[18px]" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-slate-900/75 border border-slate-800/90">
            <div
              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                isAdminMode
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400'
                  : 'bg-slate-900 border-slate-700/80 text-blue-400'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {isAdminMode ? 'Mode Admin Aktif' : 'Mode Biasa'}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {isAdminMode
                  ? 'Keuangan, Gaji & Pengaturan'
                  : 'Operasional Harian'}
              </div>
            </div>
          </div>
        )}

        <PWAInstallButton
          variant="sidebar"
          compact={isCompact}
          onAfterAction={onCloseMobile}
        />

        {isAdminMode ? (
          isCompact ? (
            <button
              type="button"
              onClick={() => {
                onExitAdminMode();
                onCloseMobile();
              }}
              onMouseEnter={(e) =>
                showFloatingTooltip(e.currentTarget, 'Keluar Mode Admin')
              }
              onMouseLeave={() => setTooltip(null)}
              onFocus={(e) =>
                showFloatingTooltip(e.currentTarget, 'Keluar Mode Admin')
              }
              onBlur={() => setTooltip(null)}
              aria-label="Keluar Mode Admin"
              title="Keluar Mode Admin"
              className="w-11 h-11 mx-auto flex items-center justify-center text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onExitAdminMode();
                onCloseMobile();
              }}
              className="w-full min-h-[40px] lg:min-h-[38px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Keluar Mode Admin</span>
            </button>
          )
        ) : isCompact ? (
          <button
            type="button"
            onClick={() => {
              onOpenAdminModeModal();
              onCloseMobile();
            }}
            onMouseEnter={(e) =>
              showFloatingTooltip(e.currentTarget, 'Masuk Mode Admin')
            }
            onMouseLeave={() => setTooltip(null)}
            onFocus={(e) =>
              showFloatingTooltip(e.currentTarget, 'Masuk Mode Admin')
            }
            onBlur={() => setTooltip(null)}
            aria-label="Masuk Mode Admin"
            title="Masuk Mode Admin"
            className="w-11 h-11 mx-auto flex items-center justify-center text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-[0_2px_10px_rgba(37,99,235,0.35)] transition-colors cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onOpenAdminModeModal();
              onCloseMobile();
            }}
            className="w-full min-h-[40px] lg:min-h-[38px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-[0_2px_10px_rgba(37,99,235,0.35)] transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Masuk Mode Admin</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside
        ref={asideRef}
        className="hidden lg:block shrink-0 no-print sticky top-0 h-screen z-40"
      >
        {renderSidebarBody(collapsed, false)}

        {/* Desktop Collapse / Expand Seam Toggle */}
        <button
          type="button"
          onClick={handleToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          className="hidden lg:flex items-center justify-center absolute top-[20px] -right-3.5 z-40 w-7 h-7 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-blue-600 hover:border-blue-500 shadow-[0_4px_12px_rgba(2,6,23,0.45),0_1px_0_rgba(255,255,255,0.16)_inset] transition-colors cursor-pointer"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Unclipped Floating Tooltip when Collapsed */}
        {collapsed && tooltip && (
          <div
            role="tooltip"
            style={{ top: `${tooltip.top}px` }}
            className="pointer-events-none absolute left-[calc(100%+12px)] -translate-y-1/2 z-50 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium border border-slate-700/90 shadow-xl whitespace-nowrap flex items-center gap-2"
          >
            <span>{tooltip.label}</span>
            {tooltip.badge !== undefined && (
              <span className="font-mono tabular-nums text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950">
                {tooltip.badge}
              </span>
            )}
            {tooltip.locked && (
              <Lock className="w-3 h-3 text-amber-400 shrink-0" />
            )}
          </div>
        )}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">
            {renderSidebarBody(false, true)}
          </div>
        </div>
      )}
    </>
  );
};
