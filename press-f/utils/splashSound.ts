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

/** Звук для фазы "ИЛИ?" — мягкий загадочный тон (два высоких колокольчика) */
export function playOrSound() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    beep(784, 100, 'sine', 0.06);
    setTimeout(() => beep(988, 140, 'sine', 0.05), 120);
    setTimeout(() => beep(659, 80, 'sine', 0.04), 280);
  } catch (_) {}
}

/** Хор ангелов для PRESS F и перехода (как при смерти в играх — в рай) */
export function playAngelChoir() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.2);
    const t0 = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.linearRampToValueAtTime(freq * 1.02, t0 + 1.5);
      osc.start(t0);
      osc.stop(t0 + 2.2);
    });
  } catch (_) {}
}
