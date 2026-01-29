import { useEffect } from 'react';
import { tg } from '../utils/telegram';
import { verifyInitDataOnServer } from '../utils/api';
import { storage } from '../utils/storage';

export const useTelegramSession = () => {
  useEffect(() => {
    // If running inside Telegram, send initData to server
    try {
      // @ts-ignore
      const raw = typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : null;
      if (raw) {
        (async () => {
          try {
            const res = await verifyInitDataOnServer(raw);
            if (res?.ok && res.sessionId) {
              storage.setSessionId(res.sessionId);
            } else {
              console.warn('Failed to verify initData, using fallback');
            }
          } catch (error) {
            console.error('Error verifying initData:', error);
            // Continue without session - app should still work with fallback
          }
        })();
      } else {
        // not inside Telegram - fallback handled by initTelegramApp mock
        console.debug('No Telegram WebApp detected, using fallback mode');
      }
    } catch (error) {
      console.error('Error in useTelegramSession:', error);
      // Don't block app initialization on session error
    }
  }, []);
};
