import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  FileDown,
  Globe,
  Loader2,
  Printer,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { AppSettings } from '../types';
import { exportManualToPdf } from '../utils/pdfManualExport';
import {
  FigureDashboardAndNotif,
  FigureDayOffAndCalendar,
  FigureDualPinAndSidebar,
  FigureFinanceDashboard,
  FigureMatrixColorAndExport,
  FigureMatrixInputMethods,
  FigurePayrollAndSlip,
  FigureRecapAndLateSettlement,
  FigureSettingsDualPin,
  FigureShiftAndMoveOff,
  FigureSystemWorkflow,
} from './ManualVisualGuides';

interface PanduanPenggunaViewProps {
  settings: AppSettings;
}

interface BookSectionAnchor {
  id: string;
  shortLabel: string;
  fullTitle: string;
  page: string;
}

const BOOK_ANCHORS: BookSectionAnchor[] = [
  { id: 'sampul', shortLabel: 'Sampul', fullTitle: 'Halaman Sampul', page: 'i' },
  { id: 'pengantar', shortLabel: 'Pengantar', fullTitle: 'Kata Pengantar', page: 'ii' },
  { id: 'daftar-isi', shortLabel: 'Daftar Isi', fullTitle: 'Daftar Isi Lengkap', page: 'iii' },
  { id: 'bab-1', shortLabel: 'Bab I', fullTitle: 'Bab I · Pengenalan Aplikasi', page: '1' },
  { id: 'bab-2', shortLabel: 'Bab II', fullTitle: 'Bab II · Mode Biasa & PIN Ganda', page: '2' },
  { id: 'bab-2-visual', shortLabel: 'Bab II (Langkah)', fullTitle: 'Bab II · Cara Membuka Mode Admin', page: '3' },
  { id: 'bab-3', shortLabel: 'Bab III', fullTitle: 'Bab III · Dashboard & Notifikasi', page: '4' },
  { id: 'bab-4', shortLabel: 'Bab IV (Input)', fullTitle: 'Bab IV · Mengisi Matriks Absensi', page: '5' },
  { id: 'bab-4-warna', shortLabel: 'Bab IV (Warna)', fullTitle: 'Bab IV · Warna, Log & Ekspor', page: '6' },
  { id: 'bab-5', shortLabel: 'Bab V', fullTitle: 'Bab V · Jadwal Shift & Pindah Libur', page: '7' },
  { id: 'bab-6', shortLabel: 'Bab VI', fullTitle: 'Bab VI · Jadwal Libur & Karyawan', page: '8' },
  { id: 'bab-7', shortLabel: 'Bab VII', fullTitle: 'Bab VII · Rekap & Cicil Telat', page: '9' },
  { id: 'bab-8', shortLabel: 'Bab VIII', fullTitle: 'Bab VIII · Keuangan Perusahaan', page: '10' },
  { id: 'bab-9', shortLabel: 'Bab IX', fullTitle: 'Bab IX · Rekap Gaji & Slip Gaji', page: '11' },
  { id: 'bab-10', shortLabel: 'Bab X', fullTitle: 'Bab X · Profil & Pengaturan', page: '12' },
  { id: 'bab-11', shortLabel: 'Bab XI', fullTitle: 'Bab XI · Penyelesaian Masalah', page: '13' },
];

interface TocEntry {
  code: string;
  title: string;
  page: string;
  indent?: boolean;
  anchorId: string;
}

const TOC_ENTRIES: TocEntry[] = [
  { code: '', title: 'Halaman Sampul Resmi', page: 'i', anchorId: 'sampul' },
  { code: '', title: 'Kata Pengantar Penyusun dan Developer', page: 'ii', anchorId: 'pengantar' },
  { code: '', title: 'Daftar Isi Lengkap', page: 'iii', anchorId: 'daftar-isi' },
  { code: 'BAB I', title: 'Pengenalan Aplikasi & Link Akses Resmi', page: '1', anchorId: 'bab-1' },
  { code: '1.1', title: 'Apa Itu Aplikasi Ini, Link Akses, dan Siapa Penggunanya', page: '1', indent: true, anchorId: 'bab-1' },
  { code: '1.2', title: 'Empat Bagian Utama dan Alur Kerja Aplikasi (Gambar 1.1)', page: '1', indent: true, anchorId: 'bab-1' },
  { code: 'BAB II', title: 'Cara Membuka Kunci dan Menggunakan Mode Admin', page: '2', anchorId: 'bab-2' },
  { code: '2.1', title: 'Perbedaan Mode Biasa, Admin Absensi, dan Admin Keuangan', page: '2', indent: true, anchorId: 'bab-2' },
  { code: '2.2', title: 'Langkah Membuka & Mengunci Mode Admin (Gambar 2.1)', page: '3', indent: true, anchorId: 'bab-2-visual' },
  { code: 'BAB III', title: 'Dashboard Harian dan Jendela Pop-Up Notifikasi', page: '4', anchorId: 'bab-3' },
  { code: '3.1', title: 'Membaca Ringkasan Kehadiran dan Grafik Tujuh Hari', page: '4', indent: true, anchorId: 'bab-3' },
  { code: '3.2', title: 'Pop-Up Notifikasi Non-Blur dan Notifikasi HP/PC (Gambar 3.1)', page: '4', indent: true, anchorId: 'bab-3' },
  { code: 'BAB IV', title: 'Mencatat Kehadiran di Matriks Daftar Hadir', page: '5', anchorId: 'bab-4' },
  { code: '4.1', title: 'Mengenal Kode Absen dan 3 Cara Input Absensi (Gambar 4.1)', page: '5', indent: true, anchorId: 'bab-4' },
  { code: '4.2', title: 'Ubah Warna di Keterangan, Log Harian, & Ekspor (Gambar 4.2)', page: '6', indent: true, anchorId: 'bab-4-warna' },
  { code: 'BAB V', title: 'Mengatur Jadwal Shift dan Memindahkan Hari Libur', page: '7', anchorId: 'bab-5' },
  { code: '5.1', title: 'Penugasan Shift, Anti Double Shift, & Pindah Libur (Gambar 5.1)', page: '7', indent: true, anchorId: 'bab-5' },
  { code: 'BAB VI', title: 'Mengatur Jadwal Libur Individu dan Data Karyawan', page: '8', anchorId: 'bab-6' },
  { code: '6.1', title: 'Libur Rutin, Tanggal Khusus, Kalender, & Karyawan (Gambar 6.1)', page: '8', indent: true, anchorId: 'bab-6' },
  { code: 'BAB VII', title: 'Rekap Bulanan dan Cara Mencicil Keterlambatan', page: '9', anchorId: 'bab-7' },
  { code: '7.1', title: 'Evaluasi Kehadiran dan Ganti / Cicil Keterlambatan (Gambar 7.1)', page: '9', indent: true, anchorId: 'bab-7' },
  { code: 'BAB VIII', title: 'Mengelola Keuangan Perusahaan (PIN Keuangan)', page: '10', anchorId: 'bab-8' },
  { code: '8.1', title: 'Kas Tunai, Rekening Bank, Transaksi, & Transfer (Gambar 8.1)', page: '10', indent: true, anchorId: 'bab-8' },
  { code: 'BAB IX', title: 'Menghitung Rekap Gaji dan Mencetak Slip Gaji', page: '11', anchorId: 'bab-9' },
  { code: '9.1', title: 'Gaji Pokok, Lembur, BPJS, Bayar Gaji, & Slip Resmi (Gambar 9.1)', page: '11', indent: true, anchorId: 'bab-9' },
  { code: 'BAB X', title: 'Profil Perusahaan, Pengaturan PIN Ganda, dan Backup', page: '12', anchorId: 'bab-10' },
  { code: '10.1', title: 'Profil Perusahaan, Shift, Ganti PIN, & Backup JSON (Gambar 10.1)', page: '12', indent: true, anchorId: 'bab-10' },
  { code: 'BAB XI', title: 'Penyelesaian Masalah (Troubleshooting) dan Kolofon', page: '13', anchorId: 'bab-11' },
];

interface SheetChromeProps {
  companyName: string;
  sectionTitle: string;
  pageLabel: string;
  children: React.ReactNode;
  id: string;
}

const BookSheet: React.FC<SheetChromeProps> = ({
  companyName,
  sectionTitle,
  pageLabel,
  children,
  id,
}) => (
  <article
    id={id}
    data-book-page={id}
    className="book-sheet p-7 sm:p-10 md:p-12 print:p-0 flex flex-col justify-between text-slate-800"
  >
    <div>
      <header className="grid grid-cols-[1fr_auto] items-center gap-4 pb-2.5 mb-5 border-b border-slate-300 text-[10.5px] text-slate-500">
        <span className="font-semibold uppercase tracking-wider text-slate-700 truncate text-left">
          {companyName} — Buku Panduan Pengguna
        </span>
        <span className="font-mono uppercase tracking-wide shrink-0 text-right">
          {sectionTitle}
        </span>
      </header>

      <div className="book-prose text-[12px] leading-relaxed text-slate-800">
        {children}
      </div>
    </div>

    <footer className="mt-6 pt-2.5 border-t border-slate-300 grid grid-cols-3 items-center gap-2 text-[10px] text-slate-500">
      <span className="text-left truncate">Penyusun &amp; Developer: Denuda</span>
      <span className="font-mono font-bold text-slate-800 text-center">
        — {pageLabel} —
      </span>
      <span className="text-right truncate uppercase tracking-wide">{companyName}</span>
    </footer>
  </article>
);

interface ChapterHeadingProps {
  kicker: string;
  title: string;
  subtitle?: string;
  accentClass?: string;
}

const ChapterHeading: React.FC<ChapterHeadingProps> = ({
  kicker,
  title,
  subtitle,
  accentClass = 'text-blue-800',
}) => (
  <div className="text-center pb-3.5 mb-4 border-b-2 border-slate-900">
    <div className={`text-[10px] font-mono font-bold uppercase tracking-[0.2em] ${accentClass}`}>
      {kicker}
    </div>
    <h2 className="font-display text-lg sm:text-[20px] font-bold text-slate-900 mt-1 leading-snug">
      {title}
    </h2>
    {subtitle && (
      <p className="book-center-copy text-[11px] text-slate-500 mt-1 font-medium">
        {subtitle}
      </p>
    )}
    <div className="mt-2 mx-auto w-14 h-0.5 bg-slate-900/80" />
  </div>
);

export const PanduanPenggunaView: React.FC<PanduanPenggunaViewProps> = ({ settings }) => {
  const [activeAnchor, setActiveAnchor] = useState<string>('sampul');
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const bookContainerRef = useRef<HTMLDivElement>(null);

  const companyName =
    settings.companyName && settings.companyName.trim()
      ? settings.companyName.trim()
      : 'KARYAPRESENSI';
  const companySubtitle =
    settings.companySubtitle && settings.companySubtitle.trim()
      ? settings.companySubtitle.trim()
      : 'SISTEM HRIS & KEUANGAN PERUSAHAAN';
  const companyLogo = settings.companyProfile?.logoDataUrl;
  const currentYear = new Date().getFullYear();

  const scrollToSection = (id: string) => {
    setActiveAnchor(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleExportPdf = async () => {
    if (!bookContainerRef.current || exportingPdf) return;
    setExportingPdf(true);
    setExportError(null);
    setExportProgress({ current: 0, total: BOOK_ANCHORS.length });

    try {
      const safeBrand = companyName
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      await exportManualToPdf({
        container: bookContainerRef.current,
        fileName: `Buku-Panduan-Pengguna-${safeBrand || 'KaryaPresensi'}.pdf`,
        onProgress: (current, total) => setExportProgress({ current, total }),
      });
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Gagal mengekspor Buku Panduan ke PDF. Silakan coba lagi atau gunakan tombol Cetak Buku.'
      );
    } finally {
      setExportingPdf(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="space-y-5 print:space-y-0">
      <style media="print">{`
        @page {
          size: A4 portrait;
          margin: 16mm 16mm 16mm 20mm;
        }
        @page cover-page {
          size: A4 portrait;
          margin: 0mm;
        }
      `}</style>

      {/* Executive Screen Toolbar */}
      <section className="surface-3d-dark rounded-2xl p-4 sm:p-5 text-white relative overflow-hidden no-print">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-blue-500/15 blur-3xl"
        />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="icon-cube-3d w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 border border-blue-300/35 text-white flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-sky-300 flex flex-wrap items-center gap-2">
                <span>Dokumentasi Operasional Resmi</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-300">Penyusun &amp; Developer: Denuda</span>
              </div>
              <h2 className="font-display text-base sm:text-lg font-bold text-white mt-0.5 tracking-tight">
                Buku Panduan Pengguna — {companyName}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={exportingPdf}
              onClick={() => void handleExportPdf()}
              className="btn-3d-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-70 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
            >
              {exportingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {exportProgress
                      ? `Mengekspor PDF (${exportProgress.current}/${exportProgress.total})...`
                      : 'Menyiapkan PDF...'}
                  </span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" />
                  <span>Export PDF Buku</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="btn-3d-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Buku</span>
            </button>
          </div>
        </div>

        {exportError && (
          <div className="relative mt-3 p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{exportError}</span>
          </div>
        )}

        <div className="relative mt-4 pt-3.5 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto pb-1">
          {BOOK_ANCHORS.map((item) => {
            const isSelected = activeAnchor === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                title={item.fullTitle}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </div>
      </section>

      {/* Book Pages Container */}
      <div ref={bookContainerRef} className="book-container flex flex-col gap-6 print:gap-0">
        {/* HALAMAN SAMPUL (FULL-BLEED A4 HARDCOVER) */}
        <article
          id="sampul"
          data-book-page="sampul"
          className="book-sheet book-cover overflow-hidden bg-[#080F1F] text-white flex flex-col justify-between p-10 sm:p-12 md:p-14 relative"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(148, 163, 184, 0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.14) 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.24),_transparent_58%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(217,119,6,0.16),_transparent_55%)]"
          />

          <div aria-hidden="true" className="pointer-events-none absolute inset-5 border border-slate-600/60" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-7 border border-amber-400/25" />
          <div aria-hidden="true" className="pointer-events-none absolute top-5 left-5 w-6 h-6 border-t-2 border-l-2 border-amber-400/85" />
          <div aria-hidden="true" className="pointer-events-none absolute top-5 right-5 w-6 h-6 border-t-2 border-r-2 border-amber-400/85" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-5 left-5 w-6 h-6 border-b-2 border-l-2 border-amber-400/85" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-5 right-5 w-6 h-6 border-b-2 border-r-2 border-amber-400/85" />

          <div className="relative z-10 pt-2 text-center space-y-2 border-b border-slate-700/70 pb-5">
            <div className="text-[10.5px] font-mono uppercase tracking-[0.26em] text-amber-300/95 font-semibold">
              Dokumentasi Standar Operasional Sistem
            </div>
            <div className="font-display text-sm sm:text-base font-bold text-white tracking-[0.12em] uppercase">
              {companyName}
            </div>
            <div className="text-[11px] text-slate-400 tracking-wide">
              {companySubtitle}
            </div>
          </div>

          <div className="relative z-10 my-auto py-8 flex flex-col items-center text-center space-y-6">
            <div className="relative flex items-center justify-center">
              <div className="w-24 h-24 rounded-2xl rotate-45 border border-amber-400/45 bg-slate-900/75 flex items-center justify-center shadow-[0_12px_32px_rgba(2,6,23,0.65)]">
                <div className="-rotate-45 w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 border border-blue-300/35 flex items-center justify-center overflow-hidden">
                  {companyLogo ? (
                    <img
                      src={companyLogo}
                      alt={companyName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain bg-white p-1.5"
                    />
                  ) : (
                    <Building2 className="w-8 h-8 text-amber-300" />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 max-w-xl mx-auto">
              <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-sky-300 font-semibold">
                Pedoman Lengkap Pengguna &amp; Administrator
              </div>
              <h1 className="font-display text-3xl sm:text-4xl md:text-[42px] font-extrabold tracking-tight text-white leading-[1.12] [text-wrap:balance]">
                BUKU PANDUAN PENGGUNA
              </h1>
              <p className="font-display text-base sm:text-lg font-semibold text-amber-300/95 leading-snug max-w-lg mx-auto [text-wrap:balance]">
                Sistem Manajemen Presensi, Penjadwalan Shift, Penggajian, dan Keuangan Perusahaan
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 w-full max-w-xs">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-400/75" />
              <span className="w-2 h-2 rotate-45 bg-amber-400 shrink-0" />
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-400/75" />
            </div>

            <p className="text-[13px] text-slate-300 leading-relaxed max-w-lg mx-auto text-center">
              Panduan langkah demi langkah disertai ilustrasi layar yang mudah dipahami untuk operator Mode Biasa, Admin Absensi, dan Admin Keuangan dalam mengelola absensi, shift kerja, pindah libur, rekapitulasi, gaji, serta keuangan perusahaan.
            </p>
          </div>

          <div className="relative z-10 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 border border-slate-700/80 rounded-xl overflow-hidden bg-slate-900/75 divide-y sm:divide-y-0 sm:divide-x divide-slate-700/80">
              <div className="p-4 text-center sm:text-left">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                  Diterbitkan Untuk
                </div>
                <div className="font-display text-sm font-bold text-white mt-1 uppercase">
                  {companyName}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tata Kelola SDM &amp; Administrasi Perusahaan
                </div>
              </div>

              <div className="p-4 text-center sm:text-right">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                  Penyusun &amp; Developer Aplikasi
                </div>
                <div className="font-display text-base font-extrabold text-amber-300 mt-1">
                  Denuda
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Arsitek Sistem &amp; Penulis Dokumentasi
                </div>
              </div>
            </div>

            <div className="border-t border-slate-700/70 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400 text-center sm:text-left">
              <span>
                Disusun dan dikembangkan oleh <strong className="text-white font-semibold">Denuda</strong>
              </span>
              <span className="font-mono tracking-wider uppercase text-slate-300">
                Edisi Resmi · {currentYear}
              </span>
            </div>
          </div>
        </article>

        {/* HALAMAN ii: KATA PENGANTAR */}
        <BookSheet
          id="pengantar"
          companyName={companyName}
          sectionTitle="Kata Pengantar"
          pageLabel="ii"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Prakata Resmi"
              title="Kata Pengantar"
              subtitle="Pengantar Penyusun dan Developer Aplikasi"
            />

            <p className="book-indent">
              Puji syukur ke hadirat Tuhan Yang Maha Esa atas terselesaikannya penyusunan{' '}
              <strong>
                Buku Panduan Pengguna Sistem Manajemen Presensi, Penjadwalan Shift, Penggajian, dan Keuangan Perusahaan
              </strong>{' '}
              untuk <strong>{companyName}</strong>. Buku ini disusun agar seluruh karyawan, koordinator shift, admin absensi, maupun admin keuangan dapat mengoperasikan setiap fitur aplikasi dengan cepat, tepat, dan tanpa keraguan.
            </p>

            <p className="book-indent">
              Di dalam aplikasi ini, hak akses dibedakan dengan jelas antara <strong>Mode Biasa</strong> (khusus melihat laporan dan mencetak dokumen tanpa mengubah data), <strong>Mode Admin Absensi</strong> (untuk mencatat presensi, mengatur shift dan pindah libur, mengganti warna matriks, serta membuka Pengaturan), dan <strong>Mode Admin Keuangan</strong> (untuk mengelola kas perusahaan dan gaji karyawan).
            </p>

            <p className="book-indent">
              Agar mudah dipelajari oleh siapa saja, termasuk pengguna yang baru pertama kali memakai sistem ini, setiap bab dilengkapi penjelasan dengan bahasa sehari-hari yang sederhana, urutan langkah bernomor dari awal sampai selesai, serta gambar ilustrasi layar aplikasi yang menunjukkan tombol mana yang harus diklik.
            </p>

            <p className="book-indent">
              Pada bagian akhir buku juga tersedia bab <em>Penyelesaian Masalah</em> yang berisi daftar kendala yang paling sering ditemui beserta cara mengatasinya secara langsung, misalnya saat tombol input tidak muncul, saat karyawan tidak bisa masuk jadwal shift karena sedang libur, atau saat hasil cetak perlu disesuaikan.
            </p>

            <p className="book-indent">
              Semoga buku panduan ini bermanfaat besar bagi kelancaran pekerjaan sehari-hari dan membantu meningkatkan kerapian administrasi di lingkungan <strong>{companyName}</strong>.
            </p>

            <div className="mt-8 pt-6 flex justify-end book-avoid-break">
              <div className="w-72 rounded-xl border border-slate-300 bg-slate-50/80 p-5 text-center">
                <div className="text-[11px] text-slate-500">Hormat kami,</div>
                <div className="text-xs text-slate-800 font-semibold mt-0.5">
                  Penyusun &amp; Developer Aplikasi
                </div>
                <div className="my-6 border-b border-dashed border-slate-400 w-44 mx-auto" />
                <div className="font-display text-base font-bold text-slate-900">Denuda</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Software Engineer &amp; System Architect
                </div>
              </div>
            </div>
          </div>
        </BookSheet>

        {/* HALAMAN iii: DAFTAR ISI LENGKAP */}
        <BookSheet
          id="daftar-isi"
          companyName={companyName}
          sectionTitle="Daftar Isi"
          pageLabel="iii"
        >
          <div>
            <ChapterHeading
              kicker="Struktur Dokumentasi"
              title="Daftar Isi Lengkap"
              subtitle="Klik salah satu judul di bawah ini untuk langsung melompat ke halaman terkait"
            />

            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-300 text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
              <span>Bagian / Bab / Materi</span>
              <span>Halaman</span>
            </div>

            <div className="space-y-0.5">
              {TOC_ENTRIES.map((entry, index) => (
                <button
                  key={`${entry.code}-${entry.title}-${index}`}
                  type="button"
                  onClick={() => scrollToSection(entry.anchorId)}
                  className={`w-full flex items-baseline text-left py-0.5 px-1.5 rounded hover:bg-blue-50/70 transition-colors cursor-pointer ${
                    entry.indent
                      ? 'pl-6 text-[11px] text-slate-700 font-normal'
                      : 'text-[11.5px] font-bold text-slate-900 pt-1.5'
                  }`}
                >
                  {entry.code && (
                    <span
                      className={`font-mono shrink-0 mr-2 ${
                        entry.indent
                          ? 'text-[10px] text-slate-500 w-7'
                          : 'text-[10.5px] text-blue-800 font-bold w-14'
                      }`}
                    >
                      {entry.code}
                    </span>
                  )}
                  <span className="truncate">{entry.title}</span>
                  <span className="book-toc-leader" aria-hidden="true" />
                  <span className="font-mono text-[11px] font-semibold text-slate-700 shrink-0 tabular-nums">
                    {entry.page}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </BookSheet>

        {/* HALAMAN 1: BAB I - PENGENALAN APLIKASI */}
        <BookSheet
          id="bab-1"
          companyName={companyName}
          sectionTitle="Bab I · Pengenalan Aplikasi"
          pageLabel="1"
        >
          <div className="space-y-3">
            <ChapterHeading
              kicker="Bab I"
              title="Pengenalan Aplikasi"
              subtitle="Fungsi Utama, Siapa Saja Penggunanya, dan Alur Kerja Sehari-hari"
            />

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                1.1 Apa Itu Aplikasi Ini, Link Akses, dan Siapa Penggunanya?
              </h3>
              <p className="book-indent">
                Aplikasi <strong>{companyName}</strong> adalah portal kerja terpadu untuk mencatat absensi harian karyawan, mengatur jadwal shift kerja dan hari libur agar tidak bentrok, menghitung keterlambatan serta lembur, hingga menghitung gaji dan mencatat uang masuk-keluar perusahaan. Semua data tersambung otomatis sehingga Anda tidak perlu menyalin angka berulang kali di kertas atau file terpisah.
              </p>

              <div className="rounded-xl border border-blue-300 bg-blue-50/75 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 book-avoid-break">
                <div className="flex items-start sm:items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4" />
                  </span>
                  <div className="text-[11px] leading-snug text-slate-700">
                    <div className="font-bold text-slate-900">
                      Link Resmi Mengakses Aplikasi (Komputer, Laptop, &amp; HP):
                    </div>
                    <div>
                      Buka peramban (Chrome, Edge, atau Safari) lalu kunjungi alamat berikut:
                    </div>
                  </div>
                </div>
                <a
                  href="https://absensi-karyawan-12.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] font-bold text-blue-800 underline underline-offset-2 hover:text-blue-950 break-all shrink-0"
                >
                  https://absensi-karyawan-12.vercel.app/
                </a>
              </div>

              <p className="book-indent">
                Aplikasi ini dirancang untuk tiga kelompok pengguna: (1) <strong>Staf / Pemantau (Mode Biasa)</strong> yang melihat jadwal, rekap, atau mencetak laporan; (2) <strong>Admin Absensi</strong> yang menginput presensi, mengatur shift/libur, dan mengelola data karyawan; serta (3) <strong>Admin Keuangan</strong> yang mengurus gaji dan kas perusahaan.
              </p>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                1.2 Empat Bagian Utama dan Urutan Penggunaan (Gambar 1.1)
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-[11.5px] text-slate-700">
                <li>
                  <strong>Bagian 1 — Pemantauan &amp; Absensi:</strong> Berisi <em>Dashboard</em> harian, <em>Matriks Daftar Hadir</em> sebulan penuh, dan <em>Pusat Notifikasi</em>.
                </li>
                <li>
                  <strong>Bagian 2 — Jadwal Shift &amp; Libur:</strong> Berisi <em>Jadwal Shift</em> (dengan aturan anti-bentrok dan fitur pindah libur) serta <em>Jadwal Libur</em> individu dan data karyawan.
                </li>
                <li>
                  <strong>Bagian 3 — Rekap, Gaji &amp; Keuangan:</strong> Berisi <em>Rekap Bulanan</em> (jam kerja, lembur, dan cicilan telat) yang terhubung ke <em>Keuangan Perusahaan</em> dan <em>Rekap Gaji</em>.
                </li>
                <li>
                  <strong>Bagian 4 — Profil, Panduan &amp; Pengaturan:</strong> Berisi <em>Profil Perusahaan</em>, <em>Panduan Pengguna</em> ini, serta <em>Pengaturan</em> jam shift, warna matriks, PIN, dan cadangan data.
                </li>
              </ul>

              <FigureSystemWorkflow />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 2: BAB II (1/2) - MODE BIASA VS PIN GANDA */}
        <BookSheet
          id="bab-2"
          companyName={companyName}
          sectionTitle="Bab II · Hak Akses & PIN Ganda"
          pageLabel="2"
        >
          <div className="space-y-3.5">
            <ChapterHeading
              kicker="Bab II"
              title="Perbedaan Mode Biasa dan Keamanan PIN Ganda"
              subtitle="Mengapa Hak Akses Dipisah Menjadi Tiga Tingkat Keamanan"
            />

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                2.1 Mode Biasa (Hanya Lihat — Aman dari Salah Pencet)
              </h3>
              <p className="book-indent">
                Setiap kali aplikasi pertama kali dibuka, sistem langsung masuk ke <strong>Mode Biasa</strong>. Pada kondisi ini, seluruh data bersifat <em>hanya lihat</em>: tombol tambah, ubah, hapus, pindah libur, pengaturan shift, dan ubah warna disembunyikan secara otomatis. Tujuannya agar karyawan atau tamu yang melihat jadwal tidak bisa mengubah catatan kehadiran secara sengaja maupun tidak sengaja.
              </p>
              <p className="book-indent">
                Meskipun tidak bisa mengubah data, pengguna pada Mode Biasa tetap dapat mencari nama karyawan, menyaring tanggal atau divisi, melihat pratinjau dokumen, mencetak laporan ke printer/PDF, mengunduh file Excel/CSV, serta membuka Buku Panduan Pengguna.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                2.2 Mengapa PIN Absensi dan PIN Keuangan Harus Berbeda?
              </h3>
              <p className="book-indent">
                Data kehadiran harian dikelola oleh bagian operasional atau HRD, sedangkan data uang kas dan nominal gaji bersifat rahasia perusahaan. Oleh karena itu, sistem memakai <strong>dua PIN terpisah yang wajib berbeda</strong>:
              </p>

              <div className="overflow-hidden rounded-xl border border-slate-300 my-2 book-avoid-break">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2 px-3 font-semibold w-[22%]">Mode Akses</th>
                      <th className="py-2 px-3 font-semibold w-[16%] text-center">PIN Bawaan</th>
                      <th className="py-2 px-3 font-semibold">Apa Saja yang Bisa Dilakukan?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2 px-3 font-bold text-slate-900">Mode Biasa</td>
                      <td className="py-2 px-3 font-mono text-center">Tidak perlu</td>
                      <td className="py-2 px-3">
                        Hanya melihat Dashboard, Matriks, Jadwal Shift, Jadwal Libur, Rekap Bulanan, Profil Perusahaan, dan Panduan Pengguna. Bisa cetak dan unduh Excel.
                      </td>
                    </tr>
                    <tr className="bg-blue-50/50">
                      <td className="py-2 px-3 font-bold text-blue-950">Admin Absensi</td>
                      <td className="py-2 px-3 font-mono font-bold text-blue-900 text-center">1234</td>
                      <td className="py-2 px-3">
                        Membuka tombol input/ubah/hapus Absensi, Data Karyawan, Jadwal Shift, Pindah Libur, Warna Matriks, Profil Perusahaan, serta menampilkan menu <strong>Pengaturan</strong>.
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/50">
                      <td className="py-2 px-3 font-bold text-emerald-950">Admin Keuangan</td>
                      <td className="py-2 px-3 font-mono font-bold text-emerald-900 text-center">123456</td>
                      <td className="py-2 px-3">
                        Menampilkan dan membuka dua menu rahasia: <strong>Keuangan Perusahaan</strong> dan <strong>Rekap Gaji Karyawan</strong>. Tidak dapat mengubah Pengaturan atau Absensi.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 3: BAB II (2/2) - LANGKAH MEMBUKA MODE ADMIN & SIDEBAR */}
        <BookSheet
          id="bab-2-visual"
          companyName={companyName}
          sectionTitle="Bab II · Cara Membuka Mode Admin"
          pageLabel="3"
        >
          <div className="space-y-3.5">
            <ChapterHeading
              kicker="Bab II (Lanjutan)"
              title="Langkah Membuka Kunci Admin dan Mengatur Sidebar"
              subtitle="Panduan Bergambar Cara Masuk ke Admin Absensi atau Admin Keuangan"
            />

            <FigureDualPinAndSidebar />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                2.3 Langkah Demi Langkah Membuka &amp; Mengunci Kembali Mode Admin
              </h3>
              <ol className="list-decimal pl-6 space-y-1.5 text-[11.5px] text-slate-700">
                <li>
                  <strong>Buka Aplikasi &amp; Klik Tombol Admin:</strong> Akses portal di{' '}
                  <a
                    href="https://absensi-karyawan-12.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-semibold text-blue-800 underline underline-offset-2"
                  >
                    https://absensi-karyawan-12.vercel.app/
                  </a>
                  , lalu klik tombol <strong>Admin Absensi</strong> / <strong>Admin Keuangan</strong> di pojok kanan atas atau klik tombol biru <strong>Masuk Mode Admin</strong> di bawah menu kiri (<em>Sidebar</em>).
                </li>
                <li>
                  <strong>Pilih Jenis Admin (atau Otomatis):</strong> Di jendela yang muncul (<em>lihat label ④ pada Gambar 2.1</em>), pilih tab <em>Otomatis</em> jika ingin sistem langsung mengenali PIN Anda, atau pilih langsung <em>Admin Absensi</em> / <em>Admin Keuangan</em>.
                </li>
                <li>
                  <strong>Ketik Angka PIN lalu Aktifkan:</strong> Masukkan <strong>1234</strong> untuk membuka input absensi dan menu <strong>Pengaturan</strong> (<em>label ②</em>), atau masukkan <strong>123456</strong> untuk membuka menu <strong>Keuangan &amp; Gaji</strong> (<em>label ③</em>), lalu tekan tombol <strong>Verifikasi &amp; Aktifkan</strong>.
                </li>
                <li>
                  <strong>Membuka Kedua Peran Sekaligus:</strong> Setelah masuk sebagai Admin Absensi, Anda tetap dapat mengklik <strong>Buka Admin Keuangan</strong> di bawah Sidebar untuk mengaktifkan keduanya bersamaan, dan dapat mengunci salah satunya atau keluar semua saat selesai bekerja.
                </li>
                <li>
                  <strong>Mengecilkan Sidebar (Compact):</strong> Klik ikon panah kecil di garis tepi kanan Sidebar (<em>label ①</em>) agar menu kiri berubah menjadi ikon ringkas sehingga area tabel di layar menjadi lebih luas.
                </li>
              </ol>
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 4: BAB III - DASHBOARD & POP-UP NOTIFIKASI */}
        <BookSheet
          id="bab-3"
          companyName={companyName}
          sectionTitle="Bab III · Dashboard & Notifikasi"
          pageLabel="4"
        >
          <div className="space-y-3">
            <ChapterHeading
              kicker="Bab III"
              title="Dashboard Harian dan Jendela Pop-Up Notifikasi"
              subtitle="Memantau Kehadiran Hari Ini dan Riwayat Aktivitas Tanpa Menghalangi Layar"
            />

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                3.1 Cara Membaca Halaman Dashboard
              </h3>
              <p className="book-indent">
                Halaman <strong>Dashboard</strong> berfungsi seperti papan informasi pagi hari. Empat kotak angka di bagian paling atas langsung memberi tahu jumlah karyawan aktif, jumlah orang yang sudah tercatat masuk hari ini, jumlah yang terlambat atau izin telat, serta jumlah orang yang sedang libur. Di bawahnya terdapat grafik batang kehadiran 7 hari terakhir dan daftar nama karyawan yang <strong>belum diabsen hari ini</strong> agar Admin Absensi bisa segera melengkapinya.
              </p>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                3.2 Memakai Pop-Up Notifikasi Non-Blur dan Mengaktifkan Notifikasi HP/PC
              </h3>
              <ol className="list-decimal pl-6 space-y-1 text-[11.5px] text-slate-700">
                <li>
                  Klik ikon <strong>Lonceng</strong> di bilah atas kanan (<em>label ①</em>) untuk memunculkan jendela <strong>Pusat Notifikasi</strong> bergaya pop-up mengambang.
                </li>
                <li>
                  Halaman di belakang pop-up <strong>tidak dibuat buram (non-blur) dan tetap bisa diklik</strong> (<em>label ②</em>), sehingga Anda bisa mengecek catatan aktivitas sambil tetap melihat atau menggulir tabel di layar utama.
                </li>
                <li>
                  Klik salah satu kartu notifikasi (<em>label ③</em>) untuk langsung melompat ke halaman terkait, atau buka tab <strong>Perangkat &amp; Preferensi</strong> (<em>label ④</em>) lalu klik <em>Izinkan Perangkat</em> agar pemberitahuan juga muncul di layar HP/komputer Anda.
                </li>
              </ol>

              <FigureDashboardAndNotif />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 5: BAB IV (1/2) - MENGISI MATRIKS DAFTAR HADIR */}
        <BookSheet
          id="bab-4"
          companyName={companyName}
          sectionTitle="Bab IV · Mengisi Matriks Absensi"
          pageLabel="5"
        >
          <div className="space-y-3">
            <ChapterHeading
              kicker="Bab IV (Bagian 1)"
              title="Mencatat Kehadiran di Matriks Daftar Hadir"
              subtitle="Mengenal Kode Kehadiran dan Tiga Cara Input Absensi Sehari-hari"
            />

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                4.1 Mengenal Isi Tabel Matriks dan Arti Huruf Kode
              </h3>
              <p className="book-indent">
                Halaman <strong>Matriks Daftar Hadir</strong> berbentuk tabel besar berisi nama seluruh karyawan di sebelah kiri dan tanggal 1 sampai akhir bulan di bagian atas. Huruf di dalam kotak tanggal menunjukkan status setiap hari: <strong>H</strong> (Hadir), <strong>T</strong> (Terlambat), <strong>IT</strong> (Izin Terlambat), <strong>I</strong> (Izin), <strong>S</strong> (Sakit), <strong>A</strong> (Alpha / Tanpa Kabar), dan <strong>L</strong> (Libur Karyawan).
              </p>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                4.2 Tiga Cara Praktis Mengisi Absensi (Wajib Aktifkan Admin Absensi Lebih Dulu)
              </h3>
              <ol className="list-decimal pl-6 space-y-1 text-[11.5px] text-slate-700">
                <li>
                  <strong>Cara 1 — Pakai Tombol Input Absensi (Paling Lengkap):</strong> Klik tombol biru <strong>Input Absensi</strong> (<em>label ①</em>), cari nama karyawan, pilih tanggal dan shift, lalu isi jam datang/pulang, jam lembur, atau alasan izin terlambat.
                </li>
                <li>
                  <strong>Cara 2 — Pakai Mode Klik Sel Cepat (Paling Cepat):</strong> Pilih status pada bilah <em>Mode Klik Sel</em> (<em>label ②</em>, misalnya klik <code>Hadir (H)</code>), lalu klik kotak tanggal di tabel (<em>label ③</em>) untuk langsung menyimpan tanpa membuka formulir.
                </li>
                <li>
                  <strong>Cara 3 — Pakai Tombol Keyboard:</strong> Arahkan klik pada salah satu kotak tanggal di tabel, lalu tekan huruf <code>H</code>, <code>T</code>, <code>I</code>, <code>S</code>, <code>A</code>, <code>L</code>, atau tombol <code>Delete</code> untuk menghapus catatan hari itu (<em>label ④</em>).
                </li>
              </ol>

              <FigureMatrixInputMethods />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 6: BAB IV (2/2) - WARNA MATRIKS, LOG & EKSPOR */}
        <BookSheet
          id="bab-4-warna"
          companyName={companyName}
          sectionTitle="Bab IV · Warna, Log & Ekspor"
          pageLabel="6"
        >
          <div className="space-y-3.5">
            <ChapterHeading
              kicker="Bab IV (Bagian 2)"
              title="Mengubah Warna Matriks, Log Harian, dan Ekspor Laporan"
              subtitle="Menyesuaikan Warna Langsung dari Keterangan serta Mencetak Laporan"
            />

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                4.3 Cara Mengubah Warna Matriks Langsung di Panel Keterangan
              </h3>
              <p className="book-indent">
                Anda tidak perlu berpindah ke menu Pengaturan hanya untuk mengganti warna status di Matriks. Saat <strong>Admin Absensi</strong> aktif, ikuti langkah mudah berikut:
              </p>
              <ol className="list-decimal pl-6 space-y-1 text-[11.5px] text-slate-700">
                <li>
                  Lihat kotak <strong>Keterangan</strong> di sisi kiri tabel Matriks (<em>label ① pada Gambar 4.2</em>).
                </li>
                <li>
                  Klik baris status yang ingin diganti warnanya (misalnya baris <em>HADIR</em>, <em>TERLAMBAT</em>, <em>SAKIT</em>, atau <em>LIBUR KARYAWAN</em>), atau klik tombol <strong>Warna</strong> di bagian atas kotak Keterangan.
                </li>
                <li>
                  Pilih warna kotak dan warna huruf yang diinginkan pada jendela pemilih warna (<em>label ②</em>), lalu klik <strong>Simpan</strong>. Warna baru langsung berubah di layar, hasil cetak, dan file Excel.
                </li>
              </ol>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                4.4 Membaca Log Absensi Harian, Cetak Lanskap, dan Unduh Excel
              </h3>
              <p className="book-indent">
                Untuk melihat rincian jam masuk, jam pulang, total menit keterlambatan, dan catatan harian karyawan, klik sub-tab <strong>Log Absensi</strong> (<em>label ③</em>). Jika ingin mencetak tabel matriks sebulan penuh, klik tombol <strong>Cetak</strong> (<em>label ④</em>) dan pilih orientasi kertas mendatar (<em>Landscape</em>), atau klik <strong>Ekspor Excel</strong> untuk mengunduh file <code>.xlsx</code> lengkap dengan warna selnya.
              </p>

              <FigureMatrixColorAndExport />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 7: BAB V - JADWAL SHIFT & PINDAH LIBUR */}
        <BookSheet
          id="bab-5"
          companyName={companyName}
          sectionTitle="Bab V · Jadwal Shift & Pindah Libur"
          pageLabel="7"
        >
          <div className="space-y-3">
            <ChapterHeading
              kicker="Bab V"
              title="Mengatur Jadwal Shift dan Memindahkan Hari Libur"
              subtitle="Penugasan Karyawan per Shift, Aturan Anti-Bentrok, dan Prosedur Pindah Libur"
            />

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                5.1 Cara Mengatur Shift dan Aturan Anti Double Shift
              </h3>
              <p className="book-indent">
                Pada menu <strong>Jadwal Shift</strong>, Admin Absensi dapat memilih siapa saja yang bertugas di Shift Pagi, Sela, Reguler, maupun Shift Malam untuk setiap hari (Senin–Minggu). Klik tombol <strong>Atur</strong> di kartu hari, lalu centang nama karyawan yang masuk. Sistem menjaga aturan <strong>Anti Double Shift</strong>: satu orang tidak boleh masuk dua shift berbeda pada hari yang sama, dan tombol <strong>Salin Jadwal</strong> dapat dipakai untuk menyalin susunan shift ke hari lain dengan cepat.
              </p>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                5.2 Mengapa Karyawan Libur Terkunci dan Cara Memindahkan Liburnya
              </h3>
              <p className="book-indent">
                Jika seorang karyawan sedang libur pada hari tersebut, namanya otomatis terkunci dan <strong>tidak bisa dicentang masuk ke jadwal shift</strong> agar hak istirahatnya terjaga. Namun bila karyawan tersebut tetap harus masuk kerja hari itu, ikuti langkah di bawah ini (<em>lihat Gambar 5.1</em>):
              </p>
              <ol className="list-decimal pl-6 space-y-1 text-[11.5px] text-slate-700">
                <li>
                  Klik tombol <strong>Pindah Libur</strong> di samping nama karyawan pada daftar <em>Libur / OFF</em> (<em>label ①</em>) atau di dalam jendela <em>Atur Shift</em>.
                </li>
                <li>
                  Pada jendela yang terbuka (<em>label ②</em>), pilih <strong>Pindah Hari Libur Rutin</strong> (misalnya geser libur mingguan dari Senin ke Rabu) atau <strong>Pindah Tanggal Libur Khusus</strong> (tukar tanggal libur minggu ini ke tanggal lain).
                </li>
                <li>
                  Centang opsi <strong>Langsung masukkan ke shift</strong> (<em>label ③</em>) jika ingin langsung memasukkannya ke shift hari itu, lalu klik <strong>Simpan Perubahan</strong> (<em>label ④</em>). Untuk mencetak jadwal mingguan yang rapi, buka tab <strong>Preview Jadwal</strong>.
                </li>
              </ol>

              <FigureShiftAndMoveOff />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 8: BAB VI - JADWAL LIBUR & MASTER KARYAWAN */}
        <BookSheet
          id="bab-6"
          companyName={companyName}
          sectionTitle="Bab VI · Jadwal Libur & Karyawan"
          pageLabel="8"
        >
          <div className="space-y-3.5">
            <ChapterHeading
              kicker="Bab VI"
              title="Mengatur Jadwal Libur Individu dan Data Karyawan"
              subtitle="Hari Libur Mingguan Berbeda, Tanggal Khusus, Kalender Bulanan, dan Tambah Karyawan"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                6.1 Cara Menambah Karyawan dan Mengatur Libur Tiap Orang
              </h3>
              <p className="book-indent">
                Menu <strong>Jadwal Libur</strong> adalah pusat pengelolaan data karyawan beserta jadwal liburnya masing-masing. Saat <strong>Admin Absensi</strong> aktif, Anda dapat melakukan tiga pekerjaan utama di halaman ini:
              </p>
              <ol className="list-decimal pl-6 space-y-1.5 text-[11.5px] text-slate-700">
                <li>
                  <strong>Menambah atau Mengubah Data Karyawan:</strong> Klik tombol <strong>+ Tambah Karyawan</strong> (<em>label ① pada Gambar 6.1</em>) untuk mengisi kode pegawai, nama lengkap, divisi, jabatan, hari libur rutin, dan status aktif. Karyawan yang dinonaktifkan tetap aman tersimpan riwayatnya untuk laporan lama.
                </li>
                <li>
                  <strong>Mengatur Libur Rutin dan Tanggal Khusus:</strong> Pilih hari libur mingguan untuk tiap karyawan (boleh berbeda antar karyawan). Jika ada libur tambahan, cuti, atau tanggal pengganti, tambahkan pada kolom <strong>Tanggal Libur Khusus</strong> (<em>label ②</em>).
                </li>
                <li>
                  <strong>Melihat Kalender Bulanan:</strong> Klik tab <strong>Kalender Bulanan</strong> (<em>label ③</em>) untuk melihat ringkasan berapa orang yang masuk kerja dan berapa orang yang libur di setiap tanggal dalam satu bulan.
                </li>
              </ol>

              <FigureDayOffAndCalendar />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 9: BAB VII - REKAP BULANAN & CICIL KETERLAMBATAN */}
        <BookSheet
          id="bab-7"
          companyName={companyName}
          sectionTitle="Bab VII · Rekap & Cicil Telat"
          pageLabel="9"
        >
          <div className="space-y-3.5">
            <ChapterHeading
              kicker="Bab VII"
              title="Membaca Rekap Bulanan dan Mencicil Keterlambatan"
              subtitle="Laporan Kehadiran Sebulan, Jam Lembur, dan Penyelesaian Menit Telat"
            />

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                7.1 Mengecek Persentase Hadir, Jam Kerja, dan Lembur Manual
              </h3>
              <p className="book-indent">
                Menu <strong>Rekap Bulanan</strong> otomatis menghitung berapa hari wajib masuk tiap karyawan (sudah dikurangi hari liburnya), jumlah hadir, terlambat, izin, sakit, alpha, persentase kehadiran, total jam kerja, dan total jam lembur manual. Anda dapat menyaring laporan berdasarkan divisi, mencetaknya, atau mengunduh ke file Excel maupun CSV kapan saja.
              </p>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                7.2 Cara Mencatat Penggantian / Cicilan Keterlambatan (Gambar 7.1)
              </h3>
              <p className="book-indent">
                Buka tab kedua bernama <strong>Data Keterlambatan &amp; Penggantian</strong> untuk melihat siapa saja yang memiliki menit keterlambatan (dihitung otomatis dari jam masuk dikurangi jam shift dan batas toleransinya, <em>label ①</em>). Saat <strong>Admin Absensi</strong> aktif, klik tombol <strong>Ganti / Cicil</strong> lalu pilih salah satu metode:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-[11.5px] text-slate-700">
                <li>
                  <strong>Tambahan Jam Kerja (Label ②):</strong> Karyawan mengganti menit telat dengan kerja ekstra di luar jam shift (catat tanggal serta jam mulai dan jam selesainya).
                </li>
                <li>
                  <strong>Potongan Gaji (Label ③):</strong> Sisa menit keterlambatan dikonversi ke nominal rupiah sesuai tarif perusahaan, lalu otomatis terbaca oleh menu <strong>Rekap Gaji</strong>.
                </li>
              </ul>

              <FigureRecapAndLateSettlement />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 10: BAB VIII - KEUANGAN PERUSAHAAN */}
        <BookSheet
          id="bab-8"
          companyName={companyName}
          sectionTitle="Bab VIII · Keuangan Perusahaan"
          pageLabel="10"
        >
          <div className="space-y-3.5">
            <ChapterHeading
              kicker="Bab VIII · Khusus Admin Keuangan"
              title="Mengelola Keuangan Perusahaan"
              subtitle="Pencatatan Saldo Kas Tunai, Rekening Bank, Pemasukan, Pengeluaran, dan Transfer"
              accentClass="text-emerald-800"
            />

            <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-3 text-[11.5px] text-emerald-950 flex items-start gap-2.5 book-avoid-break">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Akses Rahasia:</strong> Menu Keuangan Perusahaan tidak tampil pada Mode Biasa maupun Admin Absensi. Menu ini baru terbuka setelah Anda memasukkan <strong>PIN Keuangan (bawaan: 123456)</strong>.
              </p>
            </div>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                8.1 Cara Menggunakan Buku Kas Perusahaan (Gambar 8.1)
              </h3>
              <ol className="list-decimal pl-6 space-y-1.5 text-[11.5px] text-slate-700">
                <li>
                  <strong>Pantau Saldo Rekening (Label ①):</strong> Di bagian atas layar terlihat saldo masing-masing rekening atau dompet perusahaan, baik <em>Kas Tunai (Cash)</em> maupun <em>Rekening Bank (Transfer)</em>.
                </li>
                <li>
                  <strong>Catat Pemasukan &amp; Pengeluaran (Label ②):</strong> Klik tombol tambah transaksi untuk mencatat uang masuk (pendapatan) atau uang keluar (biaya operasional, pembelian, kasbon), pilih kategori dan rekening sumbernya, lalu simpan. Anda juga dapat menambah atau mengubah nama kategori transaksi.
                </li>
                <li>
                  <strong>Pindahkan Saldo (Transfer Antarkas):</strong> Gunakan tab atau tombol <em>Perpindahan Saldo</em> jika ingin mencatat setor tunai dari brankas kas ke rekening bank, tarik tunai bank ke kas, maupun transfer antarbank tanpa mengacaukan hitungan laba-rugi.
                </li>
                <li>
                  <strong>Cetak &amp; Unduh Laporan Excel (Label ③):</strong> Gunakan tombol <strong>Ekspor Excel</strong> untuk mengunduh laporan arus kas bulanan sebagai arsip pembukuan resmi.
                </li>
              </ol>

              <FigureFinanceDashboard />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 11: BAB IX - REKAP GAJI & SLIP GAJI */}
        <BookSheet
          id="bab-9"
          companyName={companyName}
          sectionTitle="Bab IX · Rekap & Slip Gaji"
          pageLabel="11"
        >
          <div className="space-y-3.5">
            <ChapterHeading
              kicker="Bab IX · Khusus Admin Keuangan"
              title="Menghitung Rekap Gaji dan Mencetak Slip Gaji"
              subtitle="Perhitungan Gaji Otomatis dari Data Kehadiran hingga Pembayaran Resmi"
              accentClass="text-emerald-800"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                9.1 Langkah Menyusun, Membayar, dan Mencetak Slip Gaji (Gambar 9.1)
              </h3>
              <p className="book-indent">
                Menu <strong>Rekap Gaji</strong> membantu Admin Keuangan menghitung gaji bulanan seluruh karyawan secara cepat dan akurat tanpa menghitung manual satu per satu:
              </p>
              <ol className="list-decimal pl-6 space-y-1.5 text-[11.5px] text-slate-700">
                <li>
                  <strong>Atur Profil Gaji Karyawan (Label ①):</strong> Buka profil gaji tiap karyawan untuk mengisi gaji pokok, tunjangan (jabatan, makan, transportasi), tarif upah lembur per jam, potongan tetap (misalnya cicilan kasbon), serta keikutsertaan BPJS Kesehatan dan BPJS Ketenagakerjaan.
                </li>
                <li>
                  <strong>Perhitungan Otomatis (Label ②):</strong> Sistem langsung menggabungkan profil gaji tersebut dengan data kehadiran dari Matriks dan Rekap Bulanan: menambah uang lembur serta bonus, lalu mengurangi potongan Alpha dan potongan keterlambatan secara otomatis.
                </li>
                <li>
                  <strong>Kenaikan Gaji &amp; Riwayat:</strong> Apabila ada penyesuaian gaji, gunakan fitur <em>Kenaikan Gaji</em> (berdasarkan persentase atau nominal rupiah) agar perubahan tercatat rapi dalam riwayat.
                </li>
                <li>
                  <strong>Tandai Dibayar &amp; Cetak Slip Gaji (Label ③):</strong> Ubah status gaji menjadi <em>Disetujui</em> atau <em>Dibayar</em> (dapat sekalian memotong saldo kas di menu Keuangan), lalu klik tombol <strong>Cetak Slip Gaji</strong> untuk mencetak satu karyawan atau seluruh karyawan sekaligus.
                </li>
              </ol>

              <FigurePayrollAndSlip />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 12: BAB X - PROFIL PERUSAHAAN & PENGATURAN SISTEM */}
        <BookSheet
          id="bab-10"
          companyName={companyName}
          sectionTitle="Bab X · Profil & Pengaturan"
          pageLabel="12"
        >
          <div className="space-y-3">
            <ChapterHeading
              kicker="Bab X"
              title="Profil Perusahaan dan Pengaturan Sistem"
              subtitle="Mengelola Identitas Perusahaan, Jam Shift, Mengganti PIN Ganda, dan Backup Data"
            />

            <section className="space-y-1">
              <h3 className="font-display text-sm font-bold text-slate-900">
                10.1 Memperbarui Profil Perusahaan dan Lokasi Cabang
              </h3>
              <p className="book-indent">
                Halaman <strong>Profil Perusahaan</strong> menampilkan nama perusahaan, logo, bidang usaha, NPWP/NIB, alamat pusat, nomor telepon, visi, misi, sebaran divisi, dan daftar kantor cabang. Saat <strong>Admin Absensi</strong> aktif, seluruh keterangan dan daftar cabang ini dapat disunting serta langsung tampil di kepala laporan cetak dan sampul buku panduan ini.
              </p>
            </section>

            <section className="space-y-1.5 pt-1 border-t border-slate-200">
              <h3 className="font-display text-sm font-bold text-slate-900">
                10.2 Mengatur Shift, Mengganti PIN Absensi vs. PIN Keuangan, dan Backup (Gambar 10.1)
              </h3>
              <p className="book-indent">
                Menu <strong>Pengaturan</strong> hanya muncul ketika Anda membuka kunci dengan <strong>PIN Absensi</strong>. Di dalamnya tersedia: (a) pengaturan jam masuk, jam pulang, dan batas toleransi telat per shift; (b) pengaturan tarif potongan telat per menit dan skema warna matriks; (c) kartu <strong>Keamanan &amp; PIN Akses Terpisah</strong> untuk mengganti <strong>PIN Absensi</strong> (<em>label ①</em>) dan <strong>PIN Keuangan</strong> (<em>label ②</em>) sepanjang 4–12 digit angka dengan syarat kedua PIN wajib berbeda; serta (d) tombol <strong>Unduh Backup JSON</strong> (<em>label ③</em>) untuk menyimpan cadangan aman sebelum melakukan <em>Restore</em> atau <em>Reset Data</em>.
              </p>

              <FigureSettingsDualPin />
            </section>
          </div>
        </BookSheet>

        {/* HALAMAN 13: BAB XI - PENYELESAIAN MASALAH & KOLOFON */}
        <BookSheet
          id="bab-11"
          companyName={companyName}
          sectionTitle="Bab XI · Penyelesaian Masalah"
          pageLabel="13"
        >
          <div className="space-y-3">
            <ChapterHeading
              kicker="Bab XI"
              title="Penyelesaian Masalah (Troubleshooting) dan Penutup"
              subtitle="Solusi Cepat Kendala Operasional dan Informasi Pengembang"
              accentClass="text-rose-700"
            />

            <p className="book-indent">
              Jika menemui kendala saat memakai aplikasi, silakan periksa tabel solusi cepat di bawah ini sebelum menghubungi admin atau pengelola sistem:
            </p>

            <div className="overflow-hidden rounded-xl border border-slate-300 book-avoid-break">
              <table className="w-full text-left border-collapse text-[10px] leading-snug">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-1.5 px-2.5 font-semibold w-[27%]">Masalah yang Dialami</th>
                    <th className="py-1.5 px-2.5 font-semibold w-[27%]">Penyebabnya</th>
                    <th className="py-1.5 px-2.5 font-semibold w-[46%]">Cara Mengatasinya</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                      Tombol Input Absensi, Tambah Karyawan, atau Edit Jadwal hilang
                    </td>
                    <td className="py-1.5 px-2.5">
                      Aplikasi masih dalam Mode Biasa (hanya lihat).
                    </td>
                    <td className="py-1.5 px-2.5">
                      Klik tombol <strong>Admin Absensi</strong> di kanan atas atau <strong>Masuk Mode Admin</strong> di bawah Sidebar, lalu masukkan PIN Absensi (bawaan <code>1234</code>).
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                      Menu Pengaturan tidak ada di Sidebar
                    </td>
                    <td className="py-1.5 px-2.5">
                      Belum masuk Admin Absensi (atau baru masuk Admin Keuangan).
                    </td>
                    <td className="py-1.5 px-2.5">
                      Menu Pengaturan hanya muncul dengan <strong>PIN Absensi</strong> (<code>1234</code>). Aktifkan peran Admin Absensi.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                      Menu Keuangan &amp; Rekap Gaji tidak terlihat walau sudah masuk Admin Absensi
                    </td>
                    <td className="py-1.5 px-2.5">
                      Hak akses absensi dan keuangan memang dipisah demi kerahasiaan gaji.
                    </td>
                    <td className="py-1.5 px-2.5">
                      Klik <strong>Admin Keuangan</strong> di atas atau <strong>Buka Admin Keuangan</strong> di Sidebar, lalu masukkan PIN Keuangan (bawaan <code>123456</code>).
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                      Gagal menyimpan PIN baru di menu Pengaturan
                    </td>
                    <td className="py-1.5 px-2.5">
                      PIN kurang dari 4 angka, bukan angka, PIN lama salah, atau PIN disamakan.
                    </td>
                    <td className="py-1.5 px-2.5">
                      Gunakan 4–12 angka saja, periksa PIN lama, dan pastikan PIN Absensi berbeda dari PIN Keuangan.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                      Karyawan tidak bisa dimasukkan ke Jadwal Shift hari ini
                    </td>
                    <td className="py-1.5 px-2.5">
                      Karyawan sedang libur hari itu atau sudah masuk shift lain.
                    </td>
                    <td className="py-1.5 px-2.5">
                      Klik tombol <strong>Pindah Libur</strong> di nama karyawan untuk menggeser liburnya ke hari lain, atau keluarkan dulu dari shift sebelumnya.
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                      Warna Matriks belum berubah di layar setelah diedit
                    </td>
                    <td className="py-1.5 px-2.5">
                      Belum menekan tombol Simpan pada kotak pemilih warna Keterangan.
                    </td>
                    <td className="py-1.5 px-2.5">
                      Klik baris status di panel Keterangan, pilih warna latar dan huruf, lalu tekan <strong>Simpan</strong>.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                      Notifikasi tidak muncul di layar HP atau komputer
                    </td>
                    <td className="py-1.5 px-2.5">
                      Izin notifikasi di browser belum diizinkan atau masih terblokir.
                    </td>
                    <td className="py-1.5 px-2.5">
                      Buka pop-up Pusat Notifikasi → tab <strong>Perangkat &amp; Preferensi</strong> → klik <strong>Izinkan Perangkat</strong>.
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                      Hasil cetak Matriks Absensi terpotong atau sampul buku berwarna putih
                    </td>
                    <td className="py-1.5 px-2.5">
                      Arah kertas belum sesuai atau opsi warna latar cetak belum dicentang.
                    </td>
                    <td className="py-1.5 px-2.5">
                      Pilih <strong>Landscape</strong> untuk Matriks dan <strong>Portrait</strong> untuk Buku Panduan, aktifkan <em>Background Graphics</em>, atau gunakan tombol <strong>Export PDF Buku</strong>.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Kolofon & Kredit Resmi */}
            <div className="mt-2.5 rounded-2xl border border-slate-300 bg-slate-50 p-4 book-avoid-break">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-blue-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Kolofon &amp; Informasi Pengembang</span>
                  </div>
                  <h4 className="font-display text-sm font-bold text-slate-900">
                    {companyName} — Sistem Manajemen Presensi, Shift, dan Keuangan
                  </h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Seluruh materi panduan ini disusun dengan bahasa yang sederhana dan disertai gambar petunjuk agar mudah dipahami, dicetak, maupun diekspor ke PDF sebagai pegangan resmi perusahaan.
                  </p>
                  <div className="pt-0.5 text-[11px] text-slate-700">
                    <span className="font-semibold">Alamat Akses Aplikasi: </span>
                    <a
                      href="https://absensi-karyawan-12.vercel.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-bold text-blue-800 underline underline-offset-2"
                    >
                      https://absensi-karyawan-12.vercel.app/
                    </a>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-900 text-white px-5 py-3 text-center shrink-0">
                  <div className="text-[9.5px] font-mono uppercase tracking-widest text-amber-300">
                    Penyusun &amp; Developer Aplikasi
                  </div>
                  <div className="font-display text-lg font-extrabold text-white mt-0.5">
                    Denuda
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-[10.5px] text-slate-500 pt-0.5">
              <Wrench className="w-3.5 h-3.5 text-slate-400" />
              <span>Dokumentasi Resmi · Disusun oleh Denuda</span>
            </div>
          </div>
        </BookSheet>
      </div>
    </div>
  );
};
