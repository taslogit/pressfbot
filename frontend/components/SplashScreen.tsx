import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import {
  playTerminalBeep,
  playTerminalSuccess,
  playOrSound,
  playAngelChoir,
  unlockSplashAudio,
} from '../utils/splashSound';
import { storage } from '../utils/storage';

const INTRO_MS = 900;
const SPLASH_DURATION_MS = 12200 + INTRO_MS;
const SHORT_SPLASH_MS = 2500;
const SKIP_BUTTON_AFTER_MS = 2500;
const TYPING_INTERVAL_MS = 26;
const INTRO_SCAN_DURATION_S = 0.7;
const SCAN_DURATION_S = 2.167;
const SCAN_ITERATIONS = 3;

const PHASE0_END_MS = INTRO_MS + 2000;
const PHASE1_END_MS = INTRO_MS + 3500;
const PHASE2_END_MS = INTRO_MS + 5000;
const PHASE3_END_MS = INTRO_MS + 6500;
const PHASE4_END_MS = INTRO_MS + 8000;
const PHASE5_END_MS = INTRO_MS + 9400; // +400ms пауза между «ИЛИ?» и PRESS F
const PHASE6_PRESS_DELAY_MS = 2000; /* 2 с задержки, затем PRESS F проявляется из ничего */
const FLASH_AT_MS = INTRO_MS + 10500; /* свет в конце тоннеля после появления PRESS F */
const FADEOUT_START_MS = INTRO_MS + 10600;

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
  const shortSplashEnabled = storage.getSettings().shortSplashEnabled === true;
  const shortMode = useRef(storage.getHasSeenSplash() && shortSplashEnabled).current;
  const soundEnabled = storage.getSettings().soundEnabled;
  const [phase, setPhase] = useState(shortMode ? 6 : -1);
  const [line1Len, setLine1Len] = useState(0);
  const [line2Len, setLine2Len] = useState(0);
  const [showFlash, setShowFlash] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [soundHintVisible, setSoundHintVisible] = useState(true);
  const onFinishRef = useRef(onFinish);
  const soundPlayedRef = useRef<Record<number, boolean>>({});
  const audioUnlockedRef = useRef(false);
  onFinishRef.current = onFinish;

  const handleSplashInteraction = () => {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    setSoundHintVisible(false);
    unlockSplashAudio();
  };

  const finish = () => {
    storage.setHasSeenSplash();
    onFinishRef.current();
  };

  const LINE1 = t('splash_checking');
  const LINE2 = t('splash_no_response');

  // Звуки при входе в фазу (только если включены в настройках)
  useEffect(() => {
    if (!soundEnabled || phase < 0 || soundPlayedRef.current[phase]) return;
    soundPlayedRef.current[phase] = true;
    if (phase === 1 || phase === 2) playTerminalBeep();
    if (phase === 3) playTerminalSuccess();
    if (phase === 4) playTerminalSuccess();
    if (phase === 5) playOrSound();
    if (phase === 6) playAngelChoir();
  }, [phase, soundEnabled]);

  // Бип при появлении "no response" (конец набора второй строки в фазе 0)
  const line2DoneRef = useRef(false);
  useEffect(() => {
    if (soundEnabled && phase === 0 && line2Len >= LINE2.length && LINE2.length > 0 && !line2DoneRef.current) {
      line2DoneRef.current = true;
      playTerminalBeep();
    }
  }, [phase, line2Len, LINE2.length, soundEnabled]);

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
        return n + 1;
      });
    }, TYPING_INTERVAL_MS);
    return () => clearInterval(t2);
  }, [line1Len, LINE1.length, LINE2]);

  // Кнопка «Пропустить» через 2.5 с; подсказка «Нажмите для звука» скрыть через 3 с
  useEffect(() => {
    const t = setTimeout(() => setShowSkip(true), SKIP_BUTTON_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSoundHintVisible(false), 3000);
    return () => clearTimeout(t);
  }, []);

  // Таймеры: короткий режим (только PRESS F + heaven) или полная заставка
  useEffect(() => {
    if (shortMode) {
      const tFlash = setTimeout(() => setShowFlash(true), 800);
      const tFade = setTimeout(() => setFadeOut(true), 900);
      const tEnd = setTimeout(finish, SHORT_SPLASH_MS);
      return () => { clearTimeout(tFlash); clearTimeout(tFade); clearTimeout(tEnd); };
    }
    const tIntro = setTimeout(() => setPhase(0), INTRO_MS);
    const t0 = setTimeout(() => setPhase(1), PHASE0_END_MS);
    const t1 = setTimeout(() => setPhase(2), PHASE1_END_MS);
    const t2 = setTimeout(() => setPhase(3), PHASE2_END_MS);
    const t3 = setTimeout(() => setPhase(4), PHASE3_END_MS);
    const t4 = setTimeout(() => setPhase(5), PHASE4_END_MS);
    const t5 = setTimeout(() => setPhase(6), PHASE5_END_MS);
    const t6 = setTimeout(() => setShowFlash(true), FLASH_AT_MS);
    const t7 = setTimeout(() => setFadeOut(true), FADEOUT_START_MS);
    const t8 = setTimeout(finish, SPLASH_DURATION_MS);
    return () => {
      [tIntro, t0, t1, t2, t3, t4, t5, t6, t7, t8].forEach(clearTimeout);
    };
  }, []);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isTerminalPhase = phase >= 0 && phase <= 3;
  const isIntro = !shortMode && phase === -1;

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
      onClick={handleSplashInteraction}
      onTouchStart={handleSplashInteraction}
      role="presentation"
      aria-hidden="true"
    >
      {/* Подсказка: нажмите для включения звука (ангел на PRESS F) */}
      {soundEnabled && soundHintVisible && !fadeOut && (
        <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
          <span className="text-xs text-[rgba(0,255,65,0.7)] font-mono">
            {t('splash_tap_for_sound')}
          </span>
        </div>
      )}

      {/* Кнопка «Пропустить» — после 2.5 с */}
      {showSkip && !fadeOut && (
        <button
          type="button"
          onClick={finish}
          className="splash-skip-btn absolute top-4 right-4 z-10 px-4 py-2 rounded border border-[rgba(0,255,65,0.5)] bg-black/40 text-[#00ff41] text-sm font-mono hover:bg-[rgba(0,255,65,0.1)] transition-colors"
          aria-label={t('splash_skip')}
        >
          {t('splash_skip')}
        </button>
      )}

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
              className="absolute left-1/2 top-1/2 -translate-x-1/2 w-28 h-0.5 rounded-full origin-center pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, #ff6b6b 40%, #00ff41 60%, transparent)',
                boxShadow: '0 0 10px rgba(255, 107, 107, 0.5)',
                animation: reducedMotion ? 'none' : 'splash-heartbeat 1.2s ease-in-out infinite',
                willChange: 'transform',
              }}
            />
          )}
        </div>
      )}

      {/* Фаза 1: Сканирование... */}
      {phase === 1 && (
        <div className="splash-phase-in absolute inset-0 flex flex-col items-center justify-center px-4">
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
        <div className="splash-phase-in absolute inset-0 flex flex-col items-center justify-center px-4">
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
        <div className="splash-phase-in absolute inset-0 flex flex-col items-center justify-center px-4">
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

      {/* Фаза 4: Данные зашифрованы + иконка замка */}
      {phase === 4 && (
        <div className="splash-phase-in absolute inset-0 flex flex-col items-center justify-center px-4">
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
          <div
            className="splash-encrypt-icon"
            style={{
              animation: reducedMotion ? 'none' : 'splash-lock-in 0.5s ease-out forwards',
              opacity: reducedMotion ? 1 : 0,
            }}
          >
            <div className="splash-encrypt-lock" />
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

      {/* Фаза 6: 2 с тишины, затем PRESS F проявляется из ничего; после — свет в конце тоннеля */}
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
                  : `splash-press-appear 0.9s ease-out ${PHASE6_PRESS_DELAY_MS / 1000}s forwards, splash-glow-pulse 1.2s ease-in-out ${(PHASE6_PRESS_DELAY_MS + 1000) / 1000}s infinite`,
              opacity: reducedMotion ? 1 : 0,
              willChange: 'transform, opacity',
            }}
          >
            {t('app_title')}
          </div>
        </div>
      )}

      {/* Свет в конце тоннеля: свет из центра расширяется и заполняет экран, затем затухание */}
      {showFlash && (
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          style={{
            animation: reducedMotion ? 'none' : 'splash-tunnel-light 2s ease-out forwards',
            willChange: 'opacity, transform',
          }}
        >
          <div
            className="absolute w-[200vmax] h-[200vmax] rounded-full"
            style={{
              background: 'radial-gradient(circle, #FFFFF8 0%, #FFF8E0 15%, rgba(255,248,220,0.5) 30%, transparent 55%)',
              animation: reducedMotion ? 'none' : 'splash-tunnel-expand 2s ease-out forwards',
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SplashScreen;
