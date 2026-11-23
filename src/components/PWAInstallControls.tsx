import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Monitor,
  PlusSquare,
  Share,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import {
  DevicePlatform,
  useOnlineStatus,
  usePWAInstall,
} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar';
  onAfterAction?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  onAfterAction,
}) => {
  const {
    isInstalled,
    platform,
    isEmbedded,
    canPromptNatively,
    promptNativeInstall,
  } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<DevicePlatform>(platform);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (canPromptNatively) {
      const outcome = await promptNativeInstall();
      if (outcome === 'accepted') {
        onAfterAction?.();
      }
      return;
    }
    setActiveTab(platform);
    setGuideOpen(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // ignore clipboard errors in restricted contexts
    }
  };

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full min-h-[42px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-blue-200 bg-blue-950/60 hover:bg-blue-900/70 border border-blue-800/70 rounded-lg transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Install Aplikasi</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          title="Install KaryaPresensi ke perangkat (Android, iPhone, Windows, Mac)"
          className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">Install App</span>
        </button>
      )}

      {guideOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-slate-950">
              <div className="w-10 h-1 bg-slate-700 rounded-full" />
            </div>
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/pwa-192x192.png"
                  alt="KaryaPresensi"
                  className="w-10 h-10 rounded-xl shrink-0 border border-slate-700"
                />
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-bold text-white truncate">
                    Install Aplikasi KaryaPresensi
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    Akses cepat layar penuh seperti aplikasi native
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Tutup panduan install"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {isEmbedded && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                  <p className="font-semibold">
                    Aplikasi sedang dibuka di dalam bingkai pratinjau.
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    Untuk memunculkan tombol install otomatis di HP atau laptop, salin tautan lalu buka langsung di browser (Chrome / Safari / Edge).
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-100 cursor-pointer"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Tautan Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Tautan Aplikasi</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Platform Switcher */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                {(
                  [
                    { id: 'android', label: 'Android', icon: Smartphone },
                    { id: 'ios', label: 'iPhone / iPad', icon: Smartphone },
                    { id: 'desktop', label: 'PC / Laptop', icon: Monitor },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`min-h-[40px] px-2 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {activeTab === 'ios' && (
                <ol className="space-y-2.5 text-xs text-slate-700">
                  <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div className="leading-relaxed">
                      Buka aplikasi ini menggunakan browser <strong>Safari</strong> di iPhone atau iPad Anda.
                    </div>
                  </li>
                  <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div className="leading-relaxed">
                      Ketuk tombol <strong className="inline-flex items-center gap-1 text-blue-700"><Share className="w-3.5 h-3.5" /> Bagikan (Share)</strong> di bilah bawah/atas Safari.
                    </div>
                  </li>
                  <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div className="leading-relaxed">
                      Pilih <strong className="inline-flex items-center gap-1 text-slate-900"><PlusSquare className="w-3.5 h-3.5" /> Tambahkan ke Layar Utama (Add to Home Screen)</strong>, lalu ketuk <strong>Tambah</strong>.
                    </div>
                  </li>
                </ol>
              )}

              {activeTab === 'android' && (
                <ol className="space-y-2.5 text-xs text-slate-700">
                  <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div className="leading-relaxed">
                      Buka aplikasi di browser <strong>Google Chrome</strong> atau <strong>Samsung Internet</strong>.
                    </div>
                  </li>
                  <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div className="leading-relaxed">
                      Ketuk ikon menu <strong>⋮ (titik tiga)</strong> di pojok kanan atas browser.
                    </div>
                  </li>
                  <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div className="leading-relaxed">
                      Pilih <strong>Install aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>, lalu konfirmasi <strong>Install</strong>.
                    </div>
                  </li>
                </ol>
              )}

              {activeTab === 'desktop' && (
                <ol className="space-y-2.5 text-xs text-slate-700">
                  <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div className="leading-relaxed">
                      Buka aplikasi menggunakan <strong>Google Chrome</strong> atau <strong>Microsoft Edge</strong> di Windows/macOS.
                    </div>
                  </li>
                  <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div className="leading-relaxed">
                      Klik ikon <strong>Install (komputer + panah)</strong> di sebelah kanan bilah alamat URL, atau buka menu <strong>⋮ → Cast, save, and share → Install KaryaPresensi</strong>.
                    </div>
                  </li>
                </ol>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setGuideOpen(false)}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Mengerti
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 no-print"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        Koneksi internet terputus — beberapa perubahan data menunggu jaringan kembali aktif.
      </span>
    </div>
  );
};
