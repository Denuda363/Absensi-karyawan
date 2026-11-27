import React from 'react';
import {
  ArrowRight,
  Bell,
  CalendarRange,
  ChevronLeft,
  CircleDollarSign,
  Clock,
  Download,
  FileSpreadsheet,
  KeyRound,
  Palette,
  Printer,
  Settings,
  Table2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';

interface PinBadgeProps {
  num: number;
  tone?: 'blue' | 'amber' | 'emerald' | 'rose';
}

const PinBadge: React.FC<PinBadgeProps> = ({ num, tone = 'blue' }) => {
  const cls =
    tone === 'amber'
      ? 'bg-amber-500 text-slate-950 border-amber-200'
      : tone === 'emerald'
        ? 'bg-emerald-600 text-white border-emerald-200'
        : tone === 'rose'
          ? 'bg-rose-600 text-white border-rose-200'
          : 'bg-blue-700 text-white border-blue-200';
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-mono font-extrabold border shadow-xs shrink-0 ${cls}`}
    >
      {num}
    </span>
  );
};

interface VisualBoxProps {
  title: string;
  caption: string;
  legends?: { num: number; text: string; tone?: 'blue' | 'amber' | 'emerald' | 'rose' }[];
  children: React.ReactNode;
}

const VisualBox: React.FC<VisualBoxProps> = ({ title, caption, legends, children }) => (
  <figure className="my-3 rounded-xl border border-slate-300 bg-slate-100/80 p-3.5 book-avoid-break">
    <div className="rounded-lg border border-slate-300 bg-white overflow-hidden shadow-xs">
      {/* Crisp Mini Window Header */}
      <div className="bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between text-[10px]">
        <span className="font-semibold tracking-wide">{title}</span>
        <span className="font-mono text-slate-400">Ilustrasi Layar Aplikasi</span>
      </div>
      <div className="p-3">{children}</div>
    </div>

    {legends && legends.length > 0 && (
      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 px-1">
        {legends.map((item) => (
          <div key={item.num} className="flex items-start gap-2 text-[10.5px] text-slate-700 leading-snug">
            <PinBadge num={item.num} tone={item.tone} />
            <span className="pt-0.5">{item.text}</span>
          </div>
        ))}
      </div>
    )}

    <figcaption className="mt-2.5 pt-2 border-t border-slate-300/80 text-center text-[11px] font-semibold text-slate-700">
      {caption}
    </figcaption>
  </figure>
);

/* 1.1 ALUR KERJA TERPADU APLIKASI */
export const FigureSystemWorkflow: React.FC = () => (
  <VisualBox
    title="Alur Penggunaan Aplikasi dari Awal Hingga Akhir"
    caption="Gambar 1.1 — Urutan kerja sistem: mulai dari Data Karyawan, Jadwal Shift, Absensi Harian, sampai Gaji dan Kas Perusahaan."
    legends={[
      { num: 1, text: 'Isi data perusahaan, jam shift, daftar karyawan, dan hari libur rutin masing-masing.' },
      { num: 2, text: 'Susun jadwal shift harian. Karyawan yang libur terkunci otomatis agar tidak bentrok.' },
      { num: 3, text: 'Catat kehadiran setiap hari di Matriks dan pantau keterlambatan di Rekap Bulanan.' },
      { num: 4, text: 'Buka dengan PIN Keuangan untuk menghitung gaji bersih dan mencatat buku kas.', tone: 'emerald' },
    ]}
  >
    <div className="grid grid-cols-4 gap-2 items-stretch">
      {[
        {
          num: 1,
          icon: Users,
          name: '1. Data Awal',
          detail: 'Karyawan, Jam Shift, & Libur Rutin',
          bg: 'bg-slate-900 text-white',
        },
        {
          num: 2,
          icon: Clock,
          name: '2. Jadwal Shift',
          detail: 'Penugasan Harian & Pindah Libur',
          bg: 'bg-blue-700 text-white',
        },
        {
          num: 3,
          icon: Table2,
          name: '3. Absensi Harian',
          detail: 'Matriks, Warna, & Rekap Telat',
          bg: 'bg-indigo-700 text-white',
        },
        {
          num: 4,
          icon: Wallet,
          name: '4. Gaji & Kas',
          detail: 'Slip Gaji & Arus Kas (PIN 123456)',
          bg: 'bg-emerald-700 text-white',
        },
      ].map((step, index) => {
        const Icon = step.icon;
        return (
          <div key={step.num} className="flex items-center gap-1">
            <div className="flex-1 h-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${step.bg}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <PinBadge num={step.num} tone={index === 3 ? 'emerald' : 'blue'} />
              </div>
              <div className="mt-2">
                <div className="text-[11px] font-bold text-slate-900">{step.name}</div>
                <div className="text-[10px] text-slate-600 leading-snug mt-0.5">{step.detail}</div>
              </div>
            </div>
            {index < 3 && <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0 -mr-1" />}
          </div>
        );
      })}
    </div>
  </VisualBox>
);

/* 2.1 SIDEBAR 3D & MODAL PIN GANDA */
export const FigureDualPinAndSidebar: React.FC = () => (
  <VisualBox
    title="Cara Membuka Kunci Mode Admin dengan PIN Terpisah"
    caption="Gambar 2.1 — Tampilan menu samping (Sidebar) dan jendela pengisian PIN untuk membuka Mode Admin Absensi atau Admin Keuangan."
    legends={[
      { num: 1, text: 'Klik tombol panah di tepi kanan Sidebar untuk mengecilkan atau melebarkan menu.' },
      { num: 2, text: 'Menu Pengaturan hanya muncul jika sudah memasukkan PIN Absensi (bawaan: 1234).', tone: 'amber' },
      { num: 3, text: 'Menu Keuangan & Rekap Gaji hanya muncul jika memasukkan PIN Keuangan (bawaan: 123456).', tone: 'emerald' },
      { num: 4, text: 'Pilih peran yang ingin dibuka, ketik angka PIN, lalu klik tombol Verifikasi & Aktifkan.' },
    ]}
  >
    <div className="grid grid-cols-12 gap-3 items-stretch text-[10px]">
      {/* Sidebar Schematic */}
      <div className="col-span-5 rounded-lg bg-[#090F1D] text-slate-200 p-3 flex flex-col justify-between relative border border-slate-800">
        <div>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <span className="font-bold text-white text-[11px]">Menu Utama</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-300 text-[9px]">
              <ChevronLeft className="w-3 h-3" />
              <PinBadge num={1} />
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="px-2 py-1.5 rounded bg-blue-600/30 border border-blue-400/40 text-white font-semibold flex justify-between">
              <span>Dashboard &amp; Matriks</span>
              <span className="text-[9px] text-sky-200">Terbuka</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 flex justify-between">
              <span>Shift, Libur, Rekap, Panduan</span>
              <span className="text-[9px] text-slate-400">Lihat</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-amber-950/50 border border-amber-500/40 text-amber-200 flex items-center justify-between">
              <span className="flex items-center gap-1 font-semibold">
                <Settings className="w-3 h-3" /> Pengaturan
              </span>
              <PinBadge num={2} tone="amber" />
            </div>
            <div className="px-2 py-1.5 rounded bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 flex items-center justify-between">
              <span className="flex items-center gap-1 font-semibold">
                <CircleDollarSign className="w-3 h-3" /> Keuangan &amp; Gaji
              </span>
              <PinBadge num={3} tone="emerald" />
            </div>
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-slate-800 text-center">
          <span className="block w-full py-1.5 rounded bg-blue-600 text-white font-bold text-[10px]">
            Masuk Mode Admin
          </span>
        </div>
      </div>

      {/* PIN Modal Schematic */}
      <div className="col-span-7 rounded-lg border border-slate-300 bg-slate-50 overflow-hidden flex flex-col justify-between">
        <div className="bg-slate-950 text-white px-3 py-2 flex items-center justify-between">
          <span className="font-bold text-[11px] flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-blue-400" /> Masuk ke Mode Admin
          </span>
          <PinBadge num={4} />
        </div>
        <div className="p-3 space-y-2.5 bg-white flex-1">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200 text-center font-semibold text-[9.5px]">
            <span className="py-1 rounded text-slate-600">Otomatis</span>
            <span className="py-1 rounded bg-white text-blue-800 border border-blue-300 shadow-2xs">
              Admin Absensi
            </span>
            <span className="py-1 rounded text-emerald-800">Admin Keuangan</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[9.5px]">
            <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-950">
              <div className="font-bold">PIN Absensi: 1234</div>
              <div className="text-blue-800 mt-0.5 leading-snug">
                Membuka input absensi, jadwal, warna matriks, &amp; Pengaturan.
              </div>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
              <div className="font-bold">PIN Keuangan: 123456</div>
              <div className="text-emerald-800 mt-0.5 leading-snug">
                Membuka Keuangan Perusahaan &amp; Rekap Gaji Karyawan.
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[9.5px] font-semibold text-slate-700">Ketik Angka PIN:</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-xs tracking-widest text-slate-800 bg-slate-50">
                1 2 3 4
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-blue-700 text-white font-bold text-[10px]">
                Verifikasi &amp; Aktifkan
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </VisualBox>
);

/* 3.1 DASHBOARD & POP-UP PUSAT NOTIFIKASI */
export const FigureDashboardAndNotif: React.FC = () => (
  <VisualBox
    title="Tampilan Dashboard dan Jendela Pop-Up Notifikasi (Tidak Memburamkan Layar)"
    caption="Gambar 3.1 — Pengguna dapat melihat grafik kehadiran di layar utama sambil membuka daftar notifikasi tanpa terhalang blur."
    legends={[
      { num: 1, text: 'Klik ikon lonceng di kanan atas untuk membuka atau menutup jendela Pop-Up Notifikasi.' },
      { num: 2, text: 'Layar utama tetap jelas (tidak buram) dan tombol di belakangnya tetap dapat diklik.' },
      { num: 3, text: 'Daftar catatan riwayat aktivitas terbaru tersusun rapi berdasarkan waktu kejadian.', tone: 'amber' },
      { num: 4, text: 'Klik tab Perangkat & Preferensi untuk mengaktifkan notifikasi langsung ke HP/Windows.', tone: 'emerald' },
    ]}
  >
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[10px]">
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200">
        <span className="font-bold text-slate-900 text-[11px]">Bilah Atas Aplikasi — Dashboard</span>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-700">
            Admin Absensi
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold">
            <Bell className="w-3.5 h-3.5" />
            <span>2 Baru</span>
            <PinBadge num={1} tone="amber" />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3 items-stretch">
        <div className="col-span-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">Layar Utama (Tetap Aktif)</span>
            <PinBadge num={2} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-lg bg-white border border-slate-200">
              <div className="text-[9px] text-slate-500">Hadir Hari Ini</div>
              <div className="font-mono font-bold text-sm text-emerald-700">24 Orang</div>
            </div>
            <div className="p-2 rounded-lg bg-white border border-slate-200">
              <div className="text-[9px] text-slate-500">Telat / Libur</div>
              <div className="font-mono font-bold text-sm text-amber-700">1 / 2 Org</div>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-white border border-slate-200">
            <div className="text-[9.5px] font-semibold text-slate-700 mb-1.5">
              Grafik Kehadiran 7 Hari Terakhir
            </div>
            <div className="flex items-end gap-2 h-11 pt-1">
              {[72, 85, 92, 78, 96, 88, 94].map((val, idx) => (
                <div key={idx} className="flex-1 bg-blue-600 rounded-t" style={{ height: `${Math.round((val / 100) * 34)}px` }} />
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-6 rounded-xl border-2 border-slate-300 bg-white shadow-md overflow-hidden flex flex-col justify-between">
          <div className="bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between">
            <span className="font-bold text-[10.5px]">Pusat Notifikasi (Pop-Up)</span>
            <PinBadge num={3} tone="amber" />
          </div>
          <div className="p-2.5 space-y-2 flex-1">
            <div className="flex gap-1.5 text-[9.5px] font-semibold">
              <span className="px-2 py-0.5 rounded bg-blue-600 text-white">Aktivitas</span>
              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-900 inline-flex items-center gap-1">
                Perangkat &amp; Preferensi <PinBadge num={4} tone="emerald" />
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-bold text-slate-900">Absensi Budi Santoso Dicatat</div>
              <div className="text-[9.5px] text-slate-600">Status Hadir · Masuk 07:55 WIB</div>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
              <div className="font-bold text-amber-950">Jadwal Libur Dipindahkan</div>
              <div className="text-[9.5px] text-amber-800">Rizal F. · Libur Senin pindah ke Rabu</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </VisualBox>
);

/* 4.1 TIGA CARA INPUT ABSENSI DI MATRIKS */
export const FigureMatrixInputMethods: React.FC = () => (
  <VisualBox
    title="Tiga Cara Mudah Mengisi Absensi Karyawan di Matriks Daftar Hadir"
    caption="Gambar 4.1 — Pengisian absensi dapat dilakukan lewat Formulir Lengkap (1), Mode Klik Sel Cepat (2), atau Tombol Keyboard (4)."
    legends={[
      { num: 1, text: 'Klik Input Absensi untuk mengisi jam masuk, jam pulang, lembur, dan alasan izin telat.' },
      { num: 2, text: 'Pilih status di bilah Mode Klik Sel, lalu klik langsung kotak tanggal di tabel (3).', tone: 'emerald' },
      { num: 3, text: 'Klik kotak tanggal mana saja pada baris karyawan untuk mengubah status hari itu.' },
      { num: 4, text: 'Sorot kotak tanggal lalu tekan huruf H, T, I, S, A, L, atau Delete di keyboard.', tone: 'amber' },
    ]}
  >
    <div className="space-y-2.5 text-[10px]">
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="px-2.5 py-1 rounded-lg bg-blue-700 text-white font-bold inline-flex items-center gap-1.5">
            <PinBadge num={1} tone="amber" /> + Input Absensi / Izin Telat
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-emerald-300">
          <PinBadge num={2} tone="emerald" />
          <span className="font-bold text-emerald-900">Mode Klik Sel:</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">Hadir (H)</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">Sakit (S)</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">Izin (I)</span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-300 overflow-hidden">
        <div className="bg-slate-900 text-white px-2.5 py-1.5 flex items-center justify-between">
          <span className="font-bold">Tabel Matriks Daftar Hadir Bulanan</span>
          <span className="inline-flex items-center gap-1.5 text-[9.5px] text-amber-300">
            <PinBadge num={4} tone="amber" /> Pintasan Keyboard: Tekan H / T / I / S / A / L
          </span>
        </div>
        <table className="w-full border-collapse text-center font-mono text-[10px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
              <th className="py-1.5 px-2.5 text-left font-sans">Nama Karyawan</th>
              <th className="py-1.5 px-2">Tgl 01</th>
              <th className="py-1.5 px-2">Tgl 02</th>
              <th className="py-1.5 px-2">Tgl 03</th>
              <th className="py-1.5 px-2">Tgl 04</th>
              <th className="py-1.5 px-2 bg-blue-50 text-blue-900">Total H</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="py-1.5 px-2.5 text-left font-sans font-bold text-slate-900">Andi Pratama</td>
              <td className="p-1"><span className="block py-1 rounded bg-emerald-100 text-emerald-900 font-bold">H</span></td>
              <td className="p-1"><span className="block py-1 rounded bg-amber-100 text-amber-900 font-bold">T</span></td>
              <td className="p-1"><span className="block py-1 rounded bg-slate-200 text-slate-700 font-bold">L</span></td>
              <td className="p-1">
                <span className="inline-flex items-center justify-center gap-1 w-full py-1 rounded bg-emerald-100 text-emerald-900 font-bold ring-2 ring-blue-600">
                  H <PinBadge num={3} />
                </span>
              </td>
              <td className="font-bold text-slate-900">22</td>
            </tr>
            <tr>
              <td className="py-1.5 px-2.5 text-left font-sans font-bold text-slate-900">Siti Rahma</td>
              <td className="p-1"><span className="block py-1 rounded bg-emerald-100 text-emerald-900 font-bold">H</span></td>
              <td className="p-1"><span className="block py-1 rounded bg-blue-100 text-blue-900 font-bold">I</span></td>
              <td className="p-1"><span className="block py-1 rounded bg-emerald-100 text-emerald-900 font-bold">H</span></td>
              <td className="p-1"><span className="block py-1 rounded bg-slate-200 text-slate-700 font-bold">L</span></td>
              <td className="font-bold text-slate-900">21</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </VisualBox>
);

/* 4.2 UBAH WARNA MATRIKS LANGSUNG & EKSPOR */
export const FigureMatrixColorAndExport: React.FC = () => (
  <VisualBox
    title="Cara Mengubah Warna Matriks Langsung di Keterangan serta Cetak / Ekspor Excel"
    caption="Gambar 4.2 — Klik baris warna pada panel Keterangan di sisi kiri matriks untuk mengganti warna tampilan, cetak, dan Excel sekaligus."
    legends={[
      { num: 1, text: 'Saat Admin Absensi aktif, klik salah satu baris pada panel Keterangan di sebelah kiri matriks.' },
      { num: 2, text: 'Pilih warna kotak dan warna huruf yang diinginkan di jendela pemilih warna, lalu simpan.', tone: 'amber' },
      { num: 3, text: 'Gunakan tab Log Absensi untuk melihat jam datang, jam pulang, dan catatan harian.', tone: 'emerald' },
      { num: 4, text: 'Klik Cetak untuk kertas A4 mendatar (Landscape) atau Ekspor Excel (.xlsx).' },
    ]}
  >
    <div className="grid grid-cols-12 gap-3 items-stretch text-[10px]">
      <div className="col-span-6 rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between font-bold text-slate-900 pb-1 border-b border-slate-200">
          <span className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-blue-700" /> Panel Keterangan
          </span>
          <PinBadge num={1} />
        </div>
        {[
          { code: 'H', label: 'Hadir Tepat Waktu', bg: '#DCFCE7', fg: '#166534' },
          { code: 'T', label: 'Terlambat', bg: '#FEF3C7', fg: '#92400E' },
          { code: 'I', label: 'Izin Resmi', bg: '#DBEAFE', fg: '#1E40AF' },
          { code: 'L', label: 'Libur Karyawan', bg: '#E2E8F0', fg: '#334155' },
        ].map((item, idx) => (
          <div
            key={item.code}
            className={`flex items-center justify-between px-2 py-1 rounded bg-white border ${
              idx === 0 ? 'border-blue-500 ring-1 ring-blue-300' : 'border-slate-200'
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded font-mono font-bold flex items-center justify-center"
                style={{ backgroundColor: item.bg, color: item.fg }}
              >
                {item.code}
              </span>
              <span className="font-semibold text-slate-800">{item.label}</span>
            </span>
            <span className="text-[9px] font-bold text-blue-700">Ubah Warna</span>
          </div>
        ))}
      </div>

      <div className="col-span-6 flex flex-col justify-between gap-2">
        <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between font-bold text-amber-950">
            <span>Jendela Pemilih Warna</span>
            <PinBadge num={2} tone="amber" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-emerald-500 border border-white shadow-2xs" />
            <span className="w-6 h-6 rounded bg-sky-500 border border-white shadow-2xs" />
            <span className="w-6 h-6 rounded bg-amber-400 border border-white shadow-2xs" />
            <span className="w-6 h-6 rounded bg-rose-500 border border-white shadow-2xs" />
            <span className="ml-auto px-2 py-1 rounded bg-slate-900 text-white font-semibold text-[9px]">
              Simpan
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold inline-flex items-center gap-1">
              Tab Log Absensi <PinBadge num={3} tone="emerald" />
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900 text-white font-semibold">
              <Printer className="w-3 h-3" /> Cetak / Excel <PinBadge num={4} />
            </span>
          </div>
          <div className="text-[9.5px] text-slate-600">
            Warna yang diubah langsung berlaku pada layar, hasil cetak PDF, dan file Excel.
          </div>
        </div>
      </div>
    </div>
  </VisualBox>
);

/* 5.1 JADWAL SHIFT, ANTI DOUBLE SHIFT & PINDAH LIBUR */
export const FigureShiftAndMoveOff: React.FC = () => (
  <VisualBox
    title="Aturan Anti-Bentrok Shift dan Cara Memindahkan Hari/Tanggal Libur"
    caption="Gambar 5.1 — Karyawan yang libur tidak bisa masuk shift (kiri). Gunakan tombol Pindah Libur (1) lalu isi jendela Pindah Libur (kanan)."
    legends={[
      { num: 1, text: 'Karyawan yang sedang libur terkunci. Klik tombol Pindah Libur di sebelah namanya.', tone: 'amber' },
      { num: 2, text: 'Pilih apakah ingin memindahkan Hari Libur Rutin (misal Senin ke Rabu) atau Tanggal Khusus.' },
      { num: 3, text: 'Centang opsi masuk shift agar karyawan otomatis masuk ke shift tujuan di hari tersebut.', tone: 'emerald' },
      { num: 4, text: 'Klik Simpan Perubahan. Hari libur berpindah dan jadwal shift langsung diperbarui.' },
    ]}
  >
    <div className="grid grid-cols-12 gap-3 items-stretch text-[10px]">
      <div className="col-span-6 rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
        <div className="flex items-center justify-between font-bold text-slate-900 border-b border-slate-200 pb-1">
          <span>Jadwal Hari Senin</span>
          <span className="text-[9px] text-blue-700 font-semibold">Proteksi Anti Double Shift</span>
        </div>
        <div className="p-2 rounded-lg bg-white border border-slate-200">
          <div className="flex items-center justify-between font-bold text-slate-800">
            <span>Shift Pagi (08:00–16:00)</span>
            <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[9px]">Atur</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-semibold">
              Andi P.
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-semibold">
              Dina K.
            </span>
          </div>
        </div>
        <div className="p-2 rounded-lg bg-amber-50 border border-amber-300 space-y-1.5">
          <div className="flex items-center justify-between font-bold text-amber-950">
            <span>Daftar Libur / OFF Hari Senin</span>
            <PinBadge num={1} tone="amber" />
          </div>
          <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded border border-amber-200">
            <span className="font-semibold text-slate-800">Rizal F. (Terkunci Libur)</span>
            <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[9px]">
              Pindah Libur
            </span>
          </div>
        </div>
      </div>

      <div className="col-span-6 rounded-lg border border-slate-300 bg-white overflow-hidden flex flex-col justify-between">
        <div className="bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between font-bold">
          <span>Jendela Pindah Libur — Rizal F.</span>
          <PinBadge num={2} />
        </div>
        <div className="p-2.5 space-y-2 flex-1">
          <div className="grid grid-cols-2 gap-1.5 text-center font-semibold text-[9.5px]">
            <div className="p-1.5 rounded bg-blue-50 border border-blue-400 text-blue-950">
              Pindah Hari Rutin (Senin → Rabu)
            </div>
            <div className="p-1.5 rounded bg-slate-50 border border-slate-200 text-slate-600">
              Pindah Tanggal Khusus
            </div>
          </div>
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between gap-2">
            <span className="font-semibold">
              Langsung masukkan ke <strong>Shift Pagi</strong> hari Senin
            </span>
            <PinBadge num={3} tone="emerald" />
          </div>
          <div className="flex justify-end items-center gap-1.5 pt-1">
            <PinBadge num={4} />
            <span className="px-3 py-1 rounded bg-blue-700 text-white font-bold">
              Simpan Perubahan
            </span>
          </div>
        </div>
      </div>
    </div>
  </VisualBox>
);

/* 6.1 JADWAL LIBUR, KALENDER BULANAN & MASTER KARYAWAN */
export const FigureDayOffAndCalendar: React.FC = () => (
  <VisualBox
    title="Mengatur Hari Libur Rutin, Tanggal Libur Khusus, dan Data Karyawan"
    caption="Gambar 6.1 — Pengaturan libur per individu, penambahan karyawan baru (1), serta kalender jumlah personel masuk dan libur (2)."
    legends={[
      { num: 1, text: 'Klik Tambah Karyawan (saat Admin Absensi aktif) untuk mendaftarkan pegawai baru.', tone: 'amber' },
      { num: 2, text: 'Klik hari libur rutin atau ikon tanggal khusus untuk mengubah jadwal libur tiap orang.' },
      { num: 3, text: 'Buka tab Kalender Bulanan untuk melihat jumlah karyawan yang masuk dan libur setiap tanggal.', tone: 'emerald' },
    ]}
  >
    <div className="grid grid-cols-12 gap-3 items-stretch text-[10px]">
      <div className="col-span-7 rounded-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 text-white px-2.5 py-1.5 flex items-center justify-between font-bold">
          <span>Daftar Karyawan &amp; Hari Libur</span>
          <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[9px] inline-flex items-center gap-1">
            <UserPlus className="w-3 h-3" /> Tambah Karyawan <PinBadge num={1} tone="amber" />
          </span>
        </div>
        <div className="p-2 space-y-1.5 bg-white">
          {[
            { name: 'Andi Pratama · Kasir', rutin: 'Minggu', khusus: '12 Nov' },
            { name: 'Rizal F. · Gudang', rutin: 'Rabu', khusus: '—' },
          ].map((emp, idx) => (
            <div
              key={emp.name}
              className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200"
            >
              <span className="font-bold text-slate-900">{emp.name}</span>
              <span className="flex items-center gap-1.5 font-mono text-[9.5px]">
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-900 font-semibold">
                  Rutin: {emp.rutin}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 font-semibold inline-flex items-center gap-1">
                  Khusus: {emp.khusus}
                  {idx === 0 && <PinBadge num={2} />}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="col-span-5 rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
        <div className="flex items-center justify-between font-bold text-slate-900">
          <span className="flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5 text-emerald-700" /> Kalender Bulanan
          </span>
          <PinBadge num={3} tone="emerald" />
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-center font-mono text-[9.5px]">
          {[
            { day: 'Tgl 1', inCount: 24, offCount: 2 },
            { day: 'Tgl 2', inCount: 23, offCount: 3 },
            { day: 'Tgl 3', inCount: 25, offCount: 1 },
            { day: 'Tgl 4', inCount: 22, offCount: 4 },
          ].map((d) => (
            <div key={d.day} className="p-1.5 rounded bg-white border border-slate-200">
              <div className="font-bold text-slate-900">{d.day}</div>
              <div className="text-emerald-700 font-semibold">{d.inCount} Masuk · {d.offCount} Off</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </VisualBox>
);

/* 7.1 REKAP BULANAN & CICILAN KETERLAMBATAN */
export const FigureRecapAndLateSettlement: React.FC = () => (
  <VisualBox
    title="Alur Penghitungan Keterlambatan dan Pilihan Penggantian (Cicilan)"
    caption="Gambar 7.1 — Sistem menghitung selisih menit keterlambatan otomatis (1) lalu menyediakan dua cara penyelesaian (2 & 3)."
    legends={[
      { num: 1, text: 'Menit telat dihitung dari jam datang dikurangi jam mulai shift dan batas toleransi.' },
      { num: 2, text: 'Metode Tambahan Jam Kerja: karyawan menambah jam kerja di hari tertentu untuk melunasi telat.' },
      { num: 3, text: 'Metode Potongan Gaji: menit telat diubah ke potongan rupiah dan otomatis masuk ke Rekap Gaji.', tone: 'emerald' },
    ]}
  >
    <div className="grid grid-cols-12 gap-2.5 items-stretch text-[10px]">
      <div className="col-span-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between">
        <div className="flex items-center justify-between font-bold text-slate-900">
          <span>Perhitungan Otomatis</span>
          <PinBadge num={1} />
        </div>
        <div className="mt-1.5 space-y-1 text-[9.5px] text-slate-700">
          <div>Shift Pagi: <strong>08:00</strong> (+ Toleransi 10 mnt)</div>
          <div>Jam Datang: <strong>08:25</strong></div>
          <div className="pt-1 font-bold text-amber-800">Hasil: Terlambat 15 Menit</div>
        </div>
      </div>

      <div className="col-span-1 flex items-center justify-center">
        <ArrowRight className="w-4 h-4 text-slate-500" />
      </div>

      <div className="col-span-7 grid grid-cols-2 gap-2.5">
        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 flex flex-col justify-between">
          <div className="flex items-center justify-between font-bold text-blue-950">
            <span>Ganti Jam Kerja</span>
            <PinBadge num={2} />
          </div>
          <div className="text-[9.5px] text-blue-900 mt-1 leading-snug">
            Isi tanggal &amp; jam lembur pengganti (misal 17:00–17:15) untuk melunasi menit telat tanpa potong gaji.
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-col justify-between">
          <div className="flex items-center justify-between font-bold text-emerald-950">
            <span>Potongan Gaji</span>
            <PinBadge num={3} tone="emerald" />
          </div>
          <div className="text-[9.5px] text-emerald-900 mt-1 leading-snug">
            Nominal potongan (Rp) langsung dikirim ke modul Rekap Gaji bulan tersebut.
          </div>
        </div>
      </div>
    </div>
  </VisualBox>
);

/* 8.1 KEUANGAN PERUSAHAAN */
export const FigureFinanceDashboard: React.FC = () => (
  <VisualBox
    title="Pengelolaan Kas Tunai, Rekening Bank, dan Arus Kas (PIN Keuangan: 123456)"
    caption="Gambar 8.1 — Tampilan buku kas perusahaan untuk memantau saldo rekening, mencatat pemasukan/pengeluaran, dan memindahkan saldo."
    legends={[
      { num: 1, text: 'Pantau saldo terkini pada masing-masing dompet Kas Tunai (Cash) maupun Bank (Transfer).', tone: 'emerald' },
      { num: 2, text: 'Catat transaksi pemasukan atau pengeluaran baru, atau pindah saldo antarkas.' },
      { num: 3, text: 'Unduh laporan kas bulanan ke format Excel (.xlsx) untuk arsip pembukuan.', tone: 'amber' },
    ]}
  >
    <div className="space-y-2.5 text-[10px]">
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="flex items-center justify-between font-bold text-emerald-950">
            <span>Kas Tunai (Cash)</span>
            <PinBadge num={1} tone="emerald" />
          </div>
          <div className="font-mono font-bold text-xs text-emerald-800 mt-1">Rp 18.500.000</div>
        </div>
        <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
          <div className="font-bold text-blue-950">Rekening Bank</div>
          <div className="font-mono font-bold text-xs text-blue-800 mt-1">Rp 64.250.000</div>
        </div>
        <div className="p-2 rounded-lg bg-slate-900 text-white flex flex-col justify-between">
          <div className="flex items-center justify-between font-bold">
            <span>Tombol Aksi</span>
            <PinBadge num={2} />
          </div>
          <div className="text-[9px] text-sky-300 mt-1">+ Pemasukan · + Pengeluaran · Transfer</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between">
        <span className="font-semibold text-slate-800">
          Catatan Transaksi Harian (Pendapatan, Biaya Operasional, &amp; Pembayaran Gaji)
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 text-white font-bold text-[9.5px]">
          <FileSpreadsheet className="w-3 h-3" /> Ekspor Excel Kas <PinBadge num={3} tone="amber" />
        </span>
      </div>
    </div>
  </VisualBox>
);

/* 9.1 REKAP GAJI & SLIP GAJI */
export const FigurePayrollAndSlip: React.FC = () => (
  <VisualBox
    title="Alur Perhitungan Otomatis Rekap Gaji dan Pencetakan Slip Gaji Resmi"
    caption="Gambar 9.1 — Rekap Gaji menggabungkan profil gaji (1), data hadir & telat (2), hingga pembayaran dan cetak Slip Gaji (3)."
    legends={[
      { num: 1, text: 'Atur gaji pokok, tunjangan, tarif lembur, dan potongan BPJS di Profil Gaji Karyawan.' },
      { num: 2, text: 'Sistem otomatis menghitung lembur & potongan telat/alpha dari data absensi bulan ini.' },
      { num: 3, text: 'Tandai status Dibayar (bisa potong kas langsung) lalu cetak Slip Gaji resmi karyawan.', tone: 'emerald' },
    ]}
  >
    <div className="grid grid-cols-11 gap-2 items-stretch text-[10px]">
      <div className="col-span-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
        <div className="flex items-center justify-between font-bold text-slate-900">
          <span>Profil Gaji</span>
          <PinBadge num={1} />
        </div>
        <div className="text-[9.5px] text-slate-600">
          Gaji Pokok + Tunjangan + Tarif Lembur + BPJS
        </div>
      </div>

      <div className="col-span-1 flex items-center justify-center">
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </div>

      <div className="col-span-3 p-2.5 rounded-lg bg-blue-50 border border-blue-200 space-y-1">
        <div className="flex items-center justify-between font-bold text-blue-950">
          <span>Hitung Otomatis</span>
          <PinBadge num={2} />
        </div>
        <div className="text-[9.5px] text-blue-900">
          (+) Lembur &amp; Bonus (−) Telat, Alpha, &amp; Kasbon
        </div>
      </div>

      <div className="col-span-1 flex items-center justify-center">
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </div>

      <div className="col-span-3 p-2.5 rounded-lg bg-emerald-900 text-white space-y-1">
        <div className="flex items-center justify-between font-bold">
          <span>Slip &amp; Bayar</span>
          <PinBadge num={3} tone="emerald" />
        </div>
        <div className="text-[9.5px] text-emerald-100">
          Status Dibayar + Cetak Slip Gaji Satuan / Massal
        </div>
      </div>
    </div>
  </VisualBox>
);

/* 10.1 PROFIL PERUSAHAAN, PENGATURAN PIN GANDA & BACKUP */
export const FigureSettingsDualPin: React.FC = () => (
  <VisualBox
    title="Pengaturan Shift, Mengganti PIN Absensi vs. PIN Keuangan, dan Backup Data"
    caption="Gambar 10.1 — Menu Pengaturan (dibuka dengan PIN Absensi) menyediakan pengaturan PIN ganda yang wajib berbeda serta cadangan data JSON."
    legends={[
      { num: 1, text: 'PIN Absensi (default 1234) dan PIN Keuangan (default 123456) dapat diubah secara terpisah.' },
      { num: 2, text: 'Sistem otomatis menolak jika Anda mencoba menyamakan PIN Absensi dan PIN Keuangan.', tone: 'emerald' },
      { num: 3, text: 'Selalu klik Unduh Backup JSON secara rutin sebelum melakukan Restore atau Reset Data.', tone: 'amber' },
    ]}
  >
    <div className="grid grid-cols-12 gap-2.5 items-stretch text-[10px]">
      <div className="col-span-4 p-2.5 rounded-lg border border-blue-300 bg-blue-50/75 space-y-1.5">
        <div className="flex items-center justify-between font-bold text-blue-950">
          <span>Ubah PIN Absensi</span>
          <PinBadge num={1} />
        </div>
        <div className="px-2 py-1 rounded bg-white border border-blue-200 font-mono text-[9.5px] text-blue-900">
          Default: 1234 (4–12 angka)
        </div>
        <div className="text-[9px] text-blue-900 leading-snug">
          Membuka input absensi, shift, libur, warna, profil, &amp; Pengaturan.
        </div>
      </div>

      <div className="col-span-4 p-2.5 rounded-lg border border-emerald-300 bg-emerald-50/75 space-y-1.5">
        <div className="flex items-center justify-between font-bold text-emerald-950">
          <span>Ubah PIN Keuangan</span>
          <PinBadge num={2} tone="emerald" />
        </div>
        <div className="px-2 py-1 rounded bg-white border border-emerald-200 font-mono text-[9.5px] text-emerald-900">
          Default: 123456 (Wajib Beda)
        </div>
        <div className="text-[9px] text-emerald-900 leading-snug">
          Membuka menu Keuangan Perusahaan dan Rekap Gaji Karyawan.
        </div>
      </div>

      <div className="col-span-4 p-2.5 rounded-lg border border-slate-300 bg-slate-50 flex flex-col justify-between space-y-1.5">
        <div className="flex items-center justify-between font-bold text-slate-900">
          <span>Cadangan Data</span>
          <PinBadge num={3} tone="amber" />
        </div>
        <div className="px-2 py-1 rounded bg-slate-900 text-white font-semibold inline-flex items-center justify-center gap-1.5 text-[9.5px]">
          <Download className="w-3 h-3" /> Unduh Backup JSON
        </div>
        <div className="text-[9px] text-slate-600 leading-snug">
          Menyimpan salinan aman seluruh data karyawan, absensi, dan pengaturan.
        </div>
      </div>
    </div>
  </VisualBox>
);
