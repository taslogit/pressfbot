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

const LOADING_MS = 600; /* быстрый экран загрузки перед скан-линией */
const SCAN_LINE_MS = 900; /* скан-линия после загрузки */
const INTRO_MS = LOADING_MS + SCAN_LINE_MS; /* 1500 — конец интро, начало терминала */
const SHORT_SPLASH_MS = 2500;
const SKIP_BUTTON_AFTER_MS = 2500;
const TYPING_INTERVAL_MS = 26;
const TYPING_BATCH = 2; /* обновлять по 2 символа — меньше ре-рендеров при той же скорости */
const TERMINAL_TYPING_INTERVAL_MS = 22;
const TERMINAL_TYPING_BATCH = 2;
const INTRO_SCAN_DURATION_S = 0.7;
const SCAN_DURATION_S = 2.167;
const SCAN_ITERATIONS = 3;

const PHASE0_SCAN_END_MS = INTRO_MS; /* 1500 — конец скан-линии */
const PHASE1_HEARTBEAT_END_MS = INTRO_MS + 2000; /* 3500 — конец heartbeat */
const PHASE2_TERMINAL_END_MS = INTRO_MS + 2000 + 6500; /* 10000 — конец терминала */
const PHASE3_OR_DURATION_MS = 600; /* ИЛИ? + не отметился — без задержек до и после */
const PHASE3_OR_END_MS = PHASE2_TERMINAL_END_MS + PHASE3_OR_DURATION_MS; /* 10600 */
const PHASE4_PRESS_DELAY_MS = 2000; /* единственная задержка: 2 с перед появлением PRESS F */
const PRESS_APPEAR_DURATION_MS = 1000; /* длительность анимации появления PRESS F */
const FLASH_AT_MS = PHASE3_OR_END_MS + PHASE4_PRESS_DELAY_MS + PRESS_APPEAR_DURATION_MS + 400; /* после появления PRESS F — свет в тоннеле */
const FADEOUT_START_MS = FLASH_AT_MS + 100;
const SPLASH_DURATION_MS = FADEOUT_START_MS + 1200; /* конец заставки */

interface SplashScreenProps {
  onFinish: () => void;
}

/**
 * Заставка:
 * -1: быстрый экран загрузки (перед скан-линией)
 *  0: скан-линия (интро)
 *  1: терминал — проверка пульса / нет ответа
 *  2: один терминал — печатание: Сканирование → Идентификация → Юзер отметился → Данные зашифрованы
 *  3: ИЛИ? + не отметился
 *  4: PRESS F и переход в приложение (свет в конце тоннеля)
 */
const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { t } = useTranslation();
  const shortSplashEnabled = storage.getSettings().shortSplashEnabled === true;
  const shortMode = useRef(storage.getHasSeenSplash() && shortSplashEnabled).current;
  const soundEnabled = storage.getSettings().soundEnabled;
  const [phase, setPhase] = useState(shortMode ? 4 : -1);
  const [line1Len, setLine1Len] = useState(0);
  const [line2Len, setLine2Len] = useState(0);
  const [terminalTypedLen, setTerminalTypedLen] = useState(0);
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

  // Звуки при входе в фазу
  useEffect(() => {
    if (!soundEnabled || phase < 0 || soundPlayedRef.current[phase]) return;
    soundPlayedRef.current[phase] = true;
    if (phase === 1) playTerminalBeep();
    if (phase === 2) playTerminalBeep();
    if (phase === 3) playOrSound();
    if (phase === 4) playAngelChoir();
  }, [phase, soundEnabled]);

  // Бип при появлении "no response" (конец набора второй строки в фазе 1)
  const line2DoneRef = useRef(false);
  useEffect(() => {
    if (soundEnabled && phase === 1 && line2Len >= LINE2.length && LINE2.length > 0 && !line2DoneRef.current) {
      line2DoneRef.current = true;
      playTerminalBeep();
    }
  }, [phase, line2Len, LINE2.length, soundEnabled]);

  // Печатание фазы 1 (heartbeat): батч по 2 символа — меньше ре-рендеров, плавнее
  useEffect(() => {
    if (phase !== 1) return;
    const t1 = setInterval(() => {
      setLine1Len((n) => {
        if (n >= LINE1.length) {
          clearInterval(t1);
          return n;
        }
        return Math.min(n + TYPING_BATCH, LINE1.length);
      });
    }, TYPING_INTERVAL_MS * TYPING_BATCH);
    return () => clearInterval(t1);
  }, [phase, LINE1]);

  useEffect(() => {
    if (line1Len < LINE1.length || phase !== 1) return;
    const t2 = setInterval(() => {
      setLine2Len((n) => {
        if (n >= LINE2.length) {
          clearInterval(t2);
          return n;
        }
        return Math.min(n + TYPING_BATCH, LINE2.length);
      });
    }, TYPING_INTERVAL_MS * TYPING_BATCH);
    return () => clearInterval(t2);
  }, [line1Len, LINE1.length, LINE2, phase]);

  // Полный текст объединённого терминала (фаза 2) для печатания
  const TERMINAL_LINES = [
    { prefix: '$ ', text: 'scan --full', color: undefined },
    { prefix: '', text: t('splash_scanning'), color: undefined },
    { prefix: '$ ', text: 'identify --user', color: undefined },
    { prefix: '', text: t('splash_identification'), color: undefined },
    { prefix: '$ ', text: 'status', color: undefined },
    { prefix: '', text: t('splash_user_checked_in'), color: '#00ff41' },
    { prefix: '', text: t('splash_data_encrypted'), color: '#00ff41' },
  ];
  const terminalFullLength = TERMINAL_LINES.reduce((acc, l) => acc + l.prefix.length + l.text.length + 1, 0);

  // Печатание объединённого терминала (фаза 2): батч по 2 символа — меньше ре-рендеров
  useEffect(() => {
    if (phase !== 2) return;
    const iv = setInterval(() => {
      setTerminalTypedLen((n) => {
        if (n >= terminalFullLength) {
          clearInterval(iv);
          return n;
        }
        return Math.min(n + TERMINAL_TYPING_BATCH, terminalFullLength);
      });
    }, TERMINAL_TYPING_INTERVAL_MS * TERMINAL_TYPING_BATCH);
    return () => clearInterval(iv);
  }, [phase, terminalFullLength]);

  // Кнопка «Пропустить» через 2.5 с; подсказка «Нажмите для звука» скрыть через 3 с
  useEffect(() => {
    const t = setTimeout(() => setShowSkip(true), SKIP_BUTTON_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSoundHintVisible(false), 3000);
    return () => clearTimeout(t);
  }, []);

  // Таймеры: короткий режим или полная заставка (загрузка → скан-линия → терминал heartbeat → объединённый терминал → ИЛИ? → PRESS F)
  useEffect(() => {
    if (shortMode) {
      const tFlash = setTimeout(() => setShowFlash(true), 800);
      const tFade = setTimeout(() => setFadeOut(true), 900);
      const tEnd = setTimeout(finish, SHORT_SPLASH_MS);
      return () => { clearTimeout(tFlash); clearTimeout(tFade); clearTimeout(tEnd); };
    }
    const tLoadingEnd = setTimeout(() => setPhase(0), LOADING_MS);
    const tScanEnd = setTimeout(() => setPhase(1), PHASE0_SCAN_END_MS);
    const tHeartbeatEnd = setTimeout(() => setPhase(2), PHASE1_HEARTBEAT_END_MS);
    const tTerminalEnd = setTimeout(() => setPhase(3), PHASE2_TERMINAL_END_MS);
    const tOrEnd = setTimeout(() => setPhase(4), PHASE3_OR_END_MS);
    const tFlash = setTimeout(() => setShowFlash(true), FLASH_AT_MS);
    const tFade = setTimeout(() => setFadeOut(true), FADEOUT_START_MS);
    const tFinish = setTimeout(finish, SPLASH_DURATION_MS);
    return () => {
      [tLoadingEnd, tScanEnd, tHeartbeatEnd, tTerminalEnd, tOrEnd, tFlash, tFade, tFinish].forEach(clearTimeout);
    };
  }, []);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isTerminalPhase = phase >= 1 && phase <= 2;
  const isLoading = !shortMode && phase === -1;
  const isScanLine = !shortMode && phase === 0;

  return (
    <div
      className="splash-screen fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundColor: (isLoading || isScanLine) ? '#000000' : '#0f0d16',
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

      {/* Фаза -1: быстрый экран загрузки */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
          <span className="font-mono text-sm text-[#00ff41] tracking-widest animate-pulse">
            {t('splash_loading')}
          </span>
        </div>
      )}

      {/* Фаза 0: скан-линия (один проход) */}
      {isScanLine && (
        <div
          className="absolute left-0 right-0 h-0.5 pointer-events-none top-0"
          style={{
            background: 'linear-gradient(90deg, transparent, #00ff41 25%, #00ff41 75%, transparent)',
            boxShadow: '0 0 20px rgba(0, 255, 65, 0.7)',
            animation: reducedMotion ? 'none' : `splash-scan ${INTRO_SCAN_DURATION_S}s linear 1 forwards`,
            willChange: 'transform',
            transform: 'translateZ(0)',
          }}
        />
      )}

      {/* Фон: сетка — изоляция перерисовки для плавности */}
      {!isLoading && !isScanLine && (
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
          contain: 'paint',
          transform: 'translateZ(0)',
        }}
      />
      )}

      {/* Скан-линия, 3 прохода — в фазах терминала (1–2) */}
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
            transform: 'translateZ(0)',
          }}
        />
      )}

      {/* Фаза 1: терминал — heartbeat / no response */}
      {phase === 1 && (
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

      {/* Фаза 2: один терминал — печатание Сканирование → Идентификация → Юзер отметился → Данные зашифрованы */}
      {phase === 2 && (
        <div className="splash-phase-in absolute inset-0 flex flex-col items-center justify-center px-4">
          <div className="splash-terminal-window max-w-lg w-full">
            <div className="splash-terminal-titlebar">
              <div className="splash-terminal-titlebar-dots"><span /><span /><span /></div>
              <span>root@pressf — Terminal</span>
            </div>
            <div className="splash-terminal-body min-h-[200px]">
              {(() => {
                let offset = 0;
                return TERMINAL_LINES.map((line, i) => {
                  const lineLen = line.prefix.length + line.text.length + 1;
                  const start = offset;
                  offset += lineLen;
                  const visible = terminalTypedLen > start;
                  const lenInLine = Math.min(Math.max(terminalTypedLen - start, 0), lineLen);
                  const textLen = Math.max(0, Math.min(lenInLine - line.prefix.length, line.text.length));
                  const showCursor = terminalTypedLen >= start && terminalTypedLen < offset;
                  return (
                    <div key={i} className="mb-1 splash-terminal-output">
                      {visible && (
                        <>
                          <span className="splash-terminal-prompt">{line.prefix}</span>
                          <span style={line.color ? { color: line.color } : undefined}>
                            {line.text.slice(0, textLen)}
                            {showCursor && (
                              <span
                                className="inline-block w-2 h-4 ml-0.5 animate-pulse"
                                style={{ backgroundColor: line.color || '#00ff41', boxShadow: `0 0 6px ${line.color || '#00ff41'}` }}
                              />
                            )}
                          </span>
                          {lenInLine >= lineLen && <br />}
                        </>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Фаза 3: ИЛИ? + не отметился */}
      {phase === 3 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center gap-4">
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
          <div
            className="font-mono text-lg sm:text-xl uppercase tracking-widest"
            style={{
              color: '#ff6b6b',
              textShadow: '0 0 12px rgba(255, 107, 107, 0.6)',
              animation: reducedMotion ? 'none' : 'splash-text-reveal 0.4s ease-out 0.2s forwards',
              opacity: reducedMotion ? 1 : 0,
            }}
          >
            {t('splash_not_checked_in')}
          </div>
        </div>
      )}

      {/* Фаза 4: 2 с задержки, затем PRESS F — градиент + подсветка; после — свет в конце тоннеля → приложение с туториалом */}
      {phase === 4 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <div
            className="splash-press-title font-logo text-5xl sm:text-6xl md:text-7xl font-black"
            style={{
              fontFamily: 'var(--font-logo), Rye, cursive',
              animation:
                reducedMotion
                  ? 'none'
                  : `splash-press-appear-v2 ${PRESS_APPEAR_DURATION_MS}ms ease-out ${PHASE4_PRESS_DELAY_MS / 1000}s forwards, splash-press-glow 2s ease-in-out ${(PHASE4_PRESS_DELAY_MS + PRESS_APPEAR_DURATION_MS) / 1000}s infinite`,
              opacity: reducedMotion ? 1 : 0,
              willChange: 'transform, opacity, filter',
            }}
          >
            {t('app_title')}
          </div>
        </div>
      )}

      {/* Свет в конце тоннеля: GPU-слой для плавной анимации */}
      {showFlash && (
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          style={{
            animation: reducedMotion ? 'none' : 'splash-tunnel-light 2s ease-out forwards',
            willChange: 'opacity',
            transform: 'translateZ(0)',
          }}
        >
          <div
            className="absolute w-[200vmax] h-[200vmax] rounded-full"
            style={{
              background: 'radial-gradient(circle, #FFFFF8 0%, #FFF8E0 15%, rgba(255,248,220,0.5) 30%, transparent 55%)',
              animation: reducedMotion ? 'none' : 'splash-tunnel-expand 2s ease-out forwards',
              willChange: 'transform, opacity',
              transform: 'translateZ(0)',
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SplashScreen;
