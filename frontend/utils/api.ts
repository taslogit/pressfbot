// Use current origin for API if VITE_API_URL is not set (production mode)
const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

if (import.meta.env.DEV && typeof window !== 'undefined') {
  console.log('[API] API_BASE:', API_BASE);
}

// Get session ID from storage (value is JSON-stringified by storage.setSessionId)
function getSessionId(): string | null {
  try {
    const raw = localStorage.getItem('lastmeme_session');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : raw;
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

// Create API headers with session
function getHeaders(): HeadersInit {
  const sessionId = getSessionId();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (sessionId) {
    headers['X-Session-Id'] = sessionId;
  }
  return headers;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second
/* 429 excluded: retrying rate limit makes it worse */
const RETRYABLE_STATUS_CODES = [408, 500, 502, 503, 504];
const RETRYABLE_ERROR_CODES = ['TIMEOUT', 'NETWORK_ERROR'];

// Exponential backoff retry helper
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// API helper function with improved error handling and retry logic
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<{ ok: boolean; data?: T; error?: string; code?: string; details?: any }> {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    // Support external AbortController (for component unmount cancellation)
    // If caller provides a signal, use it; otherwise create a timeout-based one
    const externalSignal = options.signal;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    // If external signal aborts, also abort our controller
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId);
        return { ok: false, error: 'Request cancelled', code: 'CANCELLED' };
      }
      externalSignal.addEventListener('abort', () => controller.abort());
    }

    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { ...getHeaders(), ...options.headers },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorData: any = { error: 'Request failed' };
      try {
        errorData = await res.json();
      } catch {
        // If response is not JSON, use status text
        errorData = { error: res.statusText || `HTTP ${res.status}` };
      }
      
      // Retry logic for retryable errors
      const shouldRetry = retryCount < MAX_RETRIES && 
        (RETRYABLE_STATUS_CODES.includes(res.status) || 
         errorData.code === 'TIMEOUT' || 
         errorData.code === 'NETWORK_ERROR');
      
      if (shouldRetry) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff
        if (import.meta.env.DEV) {
          console.warn(`[API] Retrying request [${endpoint}] (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${delay}ms`);
        }
        await sleep(delay);
        return apiRequest<T>(endpoint, options, retryCount + 1);
      }
      
      const errObj = errorData?.error;
      const message = (typeof errObj === 'object' && errObj !== null && errObj.message)
        ? errObj.message
        : (typeof errorData.error === 'string' ? errorData.error : errorData.message || 'Request failed');
      const code = (typeof errObj === 'object' && errObj !== null && errObj.code) ? errObj.code : errorData.code ?? (res.status === 429 ? '429' : undefined);
      return {
        ok: false,
        error: message,
        code,
        details: errorData.details ?? (typeof errObj === 'object' && errObj !== null ? errObj.details : undefined)
      };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      if (externalSignal?.aborted) {
        return { ok: false, error: 'Request cancelled', code: 'CANCELLED' };
      }
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
        if (import.meta.env.DEV) {
          console.warn(`[API] Retrying timeout [${endpoint}] (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${delay}ms`);
        }
        await sleep(delay);
        return apiRequest<T>(endpoint, options, retryCount + 1);
      }
      console.error(`API request timeout [${endpoint}]`);
      return { ok: false, error: 'Request timeout', code: 'TIMEOUT' };
    }

    // Network or other errors — retry with backoff
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
      if (import.meta.env.DEV) {
        console.warn(`[API] Retrying [${endpoint}] after error (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${delay}ms`, e?.message || e);
      }
      await sleep(delay);
      return apiRequest<T>(endpoint, options, retryCount + 1);
    }
    console.error(`API request error [${endpoint}]:`, e);
    return { ok: false, error: e.message || 'Network error', code: 'NETWORK_ERROR' };
  }
}

/** Full URL for static assets (avatars, images) - use when API is on different origin */
export const getStaticUrl = (path: string): string =>
  path.startsWith('http') ? path : `${API_BASE.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;

type QueryParams = Record<string, string | number | boolean | undefined | null>;

function toQueryString(params?: QueryParams): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.append(key, String(value));
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export async function verifyInitDataOnServer(initData: string) {
  const result = await apiRequest<{ sessionId: string }>('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  });
  return result.ok ? result.data : null;
}

// Letters API
export const lettersAPI = {
  getAll: async (params?: QueryParams, options?: RequestInit) => {
    return apiRequest<{ letters: any[] }>(`/api/letters${toQueryString(params)}`, options);
  },
  getHistory: async (id: string) => {
    return apiRequest<{ versions: any[] }>(`/api/letters/${id}/history`);
  },
  restoreVersion: async (id: string, versionId: string) => {
    return apiRequest(`/api/letters/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ versionId })
    });
  },
  getOne: async (id: string) => {
    return apiRequest<{ letter: any }>(`/api/letters/${id}`);
  },
  create: async (letter: any) => {
    return apiRequest<{ id: string; xp?: number }>('/api/letters', {
      method: 'POST',
      body: JSON.stringify(letter),
    });
  },
  update: async (id: string, letter: Partial<any>) => {
    return apiRequest<{ id: string }>(`/api/letters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(letter),
    });
  },
  delete: async (id: string) => {
    return apiRequest(`/api/letters/${id}`, {
      method: 'DELETE',
    });
  },
  uploadAttachment: async (letterId: string, file: File | Blob, options?: RequestInit) => {
    const sessionId = getSessionId();
    const headers: HeadersInit = {};
    if (sessionId) headers['X-Session-Id'] = sessionId;
    const fd = new FormData();
    fd.append('letterId', letterId);
    fd.append('file', file instanceof Blob ? new File([file], 'recording.webm', { type: file.type }) : file);
    const url = `${API_BASE.replace(/\/$/, '')}/api/letters/upload-attachment`;
    const res = await fetch(url, { method: 'POST', headers, body: fd, ...options });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errObj = err?.error;
      const message = (typeof errObj === 'object' && errObj !== null && errObj.message)
        ? errObj.message
        : (typeof err?.error === 'string' ? err.error : res.statusText);
      const code = (typeof errObj === 'object' && errObj !== null && errObj.code) ? errObj.code : err?.code;
      return { ok: false as const, error: message, code };
    }
    return { ok: true as const, data: await res.json() };
  },
};

// Duels API
export const duelsAPI = {
  getAll: async (params?: QueryParams, options?: RequestInit) => {
    return apiRequest<{ duels: any[] }>(`/api/duels${toQueryString(params)}`, options);
  },
  getHype: async (params?: QueryParams, options?: RequestInit) => {
    return apiRequest<{ duels: any[] }>(`/api/duels/hype${toQueryString(params)}`, options);
  },
  getOne: async (id: string) => {
    return apiRequest<{ duel: any }>(`/api/duels/${id}`);
  },
  create: async (duel: any) => {
    return apiRequest<{ id: string; xp?: number }>('/api/duels', {
      method: 'POST',
      body: JSON.stringify(duel),
    });
  },
  update: async (id: string, duel: Partial<any>) => {
    return apiRequest<{ id: string; winnerTauntMessage?: string }>(`/api/duels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(duel),
    });
  },
  delete: async (id: string) => {
    return apiRequest(`/api/duels/${id}`, {
      method: 'DELETE',
    });
  },
  view: async (id: string) => {
    return apiRequest<{ viewsCount: number; milestone?: number }>(`/api/duels/${id}/view`, {
      method: 'POST',
    });
  },
};

// Legacy API
export const legacyAPI = {
  getAll: async (params?: QueryParams) => {
    return apiRequest<{ items: any[] }>(`/api/legacy${toQueryString(params)}`);
  },
  getOne: async (id: string) => {
    return apiRequest<{ item: any }>(`/api/legacy/${id}`);
  },
  create: async (item: any) => {
    return apiRequest<{ id: string }>('/api/legacy', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },
  update: async (id: string, item: Partial<any>) => {
    return apiRequest<{ id: string }>(`/api/legacy/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  },
  delete: async (id: string) => {
    return apiRequest(`/api/legacy/${id}`, {
      method: 'DELETE',
    });
  },
};

// Profile API
export const profileAPI = {
  get: async (options?: RequestInit) => {
    return apiRequest<{ profile: any; settings: any }>('/api/profile', options);
  },
  update: async (profile: Partial<any>) => {
    return apiRequest('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  },
  checkIn: async () => {
    return apiRequest<{
      timestamp: number;
      streak?: { current: number; longest: number; bonus: number; usedSkip: boolean };
      xp?: number;
      bonuses?: { comeback: number; milestone: number; lucky: number };
    }>('/api/profile/check-in', {
      method: 'POST',
    });
  },
  getStreak: async () => {
    return apiRequest<{ streak: any }>('/api/profile/streak');
  },
  getStreakLeaderboard: async (limit = 20, offset = 0, options?: RequestInit) => {
    return apiRequest<{ leaderboard: { rank: number; userId: number; streak: number; avatar: string; title: string }[] }>(
      `/api/profile/streak-leaderboard?limit=${limit}&offset=${offset}`,
      options
    );
  },
  claimDailyLoginLoot: async () => {
    return apiRequest<{ claimed: boolean; xp: number }>('/api/profile/daily-login-loot', { method: 'POST' });
  },
  claimGuideReward: async () => {
    return apiRequest<{ claimed: boolean; xp: number }>('/api/profile/guide-reward', { method: 'POST' });
  },
  getReferral: async () => {
    return apiRequest<{ 
      referralCode: string; 
      referralsCount: number; 
      referrals: any[]; 
      nextMilestone: any; 
      referralLink: string;
    }>('/api/profile/referral');
  },
  updateSettings: async (settings: Partial<any>) => {
    return apiRequest('/api/profile/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },
};

export const searchAPI = {
  search: async (q: string, limit = 10) => {
    return apiRequest<{ letters: any[]; duels: any[]; legacy: any[] }>(
      `/api/search${toQueryString({ q, limit })}`
    );
  }
};

export const notificationsAPI = {
  list: async (options?: RequestInit) => {
    return apiRequest<{ events: any[] }>('/api/notifications', options);
  },
  markRead: async (ids?: string[]) => {
    return apiRequest('/api/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  }
};

// Daily Quests API
export const dailyQuestsAPI = {
  getAll: async () => {
    return apiRequest<{ quests: any[] }>('/api/daily-quests');
  },
  claim: async (id: string) => {
    return apiRequest<{ reward: number; xp: number }>(`/api/daily-quests/${id}/claim`, {
      method: 'POST',
    });
  },
  updateProgress: async (questType: string) => {
    return apiRequest('/api/daily-quests/progress', {
      method: 'POST',
      body: JSON.stringify({ questType }),
    });
  },
};

// Avatars API
export const avatarsAPI = {
  getAll: async () => {
    return apiRequest<{ avatars: Array<{ id: string; name: string; url: string; filename: string }> }>('/api/avatars');
  },
  getOne: async (id: string) => {
    return apiRequest<{ avatar: { id: string; name: string; url: string; filename: string } }>(`/api/avatars/${id}`);
  },
};

// Gifts API
export const giftsAPI = {
  getAll: async () => {
    return apiRequest<{ received: any[]; sent: any[] }>('/api/gifts');
  },
  getTypes: async () => {
    return apiRequest<{ types: any[] }>('/api/gifts/types');
  },
  send: async (recipientId: number, giftType: string, message?: string) => {
    return apiRequest<{ giftId: string; cost: number }>('/api/gifts', {
      method: 'POST',
      body: JSON.stringify({ recipientId, giftType, message }),
    });
  },
  claim: async (giftId: string) => {
    return apiRequest<{ effect: any; reward: number }>(`/api/gifts/${giftId}/claim`, {
      method: 'POST',
    });
  },
};

// Events API
export const eventsAPI = {
  getActive: async () => {
    return apiRequest<{ events: any[] }>('/api/events/active');
  },
  getProgress: async (eventId: string) => {
    return apiRequest<{ event: any; progress: Record<string, number>; rewardsClaimed: string[] }>(`/api/events/${eventId}/progress`);
  },
  claimReward: async (eventId: string, rewardId: string) => {
    return apiRequest<{ reward: { reputation: number; xp: number } }>(`/api/events/${eventId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ rewardId }),
    });
  },
};

// Tournaments API
export const tournamentsAPI = {
  getAll: async (status?: string) => {
    const query = status ? `?status=${status}` : '';
    return apiRequest<{ tournaments: any[] }>(`/api/tournaments${query}`);
  },
  getOne: async (tournamentId: string) => {
    return apiRequest<{ tournament: any; participants: any[]; matches: any[]; isRegistered: boolean; userParticipant: any }>(`/api/tournaments/${tournamentId}`);
  },
  register: async (tournamentId: string) => {
    return apiRequest<{ participantId: string; seed: number }>(`/api/tournaments/${tournamentId}/register`, {
      method: 'POST',
    });
  },
  getLeaderboard: async (tournamentId: string, limit = 50, offset = 0) => {
    return apiRequest<{ leaderboard: any[] }>(`/api/tournaments/${tournamentId}/leaderboard?limit=${limit}&offset=${offset}`);
  },
};

// Activity Feed API
export const activityAPI = {
  getFeed: async (limit = 50, offset = 0, type?: string) => {
    const query = type ? `?limit=${limit}&offset=${offset}&type=${type}` : `?limit=${limit}&offset=${offset}`;
    return apiRequest<{ activities: any[]; hasMore: boolean }>(`/api/activity/feed${query}`);
  },
  getUserActivity: async (userId: number, limit = 50, offset = 0) => {
    return apiRequest<{ activities: any[]; hasMore: boolean }>(`/api/activity/user/${userId}?limit=${limit}&offset=${offset}`);
  },
};

// Squads API
export const squadsAPI = {
  get: async (options?: RequestInit) => {
    return apiRequest<{ squad: any }>('/api/squads', options);
  },
  create: async (name: string, options?: RequestInit) => {
    return apiRequest<{ squad: any }>('/api/squads', {
      ...options,
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  update: async (id: string, updates: { name?: string; sharedPayload?: string; pactHealth?: number }, options?: RequestInit) => {
    return apiRequest<{ squad: any }>(`/api/squads/${id}`, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
  addMember: async (id: string, memberId: string, memberName?: string, avatarId?: string, options?: RequestInit) => {
    return apiRequest<{ member: any }>(`/api/squads/${id}/members`, {
      ...options,
      method: 'POST',
      body: JSON.stringify({ memberId, memberName, avatarId }),
    });
  },
  removeMember: async (id: string, memberId: string, options?: RequestInit) => {
    return apiRequest(`/api/squads/${id}/members/${memberId}`, {
      ...options,
      method: 'DELETE',
    });
  },
  join: async (id: string, options?: RequestInit) => {
    return apiRequest<{ squad: any }>(`/api/squads/${id}/join`, {
      ...options,
      method: 'POST',
    });
  },
  getLeaderboard: async (limit = 50, offset = 0, options?: RequestInit) => {
    return apiRequest<{ leaderboard: any[] }>(`/api/squads/leaderboard?limit=${limit}&offset=${offset}`, options);
  },
};

// Witnesses API
export const witnessesAPI = {
  getAll: async (letterId?: string, options?: RequestInit) => {
    const query = letterId ? `?letterId=${letterId}` : '';
    return apiRequest<{ witnesses: any[] }>(`/api/witnesses${query}`, options);
  },
  getOne: async (id: string, options?: RequestInit) => {
    return apiRequest<{ witness: any }>(`/api/witnesses/${id}`, options);
  },
  create: async (letterId: string | null, name: string, options?: RequestInit) => {
    return apiRequest<{ witness: any }>('/api/witnesses', {
      ...options,
      method: 'POST',
      body: JSON.stringify({ letterId, name }),
    });
  },
  update: async (id: string, updates: { name?: string; status?: string }, options?: RequestInit) => {
    return apiRequest<{ witness: any }>(`/api/witnesses/${id}`, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
  confirm: async (id: string, options?: RequestInit) => {
    return apiRequest(`/api/witnesses/${id}/confirm`, {
      ...options,
      method: 'POST',
    });
  },
  delete: async (id: string, options?: RequestInit) => {
    return apiRequest(`/api/witnesses/${id}`, {
      ...options,
      method: 'DELETE',
    });
  },
  getByLetter: async (letterId: string, options?: RequestInit) => {
    return apiRequest<{ witnesses: any[] }>(`/api/witnesses/letter/${letterId}`, options);
  },
};

export const tonAPI = {
  getPlansSummary: async () => {
    return apiRequest<{ hasInheritance: boolean; hasStorage: boolean }>('/api/ton/plans-summary');
  },
  createInheritancePlan: async (payload: {
    recipients: { address: string; amount: number }[];
    tokenSymbol: string;
    totalAmount: number;
    triggerType?: string;
    txHash?: string;
  }) => {
    return apiRequest('/api/ton/inheritance', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  createStoragePlan: async (payload: {
    letterId?: string;
    storageProvider: string;
    planType?: string;
    sizeBytes?: number;
    status?: string;
    txHash?: string;
  }) => {
    return apiRequest('/api/ton/storage', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  createDuelEscrow: async (payload: {
    duelId: string;
    challengerAddress: string;
    opponentAddress?: string;
    tokenSymbol: string;
    stakeAmount: number;
    status?: string;
    txHash?: string;
  }) => {
    return apiRequest('/api/ton/duel-escrow', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};

// ─── Stars / Monetization API ──────────────────────
export const starsAPI = {
  getCatalog: async (options?: RequestInit) => {
    return apiRequest<{ catalog: any[] }>('/api/stars/catalog', options);
  },
  createInvoice: async (itemId: string, recipientId?: string) => {
    return apiRequest<{ invoiceLink: string; itemId: string; stars: number }>('/api/stars/invoice', {
      method: 'POST',
      body: JSON.stringify({ itemId, recipientId })
    });
  },
  getPremiumStatus: async (options?: RequestInit) => {
    return apiRequest<{ isPremium: boolean; expiresAt: string | null; starsBalance: number; trialUsed?: boolean }>('/api/stars/premium-status', options);
  },
  activateTrial: async () => {
    return apiRequest<{ ok: boolean; expiresAt: string }>('/api/stars/activate-trial', { method: 'POST' });
  },
  getPurchases: async () => {
    return apiRequest<{ purchases: any[] }>('/api/stars/purchases');
  }
};

// ─── XP/REP Store API ──────────────────────────────
export const storeAPI = {
  getCatalog: async (options?: RequestInit) => {
    return apiRequest<{ catalog: any[] }>('/api/store/catalog', options);
  },
  getMyItems: async (options?: RequestInit) => {
    return apiRequest<{ items: any[]; firstPurchaseEligible?: boolean; achievementDiscountPercent?: number; achievementsCount?: number }>('/api/store/my-items', options);
  },
  buyItem: async (itemId: string) => {
    return apiRequest<{ item: any; remainingXp: number }>('/api/store/buy', {
      method: 'POST',
      body: JSON.stringify({ itemId })
    });
  },
  buyMysteryBox: async () => {
    return apiRequest<{ item: any; remainingXp: number }>('/api/store/mystery-box', {
      method: 'POST'
    });
  }
};

// ─── Limits API ────────────────────────────────────
export const limitsAPI = {
  getStatus: async () => {
    return apiRequest<{
      isPremium: boolean;
      limits: Record<string, { used: number; limit: number; remaining: number }>;
      resetAt?: string;
    }>('/api/limits');
  }
};
