// Mocking the Telegram WebApp object for browser development
const mockWebApp = {
  initDataUnsafe: {
    user: {
      id: 123456789,
      first_name: "Giga",
      last_name: "Chad",
      username: "gigachad_dev",
      language_code: "en"
    },
    start_param: "" // Simulate deep linking here if needed for dev: "witness_123"
  },
  themeParams: {
    bg_color: "#0f0d16",
    text_color: "#ffffff",
    hint_color: "#9ca3af",
    button_color: "#B4FF00",
    button_text_color: "#000000"
  },
  headerColor: "#0f0d16",
  backgroundColor: "#0f0d16",
  BackButton: {
    isVisible: false,
    show: () => console.log('[TG_MOCK] Show Back Button'),
    hide: () => console.log('[TG_MOCK] Hide Back Button'),
    onClick: (cb: any) => console.log('[TG_MOCK] Back Click attached'),
    offClick: (cb: any) => {}
  },
  MainButton: {
    isVisible: false,
    text: "MAIN BUTTON",
    show: () => console.log('[TG_MOCK] Show Main Button'),
    hide: () => console.log('[TG_MOCK] Hide Main Button'),
    onClick: (cb: any) => {},
    offClick: (cb: any) => {},
    setText: (text: string) => console.log(`[TG_MOCK] MainButton Text: ${text}`),
    enable: () => {},
    disable: () => {},
    showProgress: () => {},
    hideProgress: () => {},
  },
  HapticFeedback: {
    impactOccurred: (style: string) => console.log(`[TG_MOCK] Haptic Impact: ${style}`),
    notificationOccurred: (type: string) => console.log(`[TG_MOCK] Haptic Notification: ${type}`),
    selectionChanged: () => console.log(`[TG_MOCK] Haptic Selection`),
  },
  ready: () => console.log('[TG_MOCK] Ready'),
  expand: () => console.log('[TG_MOCK] Expand'),
  close: () => console.log('[TG_MOCK] Close App'),
  showPopup: (params: any) => alert(`[TG_MOCK Popup] ${params.message}`),
  openLink: (url: string) => window.open(url, '_blank'),
  setHeaderColor: (color: string) => console.log(`[TG_MOCK] Header Color: ${color}`),
  setBackgroundColor: (color: string) => console.log(`[TG_MOCK] Bg Color: ${color}`),
  enableClosingConfirmation: () => console.log('[TG_MOCK] enableClosingConfirmation'),
  disableClosingConfirmation: () => console.log('[TG_MOCK] disableClosingConfirmation'),
  onEvent: (eventType: string, callback: () => void) => {},
  offEvent: (eventType: string, callback: () => void) => {},
  platform: 'unknown'
};

// Detect if running inside Telegram
// @ts-ignore
const isTg = typeof window !== 'undefined' && window.Telegram?.WebApp && typeof window.Telegram.WebApp.initData !== 'undefined';

// Export the real WebApp or the Mock
// @ts-ignore
export const tg = isTg ? window.Telegram.WebApp : mockWebApp;

// Helper for haptics to ensure safety
export const haptic = {
  impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred(style);
  },
  notification: (type: 'error' | 'success' | 'warning') => {
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(type);
  },
  selection: () => {
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
  }
};

// Initialize App settings for production
export const initTelegramApp = () => {
  if (isTg) {
    tg.ready();
    tg.expand(); // Force full screen height
    
    // Prevent accidental closure when user has unsaved data
    try {
      tg.enableClosingConfirmation();
    } catch (e) {
      console.warn('Old TG version, cannot enable closing confirmation');
    }
    
    // Set colors to match your theme (Dark #0f0d16)
    try {
        tg.setHeaderColor('#0f0d16');
        tg.setBackgroundColor('#0f0d16');
    } catch (e) {
        console.warn('Old TG version, cannot set colors');
    }

    // Listen for theme changes from Telegram
    try {
      tg.onEvent('themeChanged', () => {
        // Re-apply our dark theme colors on Telegram theme change
        try {
          tg.setHeaderColor('#0f0d16');
          tg.setBackgroundColor('#0f0d16');
        } catch (e) {}
      });
    } catch (e) {
      console.warn('Old TG version, cannot listen for theme changes');
    }
  } else {
    // When not inside Telegram, attempt to simulate an initData string and auto-verify with local backend
    // Useful for local dev: server must be running and accept /api/verify
    (async () => {
      try {
        // Build a fake initData string similar to Telegram (very simplified)
        const fake = `user=%7B%22id%22:8473207941,%22first_name%22:%22Dev%22%7D&auth_date=${Math.floor(Date.now()/1000)}&hash=devhash`;
        const response = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: fake })
        });
        const data = await response.json();
        if (data?.ok && data?.sessionId) {
          try { localStorage.setItem('lastmeme_session', data.sessionId); } catch (e) {}
          console.log('Local initData verified, sessionId', data.sessionId);
        } else console.warn('Local verify failed', data);
      } catch (e) {
        console.warn('Local verify error', e);
      }
    })();
  }
};
