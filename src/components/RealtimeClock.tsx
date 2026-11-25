import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';

interface RealtimeClockProps {
  variant?: 'compact' | 'chronometer';
}

type SweepMode = 'smooth' | 'tick';

const ID_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ID_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

function getIndonesianTzLabel(date: Date): string {
  // getTimezoneOffset returns minutes behind UTC (e.g. WIB UTC+7 => -420)
  const offsetHours = -date.getTimezoneOffset() / 60;
  if (offsetHours === 7) return 'WIB';
  if (offsetHours === 8) return 'WITA';
  if (offsetHours === 9) return 'WIT';
  const sign = offsetHours >= 0 ? '+' : '';
  return `UTC${sign}${offsetHours}`;
}

function getDayPhaseMeta(hour: number): {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
} {
  if (hour >= 5 && hour < 11) {
    return { label: 'Sesi Pagi', Icon: Sunrise, accentClass: 'text-amber-400' };
  }
  if (hour >= 11 && hour < 15) {
    return { label: 'Sesi Siang', Icon: Sun, accentClass: 'text-sky-400' };
  }
  if (hour >= 15 && hour < 18) {
    return { label: 'Sesi Sore', Icon: Sunset, accentClass: 'text-orange-400' };
  }
  return { label: 'Sesi Malam', Icon: Moon, accentClass: 'text-indigo-300' };
}

interface RollingDigitProps {
  digit: string;
  size?: 'sm' | 'lg';
}

const RollingDigit: React.FC<RollingDigitProps> = ({ digit, size = 'lg' }) => {
  if (size === 'sm') {
    return (
      <span className="relative inline-flex items-center justify-center w-[0.65em] h-[1.25em] overflow-hidden align-middle">
        <span key={digit} className="animate-clock-digit inline-block leading-none">
          {digit}
        </span>
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center justify-center w-6 h-8 sm:w-7 sm:h-9 rounded-md bg-slate-900 border border-slate-700/80 overflow-hidden shadow-inner">
      {/* Subtle mechanical split-flap center hairline */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px bg-slate-950/80 z-10 pointer-events-none"
      />
      <span
        key={digit}
        className="animate-clock-digit font-mono text-base sm:text-lg font-bold text-white tabular-nums leading-none relative z-0"
      >
        {digit}
      </span>
    </span>
  );
};

interface KineticDialProps {
  hours: number;
  minutes: number;
  seconds: number;
  millis: number;
  sweepMode: SweepMode;
  size: number;
}

const KineticDial: React.FC<KineticDialProps> = ({
  hours,
  minutes,
  seconds,
  millis,
  sweepMode,
  size,
}) => {
  const secProgress =
    sweepMode === 'smooth' ? seconds + millis / 1000 : seconds;
  const minProgress = minutes + secProgress / 60;
  const hourProgress = (hours % 12) + minProgress / 60;

  const secondAngle = secProgress * 6;
  const minuteAngle = minProgress * 6;
  const hourAngle = hourProgress * 30;

  // Orbital 60-second arc circumference
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const arcOffset = circumference * (1 - secProgress / 60);

  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  if (size <= 28) {
    const miniR = 10.5;
    const miniCirc = 2 * Math.PI * miniR;
    const miniOffset = miniCirc * (1 - secProgress / 60);
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle
          cx="14"
          cy="14"
          r={miniR}
          fill="none"
          stroke="rgba(148, 163, 184, 0.25)"
          strokeWidth="2"
        />
        <circle
          cx="14"
          cy="14"
          r={miniR}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={miniCirc}
          strokeDashoffset={miniOffset}
          transform="rotate(-90 14 14)"
        />
        <g transform={`rotate(${hourAngle} 14 14)`}>
          <line
            x1="14"
            y1="14"
            x2="14"
            y2="9.2"
            stroke="#f8fafc"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
        <g transform={`rotate(${minuteAngle} 14 14)`}>
          <line
            x1="14"
            y1="14"
            x2="14"
            y2="7"
            stroke="#cbd5e1"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
        <g transform={`rotate(${secondAngle} 14 14)`}>
          <line
            x1="14"
            y1="15.5"
            x2="14"
            y2="5.5"
            stroke="#38bdf8"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </g>
        <circle cx="14" cy="14" r="1.4" fill="#38bdf8" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 68 68"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Outer housing ring */}
      <circle
        cx="34"
        cy="34"
        r="32"
        fill="#0f172a"
        stroke="rgba(148, 163, 184, 0.22)"
        strokeWidth="1"
      />

      {/* 60 radial precision ticks; active second illuminates */}
      {ticks.map((t) => {
        const isMajor = t % 5 === 0;
        const isActive = t === seconds;
        const isPassed = t < seconds;
        const innerR = isMajor ? 27.5 : 29;
        const outerR = 30.8;
        const rad = ((t * 6 - 90) * Math.PI) / 180;
        const x1 = 34 + innerR * Math.cos(rad);
        const y1 = 34 + innerR * Math.sin(rad);
        const x2 = 34 + outerR * Math.cos(rad);
        const y2 = 34 + outerR * Math.sin(rad);

        return (
          <line
            key={t}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={
              isActive
                ? '#38bdf8'
                : isMajor
                ? isPassed
                  ? '#93c5fd'
                  : '#64748b'
                : isPassed
                ? 'rgba(56, 189, 248, 0.45)'
                : 'rgba(100, 116, 139, 0.35)'
            }
            strokeWidth={isActive ? 1.8 : isMajor ? 1.3 : 0.75}
            strokeLinecap="round"
          />
        );
      })}

      {/* Smooth orbital 60-second progress arc */}
      <circle
        cx="34"
        cy="34"
        r={radius}
        fill="none"
        stroke="rgba(30, 41, 59, 0.9)"
        strokeWidth="2"
      />
      <circle
        cx="34"
        cy="34"
        r={radius}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={arcOffset}
        transform="rotate(-90 34 34)"
      />

      {/* Hour hand */}
      <g transform={`rotate(${hourAngle} 34 34)`}>
        <line
          x1="34"
          y1="36"
          x2="34"
          y2="20"
          stroke="#f8fafc"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>

      {/* Minute hand */}
      <g transform={`rotate(${minuteAngle} 34 34)`}>
        <line
          x1="34"
          y1="37"
          x2="34"
          y2="14"
          stroke="#cbd5e1"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </g>

      {/* Kinetic second hand with counterweight */}
      <g transform={`rotate(${secondAngle} 34 34)`}>
        <line
          x1="34"
          y1="40"
          x2="34"
          y2="11.5"
          stroke="#38bdf8"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <circle cx="34" cy="11.5" r="1.4" fill="#38bdf8" />
      </g>

      {/* Center pinion */}
      <circle cx="34" cy="34" r="2.6" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
    </svg>
  );
};

export const RealtimeClock: React.FC<RealtimeClockProps> = ({
  variant = 'chronometer',
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [sweepMode, setSweepMode] = useState<SweepMode>('smooth');
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (sweepMode === 'tick' || prefersReduced) {
      setNow(new Date());
      const interval = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(interval);
    }

    let rafId = 0;
    const updateFrame = () => {
      setNow(new Date());
      rafId = requestAnimationFrame(updateFrame);
    };
    rafId = requestAnimationFrame(updateFrame);
    return () => cancelAnimationFrame(rafId);
  }, [sweepMode]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [popoverOpen]);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const millis = now.getMilliseconds();

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  const tzLabel = getIndonesianTzLabel(now);
  const dateLabel = `${ID_DAYS[now.getDay()]}, ${now.getDate()} ${
    ID_MONTHS[now.getMonth()]
  } ${now.getFullYear()}`;
  const phase = getDayPhaseMeta(hours);
  const PhaseIcon = phase.Icon;

  // Colon beats gently in sync with the first half of each second
  const colonActive = millis < 550;

  if (variant === 'compact') {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setPopoverOpen((prev) => !prev)}
          title={`${dateLabel} · Klik untuk detail kronometer`}
          aria-expanded={popoverOpen}
          className="h-9 px-2.5 sm:px-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-lg text-white inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <KineticDial
            hours={hours}
            minutes={minutes}
            seconds={seconds}
            millis={millis}
            sweepMode={sweepMode}
            size={24}
          />
          <span className="font-mono text-xs font-semibold tracking-tight tabular-nums inline-flex items-center">
            <RollingDigit digit={hh[0]} size="sm" />
            <RollingDigit digit={hh[1]} size="sm" />
            <span
              className={`mx-0.5 transition-opacity duration-150 ${
                colonActive ? 'opacity-100 text-sky-400' : 'opacity-40 text-slate-400'
              }`}
            >
              :
            </span>
            <RollingDigit digit={mm[0]} size="sm" />
            <RollingDigit digit={mm[1]} size="sm" />
            <span
              className={`mx-0.5 transition-opacity duration-150 ${
                colonActive ? 'opacity-100 text-sky-400' : 'opacity-40 text-slate-400'
              }`}
            >
              :
            </span>
            <RollingDigit digit={ss[0]} size="sm" />
            <RollingDigit digit={ss[1]} size="sm" />
          </span>
          <span className="hidden md:inline text-[10px] font-semibold text-sky-400 tracking-wide">
            {tzLabel}
          </span>
        </button>

        {popoverOpen && (
          <div className="absolute right-0 mt-2 w-80 bg-slate-950 text-white border border-slate-800 rounded-xl shadow-xl p-4 z-50">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <PhaseIcon className={`w-3.5 h-3.5 ${phase.accentClass}`} />
                <span>{phase.label}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSweepMode((m) => (m === 'smooth' ? 'tick' : 'smooth'))
                }
                className="px-2 py-1 text-[11px] font-semibold rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
              >
                Gerak: {sweepMode === 'smooth' ? 'Halus (60fps)' : 'Detak (1Hz)'}
              </button>
            </div>

            <div className="py-4 flex items-center gap-4">
              <KineticDial
                hours={hours}
                minutes={minutes}
                seconds={seconds}
                millis={millis}
                sweepMode={sweepMode}
                size={68}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <RollingDigit digit={hh[0]} />
                  <RollingDigit digit={hh[1]} />
                  <span
                    className={`font-mono text-lg font-bold px-0.5 transition-opacity duration-150 ${
                      colonActive ? 'opacity-100 text-sky-400' : 'opacity-30 text-slate-500'
                    }`}
                  >
                    :
                  </span>
                  <RollingDigit digit={mm[0]} />
                  <RollingDigit digit={mm[1]} />
                  <span
                    className={`font-mono text-lg font-bold px-0.5 transition-opacity duration-150 ${
                      colonActive ? 'opacity-100 text-sky-400' : 'opacity-30 text-slate-500'
                    }`}
                  >
                    :
                  </span>
                  <RollingDigit digit={ss[0]} />
                  <RollingDigit digit={ss[1]} />
                </div>
                <div className="mt-2 text-xs text-slate-400 truncate">
                  {dateLabel} · <span className="text-sky-400 font-semibold">{tzLabel}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full Executive Chronometer (used in Dashboard Header)
  return (
    <div className="bg-slate-950 text-white border border-slate-800 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2.5 sm:gap-4 w-full sm:w-auto overflow-hidden shrink-0">
      <KineticDial
        hours={hours}
        minutes={minutes}
        seconds={seconds}
        millis={millis}
        sweepMode={sweepMode}
        size={58}
      />

      <div className="min-w-0 flex-1 sm:flex-none">
        <div className="flex items-center justify-between gap-2 sm:gap-3 mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300 truncate">
            <PhaseIcon className={`w-3.5 h-3.5 shrink-0 ${phase.accentClass}`} />
            <span className="truncate">{phase.label}</span>
          </span>
          <button
            type="button"
            onClick={() =>
              setSweepMode((m) => (m === 'smooth' ? 'tick' : 'smooth'))
            }
            title="Ubah gaya gerak jarum detik"
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors shrink-0 cursor-pointer"
          >
            {sweepMode === 'smooth' ? 'Halus' : 'Detak'}
          </button>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <RollingDigit digit={hh[0]} />
          <RollingDigit digit={hh[1]} />
          <span
            className={`font-mono text-base sm:text-lg font-bold px-0.5 transition-opacity duration-150 ${
              colonActive ? 'opacity-100 text-sky-400' : 'opacity-30 text-slate-500'
            }`}
          >
            :
          </span>
          <RollingDigit digit={mm[0]} />
          <RollingDigit digit={mm[1]} />
          <span
            className={`font-mono text-base sm:text-lg font-bold px-0.5 transition-opacity duration-150 ${
              colonActive ? 'opacity-100 text-sky-400' : 'opacity-30 text-slate-500'
            }`}
          >
            :
          </span>
          <RollingDigit digit={ss[0]} />
          <RollingDigit digit={ss[1]} />
        </div>

        <div className="mt-1.5 text-[10px] sm:text-[11px] text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate">{dateLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-sky-400 shrink-0">{tzLabel}</span>
        </div>
      </div>
    </div>
  );
};
