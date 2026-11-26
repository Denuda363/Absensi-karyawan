import React, { useRef, useState } from 'react';

interface Tilt3DCardProps {
  children: React.ReactNode;
  className?: string;
  maxTiltDeg?: number;
}

export const Tilt3DCard: React.FC<Tilt3DCardProps> = ({
  children,
  className = '',
  maxTiltDeg = 4.2,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<{
    rotateX: number;
    rotateY: number;
    glareX: number;
    glareY: number;
    active: boolean;
  }>({
    rotateX: 0,
    rotateY: 0,
    glareX: 50,
    glareY: 50,
    active: false,
  });

  const canTilt = () => {
    if (typeof window === 'undefined') return false;
    const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return Boolean(finePointer && !reducedMotion);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canTilt() || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    const rotateY = (px - 0.5) * maxTiltDeg * 2;
    const rotateX = (0.5 - py) * maxTiltDeg * 2;

    setTilt({
      rotateX: Number(rotateX.toFixed(2)),
      rotateY: Number(rotateY.toFixed(2)),
      glareX: Math.round(px * 100),
      glareY: Math.round(py * 100),
      active: true,
    });
  };

  const handleMouseLeave = () => {
    if (!tilt.active) return;
    setTilt({
      rotateX: 0,
      rotateY: 0,
      glareX: 50,
      glareY: 50,
      active: false,
    });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={
        tilt.active
          ? {
              transform: `perspective(960px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) translateY(-2px)`,
              transition: 'transform 90ms ease-out, box-shadow 180ms ease-out',
            }
          : {
              transform: 'perspective(960px) rotateX(0deg) rotateY(0deg) translateY(0px)',
              transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 260ms ease-out',
            }
      }
      className={`relative overflow-hidden ${className}`}
    >
      {/* Subtle dynamic specular highlight on hover */}
      <div
        aria-hidden="true"
        style={{
          background: `radial-gradient(280px circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(59, 130, 246, 0.08), transparent 70%)`,
        }}
        className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${
          tilt.active ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
};
