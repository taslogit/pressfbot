// Unit tests for authentication middleware
// 5.5.4.6: Fill auth tests (replace TODO placeholders)

const { createAuthMiddleware } = require('../middleware/auth');

describe('Authentication', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  let mockPool;

  beforeEach(() => {
    mockNext = jest.fn();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn()
    };
    mockReq = {
      path: '/api/test',
      method: 'GET',
      headers: {},
      cookies: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    mockPool = {
      query: jest.fn()
    };
  });

  test('should require session ID when no header or cookie', async () => {
    mockReq.headers['x-session-id'] = '';
    mockReq.cookies = {};
    const auth = createAuthMiddleware(mockPool);
    await auth(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'AUTH_REQUIRED',
          message: expect.any(String)
        })
      })
    );
    expect(mockPool.query).not.toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should reject invalid session ID (no row from DB)', async () => {
    mockReq.headers['x-session-id'] = 'invalid-session-uuid';
    mockPool.query.mockResolvedValue({ rowCount: 0, rows: [] });
    const auth = createAuthMiddleware(mockPool);
    await auth(mockReq, mockRes, mockNext);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT telegram_id'),
      ['invalid-session-uuid']
    );
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'AUTH_INVALID',
          message: expect.any(String)
        })
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should reject expired session', async () => {
    const sessionId = 'valid-uuid-but-expired';
    mockReq.headers['x-session-id'] = sessionId;
    const expiredDate = new Date(Date.now() - 86400 * 1000);
    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ telegram_id: 12345, expires_at: expiredDate, last_seen_at: expiredDate }]
      })
      .mockResolvedValueOnce({ rowCount: 0 });
    const auth = createAuthMiddleware(mockPool);
    await auth(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'SESSION_EXPIRED',
          message: expect.any(String)
        })
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should set userId and sessionId and call next when session valid', async () => {
    const sessionId = 'valid-session-uuid';
    mockReq.headers['x-session-id'] = sessionId;
    const futureExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockPool.query.mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          telegram_id: 98765,
          expires_at: futureExpires,
          last_seen_at: new Date()
        }
      ]
    });
    const auth = createAuthMiddleware(mockPool);
    await auth(mockReq, mockRes, mockNext);
    expect(mockReq.userId).toBe(98765);
    expect(mockReq.sessionId).toBe(sessionId);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  test('should accept session from cookie when x-session-id missing', async () => {
    mockReq.headers['x-session-id'] = undefined;
    mockReq.cookies = { sessionId: 'cookie-session-id' };
    const futureExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockPool.query.mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          telegram_id: 11111,
          expires_at: futureExpires,
          last_seen_at: new Date()
        }
      ]
    });
    const auth = createAuthMiddleware(mockPool);
    await auth(mockReq, mockRes, mockNext);
    expect(mockReq.userId).toBe(11111);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.any(String),
      ['cookie-session-id']
    );
  });

  test('when pool is null (dev mode) should set userId null and call next', async () => {
    mockReq.headers['x-session-id'] = 'any-id';
    const auth = createAuthMiddleware(null);
    await auth(mockReq, mockRes, mockNext);
    expect(mockReq.userId).toBeNull();
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  test('should strip surrounding double quotes from sessionId', async () => {
    mockReq.headers['x-session-id'] = '"quoted-session-id"';
    const futureExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockPool.query.mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          telegram_id: 22222,
          expires_at: futureExpires,
          last_seen_at: new Date()
        }
      ]
    });
    const auth = createAuthMiddleware(mockPool);
    await auth(mockReq, mockRes, mockNext);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.any(String),
      ['quoted-session-id']
    );
    expect(mockReq.userId).toBe(22222);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
