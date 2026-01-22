const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const INIT_DATA =
  process.env.INIT_DATA ||
  'user=%7B%22id%22%3A123%7D&hash=dev';

async function request(method, path, body, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${method} ${path}`);
    err.details = data;
    throw err;
  }

  return data;
}

async function waitForHealth(retries = 10, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await request('GET', '/api/health');
      return;
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function run() {
  console.log('Mini API smoke tests...');
  console.log(`API_BASE=${API_BASE}`);
  await waitForHealth();

  const verify = await request('POST', '/api/verify', { initData: INIT_DATA });
  const sessionId = verify?.sessionId;
  if (!sessionId) {
    throw new Error('Missing sessionId from /api/verify');
  }
  const authHeaders = { 'X-Session-Id': sessionId };

  // Letters
  const letterCreate = await request(
    'POST',
    '/api/letters',
    { title: 'Smoke Letter', content: 'Hello' },
    authHeaders
  );
  const letterId = letterCreate?.id;
  await request('GET', '/api/letters', null, authHeaders);
  await request('GET', `/api/letters/${letterId}`, null, authHeaders);
  await request(
    'PUT',
    `/api/letters/${letterId}`,
    { title: 'Smoke Letter Updated' },
    authHeaders
  );
  await request('DELETE', `/api/letters/${letterId}`, null, authHeaders);
  console.log('Letters OK');

  // Duels
  const duelCreate = await request(
    'POST',
    '/api/duels',
    { title: 'Smoke Duel', stake: 'Coffee' },
    authHeaders
  );
  const duelId = duelCreate?.id;
  await request('GET', '/api/duels', null, authHeaders);
  await request('GET', `/api/duels/${duelId}`, null, authHeaders);
  await request(
    'PUT',
    `/api/duels/${duelId}`,
    { status: 'active' },
    authHeaders
  );
  await request('DELETE', `/api/duels/${duelId}`, null, authHeaders);
  console.log('Duels OK');

  // Legacy
  const legacyCreate = await request(
    'POST',
    '/api/legacy',
    { type: 'ghost', title: 'Smoke Legacy', description: 'Test' },
    authHeaders
  );
  const legacyId = legacyCreate?.id;
  await request('GET', '/api/legacy', null, authHeaders);
  await request('GET', `/api/legacy/${legacyId}`, null, authHeaders);
  await request(
    'PUT',
    `/api/legacy/${legacyId}`,
    { isResolved: true },
    authHeaders
  );
  await request('DELETE', `/api/legacy/${legacyId}`, null, authHeaders);
  console.log('Legacy OK');

  console.log('✅ Mini API smoke tests passed');
}

run().catch((err) => {
  console.error('❌ Mini API smoke tests failed');
  console.error(err.message);
  if (err.details) {
    console.error('Details:', JSON.stringify(err.details));
  }
  process.exit(1);
});
