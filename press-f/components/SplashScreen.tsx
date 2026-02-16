import React, { useState, useEffect, useRef } from 'react';

const SPLASH_DURATION_MS = 5000;
const PHASE1_END_MS = 1400;
const PHASE2_END_MS = 3200;
const FLASH_AT_MS = 4200;
const FADEOUT_START_MS = 4400;

const LINE1 = 'checking user heartbeat...';
const LINE2 = 'no response';
const TYPING_INTERVAL_MS = 28;

const ASCII_SKULL = `    _____
   /     \\
  | () () |
  |   >   |
   \\_____/`;

interface SplashScreenProps {
  onFinish: () => void;
}

/**
 * Дерзкая интеллектуальная заставка PRESS F.
 * Фаза 0: heartbeat check + no response + череп.
 * Фаза 1: legacy protocol + data will survive + скан-линия + неон черепа.
 * Фаза 2: YOU MAY DISAPPEAR / YOUR DATA WON'T / PRESS F + глитч + золотая вспышка + fade-out.
 * 5000 ms, только React + CSS (transform, opacity, text-shadow).
 */
const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [phase, setPhase] = useState(0);
  const [line1Len, setLine1Len] = useState(0);
  const [line2Len, setLine2Len] = useState(0);
  const [skullVisible, setSkullVisible] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Typing effect phase 0
  useEffect(() => {
    if (phase !== 0) return;
    const t1 = setInterval(() => {
      setLine1Len((n) => {
        if (n >= LINE1.length) {
          clearInterval(t1);
          return n;
        }
        return n + 1;
      });
    }, TYPING_INTERVAL_MS);
    return () => clearInterval(t1);
  }, [phase]);

  useEffect(() => {
    if (line1Len < LINE1.length) return;
    const t2 = setInterval(() => {
      setLine2Len((n) => {
        if (n >= LINE2.length) {
          clearInterval(t2);
          setSkullVisible(true);
          return n;
        }
        return n + 1;
      });
    }, TYPING_INTERVAL_MS);
    return () => clearInterval(t2);
  }, [line1Len]);

  // Phase and final timers (setTimeout only, no rAF)
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), PHASE1_END_MS);
    const t2 = setTimeout(() => setPhase(2), PHASE2_END_MS);
    const t3 = setTimeout(() => setShowFlash(true), FLASH_AT_MS);
    const t4 = setTimeout(() => setFadeOut(true), FADEOUT_START_MS);
    const t5 = setTimeout(() => {
      onFinishRef.current();
    }, SPLASH_DURATION_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, []);

  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      className="splash-screen fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundColor: '#0f0d16',
        opacity: fadeOut ? 0 : 1,
        transform: 'translateZ(0)',
        willChange: fadeOut ? 'opacity' : 'auto',
        transition: reducedMotion ? 'none' : 'opacity 0.4s ease-out',
      }}
      aria-hidden="true"
    >
      {/* Phase 0: terminal */}
      {phase === 0 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-4"
          style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        >
          <div
            className="font-mono text-sm text-[#b0b8c2] text-left w-full max-w-[320px]"
            style={{ textShadow: '0 0 8px rgba(180, 255, 0, 0.2)' }}
          >
            <div className="mb-1">
              {LINE1.slice(0, line1Len)}
              {line1Len < LINE1.length && <span className="inline-block w-2 h-4 bg-[#B4FF00] ml-0.5 animate-pulse" />}
            </div>
            {line1Len >= LINE1.length && (
              <div>
                {LINE2.slice(0, line2Len)}
                {line2Len < LINE2.length && <span className="inline-block w-2 h-4 bg-[#B4FF00] ml-0.5 animate-pulse" />}
              </div>
            )}
          </div>
          {skullVisible && (
            <pre
              className="font-mono text-[#B4FF00] text-xs mt-6 whitespace-pre opacity-0"
              style={{
                animation: reducedMotion ? 'none' : 'splash-fadeIn 0.4s ease-out forwards',
                textShadow: '0 0 10px rgba(180, 255, 0, 0.5)',
                willChange: 'opacity',
              }}
              aria-hidden
            >
              {ASCII_SKULL}
            </pre>
          )}
        </div>
      )}

      {/* Phase 1: legacy protocol */}
      {phase === 1 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-4"
          style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        >
          <div className="font-mono text-sm text-[#b0b8c2] text-center max-w-[320px]">
            <div className="mb-2" style={{ color: '#00E0FF' }}>activating legacy protocol</div>
            <div style={{ color: '#B4FF00' }}>data will survive</div>
          </div>
          <pre
            className="font-mono text-[#B4FF00] text-xs mt-6 whitespace-pre"
            style={{
              animation: reducedMotion ? 'none' : 'splash-skull-neon 1.5s ease-in-out infinite',
              willChange: 'transform',
            }}
            aria-hidden
          >
            {ASCII_SKULL}
          </pre>
          {/* Scan line — движется сверху вниз */}
          <div
            className="absolute left-0 right-0 h-0.5 pointer-events-none top-0"
            style={{
              background: 'linear-gradient(90deg, transparent, #00E0FF 20%, #00E0FF 80%, transparent)',
              boxShadow: '0 0 20px #00E0FF',
              animation: reducedMotion ? 'none' : 'splash-scan 1.8s linear infinite',
              willChange: 'transform',
            }}
          />
        </div>
      )}

      {/* Phase 2: main statement */}
      {phase === 2 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
          style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        >
          <div
            className="font-heading text-lg sm:text-xl tracking-wider uppercase"
            style={{
              color: '#B4FF00',
              fontFamily: 'var(--font-heading), "Rubik Wet Paint", cursive',
              animation: reducedMotion ? 'none' : 'splash-glitch 0.5s ease-in-out 2',
              willChange: 'transform',
            }}
          >
            <div className="mb-1">YOU MAY DISAPPEAR</div>
            <div className="mb-2">YOUR DATA WON'T</div>
          </div>
          <div
            className="font-logo text-3xl sm:text-4xl mt-2"
            style={{
              color: '#FFD700',
              fontFamily: 'var(--font-logo), Rye, cursive',
              textShadow: '0 0 20px rgba(255, 215, 0, 0.8)',
              animation: reducedMotion ? 'none' : 'splash-flicker 0.15s ease-in-out 3',
              willChange: 'opacity',
            }}
          >
            PRESS F
          </div>
        </div>
      )}

      {/* Gold flash overlay */}
      {showFlash && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: '#FFD700',
            opacity: 0,
            animation: reducedMotion ? 'none' : 'splash-flash 0.6s ease-out forwards',
            willChange: 'opacity',
          }}
        />
      )}
    </div>
  );
};

export default SplashScreen;
