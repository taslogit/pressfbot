/**
 * 5.5.2.8: EXPLAIN ANALYZE for slow queries in production
 * Wraps pool.query to log EXPLAIN (ANALYZE, BUFFERS) when a query exceeds a threshold.
 * Only enabled in production or when ENABLE_SLOW_QUERY_EXPLAIN=1.
 */

const logger = require('./logger');

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 1000;
const ENABLED = process.env.NODE_ENV === 'production' || process.env.ENABLE_SLOW_QUERY_EXPLAIN === '1';

function isSelectOnly(text) {
  const t = (text || '').trim().toUpperCase();
  return t.startsWith('SELECT') && !t.includes('INSERT') && !t.includes('UPDATE') && !t.includes('DELETE');
}

/**
 * Run EXPLAIN (ANALYZE, BUFFERS) for SELECT, or EXPLAIN for other statements (no ANALYZE to avoid double execution).
 * @param {Pool} pool
 * @param {string} query
 * @param {Array} params
 * @returns {Promise<{ plan: string, error?: string }>}
 */
async function runExplain(pool, query, params = []) {
  if (!pool || !query) return { plan: '', error: 'no pool or query' };
  const useAnalyze = isSelectOnly(query);
  const explainQuery = useAnalyze
    ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`
    : `EXPLAIN (FORMAT TEXT) ${query}`;
  try {
    const res = await pool.query(explainQuery, params);
    const plan = (res.rows || []).map((r) => r['QUERY PLAN'] || r.query_plan || (r && Object.values(r)[0]) || '').join('\n');
    return { plan };
  } catch (err) {
    return { plan: '', error: err?.message || String(err) };
  }
}

/**
 * Wrap pool.query to log slow query plans via EXPLAIN ANALYZE.
 * @param {import('pg').Pool} pool
 * @param {{ slowQueryMs?: number, enabled?: boolean }} options
 * @returns {void}
 */
function wrapPoolForSlowQueryExplain(pool, options = {}) {
  if (!pool || typeof pool.query !== 'function') return;
  const enabled = options.enabled !== undefined ? options.enabled : ENABLED;
  const thresholdMs = options.slowQueryMs !== undefined ? options.slowQueryMs : SLOW_QUERY_MS;
  if (!enabled) return;

  const originalQuery = pool.query.bind(pool);
  pool.query = function (query, paramsOrCb, maybeCb) {
    const start = Date.now();
    const isConfig = query && typeof query === 'object' && 'text' in query;
    const text = typeof query === 'string' ? query : (isConfig ? query.text : '');
    const params = isConfig ? (query.values || []) : (Array.isArray(paramsOrCb) ? paramsOrCb : []);
    const callback = typeof paramsOrCb === 'function' ? paramsOrCb : maybeCb;
    const hasCb = typeof paramsOrCb === 'function' || typeof maybeCb === 'function';

    const handleDone = () => {
      const duration = Date.now() - start;
      if (duration >= thresholdMs && text) {
        runExplain(pool, text, params)
          .then(({ plan, error }) => {
            logger.warn('Slow query EXPLAIN', null, {
              durationMs: duration,
              thresholdMs,
              queryPreview: text.substring(0, 200),
              paramCount: params.length,
              explainPlan: plan || undefined,
              explainError: error || undefined,
            });
          })
          .catch((err) => logger.warn('Slow query EXPLAIN failed', err, { durationMs: duration }));
      }
    };

    if (hasCb && typeof callback === 'function') {
      const wrapped = (err, res) => {
        handleDone();
        callback(err, res);
      };
      return originalQuery(query, params, wrapped);
    }
    const result = originalQuery(query, params);
    if (result && typeof result.then === 'function') {
      result.then(handleDone, () => {}).catch(() => {});
    }
    return result;
  };
}

module.exports = {
  wrapPoolForSlowQueryExplain,
  runExplain,
  SLOW_QUERY_MS,
  ENABLED,
};
