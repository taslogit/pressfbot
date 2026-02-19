/**
 * Confirm critical actions. Uses Telegram popup with buttons when in WebApp, else window.confirm.
 */
import { tg, isTelegramWebApp } from './telegram';

/**
 * Show confirmation dialog. Returns true if user confirmed, false if cancelled.
 */
export function confirmCritical(options: {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { message, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = true } = options;

  if (isTelegramWebApp && typeof tg?.showPopup === 'function') {
    return new Promise((resolve) => {
      tg.showPopup(
        {
          message,
          buttons: [
            { id: 'cancel', type: 'cancel', text: cancelLabel },
            { id: 'confirm', type: destructive ? 'destructive' : 'default', text: confirmLabel }
          ]
        },
        (buttonId: string) => {
          resolve(buttonId === 'confirm');
        }
      );
    });
  }
  return Promise.resolve(window.confirm(message));
}
