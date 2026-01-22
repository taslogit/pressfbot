import { useEffect } from 'react';
import { tg } from '../utils/telegram';
import { verifyInitDataOnServer } from '../utils/api';
import { storage } from '../utils/storage';

export const useTelegramSession = () => {
  useEffect(() => {
    // If running inside Telegram, send initData to server
    // @ts-ignore
    const raw = typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : null;
    if (raw) {
      (async () => {
        const res = await verifyInitDataOnServer(raw);
        if (res?.ok && res.sessionId) storage.setSessionId(res.sessionId);
      })();
    } else {
      // not inside Telegram — fallback handled by initTelegramApp mock
    }
  }, []);
};
