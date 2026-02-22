// Basic analytics utility for tracking user events
// Can be extended with Google Analytics, Yandex Metrika, etc.

interface AnalyticsEvent {
  event: string;
  category?: string;
  action?: string;
  label?: string;
  value?: number;
  userId?: number;
  timestamp?: number;
  properties?: Record<string, any>;
}

class Analytics {
  private events: AnalyticsEvent[] = [];
  private userId: number | null = null;
  private enabled: boolean = true;

  constructor() {
    // Check if analytics should be enabled (can be disabled via localStorage)
    try {
      const disabled = localStorage.getItem('analytics_disabled') === 'true';
      this.enabled = !disabled;
    } catch (e) {
      // localStorage not available
      this.enabled = false;
    }
  }

  setUserId(userId: number | null) {
    this.userId = userId;
  }

  track(event: string, properties?: Record<string, any>) {
    if (!this.enabled) return;

    const analyticsEvent: AnalyticsEvent = {
      event,
      userId: this.userId || undefined,
      timestamp: Date.now(),
      properties
    };

    this.events.push(analyticsEvent);

    // Log to console in development
    if (import.meta.env.DEV) {
      console.log('[Analytics]', analyticsEvent);
    }

    // Send to backend (non-blocking)
    this.sendToBackend(analyticsEvent).catch(err => {
      console.debug('[Analytics] Failed to send event to backend', err);
    });

    // Keep only last 100 events in memory
    if (this.events.length > 100) {
      this.events.shift();
    }
  }

  private async sendToBackend(event: AnalyticsEvent) {
    try {
      // Send to backend analytics endpoint (if exists)
      const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      await fetch(`${API_BASE}/api/analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
        // Don't wait for response - fire and forget
        signal: AbortSignal.timeout(2000)
      }).catch(() => {
        // Ignore errors - analytics is non-critical
      });
    } catch (e) {
      // Ignore errors
    }
  }

  // Convenience methods for common events
  trackPageView(path: string) {
    this.track('page_view', { path });
  }

  trackButtonClick(buttonName: string, location?: string) {
    this.track('button_click', { button: buttonName, location });
  }

  trackLetterCreated(letterId: string, type?: string) {
    this.track('letter_created', { letterId, type });
  }

  trackDuelCreated(duelId: string, isPublic?: boolean) {
    this.track('duel_created', { duelId, isPublic });
  }

  trackCheckIn(streak?: number) {
    this.track('check_in', { streak });
  }

  trackQuestCompleted(questId: string, questType: string) {
    this.track('quest_completed', { questId, questType });
  }

  trackLevelUp(level: number) {
    this.track('level_up', { level });
  }

  trackShare(type: string, itemId?: string) {
    this.track('share', { type, itemId });
  }

  trackReferral(code: string) {
    this.track('referral', { code });
  }

  trackError(error: string, context?: string) {
    this.track('error', { error, context });
  }

  trackStorePurchase(itemId: string, source: 'xp' | 'stars', extra?: Record<string, unknown>) {
    this.track('store_purchase', { itemId, source, ...extra });
  }

  trackSquadCreated(squadId: string, squadName?: string) {
    this.track('squad_created', { squadId, squadName });
  }

  trackSquadJoined(squadId: string) {
    this.track('squad_joined', { squadId });
  }

  trackFriendRequestSent(friendId: number) {
    this.track('friend_request_sent', { friendId });
  }

  trackFriendRequestAccepted(friendId: number) {
    this.track('friend_request_accepted', { friendId });
  }

  trackFriendRequestDeclined(friendId: number) {
    this.track('friend_request_declined', { friendId });
  }

  trackLetterViewed(letterId: string, status?: string) {
    this.track('letter_viewed', { letterId, status });
  }
}

export const analytics = new Analytics();
