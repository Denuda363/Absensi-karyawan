import React, { useEffect, useRef, useState } from 'react';
import { NavSection } from '../types';

const NAV_ORDER: NavSection[] = [
  'ringkasan',
  'matriks',
  'jadwal-shift',
  'jadwal-libur',
  'rekap',
  'keuangan',
  'rekap-gaji',
  'profil-perusahaan',
  'pengaturan',
];

interface PageTransitionStageProps {
  pageKey: NavSection;
  children: React.ReactNode;
}

export const PageTransitionStage: React.FC<PageTransitionStageProps> = ({
  pageKey,
  children,
}) => {
  const prevKeyRef = useRef<NavSection>(pageKey);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [isAnimating, setIsAnimating] = useState<boolean>(true);
  const [sweepId, setSweepId] = useState<number>(0);

  useEffect(() => {
    const prevKey = prevKeyRef.current;
    if (prevKey !== pageKey) {
      const prevIdx = NAV_ORDER.indexOf(prevKey);
      const nextIdx = NAV_ORDER.indexOf(pageKey);
      setDirection(nextIdx >= prevIdx ? 'forward' : 'backward');
      prevKeyRef.current = pageKey;
      setSweepId((n) => n + 1);

      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    setIsAnimating(true);
    const timer = window.setTimeout(() => {
      setIsAnimating(false);
    }, 430);

    return () => window.clearTimeout(timer);
  }, [pageKey]);

  const animClass = isAnimating
    ? direction === 'forward'
      ? 'animate-page-3d-forward'
      : 'animate-page-3d-backward'
    : '';

  return (
    <div className="relative">
      {sweepId > 0 && isAnimating && (
        <div
          key={`sweep-${sweepId}`}
          aria-hidden="true"
          className="fixed top-14 sm:top-16 left-0 right-0 h-[2px] z-30 pointer-events-none overflow-hidden no-print"
        >
          <div className="h-full w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400 animate-page-sweep" />
        </div>
      )}

      <div
        key={pageKey}
        onAnimationEnd={() => setIsAnimating(false)}
        className={`${animClass} print:animate-none print:transform-none`}
      >
        {children}
      </div>
    </div>
  );
};
