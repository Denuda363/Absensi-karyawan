import React, { useState } from 'react';
import {
  BookOpen,
  Building2,
  CheckCircle2,
  Printer,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { AppSettings } from '../types';

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
  { id: 'bab-2', shortLabel: 'Bab II', fullTitle: 'Bab II · Keamanan PIN Ganda & Navigasi', page: '2' },
  { id: 'bab-3', shortLabel: 'Bab III', fullTitle: 'Bab III · Dashboard & Notifikasi Pop-Up', page: '3' },
  { id: 'bab-4', shortLabel: 'Bab IV', fullTitle: 'Bab IV · Matriks Daftar Hadir & Warna', page: '4' },
  { id: 'bab-5', shortLabel: 'Bab V', fullTitle: 'Bab V · Jadwal Shift & Pindah Libur', page: '5' },
  { id: 'bab-6', shortLabel: 'Bab VI', fullTitle: 'Bab VI · Jadwal Libur & Master Karyawan', page: '6' },
  { id: 'bab-7', shortLabel: 'Bab VII', fullTitle: 'Bab VII · Rekap Bulanan & Keterlambatan', page: '7' },
  { id: 'bab-8', shortLabel: 'Bab VIII–IX', fullTitle: 'Bab VIII & IX · Keuangan & Rekap Gaji', page: '8' },
  { id: 'bab-10', shortLabel: 'Bab X–XI', fullTitle: 'Bab X & XI · Profil & Pengaturan', page: '9' },
  { id: 'bab-12', shortLabel: 'Bab XII', fullTitle: 'Bab XII · Penyelesaian Masalah & Penutup', page: '10' },
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
  { code: 'BAB I', title: 'Pengenalan Aplikasi', page: '1', anchorId: 'bab-1' },
  { code: '1.1', title: 'Latar Belakang dan Tujuan Pengembangan', page: '1', indent: true, anchorId: 'bab-1' },
  { code: '1.2', title: 'Ruang Lingkup Modul Terpadu', page: '1', indent: true, anchorId: 'bab-1' },
  { code: '1.3', title: 'Alur Kerja Operasional Sistem', page: '1', indent: true, anchorId: 'bab-1' },
  { code: '1.4', title: 'Keunggulan Arsitektur dan Dukungan Perangkat', page: '1', indent: true, anchorId: 'bab-1' },
  { code: 'BAB II', title: 'Arsitektur Akses, Keamanan PIN Ganda, dan Navigasi', page: '2', anchorId: 'bab-2' },
  { code: '2.1', title: 'Mode Biasa (Akses Baca Saja / Read-Only)', page: '2', indent: true, anchorId: 'bab-2' },
  { code: '2.2', title: 'Pemisahan Otorisasi PIN Absensi dan PIN Keuangan', page: '2', indent: true, anchorId: 'bab-2' },
  { code: '2.3', title: 'Navigasi Sidebar 3D dan Mode Ciut (Compact)', page: '2', indent: true, anchorId: 'bab-2' },
  { code: 'BAB III', title: 'Dashboard Eksekutif dan Pusat Notifikasi Pop-Up', page: '3', anchorId: 'bab-3' },
  { code: '3.1', title: 'Ringkasan KPI Harian dan Grafik Kehadiran Tujuh Hari', page: '3', indent: true, anchorId: 'bab-3' },
  { code: '3.2', title: 'Pusat Notifikasi Pop-Up Interaktif (Tanpa Blur)', page: '3', indent: true, anchorId: 'bab-3' },
  { code: '3.3', title: 'Pengaktifan Notifikasi Sistem Perangkat (OS dan PWA)', page: '3', indent: true, anchorId: 'bab-3' },
  { code: 'BAB IV', title: 'Matriks Daftar Hadir, Pewarnaan Langsung, dan Log Absensi', page: '4', anchorId: 'bab-4' },
  { code: '4.1', title: 'Membaca Matriks dan Indikator Ringkasan Bulanan', page: '4', indent: true, anchorId: 'bab-4' },
  { code: '4.2', title: 'Input Absensi, Mode Klik Sel Cepat, dan Pintasan Keyboard', page: '4', indent: true, anchorId: 'bab-4' },
  { code: '4.3', title: 'Mengubah Warna Matriks Langsung dari Keterangan', page: '4', indent: true, anchorId: 'bab-4' },
  { code: '4.4', title: 'Log Catatan Absensi, Cetak Lanskap, dan Ekspor Excel', page: '4', indent: true, anchorId: 'bab-4' },
  { code: 'BAB V', title: 'Manajemen Jadwal Shift dan Prosedur Pindah Libur', page: '5', anchorId: 'bab-5' },
  { code: '5.1', title: 'Penugasan Shift Harian dan Proteksi Anti Double Shift', page: '5', indent: true, anchorId: 'bab-5' },
  { code: '5.2', title: 'Aturan Karyawan Libur dan Prosedur Pindah Hari/Tanggal Libur', page: '5', indent: true, anchorId: 'bab-5' },
  { code: '5.3', title: 'Salin Jadwal Harian, Matriks Mingguan, dan Pratinjau Cetak', page: '5', indent: true, anchorId: 'bab-5' },
  { code: 'BAB VI', title: 'Jadwal Libur Individu dan Data Master Karyawan', page: '6', anchorId: 'bab-6' },
  { code: '6.1', title: 'Penetapan Hari Libur Rutin Mingguan dan Tanggal Khusus', page: '6', indent: true, anchorId: 'bab-6' },
  { code: '6.2', title: 'Kalender Operasional Bulanan dan Pengelolaan Master Karyawan', page: '6', indent: true, anchorId: 'bab-6' },
  { code: 'BAB VII', title: 'Rekapitulasi Bulanan dan Penyelesaian Keterlambatan', page: '7', anchorId: 'bab-7' },
  { code: '7.1', title: 'Evaluasi Kehadiran Efektif, Jam Kerja, dan Lembur Manual', page: '7', indent: true, anchorId: 'bab-7' },
  { code: '7.2', title: 'Cicilan Penyelesaian Keterlambatan (Tambahan Jam / Potong Gaji)', page: '7', indent: true, anchorId: 'bab-7' },
  { code: 'BAB VIII', title: 'Keuangan Perusahaan (Khusus Admin Keuangan)', page: '8', anchorId: 'bab-8' },
  { code: '8.1', title: 'Pencatatan Arus Kas Masuk, Keluar, dan Perpindahan Saldo', page: '8', indent: true, anchorId: 'bab-8' },
  { code: 'BAB IX', title: 'Rekapitulasi Penggajian dan Slip Gaji Resmi', page: '8', anchorId: 'bab-8' },
  { code: '9.1', title: 'Komponen Gaji, BPJS, Kenaikan Gaji, dan Pencetakan Slip', page: '8', indent: true, anchorId: 'bab-8' },
  { code: 'BAB X', title: 'Profil Perusahaan dan Lokasi Kantor Cabang', page: '9', anchorId: 'bab-10' },
  { code: 'BAB XI', title: 'Pengaturan Sistem, Pengelolaan PIN Ganda, dan Backup/Restore', page: '9', anchorId: 'bab-10' },
  { code: '11.1', title: 'Konfigurasi Shift, Palet Warna Matriks, dan Koneksi Database', page: '9', indent: true, anchorId: 'bab-10' },
  { code: '11.2', title: 'Pembaruan PIN Absensi vs. PIN Keuangan dan Reset Bertingkat', page: '9', indent: true, anchorId: 'bab-10' },
  { code: 'BAB XII', title: 'Penyelesaian Masalah (Troubleshooting) dan Kolofon', page: '10', anchorId: 'bab-12' },
];

interface SheetChromeProps {
  companyName: string;
  sectionTitle: string;
  pageLabel: string;
  children: React.ReactNode;
  id?: string;
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
    className="book-sheet p-7 sm:p-10 md:p-12 print:p-0 flex flex-col justify-between text-slate-800"
  >
    <div>
      {/* Running Header */}
      <header className="grid grid-cols-[1fr_auto] items-center gap-4 pb-2.5 mb-6 border-b border-slate-300 text-[10.5px] text-slate-500">
        <span className="font-semibold uppercase tracking-wider text-slate-700 truncate text-left">
          {companyName} — Buku Panduan Pengguna
        </span>
        <span className="font-mono uppercase tracking-wide shrink-0 text-right">
          {sectionTitle}
        </span>
      </header>

      <div className="book-prose text-[12.5px] leading-relaxed text-slate-800">
        {children}
      </div>
    </div>

    {/* Running Footer with centered page number */}
    <footer className="mt-7 pt-2.5 border-t border-slate-300 grid grid-cols-3 items-center gap-2 text-[10px] text-slate-500">
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
  <div className="text-center pb-4 mb-5 border-b-2 border-slate-900">
    <div className={`text-[10.5px] font-mono font-bold uppercase tracking-[0.2em] ${accentClass}`}>
      {kicker}
    </div>
    <h2 className="font-display text-xl sm:text-[22px] font-bold text-slate-900 mt-1 leading-snug">
      {title}
    </h2>
    {subtitle && (
      <p className="book-center-copy text-[11.5px] text-slate-500 mt-1 font-medium">
        {subtitle}
      </p>
    )}
    <div className="mt-2.5 mx-auto w-16 h-0.5 bg-slate-900/80" />
  </div>
);

export const PanduanPenggunaView: React.FC<PanduanPenggunaViewProps> = ({ settings }) => {
  const [activeAnchor, setActiveAnchor] = useState<string>('sampul');
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

  return (
    <div className="space-y-5 print:space-y-0">
      <style media="print">{`@page { size: A4 portrait; margin: 16mm 16mm 16mm 20mm; }`}</style>

      {/* Executive Screen Toolbar (Hidden when printing) */}
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

          <button
            type="button"
            onClick={() => window.print()}
            className="btn-3d-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / Simpan Buku PDF</span>
          </button>
        </div>

        {/* Chapter Quick-Jump Strip */}
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
      <div className="book-container flex flex-col gap-6 print:gap-0">
        {/* HALAMAN SAMPUL (COVER DEPAN EKSEKUTIF & PROFESIONAL) */}
        <article
          id="sampul"
          className="book-sheet book-cover overflow-hidden bg-[#080F1F] text-white flex flex-col justify-between p-8 sm:p-12 md:p-14 relative"
        >
          {/* Architectural Background Grid & Ambient Depth */}
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
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.22),_transparent_58%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(217,119,6,0.14),_transparent_55%)]"
          />

          {/* Architectural Double Border Frame & Corner Brackets */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-4 sm:inset-6 border border-slate-600/60"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-5 sm:inset-7 border border-amber-400/25"
          />
          <div aria-hidden="true" className="pointer-events-none absolute top-4 left-4 sm:top-6 sm:left-6 w-5 h-5 border-t-2 border-l-2 border-amber-400/80" />
          <div aria-hidden="true" className="pointer-events-none absolute top-4 right-4 sm:top-6 sm:right-6 w-5 h-5 border-t-2 border-r-2 border-amber-400/80" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-4 left-4 sm:bottom-6 sm:left-6 w-5 h-5 border-b-2 border-l-2 border-amber-400/80" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-4 right-4 sm:bottom-6 sm:right-6 w-5 h-5 border-b-2 border-r-2 border-amber-400/80" />

          {/* Top Institutional Header (Centered & Balanced) */}
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

          {/* Center Focal Title Composition (Rata Tengah / Symmetrical Executive Hardcover) */}
          <div className="relative z-10 my-auto py-8 flex flex-col items-center text-center space-y-6">
            {/* Architectural Crest / Emblem */}
            <div className="relative flex items-center justify-center">
              <div className="w-24 h-24 rounded-2xl rotate-45 border border-amber-400/40 bg-slate-900/70 flex items-center justify-center shadow-[0_12px_32px_rgba(2,6,23,0.65)]">
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
                Pedoman Resmi Pengguna &amp; Administrator
              </div>
              <h1 className="font-display text-3xl sm:text-4xl md:text-[42px] font-extrabold tracking-tight text-white leading-[1.12] [text-wrap:balance]">
                BUKU PANDUAN PENGGUNA
              </h1>
              <p className="font-display text-base sm:text-lg font-semibold text-amber-300/95 leading-snug max-w-lg mx-auto [text-wrap:balance]">
                Sistem Manajemen Presensi, Penjadwalan Shift, Penggajian, dan Keuangan Perusahaan
              </p>
            </div>

            {/* Classic Editorial Brass-Blue Rule */}
            <div className="flex items-center justify-center gap-3 w-full max-w-xs">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-400/75" />
              <span className="w-2 h-2 rotate-45 bg-amber-400 shrink-0" />
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-400/75" />
            </div>

            <p className="text-[13px] text-slate-300 leading-relaxed max-w-lg mx-auto text-center">
              Acuan operasional lengkap bagi operator Mode Biasa, Administrator Absensi, dan Administrator Keuangan dalam mengelola kehadiran harian, jadwal shift anti-bentrok, penyelesaian keterlambatan, hingga pelaporan kas serta penggajian perusahaan secara tertib, aman, dan akurat.
            </p>
          </div>

          {/* Bottom Institutional Attribution Block */}
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

        {/* HALAMAN ii: KATA PENGANTAR PROFESIONAL */}
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
              untuk <strong>{companyName}</strong>. Buku panduan ini disusun secara sistematis sebagai pedoman kerja resmi bagi seluruh pengguna sistem, mulai dari operator pemantau harian, penyusun jadwal kerja, administrator sumber daya manusia, hingga administrator keuangan perusahaan.
            </p>

            <p className="book-indent">
              Aplikasi ini dirancang dengan mengutamakan kejelasan alur kerja, ketepatan perhitungan data, serta keamanan akses yang berlapis. Melalui penerapan sistem kendali akses terpisah antara <strong>Mode Biasa (Baca Saja)</strong>, <strong>Mode Admin Absensi</strong>, dan <strong>Mode Admin Keuangan</strong>, setiap perubahan data kehadiran, penjadwalan, maupun pengelolaan kas dan gaji hanya dapat dilakukan oleh personel yang memiliki otorisasi resmi.
            </p>

            <p className="book-indent">
              Materi di dalam buku ini disusun secara berurutan agar mudah dipelajari baik oleh pengguna baru maupun administrator berpengalaman. Pembahasan diawali dengan pengenalan menyeluruh mengenai tujuan dan arsitektur aplikasi, dilanjutkan dengan tata cara pengoperasian setiap modul secara terperinci, serta ditutup dengan panduan <em>Penyelesaian Masalah (Troubleshooting)</em> untuk membantu penanganan kendala di lapangan secara mandiri.
            </p>

            <p className="book-indent">
              Penyusun menyadari bahwa dokumentasi yang baik merupakan bagian penting dari keberhasilan penerapan teknologi informasi di lingkungan kerja. Oleh karena itu, setiap langkah dijelaskan menggunakan bahasa yang lugas, tata letak yang terstruktur, serta contoh prosedur yang dapat langsung dipraktikkan.
            </p>

            <p className="book-indent">
              Akhir kata, penyusun mengucapkan terima kasih kepada seluruh pihak yang mendukung pengembangan serta penggunaan sistem ini. Semoga buku panduan ini memberikan manfaat nyata bagi kelancaran operasional, kedisiplinan kerja, dan ketertiban administrasi di lingkungan <strong>{companyName}</strong>.
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

        {/* HALAMAN iii: DAFTAR ISI LENGKAP & DETAIL */}
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
              subtitle="Klik salah satu bagian di bawah ini untuk langsung menuju halaman terkait"
            />

            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-300 text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
              <span>Bagian / Bab / Subbab</span>
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
                      ? 'pl-7 text-[11.5px] text-slate-700 font-normal'
                      : 'text-[12px] font-bold text-slate-900 pt-1.5'
                  }`}
                >
                  {entry.code && (
                    <span
                      className={`font-mono shrink-0 mr-2 ${
                        entry.indent
                          ? 'text-[10.5px] text-slate-500 w-8'
                          : 'text-[11px] text-blue-800 font-bold w-14'
                      }`}
                    >
                      {entry.code}
                    </span>
                  )}
                  <span className="shrink-0">{entry.title}</span>
                  <span className="book-toc-leader" aria-hidden="true" />
                  <span className="font-mono text-[11px] font-semibold text-slate-700 shrink-0 tabular-nums">
                    {entry.page}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </BookSheet>

        {/* BAB I: PENGENALAN APLIKASI */}
        <BookSheet
          id="bab-1"
          companyName={companyName}
          sectionTitle="Bab I · Pengenalan Aplikasi"
          pageLabel="1"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab I"
              title="Pengenalan Aplikasi"
              subtitle="Gambaran Umum, Ruang Lingkup Modul, dan Alur Kerja Terpadu"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                1.1 Latar Belakang dan Tujuan Pengembangan
              </h3>
              <p className="book-indent">
                Pengelolaan kehadiran karyawan, rotasi jadwal shift, pengaturan hari libur, serta administrasi penggajian dan kas perusahaan sering kali terkendala apabila masih dicatat secara terpisah pada berbagai berkas manual. Ketidaksesuaian antara jadwal libur dan jadwal kerja, keterlambatan rekapitulasi bulanan, serta risiko terbukanya informasi gaji kepada pihak yang tidak berwenang merupakan tantangan umum dalam operasional harian.
              </p>
              <p className="book-indent">
                Untuk menjawab kebutuhan tersebut, <strong>{companyName}</strong> menghadirkan aplikasi manajemen terpadu yang menyatukan seluruh proses administrasi presensi, penjadwalan, pelaporan keterlambatan, pengelolaan arus kas, dan penggajian karyawan dalam satu platform modern berbasis web yang cepat, akurat, serta mudah diaudit.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                1.2 Ruang Lingkup Modul Terpadu
              </h3>
              <p className="book-indent">
                Secara fungsional, aplikasi dibagi ke dalam empat pilar utama yang saling terhubung secara otomatis:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-[12px] text-slate-700">
                <li>
                  <strong>Pilar Pemantauan dan Presensi:</strong> Mencakup halaman <em>Dashboard</em> untuk ringkasan statistik harian, <em>Matriks Daftar Hadir</em> untuk pencatatan kehadiran sebulan penuh beserta log jam kerja, dan <em>Pusat Notifikasi</em> untuk memantau aktivitas terbaru.
                </li>
                <li>
                  <strong>Pilar Penjadwalan Kerja dan Libur:</strong> Mencakup <em>Jadwal Shift</em> dengan proteksi anti-bentrok (<em>anti double shift</em>) serta fitur pindah hari atau tanggal libur, dan <em>Jadwal Libur</em> untuk mengatur hari libur rutin maupun data master karyawan.
                </li>
                <li>
                  <strong>Pilar Pelaporan dan Penggajian:</strong> Mencakup <em>Rekap Bulanan</em> untuk evaluasi jam kerja, lembur, serta cicilan keterlambatan, yang terhubung langsung dengan modul rahasia <em>Rekap Gaji</em> dan <em>Keuangan Perusahaan</em>.
                </li>
                <li>
                  <strong>Pilar Tata Kelola dan Dokumentasi:</strong> Mencakup <em>Profil Perusahaan</em>, <em>Pengaturan Sistem</em> (shift, warna matriks, keamanan PIN ganda, serta cadangan data), dan <em>Panduan Pengguna</em> sebagai acuan resmi.
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                1.3 Alur Kerja Operasional Sistem
              </h3>
              <div className="overflow-hidden rounded-xl border border-slate-300 my-2 book-avoid-break">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2 px-2.5 font-semibold w-12 text-center">Tahap</th>
                      <th className="py-2 px-2.5 font-semibold w-[28%]">Modul Terkait</th>
                      <th className="py-2 px-2.5 font-semibold">Proses dan Dampak Otomatis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2 px-2.5 font-mono font-bold text-center text-blue-900">01</td>
                      <td className="py-2 px-2.5 font-semibold text-slate-900">Profil, Shift &amp; Karyawan</td>
                      <td className="py-2 px-2.5">Menetapkan identitas perusahaan, jam kerja per shift, daftar karyawan aktif, dan hari libur rutin individu.</td>
                    </tr>
                    <tr className="bg-slate-50/70">
                      <td className="py-2 px-2.5 font-mono font-bold text-center text-blue-900">02</td>
                      <td className="py-2 px-2.5 font-semibold text-slate-900">Jadwal Shift Harian</td>
                      <td className="py-2 px-2.5">Menempatkan karyawan ke shift harian; karyawan yang sedang libur terkunci otomatis hingga liburnya dipindahkan.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-2.5 font-mono font-bold text-center text-blue-900">03</td>
                      <td className="py-2 px-2.5 font-semibold text-slate-900">Matriks &amp; Rekap Bulanan</td>
                      <td className="py-2 px-2.5">Mencatat kehadiran harian, menghitung durasi kerja dan keterlambatan terhadap jam shift, serta mengelola cicilan telat.</td>
                    </tr>
                    <tr className="bg-slate-50/70">
                      <td className="py-2 px-2.5 font-mono font-bold text-center text-blue-900">04</td>
                      <td className="py-2 px-2.5 font-semibold text-slate-900">Rekap Gaji &amp; Keuangan</td>
                      <td className="py-2 px-2.5">Menghitung gaji bersih secara otomatis dari data kehadiran dan mencatat pembayaran gaji ke buku kas perusahaan.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                1.4 Keunggulan Arsitektur dan Dukungan Perangkat
              </h3>
              <p className="book-indent">
                Aplikasi dapat dijalankan dengan lancar pada komputer desktop, laptop, tablet, maupun ponsel pintar melalui peramban modern, serta mendukung pemasangan sebagai aplikasi mandiri (<em>Progressive Web App</em>) lengkap dengan notifikasi perangkat. Penyimpanan data mendukung sinkronisasi <em>real-time</em> berbasis cloud maupun penyimpanan lokal terstruktur sehingga operasional tetap berjalan andal.
              </p>
            </section>
          </div>
        </BookSheet>

        {/* BAB II: ARSITEKTUR AKSES & KEAMANAN PIN GANDA */}
        <BookSheet
          id="bab-2"
          companyName={companyName}
          sectionTitle="Bab II · Keamanan PIN Ganda"
          pageLabel="2"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab II"
              title="Arsitektur Akses, Keamanan PIN Ganda, dan Navigasi"
              subtitle="Pemisahan Hak Akses Mode Biasa, Admin Absensi, dan Admin Keuangan"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                2.1 Mode Biasa (Akses Baca Saja / Read-Only)
              </h3>
              <p className="book-indent">
                Saat aplikasi pertama kali dibuka, sistem secara otomatis berada pada <strong>Mode Biasa</strong>. Pada mode ini, pengguna hanya diperbolehkan untuk melihat informasi tanpa risiko perubahan data secara tidak sengaja. Seluruh tombol input, ubah, hapus, pemindahan libur, pengaturan shift, serta pengubahan warna disembunyikan dan dikunci oleh sistem.
              </p>
              <p className="book-indent">
                Meskipun bersifat baca saja, Mode Biasa tetap mendukung aktivitas pemantauan dan pelaporan, seperti pencarian nama karyawan, penyaringan divisi atau tanggal, pratinjau dokumen, pencetakan laporan ke kertas maupun PDF, pengunduhan berkas CSV dan Excel (<code>.xlsx</code>), serta membaca <strong>Panduan Pengguna</strong> ini.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                2.2 Pemisahan Otorisasi PIN Absensi dan PIN Keuangan
              </h3>
              <p className="book-indent">
                Untuk melakukan perubahan data atau membuka modul rahasia, aplikasi memisahkan otorisasi menggunakan <strong>dua PIN yang wajib berbeda</strong>. Pemisahan ini memastikan staf operasional presensi tidak dapat melihat data gaji dan arus kas perusahaan, serta menjaga agar menu pengaturan sistem tetap terkendali.
              </p>

              <div className="overflow-hidden rounded-xl border border-slate-300 my-3 book-avoid-break">
                <table className="w-full text-left border-collapse text-[11.5px]">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2 px-3 font-semibold w-[24%]">Tingkat Akses</th>
                      <th className="py-2 px-3 font-semibold w-[18%] text-center">PIN Default</th>
                      <th className="py-2 px-3 font-semibold">Hak Akses dan Menu yang Terbuka</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2 px-3 font-bold text-slate-900">Mode Biasa</td>
                      <td className="py-2 px-3 font-mono text-center">Tanpa PIN</td>
                      <td className="py-2 px-3">
                        Hanya lihat Dashboard, Matriks, Jadwal Shift, Jadwal Libur, Rekap Bulanan, Profil Perusahaan, dan Panduan Pengguna. Fitur cetak dan ekspor tetap aktif.
                      </td>
                    </tr>
                    <tr className="bg-blue-50/40">
                      <td className="py-2 px-3 font-bold text-blue-900">Admin Absensi</td>
                      <td className="py-2 px-3 font-mono font-bold text-blue-900 text-center">1234</td>
                      <td className="py-2 px-3">
                        Membuka penuh input, ubah, dan hapus data Absensi, Karyawan, Jadwal Shift, Pindah Libur, Warna Matriks, Profil Perusahaan, serta menampilkan menu <strong>Pengaturan Sistem</strong>.
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/40">
                      <td className="py-2 px-3 font-bold text-emerald-900">Admin Keuangan</td>
                      <td className="py-2 px-3 font-mono font-bold text-emerald-900 text-center">123456</td>
                      <td className="py-2 px-3">
                        Menampilkan dan membuka akses penuh ke menu rahasia <strong>Keuangan Perusahaan</strong> serta <strong>Rekap Gaji Karyawan</strong>.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="book-indent">
                Kedua sesi admin dapat diaktifkan secara bersamaan maupun terpisah melalui tombol <strong>Admin Absensi</strong> atau <strong>Admin Keuangan</strong> di bilah atas maupun di bagian bawah Sidebar. Ketika sesi selesai digunakan, klik tombol keluar pada peran terkait atau klik <strong>Keluar Mode Admin</strong> untuk mengembalikan sistem ke Mode Biasa.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                2.3 Navigasi Sidebar 3D dan Mode Ciut (Compact)
              </h3>
              <p className="book-indent">
                Pada tampilan komputer desktop, panel navigasi di sisi kiri dapat diciutkan menjadi bilah ikon ringkas melalui tombol panah bundar di tepi kanan Sidebar. Saat diciutkan, arahkan kursor ke ikon mana saja untuk melihat keterangan menu melayang beserta lencana jumlah karyawan yang belum diabsen hari ini. Status penciutan akan tersimpan secara otomatis pada peramban.
              </p>
            </section>
          </div>
        </BookSheet>

        {/* BAB III: DASHBOARD & PUSAT NOTIFIKASI POP-UP */}
        <BookSheet
          id="bab-3"
          companyName={companyName}
          sectionTitle="Bab III · Dashboard & Notifikasi"
          pageLabel="3"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab III"
              title="Dashboard Eksekutif dan Pusat Notifikasi Pop-Up"
              subtitle="Pemantauan Kehadiran Harian dan Log Aktivitas Non-Blokir"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                3.1 Ringkasan KPI Harian dan Grafik Kehadiran Tujuh Hari
              </h3>
              <p className="book-indent">
                Halaman <strong>Dashboard</strong> menyajikan gambaran menyeluruh mengenai kondisi kehadiran perusahaan pada hari berjalan. Kartu statistik paling atas menampilkan jumlah total karyawan aktif, jumlah karyawan yang telah tercatat hadir hari ini, total karyawan terlambat atau izin datang terlambat, serta jumlah karyawan yang dijadwalkan libur.
              </p>
              <p className="book-indent">
                Di bawah kartu ringkasan terdapat grafik tren kehadiran selama tujuh hari terakhir beserta perbandingan persentase kehadiran antardivisi. Daftar personel yang belum memiliki catatan kehadiran pada hari berjalan juga ditampilkan agar Admin Absensi dapat segera menindaklanjuti melalui tautan langsung menuju Matriks Daftar Hadir.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                3.2 Pusat Notifikasi Pop-Up Interaktif (Tanpa Blur)
              </h3>
              <p className="book-indent">
                Setiap transaksi penting—seperti pencatatan absensi baru, perubahan jadwal shift, pemindahan hari libur, transaksi pemasukan maupun pengeluaran kas, pembaruan rekap gaji, hingga perubahan PIN—dicatat secara otomatis ke dalam <strong>Pusat Notifikasi</strong> yang dapat dibuka dengan menekan ikon lonceng di sudut kanan atas.
              </p>
              <p className="book-indent">
                Jendela Pusat Notifikasi menggunakan gaya <em>pop-up</em> mengambang 3D yang <strong>tidak memburamkan dan tidak memblokir halaman utama</strong>. Dengan demikian, pengguna tetap dapat membaca tabel matriks, menggulir laporan, atau meninjau data di layar utama sambil memantau riwayat aktivitas pada jendela pop-up tersebut.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                3.3 Pengaktifan Notifikasi Sistem Perangkat (OS dan PWA)
              </h3>
              <p className="book-indent">
                Di dalam pop-up Pusat Notifikasi tersedia tab <strong>Perangkat &amp; Preferensi</strong>. Pengguna dapat mengaktifkan izin notifikasi sistem (<em>OS Push</em>) agar setiap aktivitas penting tampil sebagai notifikasi resmi di bilah notifikasi Windows, macOS, maupun ponsel pintar ketika aplikasi dipasang sebagai <em>Progressive Web App</em> (PWA). Pengguna juga dapat mengatur suara peringatan, menonaktifkan <em>toast</em> layar, serta menyaring modul yang diizinkan mengirim pemberitahuan.
              </p>
            </section>
          </div>
        </BookSheet>

        {/* BAB IV: MATRIKS DAFTAR HADIR, PEWARNAAN & LOG */}
        <BookSheet
          id="bab-4"
          companyName={companyName}
          sectionTitle="Bab IV · Matriks Daftar Hadir"
          pageLabel="4"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab IV"
              title="Matriks Daftar Hadir, Pewarnaan Langsung, dan Log Absensi"
              subtitle="Pencatatan Kehadiran Bulanan, Kustomisasi Warna, dan Ekspor Laporan"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                4.1 Membaca Matriks dan Indikator Ringkasan Bulanan
              </h3>
              <p className="book-indent">
                Menu <strong>Matriks Daftar Hadir</strong> menampilkan seluruh karyawan aktif pada baris tabel dan tanggal 1 hingga akhir bulan pada kolom tabel. Sisi kiri panel menampilkan blok identitas perusahaan, rekapitulasi angka total (Pegawai, Rasio Hadir, Izin, Sakit, dan Alpha), serta tabel <strong>Keterangan Kode</strong>: <code>H</code> (Hadir, Terlambat, atau Izin Telat), <code>I</code> (Izin), <code>S</code> (Sakit), <code>A</code> (Alpha), dan <code>L</code> (Libur Karyawan).
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                4.2 Input Absensi, Mode Klik Sel Cepat, dan Pintasan Keyboard
              </h3>
              <p className="book-indent">
                Ketika <strong>Admin Absensi</strong> telah diaktifkan, pengisian kehadiran dapat dilakukan melalui tiga cara yang saling terintegrasi:
              </p>
              <ol className="list-decimal pl-6 space-y-1.5 text-[12px] text-slate-700">
                <li>
                  <strong>Tombol Input Absensi / Izin Terlambat:</strong> Klik tombol pada bilah alat atas untuk membuka formulir lengkap (memilih karyawan dengan pencarian cepat, tanggal, shift kerja, status kehadiran, jam masuk atau pulang, jam lembur, serta alasan izin datang terlambat).
                </li>
                <li>
                  <strong>Mode Klik Sel Cepat:</strong> Pilih salah satu status pada bilah <em>Mode Klik Sel</em> (misalnya <code>Hadir (H)</code> atau <code>Sakit (S)</code>), lalu ketuk sel tanggal mana saja pada tabel matriks untuk menyimpan status tersebut dalam satu kali klik.
                </li>
                <li>
                  <strong>Pintasan Papan Ketik (Keyboard):</strong> Saat menyorot sel pada tabel matriks, tekan tombol <code>H</code>, <code>T</code> (Terlambat), <code>I</code>, <code>S</code>, <code>A</code>, <code>L</code>, atau <code>Delete</code> untuk memperbarui status sel tanpa membuka jendela formulir.
                </li>
              </ol>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                4.3 Mengubah Warna Matriks Langsung dari Keterangan
              </h3>
              <p className="book-indent">
                Pada mode Admin Absensi, blok <strong>Keterangan</strong> di sisi kiri tabel matriks dilengkapi tombol <strong>Warna</strong> serta ikon penyunting di setiap baris status. Ketuk salah satu item keterangan (misalnya <em>HADIR</em>, <em>TERLAMBAT</em>, <em>IZIN TELAT</em>, atau <em>LIBUR KARYAWAN</em>) untuk langsung memilih warna latar dan warna teks baru melalui jendela pemilih warna. Perubahan warna tersebut otomatis diterapkan pada tampilan layar, hasil cetak PDF, maupun file ekspor Excel (<code>.xlsx</code>).
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                4.4 Log Catatan Absensi, Cetak Lanskap, dan Ekspor Excel
              </h3>
              <p className="book-indent">
                Gunakan sub-tab <strong>Log Absensi</strong> untuk memeriksa rincian jam masuk, jam keluar, durasi kerja aktual, selisih menit keterlambatan, dan catatan izin setiap hari. Pada tab Matriks, tombol <strong>Cetak</strong> otomatis menyesuaikan halaman ke ukuran <em>A4 Landscape</em> agar seluruh tanggal 1 sampai 31 termuat rapi dalam satu lembar, sedangkan tombol <strong>Ekspor Excel</strong> menghasilkan berkas <code>.xlsx</code> multi-sheet lengkap dengan pewarnaan sel dan rumus ringkasan.
              </p>
            </section>
          </div>
        </BookSheet>

        {/* BAB V: JADWAL SHIFT & PINDAH LIBUR */}
        <BookSheet
          id="bab-5"
          companyName={companyName}
          sectionTitle="Bab V · Jadwal Shift & Pindah Libur"
          pageLabel="5"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab V"
              title="Manajemen Jadwal Shift dan Prosedur Pindah Libur"
              subtitle="Penugasan Harian, Validasi Anti Double Shift, dan Pergeseran Hari Libur"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                5.1 Penugasan Shift Harian dan Proteksi Anti Double Shift
              </h3>
              <p className="book-indent">
                Menu <strong>Jadwal Shift</strong> memungkinkan Admin Absensi menyusun jadwal kerja untuk setiap shift (seperti Shift Pagi, Shift Sela, Reguler, maupun Shift Malam) dari hari Senin hingga Minggu. Klik tombol <strong>Atur</strong> pada kartu shift di suatu hari untuk memilih karyawan yang bertugas, atau gunakan opsi penerapan sekaligus ke <em>Senin–Sabtu</em> maupun <em>Seluruh Minggu</em>.
              </p>
              <p className="book-indent">
                Sistem secara otomatis menerapkan validasi <strong>Anti Double Shift</strong>: satu orang karyawan tidak dapat didaftarkan ke dua shift yang berbeda pada hari yang sama. Apabila karyawan sudah terdaftar pada shift lain, sistem akan menandai statusnya dan menahan penyimpanan sebelum karyawan tersebut dikeluarkan dari shift sebelumnya.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                5.2 Aturan Karyawan Libur dan Prosedur Pindah Hari/Tanggal Libur
              </h3>
              <p className="book-indent">
                Demi menjaga hak istirahat dan konsistensi presensi, karyawan yang memiliki jadwal libur rutin mingguan atau tanggal libur khusus pada suatu hari <strong>tidak dapat dimasukkan ke dalam jadwal shift</strong> pada hari tersebut. Pada formulir pemilihan anggota harian, nama karyawan yang sedang libur ditampilkan dalam daftar terpisah dengan keterangan terkunci.
              </p>
              <div className="rounded-xl border border-slate-300 bg-slate-50/90 p-4 my-2 book-avoid-break">
                <div className="text-xs font-bold text-slate-900 mb-2 text-center uppercase tracking-wide">
                  Prosedur Apabila Karyawan Libur Harus Masuk Jadwal
                </div>
                <ol className="list-decimal pl-6 space-y-1.5 text-[12px] text-slate-700">
                  <li>
                    Klik tombol <strong>Pindah Libur</strong> pada lencana nama karyawan di bagian bawah kartu hari (<em>Libur / OFF</em>), pada tab Matriks Mingguan, atau langsung di dalam jendela pengaturan anggota harian.
                  </li>
                  <li>
                    Pilih mode pemindahan yang dibutuhkan: <strong>Pindah Hari Libur Rutin</strong> (misalnya memindahkan libur mingguan dari Senin ke Rabu) atau <strong>Pindah Tanggal Libur Khusus</strong> (mengganti tanggal minggu berjalan ke tanggal lain).
                  </li>
                  <li>
                    Secara opsional, pilih shift tujuan pada hari yang baru dibuka agar karyawan langsung masuk ke shift kerja tersebut setelah liburnya berhasil dipindahkan.
                  </li>
                </ol>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                5.3 Salin Jadwal Harian, Matriks Mingguan, dan Pratinjau Cetak
              </h3>
              <p className="book-indent">
                Untuk mempercepat penyusunan jadwal yang seragam, gunakan tombol <strong>Salin [Hari]</strong> guna menyalin susunan seluruh shift ke hari lain (slot karyawan yang libur di hari tujuan akan dilewati secara otomatis). Tab <strong>Preview Jadwal</strong> menyajikan lembar jadwal siap tempel dengan pengelompokan jabatan serta bagian kaki berisi daftar karyawan <em>OFF</em> yang dapat langsung dicetak atau diekspor ke Excel.
              </p>
            </section>
          </div>
        </BookSheet>

        {/* BAB VI: JADWAL LIBUR & MASTER KARYAWAN */}
        <BookSheet
          id="bab-6"
          companyName={companyName}
          sectionTitle="Bab VI · Jadwal Libur & Karyawan"
          pageLabel="6"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab VI"
              title="Jadwal Libur Individu dan Data Master Karyawan"
              subtitle="Pengaturan Libur Mingguan, Kalender Bulanan, dan Administrasi Personel"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                6.1 Penetapan Hari Libur Rutin Mingguan dan Tanggal Khusus
              </h3>
              <p className="book-indent">
                Pada menu <strong>Jadwal Libur</strong>, Admin Absensi dapat menetapkan hari libur mingguan yang berbeda-beda bagi setiap karyawan (misalnya karyawan A libur pada hari Senin, sedangkan karyawan B libur pada hari Kamis). Pengaturan ini menjadi dasar bagi sistem dalam menghitung jumlah hari wajib masuk efektif pada tiap bulan serta mengunci slot shift pada hari libur karyawan yang bersangkutan.
              </p>
              <p className="book-indent">
                Selain libur rutin mingguan, tersedia daftar <strong>Tanggal Libur Khusus</strong> per individu untuk mencatat tanggal pengganti hasil pemindahan libur, cuti terjadwal, atau hari libur tambahan di luar hari libur mingguan. Tanggal khusus tersebut tercatat secara kronologis dan dapat ditambahkan maupun dihapus apabila terjadi perubahan jadwal.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                6.2 Kalender Operasional Bulanan dan Pengelolaan Master Karyawan
              </h3>
              <p className="book-indent">
                Beralihlah ke tab <strong>Kalender Bulanan</strong> untuk memantau distribusi personel yang masuk kerja dan yang libur pada setiap tanggal kalender dalam satu bulan penuh. Tampilan kalender ini memudahkan koordinator shift dalam memastikan kecukupan personel harian sebelum jadwal dipublikasikan.
              </p>
              <p className="book-indent">
                Penambahan karyawan baru, pembaruan kode pegawai, nama lengkap, divisi, jabatan, hari libur bawaan, serta status keaktifan (<em>Aktif</em> atau <em>Nonaktif</em>) juga dikelola melalui menu ini saat <strong>Admin Absensi</strong> aktif. Karyawan yang dinonaktifkan tidak akan muncul pada daftar absensi maupun jadwal shift bulan berjalan, namun riwayat data terdahulu tetap tersimpan dengan aman untuk keperluan audit.
              </p>
            </section>
          </div>
        </BookSheet>

        {/* BAB VII: REKAP BULANAN & PENYELESAIAN KETERLAMBATAN */}
        <BookSheet
          id="bab-7"
          companyName={companyName}
          sectionTitle="Bab VII · Rekap Bulanan"
          pageLabel="7"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab VII"
              title="Rekapitulasi Bulanan dan Penyelesaian Keterlambatan"
              subtitle="Evaluasi Kehadiran Efektif, Lembur Manual, dan Cicilan Keterlambatan"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                7.1 Evaluasi Kehadiran Efektif, Jam Kerja, dan Lembur Manual
              </h3>
              <p className="book-indent">
                Menu <strong>Rekap Bulanan</strong> menghitung hari wajib kerja efektif setiap karyawan secara otomatis dengan memperhitungkan hari libur individu masing-masing. Tab pertama menampilkan ringkasan persentase kehadiran, rincian status Hadir, Terlambat, Izin Telat, Izin, Sakit, Alpha, total jam kerja aktual, serta akumulasi jam lembur manual yang tercatat pada bulan terpilih.
              </p>
              <p className="book-indent">
                Seluruh tabel rekapitulasi dapat disaring berdasarkan divisi atau pencarian nama, dicetak dalam tampilan resmi perusahaan, maupun diunduh ke format CSV dan Excel (<code>.xlsx</code>) baik pada Mode Biasa maupun Mode Admin.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                7.2 Cicilan Penyelesaian Keterlambatan (Tambahan Jam / Potong Gaji)
              </h3>
              <p className="book-indent">
                Tab kedua (<strong>Data Keterlambatan &amp; Penggantian</strong>) menghitung selisih menit keterlambatan berdasarkan jam mulai shift yang bertugas beserta batas toleransi menit masing-masing shift. Admin Absensi dapat mencatat cicilan penyelesaian keterlambatan melalui tombol <strong>Catat Ganti Keterlambatan</strong> atau <strong>Ganti / Cicil</strong> dengan memilih dua metode berikut:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-[12px] text-slate-700">
                <li>
                  <strong>Tambahan Jam Kerja:</strong> Karyawan mengganti akumulasi menit keterlambatan dengan menambah durasi kerja di luar jam shift normal (tercatat tanggal pelaksanaan serta jam mulai dan jam selesai tambahan).
                </li>
                <li>
                  <strong>Potongan Gaji:</strong> Menit keterlambatan yang belum diganti jam kerja dikonversi menjadi nominal potongan rupiah sesuai tarif per menit yang berlaku, dan nilainya akan otomatis terbaca oleh modul <strong>Rekap Gaji</strong>.
                </li>
              </ul>
            </section>
          </div>
        </BookSheet>

        {/* BAB VIII & IX: KEUANGAN PERUSAHAAN & REKAP GAJI */}
        <BookSheet
          id="bab-8"
          companyName={companyName}
          sectionTitle="Bab VIII–IX · Keuangan & Gaji"
          pageLabel="8"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab VIII & Bab IX · Akses PIN Keuangan"
              title="Keuangan Perusahaan dan Rekapitulasi Penggajian"
              subtitle="Pengelolaan Arus Kas serta Perhitungan Gaji Rahasia"
              accentClass="text-emerald-800"
            />

            <div className="rounded-xl border border-emerald-300 bg-emerald-50/75 p-3.5 text-[12px] text-emerald-950 flex items-start gap-2.5 book-avoid-break">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Perlindungan Kerahasiaan Data:</strong> Kedua menu pada bab ini hanya tampil dan dapat dibuka setelah pengguna memasukkan <strong>PIN Admin Keuangan (default: 123456)</strong>. PIN Absensi tidak dapat digunakan untuk mengakses data keuangan maupun penggajian karyawan.
              </p>
            </div>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                8.1 Pencatatan Arus Kas Masuk, Keluar, dan Perpindahan Saldo
              </h3>
              <p className="book-indent">
                Modul <strong>Keuangan Perusahaan</strong> menyediakan dasbor arus kas real-time untuk memantau saldo tiap rekening (Kas Tunai / Cash maupun Rekening Bank / Transfer). Admin Keuangan dapat mencatat transaksi pendapatan dan pengeluaran harian, mengatur kategori transaksi secara kustom, melakukan transfer antarrekening (misalnya setor tunai ke bank atau tarik tunai), serta mengekspor laporan buku kas bulanan ke format Excel (<code>.xlsx</code>).
              </p>
            </section>

            <section className="space-y-2 pt-2 border-t border-slate-200">
              <h3 className="font-display text-sm font-bold text-slate-900">
                9.1 Komponen Gaji, BPJS, Kenaikan Gaji, dan Pencetakan Slip Resmi
              </h3>
              <p className="book-indent">
                Menu <strong>Rekap Gaji</strong> secara otomatis menghubungkan rekap kehadiran bulanan dengan profil gaji tiap karyawan. Komponen yang dihitung meliputi gaji pokok, tunjangan jabatan/makan/transportasi, tarif upah lembur per jam, iuran BPJS Kesehatan dan Ketenagakerjaan (porsi karyawan dan perusahaan), potongan tetap seperti kasbon atau cicilan, serta potongan keterlambatan yang berasal dari modul Rekap Bulanan.
              </p>
              <p className="book-indent">
                Admin Keuangan dapat mengeksekusi penyesuaian atau kenaikan gaji (berdasarkan persentase maupun nominal tetap) yang tersimpan sebagai riwayat audit permanen. Setiap baris gaji bulanan dapat ditandai statusnya (<em>Draft</em>, <em>Disetujui</em>, atau <em>Dibayar</em>), dibayarkan langsung dari rekening kas perusahaan, serta dicetak sebagai <strong>Slip Gaji Resmi</strong> satuan maupun massal.
              </p>
            </section>
          </div>
        </BookSheet>

        {/* BAB X & XI: PROFIL PERUSAHAAN & PENGATURAN SISTEM */}
        <BookSheet
          id="bab-10"
          companyName={companyName}
          sectionTitle="Bab X–XI · Profil & Pengaturan"
          pageLabel="9"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab X & Bab XI"
              title="Profil Perusahaan dan Pengaturan Sistem Terpadu"
              subtitle="Identitas Resmi Organisasi, Konfigurasi Shift, dan Pengelolaan PIN"
            />

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                10.1 Profil Perusahaan, Legalitas, dan Lokasi Kantor Cabang
              </h3>
              <p className="book-indent">
                Halaman <strong>Profil Perusahaan</strong> menampilkan identitas resmi perusahaan, antara lain nama badan usaha, logo, bidang usaha, NPWP/NIB, alamat pusat, kontak resmi, visi, misi, sebaran divisi, serta daftar kantor cabang. Pada Mode Biasa, halaman ini bersifat baca saja; sedangkan saat <strong>Admin Absensi</strong> aktif, seluruh informasi profil maupun daftar cabang dapat diperbarui dan langsung tercermin pada kepala laporan cetak serta dokumen panduan ini.
              </p>
            </section>

            <section className="space-y-2 pt-2 border-t border-slate-200">
              <h3 className="font-display text-sm font-bold text-slate-900">
                11.1 Konfigurasi Shift, Palet Warna Matriks, dan Koneksi Database
              </h3>
              <p className="book-indent">
                Menu <strong>Pengaturan Sistem</strong> hanya ditampilkan dan dapat dibuka menggunakan <strong>PIN Admin Absensi</strong>. Di dalamnya tersedia panel konfigurasi jam masuk, jam pulang, serta batas toleransi tiap shift, penyesuaian tarif default potongan keterlambatan per menit, penyuntingan identitas singkat perusahaan, pengaturan palet warna matriks beserta preset siap pakai, dan panel koneksi Database (Cloud Firestore maupun penyimpanan lokal terstruktur).
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                11.2 Pembaruan PIN Absensi vs. PIN Keuangan dan Reset Bertingkat
              </h3>
              <p className="book-indent">
                Pada kartu <strong>Keamanan &amp; PIN Akses Terpisah</strong>, Admin dapat mengganti <strong>PIN Absensi &amp; Pengaturan</strong> (default <code>1234</code>) dan <strong>PIN Keuangan &amp; Rekap Gaji</strong> (default <code>123456</code>) secara independen dengan panjang 4 hingga 12 digit angka. Sistem secara ketat melarang penggunaan kombinasi PIN yang sama antara Absensi dan Keuangan demi menjaga pemisahan wewenang.
              </p>
              <p className="book-indent">
                Untuk menjaga keamanan data jangka panjang, lakukan <strong>Unduh Backup JSON</strong> secara berkala sebelum menjalankan <em>Restore</em> atau <em>Reset Data</em>. Fitur Reset menyediakan pilihan penghapusan data absensi saja (dapat diverifikasi Admin Absensi) hingga reset menyeluruh seluruh modul (memerlukan otorisasi Admin Keuangan).
              </p>
            </section>
          </div>
        </BookSheet>

        {/* BAB XII: PENYELESAIAN MASALAH (TROUBLESHOOTING) & KOLOFON */}
        <BookSheet
          id="bab-12"
          companyName={companyName}
          sectionTitle="Bab XII · Penyelesaian Masalah"
          pageLabel="10"
        >
          <div className="space-y-4">
            <ChapterHeading
              kicker="Bab XII"
              title="Penyelesaian Masalah (Troubleshooting) dan Penutup"
              subtitle="Panduan Diagnosis Mandiri dan Kolofon Pengembang"
              accentClass="text-rose-700"
            />

            <p className="book-indent">
              Apabila pengguna mengalami kendala saat mengoperasikan aplikasi, gunakan tabel panduan penyelesaian masalah di bawah ini sebagai langkah diagnosis dan penanganan pertama sebelum menghubungi pengelola sistem:
            </p>

            <div className="overflow-hidden rounded-xl border border-slate-300 book-avoid-break">
              <table className="w-full text-left border-collapse text-[10.5px] leading-snug">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-2 px-2.5 font-semibold w-[27%]">Kendala / Gejala</th>
                    <th className="py-2 px-2.5 font-semibold w-[28%]">Kemungkinan Penyebab</th>
                    <th className="py-2 px-2.5 font-semibold w-[45%]">Langkah Penyelesaian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-2 px-2.5 font-semibold text-slate-900">
                      Tombol Input Absensi, Tambah Karyawan, atau Ubah Jadwal tidak muncul
                    </td>
                    <td className="py-2 px-2.5">
                      Aplikasi masih berada dalam Mode Biasa (Baca Saja).
                    </td>
                    <td className="py-2 px-2.5">
                      Klik tombol <strong>Admin Absensi</strong> atau <strong>Masuk Mode Admin</strong>, lalu masukkan PIN Absensi (default <code>1234</code>).
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-2 px-2.5 font-semibold text-slate-900">
                      Menu Pengaturan tidak terlihat di Sidebar
                    </td>
                    <td className="py-2 px-2.5">
                      Baru membuka Admin Keuangan atau belum masuk Admin Absensi.
                    </td>
                    <td className="py-2 px-2.5">
                      Menu Pengaturan dibuka khusus oleh <strong>PIN Absensi</strong> (<code>1234</code>). Aktifkan peran Admin Absensi terlebih dahulu.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2.5 font-semibold text-slate-900">
                      Menu Keuangan / Rekap Gaji ditolak walau sudah masuk Admin Absensi
                    </td>
                    <td className="py-2 px-2.5">
                      Pemisahan hak akses keamanan antara operasional absensi dan keuangan.
                    </td>
                    <td className="py-2 px-2.5">
                      Klik tombol <strong>Buka Admin Keuangan</strong>, lalu masukkan PIN Keuangan (default <code>123456</code>).
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-2 px-2.5 font-semibold text-slate-900">
                      Gagal menyimpan perubahan PIN baru di Pengaturan
                    </td>
                    <td className="py-2 px-2.5">
                      PIN baru bukan 4–12 angka, PIN lama keliru, atau PIN Absensi disamakan dengan PIN Keuangan.
                    </td>
                    <td className="py-2 px-2.5">
                      Pastikan panjang PIN antara 4–12 digit angka dan pastikan PIN Absensi berbeda dari PIN Keuangan.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2.5 font-semibold text-slate-900">
                      Karyawan tidak dapat dicentang masuk ke Jadwal Shift
                    </td>
                    <td className="py-2 px-2.5">
                      Karyawan sedang libur pada hari tersebut atau sudah terdaftar pada shift lain.
                    </td>
                    <td className="py-2 px-2.5">
                      Klik tombol <strong>Pindah Libur</strong> untuk menggeser hari/tanggal liburnya, atau keluarkan lebih dahulu dari shift sebelumnya.
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-2 px-2.5 font-semibold text-slate-900">
                      Notifikasi perangkat tidak tampil di layar HP atau komputer
                    </td>
                    <td className="py-2 px-2.5">
                      Izin notifikasi pada peramban belum diberikan atau diblokir.
                    </td>
                    <td className="py-2 px-2.5">
                      Buka pop-up Pusat Notifikasi → tab <strong>Perangkat &amp; Preferensi</strong> → klik <strong>Izinkan Perangkat</strong> atau ubah izin situs menjadi <em>Allow</em>.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2.5 font-semibold text-slate-900">
                      Hasil cetak Matriks Absensi terpotong ke halaman samping
                    </td>
                    <td className="py-2 px-2.5">
                      Orientasi kertas pada dialog cetak belum sesuai atau margin terlalu lebar.
                    </td>
                    <td className="py-2 px-2.5">
                      Pastikan orientasi kertas diatur ke <strong>Landscape</strong> untuk Matriks Absensi dan <strong>Portrait</strong> untuk Buku Panduan, dengan opsi <em>Background Graphics</em> aktif.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Kolofon & Kredit Resmi (Balanced Center / Right Attribution) */}
            <div className="mt-4 rounded-2xl border border-slate-300 bg-slate-50 p-5 book-avoid-break">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1.5 text-center sm:text-left">
                  <div className="inline-flex items-center gap-1.5 text-[10.5px] font-mono font-bold uppercase tracking-widest text-blue-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Kolofon &amp; Informasi Pengembang</span>
                  </div>
                  <h4 className="font-display text-sm sm:text-base font-bold text-slate-900">
                    {companyName} — Sistem Manajemen Presensi, Shift, dan Keuangan
                  </h4>
                  <p className="text-[11.5px] text-slate-600 leading-relaxed">
                    Seluruh materi panduan ini disusun sebagai acuan standar operasional resmi yang dapat dicetak serta dijilid untuk kebutuhan administrasi perusahaan.
                  </p>
                </div>
                <div className="rounded-xl bg-slate-900 text-white px-5 py-3.5 text-center shrink-0">
                  <div className="text-[9.5px] font-mono uppercase tracking-widest text-amber-300">
                    Penyusun &amp; Developer Aplikasi
                  </div>
                  <div className="font-display text-lg font-extrabold text-white mt-0.5">
                    Denuda
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-1">
              <Wrench className="w-3.5 h-3.5 text-slate-400" />
              <span>Dokumentasi Resmi · Disusun oleh Denuda</span>
            </div>
          </div>
        </BookSheet>
      </div>
    </div>
  );
};
