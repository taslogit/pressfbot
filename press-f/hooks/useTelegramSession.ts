import { useEffect, useState } from 'react';
import { tg } from '../utils/telegram';
import { verifyInitDataOnServer } from '../utils/api';
import { storage } from '../utils/storage';

/** Runs verify and returns true when init is done (so first API calls can use session). */
export const useTelegramSession = () => {
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // @ts-ignore
        const raw = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData ?? null;
        if (raw) {
          try {
            const res = await verifyInitDataOnServer(raw);
            if (!cancelled && res?.sessionId) {
              storage.setSessionId(res.sessionId);
            } else if (!cancelled && !res?.sessionId) {
              if (import.meta.env.DEV) console.warn('[Session] Verify failed or no sessionId');
            }
          } catch (error) {
            if (!cancelled) console.error('[Session] Verify error:', error);
          }
        } else {
          if (import.meta.env.DEV) console.debug('[Session] No initData, fallback mode');
        }
      } catch (error) {
        if (!cancelled) console.error('[Session] Init error:', error);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return sessionReady;
};
