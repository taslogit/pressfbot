import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import {
  playTerminalBeep,
  playTerminalSuccess,
  playOrSound,
  playAngelChoir,
} from '../utils/splashSound';

const INTRO_MS = 900;
const SPLASH_DURATION_MS = 10000 + INTRO_MS;
const TYPING_INTERVAL_MS = 26;
/** Быстрая скан-линия в интро — один проход */
const INTRO_SCAN_DURATION_S = 0.7;
/** Скан-линия в терминальных фазах — 3 прохода */
const SCAN_DURATION_S = 2.167;
const SCAN_ITERATIONS = 3;

const PHASE0_END_MS = INTRO_MS + 2000;
const PHASE1_END_MS = INTRO_MS + 3500;
const PHASE2_END_MS = INTRO_MS + 5000;
const PHASE3_END_MS = INTRO_MS + 6500;
const PHASE4_END_MS = INTRO_MS + 8000;
const PHASE5_END_MS = INTRO_MS + 9000;
const PHASE6_PRESS_DELAY_MS = 400;
const FLASH_AT_MS = INTRO_MS + 9600;
const FADEOUT_START_MS = INTRO_MS + 9700;

interface SplashScreenProps {
  onFinish: () => void;
}

/**
 * Заставка: 7 фаз, ~10 с.
 * 0: терминал — проверка пульса / нет ответа (как есть).
 * 1: терминал — Сканирование...
 * 2: терминал — Идентификация...
 * 3: терминал — Юзер отметился
 * 4: Данные зашифрованы (анимация шифрования + иконка замка)
 * 5: ИЛИ? — крупно на весь экран, звук предупреждения
 * 6: PRESS F и эпичный переход (звук + вспышка)
 * Одна скан-линия, 3 прохода за фазы 0–3. Стиль терминала Kali для 0–3.
 */
const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState(-1);
  const [line1Len, setLine1Len] = useState(0);
  const [line2Len, setLine2Len] = useState(0);
  const [symbolVisible, setSymbolVisible] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const onFinishRef = useRef(onFinish);
  const soundPlayedRef = useRef<Record<number, boolean>>({});
  onFinishRef.current = onFinish;

  const LINE1 = t('splash_checking');
  const LINE2 = t('splash_no_response');

  // Звуки при входе в фазу (интро -1 без звука)
  useEffect(() => {
    if (phase < 0 || soundPlayedRef.current[phase]) return;
    soundPlayedRef.current[phase] = true;
    if (phase === 1 || phase === 2) playTerminalBeep();
    if (phase === 3) playTerminalSuccess();
    if (phase === 4) playTerminalSuccess();
    if (phase === 5) playOrSound();
    if (phase === 6) playAngelChoir();
  }, [phase]);

  // Бип при появлении "no response" (конец набора второй строки в фазе 0)
  const line2DoneRef = useRef(false);
  useEffect(() => {
    if (phase === 0 && line2Len >= LINE2.length && LINE2.length > 0 && !line2DoneRef.current) {
      line2DoneRef.current = true;
      playTerminalBeep();
    }
  }, [phase, line2Len, LINE2.length]);

  // Печатание фазы 0
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
          return n;
        }
        const next = n + 1;
        if (next >= LINE2.length) setSymbolVisible(true);
        return next;
      });
    }, TYPING_INTERVAL_MS);
    return () => clearInterval(t2);
  }, [line1Len, LINE1.length, LINE2]);

  // Таймеры: интро → затем фазы 0..6 и финал
  useEffect(() => {
    const tIntro = setTimeout(() => setPhase(0), INTRO_MS);
    const t0 = setTimeout(() => setPhase(1), PHASE0_END_MS);
    const t1 = setTimeout(() => setPhase(2), PHASE1_END_MS);
    const t2 = setTimeout(() => setPhase(3), PHASE2_END_MS);
    const t3 = setTimeout(() => setPhase(4), PHASE3_END_MS);
    const t4 = setTimeout(() => setPhase(5), PHASE4_END_MS);
    const t5 = setTimeout(() => setPhase(6), PHASE5_END_MS);
    const t6 = setTimeout(() => setShowFlash(true), FLASH_AT_MS);
    const t7 = setTimeout(() => setFadeOut(true), FADEOUT_START_MS);
    const t8 = setTimeout(() => onFinishRef.current(), SPLASH_DURATION_MS);
    return () => {
      [tIntro, t0, t1, t2, t3, t4, t5, t6, t7, t8].forEach(clearTimeout);
    };
  }, []);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isTerminalPhase = phase >= 0 && phase <= 3;
  const isIntro = phase === -1;

  return (
    <div
      className="splash-screen fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundColor: isIntro ? '#000000' : '#0f0d16',
        opacity: fadeOut ? 0 : 1,
        transform: 'translateZ(0)',
        willChange: fadeOut ? 'opacity' : 'auto',
        transition: reducedMotion ? 'none' : 'opacity 1.2s ease-out',
      }}
      aria-hidden="true"
    >
      {/* Интро: только чёрный экран + быстрая скан-линия (один проход) */}
      {isIntro && (
        <div
          className="absolute left-0 right-0 h-0.5 pointer-events-none top-0"
          style={{
            background: 'linear-gradient(90deg, transparent, #00ff41 25%, #00ff41 75%, transparent)',
            boxShadow: '0 0 20px rgba(0, 255, 65, 0.7)',
            animation: reducedMotion ? 'none' : `splash-scan ${INTRO_SCAN_DURATION_S}s linear 1 forwards`,
            willChange: 'transform',
          }}
        />
      )}

      {/* Фон: сетка — не показывать в интро */}
      {!isIntro && (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: isTerminalPhase
            ? `linear-gradient(rgba(0, 255, 65, 0.03) 1px, transparent 1px),
               linear-gradient(90deg, rgba(0, 255, 65, 0.03) 1px, transparent 1px)`
            : `linear-gradient(rgba(0, 224, 255, 0.04) 1px, transparent 1px),
               linear-gradient(90deg, rgba(0, 224, 255, 0.04) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
          opacity: 0.6,
        }}
      />
      )}

      {/* Скан-линия, 3 прохода — только в фазах 0–3 (не в интро) */}
      {isTerminalPhase && (
        <div
          className="absolute left-0 right-0 h-0.5 pointer-events-none top-0 origin-center"
          style={{
            background:
              'linear-gradient(90deg, transparent, #00ff41 20%, #00ff41 80%, transparent)',
            boxShadow: '0 0 16px rgba(0, 255, 65, 0.6)',
            animation:
              reducedMotion
                ? 'none'
                : `splash-scan ${SCAN_DURATION_S}s linear ${SCAN_ITERATIONS}`,
            willChange: 'transform',
          }}
        />
      )}

      {/* Фаза 0: терминал с командной строкой — heartbeat / no response + пульс + F */}
      {phase === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <div className="splash-terminal-window">
            <div className="splash-terminal-titlebar">
              <div className="splash-terminal-titlebar-dots">
                <span /><span /><span />
              </div>
              <span>root@pressf — Terminal</span>
            </div>
            <div className="splash-terminal-body">
              <div className="splash-terminal-prompt mb-1">
                <span className="opacity-90">check_pulse</span>
              </div>
              <div className="mb-1 splash-terminal-output">
                {LINE1.slice(0, line1Len)}
                {line1Len < LINE1.length && (
                  <span
                    className="inline-block w-2 h-4 bg-[#00ff41] ml-0.5 animate-pulse"
                    style={{ boxShadow: '0 0 6px #00ff41' }}
                  />
                )}
              </div>
              {line1Len >= LINE1.length && (
                <div className="splash-terminal-output" style={{ color: '#ff6b6b' }}>
                  {LINE2.slice(0, line2Len)}
                  {line2Len < LINE2.length && (
                    <span
                      className="inline-block w-2 h-4 bg-[#ff6b6b] ml-0.5 animate-pulse"
                      style={{ boxShadow: '0 0 6px #ff6b6b' }}
                    />
                  )}
                </div>
              )}
              {line2Len >= LINE2.length && (
                <div className="splash-terminal-prompt mt-2">
                  <span className="inline-block w-2 h-4 bg-[#00ff41] ml-0.5 animate-pulse" style={{ boxShadow: '0 0 6px #00ff41' }} />
                </div>
              )}
            </div>
          </div>
          {line1Len >= LINE1.length && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 w-28 h-0.5 rounded-full origin-center"
              style={{
                background: 'linear-gradient(90deg, transparent, #ff6b6b 40%, #00ff41 60%, transparent)',
                boxShadow: '0 0 10px rgba(255, 107, 107, 0.5)',
                animation: reducedMotion ? 'none' : 'splash-heartbeat 1.2s ease-in-out infinite',
                willChange: 'transform',
              }}
            />
          )}
          {symbolVisible && (
            <div
              className="splash-monument-f opacity-0 flex items-center justify-center mt-8"
              style={{
                animation: reducedMotion ? 'none' : 'splash-fadeIn 0.5s ease-out forwards',
                willChange: 'opacity',
                borderColor: 'rgba(0, 255, 65, 0.4)',
                boxShadow: '0 0 14px rgba(0, 255, 65, 0.2), inset 0 0 16px rgba(0, 255, 65, 0.06)',
              }}
              aria-hidden
            >
              <span
                className="font-logo text-4xl sm:text-5xl font-black select-none"
                style={{
                  color: '#00ff41',
                  fontFamily: 'var(--font-logo), Rye, cursive',
                  textShadow: '0 0 12px rgba(0, 255, 65, 0.6)',
                  lineHeight: 1,
                }}
              >
                F
              </span>
            </div>
          )}
        </div>
      )}

      {/* Фаза 1: Сканирование... */}
      {phase === 1 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <div className="splash-terminal-window">
            <div className="splash-terminal-titlebar">
              <div className="splash-terminal-titlebar-dots"><span /><span /><span /></div>
              <span>root@pressf — Terminal</span>
            </div>
            <div className="splash-terminal-body">
              <div className="splash-terminal-prompt mb-1"><span className="opacity-90">scan --full</span></div>
              <div className="splash-terminal-output">{t('splash_scanning')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Фаза 2: Идентификация... */}
      {phase === 2 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <div className="splash-terminal-window">
            <div className="splash-terminal-titlebar">
              <div className="splash-terminal-titlebar-dots"><span /><span /><span /></div>
              <span>root@pressf — Terminal</span>
            </div>
            <div className="splash-terminal-body">
              <div className="splash-terminal-prompt mb-1"><span className="opacity-90">identify --user</span></div>
              <div className="splash-terminal-output">{t('splash_identification')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Фаза 3: Юзер отметился */}
      {phase === 3 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <div className="splash-terminal-window">
            <div className="splash-terminal-titlebar">
              <div className="splash-terminal-titlebar-dots"><span /><span /><span /></div>
              <span>root@pressf — Terminal</span>
            </div>
            <div className="splash-terminal-body">
              <div className="splash-terminal-prompt mb-1"><span className="opacity-90">status</span></div>
              <div className="splash-terminal-output" style={{ color: '#00ff41' }}>{t('splash_user_checked_in')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Фаза 4: Данные зашифрованы + анимация + замок */}
      {phase === 4 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <div
            className="font-mono text-lg sm:text-xl text-center mb-6"
            style={{
              color: '#00ff41',
              textShadow: '0 0 12px rgba(0, 255, 65, 0.5)',
              animation: reducedMotion ? 'none' : 'splash-encrypt 1.2s ease-in-out infinite',
            }}
          >
            {t('splash_data_encrypted')}
          </div>
          {/* Иконка шифрования: щит (CSS) */}
          <div
            className="splash-shield-icon flex items-center justify-center"
            style={{
              animation: reducedMotion ? 'none' : 'splash-lock-in 0.5s ease-out forwards',
              opacity: reducedMotion ? 1 : 0,
            }}
          >
            <div
              className="splash-shield-shape"
              style={{
                boxShadow: '0 0 20px rgba(0, 255, 65, 0.4), inset 0 0 12px rgba(0, 255, 65, 0.08)',
              }}
            />
          </div>
        </div>
      )}

      {/* Фаза 5: ИЛИ? — на весь экран, привлекает внимание */}
      {phase === 5 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <div
            className="font-heading text-6xl sm:text-8xl md:text-9xl font-black uppercase tracking-tight"
            style={{
              color: '#FFD700',
              fontFamily: 'var(--font-heading), "Rubik Wet Paint", cursive',
              textShadow: '0 0 40px rgba(255, 215, 0, 0.9), 0 0 80px rgba(255, 77, 210, 0.5)',
              animation: reducedMotion ? 'none' : 'splash-text-reveal 0.35s ease-out forwards, splash-or-pulse 1.5s ease-in-out 0.4s infinite',
              opacity: reducedMotion ? 1 : 0,
            }}
          >
            {t('splash_or')}
          </div>
        </div>
      )}

      {/* Фаза 6: PRESS F с задержкой появления, затем переход в приложение */}
      {phase === 6 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <div
            className="font-logo text-5xl sm:text-6xl md:text-7xl font-black"
            style={{
              color: '#FFD700',
              fontFamily: 'var(--font-logo), Rye, cursive',
              textShadow:
                '0 0 30px rgba(255, 215, 0, 0.9), 0 0 60px rgba(255, 77, 210, 0.4)',
              animation:
                reducedMotion
                  ? 'none'
                  : `splash-logo-burst 0.5s ease-out ${PHASE6_PRESS_DELAY_MS / 1000}s forwards, splash-glow-pulse 1.2s ease-in-out ${(PHASE6_PRESS_DELAY_MS + 600) / 1000}s infinite`,
              opacity: reducedMotion ? 1 : 0,
              willChange: 'transform, opacity',
            }}
          >
            {t('app_title')}
          </div>
        </div>
      )}

      {/* Переход «в рай»: светло-жёлтый свет, эпичное заполнение и затухание */}
      {showFlash && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: '#FFF8DC',
            opacity: 0,
            animation: reducedMotion ? 'none' : 'splash-heaven 1.6s ease-out forwards',
            willChange: 'opacity',
          }}
        />
      )}
    </div>
  );
};

export default SplashScreen;
