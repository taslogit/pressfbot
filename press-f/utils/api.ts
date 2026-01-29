const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Get session ID from storage
function getSessionId(): string | null {
  try {
    return localStorage.getItem('lastmeme_session');
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

// API helper function
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...getHeaders(), ...options.headers },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Network error' }));
      return { ok: false, error: error.error || 'Request failed' };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    console.error(`API request error [${endpoint}]:`, e);
    return { ok: false, error: 'Network error' };
  }
}

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
  getAll: async (params?: QueryParams) => {
    return apiRequest<{ letters: any[] }>(`/api/letters${toQueryString(params)}`);
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
};

// Duels API
export const duelsAPI = {
  getAll: async (params?: QueryParams) => {
    return apiRequest<{ duels: any[] }>(`/api/duels${toQueryString(params)}`);
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
    return apiRequest<{ id: string }>(`/api/duels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(duel),
    });
  },
  delete: async (id: string) => {
    return apiRequest(`/api/duels/${id}`, {
      method: 'DELETE',
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
  get: async () => {
    return apiRequest<{ profile: any; settings: any }>('/api/profile');
  },
  update: async (profile: Partial<any>) => {
    return apiRequest('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  },
  checkIn: async () => {
    return apiRequest<{ timestamp: number; streak?: any; xp?: number }>('/api/profile/check-in', {
      method: 'POST',
    });
  },
  getStreak: async () => {
    return apiRequest<{ streak: any }>('/api/profile/streak');
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
  list: async () => {
    return apiRequest<{ events: any[] }>('/api/notifications');
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

export const tonAPI = {
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
