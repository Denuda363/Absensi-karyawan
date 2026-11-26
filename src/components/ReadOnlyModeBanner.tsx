import React from 'react';
import { Eye, KeyRound, Lock } from 'lucide-react';

interface ReadOnlyModeBannerProps {
  areaLabel: string;
  onRequestAttendanceAdmin?: () => void;
}

export const ReadOnlyModeBanner: React.FC<ReadOnlyModeBannerProps> = ({
  areaLabel,
  onRequestAttendanceAdmin,
}) => {
  return (
    <div className="surface-3d rounded-2xl px-4 py-3 border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-blue-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 no-print">
      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
        <div className="icon-cube-3d w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0">
          <Eye className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-900">
              Mode Biasa (Hanya Lihat)
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
              <Lock className="w-2.5 h-2.5" />
              <span>Baca Saja</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Pada Mode Biasa Anda hanya dapat melihat, memfilter, mencetak, dan mengekspor {areaLabel}. Aktifkan <strong className="text-slate-800">Admin Absensi</strong> untuk input, ubah, atau hapus data.
          </p>
        </div>
      </div>

      {onRequestAttendanceAdmin && (
        <button
          type="button"
          onClick={onRequestAttendanceAdmin}
          className="btn-3d-primary inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Masuk Admin Absensi</span>
        </button>
      )}
    </div>
  );
};
