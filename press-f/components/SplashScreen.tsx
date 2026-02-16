import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

const SPLASH_DURATION_MS = 7800;
const PHASE1_END_MS = 2600;
const PHASE2_END_MS = 5200;
const FLASH_AT_MS = 7000;
const FADEOUT_START_MS = 7200;

const TYPING_INTERVAL_MS = 26;

interface SplashScreenProps {
  onFinish: () => void;
}

/**
 * Заставка PRESS F: двуязычная (en/ru по языку приложения), удлинённая по времени.
 * Фаза 0: проверка пульса → нет ответа → появление монументальной «F».
 * Фаза 1: протокол наследия, «твои слова переживут тебя», скан-линии, неон «F».
 * Фаза 2: ТЫ МОЖЕШЬ ИСЧЕЗНУТЬ / ТВОИ ДАННЫЕ — НЕТ / PRESS F + подпись «в знак уважения».
 * Язык берётся из LanguageContext (Telegram или настройки).
 */
const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState(0);
  const [line1Len, setLine1Len] = useState(0);
  const [line2Len, setLine2Len] = useState(0);
  const [symbolVisible, setSymbolVisible] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const LINE1 = t('splash_checking');
  const LINE2 = t('splash_no_response');

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
  }, [phase, LINE1]);

  useEffect(() => {
    if (line1Len < LINE1.length) return;
    const t2 = setInterval(() => {
      setLine2Len((n) => {
        if (n >= LINE2.length) {
          clearInterval(t2);
          setSymbolVisible(true);
          return n;
        }
        return n + 1;
      });
    }, TYPING_INTERVAL_MS);
    return () => clearInterval(t2);
  }, [line1Len, LINE1.length, LINE2]);

  // Phase and final timers
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

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      className="splash-screen fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundColor: '#0f0d16',
        opacity: fadeOut ? 0 : 1,
        transform: 'translateZ(0)',
        willChange: fadeOut ? 'opacity' : 'auto',
        transition: reducedMotion ? 'none' : 'opacity 0.5s ease-out',
      }}
      aria-hidden="true"
    >
      {/* Фон: сетка + пульс */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 224, 255, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 224, 255, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
          animation: reducedMotion ? 'none' : 'splash-grid-fade 1.5s ease-out forwards',
          opacity: 0.6,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(180, 255, 0, 0.06) 0%, transparent 55%)',
          animation: reducedMotion ? 'none' : 'splash-bg-pulse 2.5s ease-in-out infinite',
          willChange: 'opacity',
        }}
      />
      {/* Виньетка */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 100% 100% at 50% 50%, transparent 45%, rgba(0,0,0,0.4) 100%),
            radial-gradient(ellipse 80% 50% at 50% 50%, transparent 60%, rgba(15,13,22,0.3) 100%)
          `,
          animation: reducedMotion ? 'none' : 'splash-vignette-in 2s ease-out forwards',
          opacity: 0.9,
        }}
      />
      {/* Угловая рамка — четыре угла */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          animation: reducedMotion ? 'none' : 'splash-corner-in 0.8s ease-out 0.3s forwards',
          opacity: 0,
        }}
      >
        <div className="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2 border-[rgba(0,224,255,0.4)] rounded-tl" style={{ boxShadow: '0 0 12px rgba(0,224,255,0.2)' }} />
        <div className="absolute top-4 right-4 w-12 h-12 border-r-2 border-t-2 border-[rgba(255,77,210,0.35)] rounded-tr" style={{ boxShadow: '0 0 12px rgba(255,77,210,0.15)' }} />
        <div className="absolute bottom-4 left-4 w-12 h-12 border-l-2 border-b-2 border-[rgba(180,255,0,0.3)] rounded-bl" style={{ boxShadow: '0 0 12px rgba(180,255,0,0.15)' }} />
        <div className="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2 border-[rgba(255,215,0,0.25)] rounded-br" style={{ boxShadow: '0 0 12px rgba(255,215,0,0.1)' }} />
      </div>
      {/* Летающие точки (data flow) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-[#00E0FF]"
            style={{
              left: `${8 + i * 10}%`,
              top: `${15 + (i % 4) * 22}%`,
              animation: reducedMotion ? 'none' : `splash-dot-pulse ${1.2 + i * 0.15}s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
              opacity: 0.3,
            }}
          />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={`b-${i}`}
            className="absolute w-1 h-1 rounded-full bg-[#FF4DD2]"
            style={{
              right: `${10 + i * 12}%`,
              bottom: `${20 + (i % 3) * 25}%`,
              animation: reducedMotion ? 'none' : `splash-dot-pulse ${1.5 + i * 0.12}s ease-in-out infinite`,
              animationDelay: `${0.5 + i * 0.15}s`,
              opacity: 0.25,
            }}
          />
        ))}
      </div>

      {/* Phase 0: terminal */}
      {phase === 0 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-4"
          style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        >
          <div
            className="font-mono text-sm text-left w-full max-w-[340px]"
            style={{
              color: '#b0b8c2',
              textShadow: '0 0 12px rgba(180, 255, 0, 0.25)',
            }}
          >
            <div className="mb-1" style={{ color: '#b0b8c2' }}>
              {LINE1.slice(0, line1Len)}
              {line1Len < LINE1.length && (
                <span
                  className="inline-block w-2 h-4 bg-[#B4FF00] ml-0.5 animate-pulse"
                  style={{ boxShadow: '0 0 8px #B4FF00' }}
                />
              )}
            </div>
            {line1Len >= LINE1.length && (
              <div
                style={{
                  color: '#FF6B8A',
                  textShadow: '0 0 10px rgba(255, 77, 210, 0.4)',
                }}
              >
                {LINE2.slice(0, line2Len)}
                {line2Len < LINE2.length && (
                  <span
                    className="inline-block w-2 h-4 bg-[#FF4DD2] ml-0.5 animate-pulse"
                    style={{ boxShadow: '0 0 8px #FF4DD2' }}
                  />
                )}
              </div>
            )}
          </div>
          {line1Len >= LINE1.length && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 w-32 h-0.5 rounded-full origin-center"
              style={{
                background:
                  'linear-gradient(90deg, transparent, #FF4DD2 30%, #00E0FF 70%, transparent)',
                boxShadow: '0 0 12px rgba(255, 77, 210, 0.6)',
                animation: reducedMotion
                  ? 'none'
                  : 'splash-heartbeat 1.2s ease-in-out infinite',
                willChange: 'transform',
              }}
            />
          )}
          {symbolVisible && (
            <div
              className="splash-monument-f opacity-0 flex items-center justify-center mt-8"
              style={{
                animation: reducedMotion
                  ? 'none'
                  : 'splash-fadeIn 0.6s ease-out forwards, splash-monument-float 3s ease-in-out 0.6s infinite',
                willChange: 'opacity, transform',
              }}
              aria-hidden
            >
              <span
                className="font-logo text-5xl sm:text-6xl font-black select-none"
                style={{
                  color: '#B4FF00',
                  fontFamily: 'var(--font-logo), Rye, cursive',
                  textShadow:
                    '0 0 12px rgba(180, 255, 0, 0.6), 0 0 24px rgba(0, 224, 255, 0.3)',
                  lineHeight: 1,
                }}
              >
                F
              </span>
            </div>
          )}
        </div>
      )}

      {/* Phase 1: legacy protocol */}
      {phase === 1 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-4"
          style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        >
          <div className="font-mono text-sm text-center max-w-[340px]">
            <div
              className="mb-2"
              style={{
                color: '#00E0FF',
                textShadow:
                  '0 0 15px rgba(0, 224, 255, 0.6), 0 0 30px rgba(0, 224, 255, 0.3)',
              }}
            >
              {t('splash_activating')}
            </div>
            <div
              style={{
                color: '#B4FF00',
                textShadow:
                  '0 0 15px rgba(180, 255, 0, 0.7), 0 0 25px rgba(180, 255, 0, 0.3)',
              }}
            >
              {t('splash_data_survive')}
            </div>
          </div>
          <div
            className="splash-monument-f flex items-center justify-center mt-8"
            style={{
              animation: reducedMotion
                ? 'none'
                : 'splash-skull-neon 1.2s ease-in-out infinite, splash-monument-float 3s ease-in-out infinite, splash-border-glow 2s ease-in-out infinite',
              willChange: 'transform',
            }}
            aria-hidden
          >
            <span
              className="font-logo text-5xl sm:text-6xl font-black select-none"
              style={{
                color: '#B4FF00',
                fontFamily: 'var(--font-logo), Rye, cursive',
                textShadow:
                  '0 0 12px var(--splash-cyan), 0 0 24px var(--splash-lime)',
                lineHeight: 1,
              }}
            >
              F
            </span>
          </div>
          {/* Скан-линия cyan */}
          <div
            className="absolute left-0 right-0 h-0.5 pointer-events-none top-0 origin-center"
            style={{
              background:
                'linear-gradient(90deg, transparent, #00E0FF 15%, #00E0FF 85%, transparent)',
              boxShadow: '0 0 20px #00E0FF',
              animation:
                reducedMotion
                  ? 'none'
                  : 'splash-scan 1.8s linear infinite, splash-scan-glow 0.8s ease-in-out infinite',
              willChange: 'transform',
            }}
          />
          {/* Скан-линия pink */}
          <div
            className="absolute left-0 right-0 h-px pointer-events-none top-0"
            style={{
              background:
                'linear-gradient(90deg, transparent, #FF4DD2 25%, #FF4DD2 75%, transparent)',
              boxShadow: '0 0 15px rgba(255, 77, 210, 0.7)',
              animation: reducedMotion
                ? 'none'
                : 'splash-scan 2.4s linear 0.3s infinite',
              willChange: 'transform',
            }}
          />
          {/* Скан-линия gold */}
          <div
            className="absolute left-0 right-0 h-px pointer-events-none top-0"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,215,0,0.6) 30%, rgba(255,215,0,0.8) 70%, transparent)',
              boxShadow: '0 0 12px rgba(255, 215, 0, 0.4)',
              animation: reducedMotion
                ? 'none'
                : 'splash-scan 3s linear 0.8s infinite, splash-line-flicker 1.5s ease-in-out infinite',
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
              textShadow:
                '0 0 20px rgba(180, 255, 0, 0.5), 0 0 40px rgba(0, 224, 255, 0.2)',
              animation: reducedMotion
                ? 'none'
                : 'splash-glitch 0.5s ease-in-out 2',
              willChange: 'transform',
            }}
          >
            <div
              className="mb-1"
              style={{
                animation:
                  reducedMotion ? 'none' : 'splash-text-reveal 0.4s ease-out forwards',
                animationDelay: '0s',
                opacity: reducedMotion ? 1 : 0,
              }}
            >
              {t('splash_you_disappear')}
            </div>
            <div
              className="mb-2"
              style={{
                animation:
                  reducedMotion ? 'none' : 'splash-text-reveal 0.4s ease-out forwards',
                animationDelay: '0.18s',
                opacity: reducedMotion ? 1 : 0,
              }}
            >
              {t('splash_data_wont')}
            </div>
          </div>
          <div className="relative inline-block mt-3">
            {/* Кольцо-пульс вокруг PRESS F */}
            {!reducedMotion && (
              <div
                className="absolute rounded-full border-2 border-[rgba(255,215,0,0.5)] pointer-events-none"
                style={{
                  width: '6rem',
                  height: '6rem',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%) translateZ(0)',
                  animation: 'splash-ring-pulse 1.2s ease-out 0.4s 2 forwards',
                  willChange: 'transform, opacity',
                }}
              />
            )}
            <div
              className="font-logo text-4xl sm:text-5xl relative z-10"
              style={{
                color: '#FFD700',
                fontFamily: 'var(--font-logo), Rye, cursive',
                textShadow:
                  '0 0 25px rgba(255, 215, 0, 0.9), 0 0 50px rgba(255, 77, 210, 0.3)',
                animation:
                  reducedMotion
                    ? 'none'
                    : 'splash-logo-burst 0.5s ease-out 0.3s forwards, splash-glow-pulse 1.2s ease-in-out 0.9s infinite',
                opacity: reducedMotion ? 1 : 0,
                willChange: 'transform, opacity',
              }}
            >
              {t('app_title')}
            </div>
          </div>
          <div
            className="font-mono text-xs sm:text-sm mt-2 tracking-widest uppercase opacity-90"
            style={{
              color: 'var(--splash-muted, #b0b8c2)',
              animation:
                reducedMotion ? 'none' : 'splash-text-reveal 0.35s ease-out 0.5s forwards',
              opacity: reducedMotion ? 0.9 : 0,
            }}
          >
            {t('splash_pay_respects')}
          </div>
        </div>
      )}

      {/* Gold flash overlay */}
      {showFlash && (
        <>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundColor: '#FFD700',
              opacity: 0,
              animation: reducedMotion
                ? 'none'
                : 'splash-flash-strong 0.7s ease-out forwards',
              willChange: 'opacity',
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundColor: '#fff',
              opacity: 0,
              animation: reducedMotion
                ? 'none'
                : 'splash-flash 0.25s ease-out 0.05s forwards',
              willChange: 'opacity',
            }}
          />
        </>
      )}
    </div>
  );
};

export default SplashScreen;
