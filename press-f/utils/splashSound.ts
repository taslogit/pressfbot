/**
 * Звуки заставки через Web Audio API (без внешних файлов).
 * Терминальные бипы, предупреждение для "ИЛИ?", эпичный аккорд для PRESS F.
 */

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioContext;
}

function beep(
  frequency: number,
  durationMs: number,
  type: OscillatorType = 'sine',
  volume = 0.15
) {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (_) {}
}

/** Короткий терминальный бип (фазы 0–3) */
export function playTerminalBeep() {
  beep(880, 40, 'square', 0.08);
}

/** Звук успеха / подтверждения (юзер отметился, данные зашифрованы) */
export function playTerminalSuccess() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    beep(523, 60, 'sine', 0.12);
    setTimeout(() => beep(659, 60, 'sine', 0.1), 80);
    setTimeout(() => beep(784, 80, 'sine', 0.08), 160);
  } catch (_) {}
}

/** Предупреждение для фазы "ИЛИ?" */
export function playWarning() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    beep(200, 120, 'sawtooth', 0.12);
    setTimeout(() => beep(180, 120, 'sawtooth', 0.1), 150);
    setTimeout(() => beep(160, 200, 'sawtooth', 0.08), 300);
  } catch (_) {}
}

/** Эпичный аккорд для PRESS F и перехода */
export function playEpic() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    [261.63, 329.63, 392].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.2);
    });
  } catch (_) {}
}
