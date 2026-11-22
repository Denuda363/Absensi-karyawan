import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Globe,
  Layers,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  Settings,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AppSettings,
  CompanyBranch,
  CompanyProfile,
  Employee,
  NavSection,
} from '../types';
import { updateAppSettings } from '../services/attendanceService';

interface CompanyProfileViewProps {
  employees: Employee[];
  settings: AppSettings;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (nav: NavSection) => void;
  isAdminMode?: boolean;
}

const FALLBACK_PROFILE: CompanyProfile = {
  legalName: 'PT KaryaPresensi Nusantara',
  industry: 'Distribusi, Ritel & Logistik Terpadu',
  taxId: '01.234.567.8-012.000',
  nib: '9120304050607',
  establishedYear: '2018',
  phone: '(021) 555-0192',
  email: 'hrd@karyapresensi.co.id',
  website: 'https://karyapresensi.co.id',
  address: 'Jl. Jenderal Sudirman Kav. 52–53, SCBD, Kebayoran Baru',
  city: 'Jakarta Selatan, DKI Jakarta',
  postalCode: '12190',
  directorName: 'Hendra Kusuma, S.E., M.M.',
  hrManagerName: 'Ratna Dewi Anggraini, S.Psi.',
  hrManagerTitle: 'Manajer Sumber Daya Manusia',
  workDaysSummary: 'Senin – Minggu (Sistem Shift & Libur Bergilir)',
  vision:
    'Menjadi perusahaan distribusi dan layanan operasional terdepan yang mengutamakan kedisiplinan kerja, keandalan rantai pasok, dan kesejahteraan sumber daya manusia.',
  mission:
    'Membangun budaya kerja yang akurat dan transparan, memberdayakan tim lintas divisi dengan standar operasional modern, serta menjaga kualitas pelayanan terbaik bagi seluruh mitra.',
  logoDataUrl: '',
  branches: [],
};

type EditSectionTab = 'identitas' | 'kontak' | 'pimpinan';

function getCompanyMonogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && w.toUpperCase() !== 'PT' && w.toUpperCase() !== 'CV');
  if (words.length === 0) return 'KP';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

async function resizeLogoFileToDataUrl(file: File): Promise<string> {
  if (file.type === 'image/svg+xml') {
    const text = await file.text();
    if (text.length > 150000) {
      throw new Error('Ukuran file SVG terlalu besar (maksimal 150 KB).');
    }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        const maxSide = 240;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Browser tidak mendukung pemrosesan gambar.'));
          return;
        }
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const CompanyProfileView: React.FC<CompanyProfileViewProps> = ({
  employees,
  settings,
  loading,
  onRefresh,
  onNavigate,
  isAdminMode = false,
}) => {
  const profile: CompanyProfile = settings.companyProfile ?? FALLBACK_PROFILE;
  const companyName = settings.companyName || 'KARYAPRESENSI';
  const companySubtitle = settings.companySubtitle || 'HRIS PERUSAHAAN';

  const [bannerNotice, setBannerNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [logoError, setLogoError] = useState<boolean>(false);

  // Edit Profile Modal state
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editTab, setEditTab] = useState<EditSectionTab>('identitas');
  const [formCompanyName, setFormCompanyName] = useState<string>(companyName);
  const [formSubtitle, setFormSubtitle] = useState<string>(companySubtitle);
  const [formProfile, setFormProfile] = useState<CompanyProfile>(profile);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Branch Modal state
  const [branchModalOpen, setBranchModalOpen] = useState<boolean>(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string>('');
  const [branchCity, setBranchCity] = useState<string>('');
  const [branchAddress, setBranchAddress] = useState<string>('');
  const [branchPhone, setBranchPhone] = useState<string>('');
  const [branchIsHq, setBranchIsHq] = useState<boolean>(false);
  const [savingBranch, setSavingBranch] = useState<boolean>(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active),
    [employees]
  );

  const divisionBreakdown = useMemo(() => {
    const map = new Map<string, { department: string; count: number; positions: Set<string> }>();
    for (const emp of activeEmployees) {
      const existing = map.get(emp.department) ?? {
        department: emp.department,
        count: 0,
        positions: new Set<string>(),
      };
      existing.count += 1;
      if (emp.position) existing.positions.add(emp.position);
      map.set(emp.department, existing);
    }
    const total = activeEmployees.length || 1;
    return Array.from(map.values())
      .map((d) => ({
        department: d.department,
        count: d.count,
        sharePct: Math.round((d.count / total) * 100),
        positionsLabel: Array.from(d.positions).slice(0, 3).join(', '),
      }))
      .sort((a, b) => b.count - a.count);
  }, [activeEmployees]);

  const openEditModal = (initialTab: EditSectionTab = 'identitas') => {
    setFormCompanyName(companyName);
    setFormSubtitle(companySubtitle);
    setFormProfile({ ...profile });
    setEditTab(initialTab);
    setEditError(null);
    setEditModalOpen(true);
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setEditError('Ukuran file logo maksimal 3 MB.');
      return;
    }
    try {
      const dataUrl = await resizeLogoFileToDataUrl(file);
      setFormProfile((prev) => ({ ...prev, logoDataUrl: dataUrl }));
      setLogoError(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Gagal memproses logo.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    if (!formCompanyName.trim()) {
      setEditError('Nama perusahaan wajib diisi.');
      setEditTab('identitas');
      return;
    }

    setSavingProfile(true);
    try {
      await updateAppSettings({
        companyName: formCompanyName.trim(),
        companySubtitle: formSubtitle.trim() || 'HRIS PERUSAHAAN',
        companyProfile: formProfile,
      });
      await onRefresh();
      setEditModalOpen(false);
      setBannerNotice({
        type: 'success',
        text: 'Profil perusahaan berhasil diperbarui dan disinkronkan ke header laporan & Excel.',
      });
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Gagal menyimpan profil perusahaan.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const openNewBranchModal = () => {
    setEditingBranchId(null);
    setBranchName('');
    setBranchCity('');
    setBranchAddress('');
    setBranchPhone('');
    setBranchIsHq(profile.branches.length === 0);
    setBranchError(null);
    setBranchModalOpen(true);
  };

  const openEditBranchModal = (b: CompanyBranch) => {
    setEditingBranchId(b.id);
    setBranchName(b.name);
    setBranchCity(b.city);
    setBranchAddress(b.address);
    setBranchPhone(b.phone);
    setBranchIsHq(b.isHeadquarters);
    setBranchError(null);
    setBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBranchError(null);
    if (!branchName.trim() || !branchCity.trim()) {
      setBranchError('Nama lokasi dan kota wajib diisi.');
      return;
    }

    setSavingBranch(true);
    try {
      let nextBranches = [...profile.branches];
      if (branchIsHq) {
        nextBranches = nextBranches.map((b) => ({ ...b, isHeadquarters: false }));
      }
      if (editingBranchId) {
        nextBranches = nextBranches.map((b) =>
          b.id === editingBranchId
            ? {
                ...b,
                name: branchName.trim(),
                city: branchCity.trim(),
                address: branchAddress.trim(),
                phone: branchPhone.trim(),
                isHeadquarters: branchIsHq,
              }
            : b
        );
      } else {
        nextBranches.push({
          id: `branch_${Date.now()}`,
          name: branchName.trim(),
          city: branchCity.trim(),
          address: branchAddress.trim(),
          phone: branchPhone.trim(),
          isHeadquarters: branchIsHq,
        });
      }

      await updateAppSettings({
        companyProfile: {
          ...profile,
          branches: nextBranches,
        },
      });
      await onRefresh();
      setBranchModalOpen(false);
      setBannerNotice({
        type: 'success',
        text: editingBranchId
          ? `Lokasi ${branchName.trim()} berhasil diperbarui.`
          : `Lokasi baru ${branchName.trim()} berhasil ditambahkan.`,
      });
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : 'Gagal menyimpan lokasi cabang.');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleDeleteBranch = async (branch: CompanyBranch) => {
    setBannerNotice(null);
    try {
      const nextBranches = profile.branches.filter((b) => b.id !== branch.id);
      await updateAppSettings({
        companyProfile: {
          ...profile,
          branches: nextBranches,
        },
      });
      await onRefresh();
      setBannerNotice({
        type: 'success',
        text: `Lokasi ${branch.name} telah dihapus dari daftar cabang.`,
      });
    } catch (err) {
      setBannerNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus lokasi.',
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-36 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="lg:col-span-5 h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const monogram = getCompanyMonogram(companyName);

  return (
    <div className="space-y-6">
      {bannerNotice && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 no-print ${
            bannerNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{bannerNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerNotice(null)}
            aria-label="Tutup notifikasi"
            className="hover:opacity-70 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Company Identity Header Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 min-w-0">
            {/* Company Logo / Monogram */}
            <div className="w-20 h-20 rounded-xl bg-slate-900 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {profile.logoDataUrl && !logoError ? (
                <img
                  src={profile.logoDataUrl}
                  alt={`Logo ${companyName}`}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="w-full h-full object-contain bg-white p-1.5"
                />
              ) : (
                <span className="font-display text-2xl font-bold tracking-tight text-white">
                  {monogram}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-700">{profile.legalName || companyName}</span>
                {profile.industry && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{profile.industry}</span>
                  </>
                )}
                {profile.establishedYear && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Berdiri {profile.establishedYear}</span>
                  </>
                )}
              </div>

              <h2 className="font-display text-2xl font-bold text-slate-900 mt-1 tracking-tight text-balance">
                {companyName}
              </h2>

              <div className="mt-1.5 text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>{companySubtitle}</span>
                {profile.city && (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{profile.city}</span>
                  </span>
                )}
                {profile.phone && (
                  <span className="inline-flex items-center gap-1 font-mono text-slate-500 tabular-nums">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{profile.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Profil</span>
            </button>

            <button
              type="button"
              onClick={() => openEditModal('identitas')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Profil Perusahaan</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4-Column Organization Metrics Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Karyawan Aktif</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {activeEmployees.length}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1.5">orang</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            Terdaftar pada basis data aktif
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Divisi Operasional</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {divisionBreakdown.length}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1.5">divisi</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500 truncate">
            {divisionBreakdown.length > 0
              ? `Terbesar: ${divisionBreakdown[0].department}`
              : 'Belum ada divisi'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Shift Kerja Terkonfigurasi</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {settings.shifts.length}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1.5">shift</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500 truncate">
            {profile.workDaysSummary || 'Mengikuti jadwal shift'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Kantor &amp; Cabang</span>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {profile.branches.length}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1.5">lokasi</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500 truncate">
            {profile.branches.find((b) => b.isHeadquarters)?.city || profile.city || 'Pusat'}
          </div>
        </div>
      </section>

      {/* Main Two-Column Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Legal Info, Contact, Vision/Mission, Divisions */}
        <div className="lg:col-span-7 space-y-6">
          {/* Legalitas & Kontak Resmi */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Identitas Legal &amp; Kontak Resmi
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Data administrasi perusahaan untuk keperluan kop surat dan laporan resmi HRD
                </p>
              </div>
              <button
                type="button"
                onClick={() => openEditModal('kontak')}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer no-print"
              >
                Ubah Kontak
              </button>
            </div>

            <dl className="divide-y divide-slate-100 text-sm">
              <div className="px-6 py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                <dt className="text-xs font-medium text-slate-500">Badan Hukum</dt>
                <dd className="sm:col-span-2 font-medium text-slate-900">
                  {profile.legalName || '—'}
                </dd>
              </div>

              <div className="px-6 py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                <dt className="text-xs font-medium text-slate-500">Bidang Usaha</dt>
                <dd className="sm:col-span-2 text-slate-800">{profile.industry || '—'}</dd>
              </div>

              <div className="px-6 py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                <dt className="text-xs font-medium text-slate-500">NPWP &amp; NIB</dt>
                <dd className="sm:col-span-2 font-mono text-xs text-slate-800 tabular-nums flex flex-wrap gap-x-4 gap-y-1">
                  <span>NPWP: {profile.taxId || '—'}</span>
                  <span>NIB: {profile.nib || '—'}</span>
                </dd>
              </div>

              <div className="px-6 py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                <dt className="text-xs font-medium text-slate-500">Telepon &amp; Email</dt>
                <dd className="sm:col-span-2 text-slate-800 space-y-1">
                  <div className="font-mono text-xs tabular-nums flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{profile.phone || '—'}</span>
                  </div>
                  <div className="text-xs flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{profile.email || '—'}</span>
                  </div>
                </dd>
              </div>

              <div className="px-6 py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                <dt className="text-xs font-medium text-slate-500">Situs Web</dt>
                <dd className="sm:col-span-2 text-xs text-slate-800 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{profile.website || '—'}</span>
                </dd>
              </div>

              <div className="px-6 py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                <dt className="text-xs font-medium text-slate-500">Alamat Kantor Pusat</dt>
                <dd className="sm:col-span-2 text-slate-800 text-xs leading-relaxed">
                  <div>{profile.address || '—'}</div>
                  <div className="text-slate-500 mt-0.5 font-mono tabular-nums">
                    {[profile.city, profile.postalCode].filter(Boolean).join(' · ')}
                  </div>
                </dd>
              </div>
            </dl>
          </section>

          {/* Visi & Misi Perusahaan */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Visi &amp; Misi Perusahaan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Arah strategis dan prinsip operasional organisasi
                </p>
              </div>
              <button
                type="button"
                onClick={() => openEditModal('pimpinan')}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer no-print"
              >
                Ubah Visi/Misi
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">Visi</div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {profile.vision || 'Belum ada visi perusahaan yang ditetapkan.'}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-700 mb-1">Misi</div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {profile.mission || 'Belum ada misi perusahaan yang ditetapkan.'}
                </p>
              </div>
            </div>
          </section>

          {/* Sebaran Divisi & SDM Aktif */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Struktur Divisi &amp; Sebaran Karyawan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Komposisi tenaga kerja aktif berdasarkan data karyawan saat ini
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('absensi')}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer no-print"
              >
                Kelola Karyawan
              </button>
            </div>

            {divisionBreakdown.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Belum ada karyawan aktif terdaftar.
              </div>
            ) : (
              <div className="mt-4 space-y-3.5">
                {divisionBreakdown.map((div) => (
                  <div key={div.department} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900">{div.department}</span>
                        {div.positionsLabel && (
                          <span className="text-slate-400 ml-2 truncate">
                            {div.positionsLabel}
                          </span>
                        )}
                      </div>
                      <div className="font-mono tabular-nums text-slate-700 shrink-0">
                        <span className="font-semibold text-slate-900">{div.count}</span> staf ·{' '}
                        <span className="text-slate-500">{div.sharePct}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-700 transition-all duration-300"
                        style={{ width: `${Math.min(100, div.sharePct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Leadership, Shift Schedule, Branches */}
        <div className="lg:col-span-5 space-y-6">
          {/* Pimpinan & Penandatangan Laporan */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Pimpinan &amp; Penandatangan HRD
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tercantum otomatis pada footer cetak laporan bulanan
                </p>
              </div>
              <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="space-y-3 text-sm">
              <div className="pb-3 border-b border-slate-100">
                <div className="text-xs text-slate-500">Pimpinan / Direktur Utama</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {profile.directorName || '—'}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">
                  Penanggung Jawab HRD ({profile.hrManagerTitle || 'Manajer HRD'})
                </div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {profile.hrManagerName || '—'}
                </div>
              </div>
            </div>

            {/* Letterhead Preview */}
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[11px] font-medium text-slate-500 mb-2">
                Pratinjau Kop Laporan Resmi:
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-0.5">
                <div className="font-display font-bold text-sm text-slate-900 uppercase">
                  {profile.legalName || companyName}
                </div>
                <div className="text-[11px] text-slate-600">
                  {profile.address}
                  {profile.city ? `, ${profile.city}` : ''}
                </div>
                <div className="font-mono text-[10px] text-slate-500 tabular-nums">
                  {[profile.phone ? `Telp: ${profile.phone}` : '', profile.email]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
          </section>

          {/* Kebijakan Shift & Jam Operasional */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Jadwal Shift &amp; Operasional
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {profile.workDaysSummary || 'Mengikuti jadwal shift kerja'}
                </p>
              </div>
              {isAdminMode && (
                <button
                  type="button"
                  onClick={() => onNavigate('pengaturan')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer no-print"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Atur Shift</span>
                </button>
              )}
            </div>

            {settings.shifts.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Belum ada shift terkonfigurasi.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {settings.shifts.map((s) => (
                  <div
                    key={s.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="font-semibold text-slate-800">{s.name}</div>
                    <div className="font-mono tabular-nums text-slate-600">
                      {s.startTime}–{s.endTime} · Tol. {s.lateToleranceMinutes} mnt
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Lokasi Kantor & Cabang */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Lokasi Kantor &amp; Cabang
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar unit operasional dan kantor perwakilan
                </p>
              </div>
              <button
                type="button"
                onClick={openNewBranchModal}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer no-print"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Lokasi</span>
              </button>
            </div>

            {profile.branches.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <p className="text-xs text-slate-500">
                  Belum ada lokasi atau cabang yang ditambahkan.
                </p>
                <button
                  type="button"
                  onClick={openNewBranchModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer no-print"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Lokasi Pertama</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {profile.branches.map((b) => (
                  <div key={b.id} className="py-3.5 first:pt-1 last:pb-1 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 flex flex-wrap items-center gap-2">
                          <span>{b.name}</span>
                          {b.isHeadquarters && (
                            <span className="text-[11px] font-medium text-blue-700">
                              · Kantor Pusat
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {b.city}
                          {b.phone ? ` · ${b.phone}` : ''}
                        </div>
                        {b.address && (
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {b.address}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 no-print">
                        <button
                          type="button"
                          onClick={() => openEditBranchModal(b)}
                          aria-label={`Edit ${b.name}`}
                          className="p-1.5 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBranch(b)}
                          aria-label={`Hapus ${b.name}`}
                          className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modal: Edit Profil Perusahaan */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto no-print">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-xl my-auto max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Edit Profil Perusahaan
                </h3>
                <p className="text-xs text-slate-500">
                  Lengkapi identitas perusahaan, legalitas, kontak, dan pejabat penandatangan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                aria-label="Tutup"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section Tabs */}
            <div className="px-6 pt-3 pb-0 border-b border-slate-200 flex items-center gap-2 bg-slate-50/70 shrink-0 overflow-x-auto">
              {[
                { id: 'identitas' as const, label: 'Identitas & Logo' },
                { id: 'kontak' as const, label: 'Kontak & Legalitas' },
                { id: 'pimpinan' as const, label: 'Pimpinan & Visi/Misi' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEditTab(tab.id)}
                  className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    editTab === tab.id
                      ? 'border-blue-700 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto">
                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                {editTab === 'identitas' && (
                  <div className="space-y-4">
                    {/* Logo Upload */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                        {formProfile.logoDataUrl ? (
                          <img
                            src={formProfile.logoDataUrl}
                            alt="Pratinjau logo"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain bg-white p-1"
                          />
                        ) : (
                          <span className="font-display text-lg font-bold text-white">
                            {getCompanyMonogram(formCompanyName || 'KP')}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="text-xs font-semibold text-slate-900">
                          Logo Perusahaan
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Unggah file PNG, JPG, atau SVG. Gambar otomatis dikompresi agar ringan.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={handleLogoFileChange}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Pilih Gambar Logo</span>
                          </button>
                          {formProfile.logoDataUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormProfile((p) => ({ ...p, logoDataUrl: '' }));
                                if (logoInputRef.current) logoInputRef.current.value = '';
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus Logo</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Nama Tampilan / Brand Perusahaan *
                        </label>
                        <input
                          type="text"
                          value={formCompanyName}
                          onChange={(e) => setFormCompanyName(e.target.value)}
                          maxLength={60}
                          required
                          placeholder="PT Karya Nusantara"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Subjudul / Unit HR
                        </label>
                        <input
                          type="text"
                          value={formSubtitle}
                          onChange={(e) => setFormSubtitle(e.target.value)}
                          maxLength={60}
                          placeholder="HRIS PERUSAHAAN"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Nama Badan Hukum Resmi
                      </label>
                      <input
                        type="text"
                        value={formProfile.legalName}
                        onChange={(e) =>
                          setFormProfile((p) => ({ ...p, legalName: e.target.value }))
                        }
                        maxLength={100}
                        placeholder="PT KaryaPresensi Nusantara"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Bidang Usaha / Sektor Industri
                        </label>
                        <input
                          type="text"
                          value={formProfile.industry}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, industry: e.target.value }))
                          }
                          maxLength={100}
                          placeholder="Distribusi, Ritel & Logistik"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Tahun Berdiri
                        </label>
                        <input
                          type="text"
                          value={formProfile.establishedYear}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, establishedYear: e.target.value }))
                          }
                          maxLength={10}
                          placeholder="2018"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {editTab === 'kontak' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          NPWP Perusahaan
                        </label>
                        <input
                          type="text"
                          value={formProfile.taxId}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, taxId: e.target.value }))
                          }
                          maxLength={40}
                          placeholder="01.234.567.8-012.000"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          NIB (Nomor Induk Berusaha)
                        </label>
                        <input
                          type="text"
                          value={formProfile.nib}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, nib: e.target.value }))
                          }
                          maxLength={40}
                          placeholder="9120304050607"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Telepon Kantor
                        </label>
                        <input
                          type="text"
                          value={formProfile.phone}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, phone: e.target.value }))
                          }
                          maxLength={40}
                          placeholder="(021) 555-0192"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Email Resmi / HRD
                        </label>
                        <input
                          type="email"
                          value={formProfile.email}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, email: e.target.value }))
                          }
                          maxLength={80}
                          placeholder="hrd@perusahaan.co.id"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Situs Web
                      </label>
                      <input
                        type="text"
                        value={formProfile.website}
                        onChange={(e) =>
                          setFormProfile((p) => ({ ...p, website: e.target.value }))
                        }
                        maxLength={100}
                        placeholder="https://perusahaan.co.id"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Alamat Lengkap Kantor Pusat
                      </label>
                      <textarea
                        rows={2}
                        value={formProfile.address}
                        onChange={(e) =>
                          setFormProfile((p) => ({ ...p, address: e.target.value }))
                        }
                        maxLength={250}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Kota / Provinsi
                        </label>
                        <input
                          type="text"
                          value={formProfile.city}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, city: e.target.value }))
                          }
                          maxLength={80}
                          placeholder="Jakarta Selatan, DKI Jakarta"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Kode Pos
                        </label>
                        <input
                          type="text"
                          value={formProfile.postalCode}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, postalCode: e.target.value }))
                          }
                          maxLength={15}
                          placeholder="12190"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {editTab === 'pimpinan' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Nama Pimpinan / Direktur Utama
                      </label>
                      <input
                        type="text"
                        value={formProfile.directorName}
                        onChange={(e) =>
                          setFormProfile((p) => ({ ...p, directorName: e.target.value }))
                        }
                        maxLength={80}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Penanggung Jawab HRD (Penandatangan Laporan)
                        </label>
                        <input
                          type="text"
                          value={formProfile.hrManagerName}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, hrManagerName: e.target.value }))
                          }
                          maxLength={80}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Jabatan Penandatangan
                        </label>
                        <input
                          type="text"
                          value={formProfile.hrManagerTitle}
                          onChange={(e) =>
                            setFormProfile((p) => ({ ...p, hrManagerTitle: e.target.value }))
                          }
                          maxLength={80}
                          placeholder="Manajer Sumber Daya Manusia"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Ringkasan Hari Operasional Kantor
                      </label>
                      <input
                        type="text"
                        value={formProfile.workDaysSummary}
                        onChange={(e) =>
                          setFormProfile((p) => ({ ...p, workDaysSummary: e.target.value }))
                        }
                        maxLength={100}
                        placeholder="Senin – Sabtu (Sistem Shift & Libur Bergilir)"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Visi Perusahaan
                      </label>
                      <textarea
                        rows={3}
                        value={formProfile.vision}
                        onChange={(e) =>
                          setFormProfile((p) => ({ ...p, vision: e.target.value }))
                        }
                        maxLength={500}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Misi Perusahaan
                      </label>
                      <textarea
                        rows={3}
                        value={formProfile.mission}
                        onChange={(e) =>
                          setFormProfile((p) => ({ ...p, mission: e.target.value }))
                        }
                        maxLength={800}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingProfile ? 'Menyimpan...' : 'Simpan Profil Perusahaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah / Edit Lokasi Cabang */}
      {branchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto no-print">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl my-auto overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingBranchId ? 'Edit Lokasi Cabang' : 'Tambah Lokasi / Cabang Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                aria-label="Tutup"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="p-5 space-y-4">
              {branchError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {branchError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nama Unit / Cabang *
                </label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  maxLength={80}
                  placeholder="Cabang Operasional Surabaya"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Kota *
                  </label>
                  <input
                    type="text"
                    required
                    value={branchCity}
                    onChange={(e) => setBranchCity(e.target.value)}
                    maxLength={60}
                    placeholder="Surabaya"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Nomor Telepon
                  </label>
                  <input
                    type="text"
                    value={branchPhone}
                    onChange={(e) => setBranchPhone(e.target.value)}
                    maxLength={40}
                    placeholder="(031) 555-0144"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Alamat Lokasi
                </label>
                <textarea
                  rows={2}
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  maxLength={200}
                  placeholder="Jl. Raya Industri No. 88"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={branchIsHq}
                  onChange={(e) => setBranchIsHq(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>Tandai sebagai Kantor Pusat</span>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBranchModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingBranch}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingBranch ? 'Menyimpan...' : 'Simpan Lokasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
