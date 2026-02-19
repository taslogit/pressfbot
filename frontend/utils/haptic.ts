/**
 * Haptic feedback for Telegram WebApp.
 * Call alongside playSound for consistent feedback; safe when tg.HapticFeedback is missing.
 */
import { tg } from './telegram';

export type HapticType = 'selection' | 'impact_light' | 'impact_medium' | 'impact_heavy' | 'success' | 'warning' | 'error';

export function haptic(type: HapticType = 'selection'): void {
  try {
    const h = tg?.HapticFeedback;
    if (!h) return;
    switch (type) {
      case 'selection':
        h.selectionChanged?.();
        break;
      case 'impact_light':
        h.impactOccurred?.('light');
        break;
      case 'impact_medium':
        h.impactOccurred?.('medium');
        break;
      case 'impact_heavy':
        h.impactOccurred?.('heavy');
        break;
      case 'success':
        h.notificationOccurred?.('success');
        break;
      case 'warning':
        h.notificationOccurred?.('warning');
        break;
      case 'error':
        h.notificationOccurred?.('error');
        break;
      default:
        h.selectionChanged?.();
    }
  } catch {
    // ignore
  }
}
