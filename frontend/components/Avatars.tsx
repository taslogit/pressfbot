
import React from 'react';

type AvatarProps = {
  className?: string;
};

export const AvatarNetRunner: React.FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gradCyan" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00E0FF" />
        <stop offset="100%" stopColor="#004a54" />
      </linearGradient>
      <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle cx="50" cy="50" r="48" fill="#0f172a" stroke="url(#gradCyan)" strokeWidth="2" />
    {/* Helmet Shape */}
    <path d="M25 50 L25 35 Q25 15 50 15 Q75 15 75 35 L75 50 L85 60 L85 80 L70 90 L30 90 L15 80 L15 60 Z" fill="#1e293b" stroke="#00E0FF" strokeWidth="1" />
    {/* Visor */}
    <path d="M28 45 L72 45 L75 60 L25 60 Z" fill="url(#gradCyan)" filter="url(#glowCyan)" opacity="0.8" />
    <path d="M30 48 L70 48" stroke="#fff" strokeWidth="0.5" opacity="0.5" />
    {/* Details */}
    <rect x="35" y="70" width="30" height="2" fill="#00E0FF" />
    <rect x="35" y="75" width="30" height="2" fill="#00E0FF" opacity="0.5" />
    <circle cx="20" cy="65" r="2" fill="#00E0FF" className="animate-pulse" />
  </svg>
);

export const AvatarGlitchSkull: React.FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gradLime" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#B4FF00" />
        <stop offset="100%" stopColor="#3d5700" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="#0d1205" stroke="url(#gradLime)" strokeWidth="2" />
    {/* Skull Base */}
    <path d="M30 30 Q30 10 50 10 Q70 10 70 30 L70 55 Q70 65 60 70 L60 85 L40 85 L40 70 Q30 65 30 55 Z" fill="#1a2e05" stroke="#B4FF00" strokeWidth="1" />
    {/* Glitch Rects */}
    <rect x="25" y="35" width="10" height="4" fill="#B4FF00" opacity="0.8" className="animate-pulse" />
    <rect x="75" y="50" width="8" height="2" fill="#B4FF00" opacity="0.6" />
    {/* Eyes */}
    <path d="M38 40 L48 40 L45 50 L38 50 Z" fill="#B4FF00" />
    <path d="M52 40 L62 40 L62 50 L55 50 Z" fill="#B4FF00" />
    {/* Teeth / Jaw */}
    <rect x="42" y="75" width="2" height="6" fill="#B4FF00" />
    <rect x="46" y="75" width="2" height="6" fill="#B4FF00" />
    <rect x="50" y="75" width="2" height="6" fill="#B4FF00" />
    <rect x="54" y="75" width="2" height="6" fill="#B4FF00" />
    {/* Crosses */}
    <path d="M50 20 L55 25 M55 20 L50 25" stroke="#B4FF00" strokeWidth="1" />
  </svg>
);

export const AvatarNeonDemon: React.FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gradPink" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF4DD2" />
        <stop offset="100%" stopColor="#5e0b48" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="#1f0a18" stroke="url(#gradPink)" strokeWidth="2" />
    {/* Horns */}
    <path d="M30 35 L20 15 L40 25" fill="#360f2a" stroke="#FF4DD2" strokeWidth="1" />
    <path d="M70 35 L80 15 L60 25" fill="#360f2a" stroke="#FF4DD2" strokeWidth="1" />
    {/* Mask Face */}
    <path d="M25 40 Q25 80 50 90 Q75 80 75 40 Q75 30 50 30 Q25 30 25 40 Z" fill="#360f2a" stroke="#FF4DD2" strokeWidth="1" />
    {/* Eyes */}
    <circle cx="40" cy="50" r="4" fill="#FF4DD2" className="animate-pulse" />
    <circle cx="60" cy="50" r="4" fill="#FF4DD2" className="animate-pulse" />
    {/* Markings */}
    <path d="M50 35 L50 45" stroke="#FF4DD2" strokeWidth="2" />
    <path d="M40 65 Q50 75 60 65" stroke="#FF4DD2" strokeWidth="2" fill="none" />
    {/* Tech Lines */}
    <path d="M25 40 L15 50" stroke="#FF4DD2" strokeWidth="1" opacity="0.5" />
    <path d="M75 40 L85 50" stroke="#FF4DD2" strokeWidth="1" opacity="0.5" />
  </svg>
);

export const AvatarGhostOps: React.FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gradGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFD700" />
        <stop offset="100%" stopColor="#5c4d00" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="#121212" stroke="url(#gradGold)" strokeWidth="2" />
    {/* Hood */}
    <path d="M20 90 L20 40 Q20 10 50 10 Q80 10 80 40 L80 90" fill="#222" stroke="#444" strokeWidth="1" />
    {/* Face Void */}
    <path d="M30 90 L30 45 Q30 25 50 25 Q70 25 70 45 L70 90" fill="#000" />
    {/* Sensor Cluster (Eyes) */}
    <circle cx="42" cy="50" r="3" fill="#FFD700" />
    <circle cx="50" cy="50" r="3" fill="#FFD700" />
    <circle cx="58" cy="50" r="3" fill="#FFD700" />
    <path d="M30 50 L70 50" stroke="#FFD700" strokeWidth="0.5" opacity="0.3" />
    {/* Triangle */}
    <path d="M50 30 L55 38 L45 38 Z" fill="#FFD700" opacity="0.8" />
    {/* Binary Rain Decoration */}
    <rect x="35" y="70" width="2" height="10" fill="#333" />
    <rect x="45" y="65" width="2" height="15" fill="#333" />
    <rect x="55" y="72" width="2" height="8" fill="#333" />
  </svg>
);

export const getAvatarComponent = (id: string) => {
  switch (id) {
    case 'cyber': return AvatarNetRunner;
    case 'punk': return AvatarGlitchSkull;
    case 'anon': return AvatarGhostOps;
    case 'demon': return AvatarNeonDemon; // Added demon ID support
    case 'default': default: return AvatarNetRunner;
  }
};
