/**
 * Unit tests for adaptive rate limit utility
 */
const {
  record,
  getFactor,
  getAdaptiveMax,
  adaptiveTrackingMiddleware,
  ADAPTIVE_WINDOW_MS
} = require('../../../utils/adaptiveRateLimit');

describe('adaptiveRateLimit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getFactor', () => {
    test('returns 1 when no data for IP', () => {
      expect(getFactor('1.2.3.4')).toBe(1);
    });

    test('returns 0.25 after many 5xx or rate_limit or 4xx', () => {
      const ip = '1.2.3.4';
      for (let i = 0; i < 5; i++) record(ip, '5xx');
      expect(getFactor(ip)).toBe(0.25);
    });

    test('returns 0.5 after moderate errors', () => {
      const ip = '1.2.3.5';
      for (let i = 0; i < 4; i++) record(ip, 'rate_limit');
      expect(getFactor(ip)).toBe(0.5);
    });

    test('returns 1 when window expired', () => {
      const ip = '1.2.3.6';
      record(ip, '5xx');
      record(ip, '5xx');
      jest.advanceTimersByTime(ADAPTIVE_WINDOW_MS + 1);
      expect(getFactor(ip)).toBe(1);
    });
  });

  describe('getAdaptiveMax', () => {
    test('returns baseMax when factor is 1', () => {
      expect(getAdaptiveMax({ ip: '9.9.9.9' }, 20)).toBe(20);
    });

    test('returns floor(baseMax * 0.5) when factor 0.5', () => {
      const ip = '1.2.3.7';
      for (let i = 0; i < 4; i++) record(ip, 'rate_limit');
      expect(getAdaptiveMax({ ip }, 20)).toBe(10);
    });

    test('returns at least 1', () => {
      const ip = '1.2.3.8';
      for (let i = 0; i < 10; i++) record(ip, 'rate_limit');
      expect(getAdaptiveMax({ ip }, 2)).toBe(1);
    });
  });

  describe('record', () => {
    test('increments 4xx count', () => {
      const ip = '2.2.2.2';
      record(ip, '4xx');
      record(ip, '4xx');
      record(ip, '4xx');
      expect(getFactor(ip)).toBe(1);
      for (let i = 0; i < 14; i++) record(ip, '4xx');
      expect(getFactor(ip)).toBe(0.5);
    });
  });

  describe('adaptiveTrackingMiddleware', () => {
    test('calls next() and attaches finish listener', () => {
      const req = { ip: '3.3.3.3' };
      const res = { on: jest.fn(), statusCode: 200 };
      const next = jest.fn();
      adaptiveTrackingMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    test('on finish with 429 calls record with rate_limit', () => {
      const ip = '4.4.4.4';
      const req = { ip };
      const finishCbs = [];
      const res = {
        on: (ev, fn) => { if (ev === 'finish') finishCbs.push(fn); },
        statusCode: 429
      };
      const next = jest.fn();
      adaptiveTrackingMiddleware(req, res, next);
      expect(finishCbs.length).toBe(1);
      finishCbs[0]();
      expect(getFactor(ip)).toBe(1);
      for (let i = 0; i < 9; i++) finishCbs[0]();
      expect(getFactor(ip)).toBe(0.25);
    });
  });
});
