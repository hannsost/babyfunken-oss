/**
 * Configuration is read once at startup and validated loudly. A baby
 * monitor that silently starts with a broken TURN config is worse than
 * one that refuses to boot, so anything misconfigured throws here.
 */

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function int(name, fallback) {
  const raw = optional(name, null);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return parsed;
}

function list(name, fallback = []) {
  const raw = optional(name, null);
  if (raw === null) return fallback;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function loadConfig(env = process.env) {
  const previous = process.env;
  process.env = env;
  try {
    const isProduction = optional('NODE_ENV', 'development') === 'production';

    const config = {
      isProduction,
      port: int('PORT', 8002),
      host: optional('HOST', '0.0.0.0'),

      /**
       * Exact origins allowed to reach the signaling socket. In production
       * this must be set — a wildcard would let any page on the internet
       * drive a socket on a user's behalf.
       */
      allowedOrigins: list('ALLOWED_ORIGINS', isProduction ? null : ['*']),

      /** Trust N proxy hops for client IPs. 1 behind a single ingress. */
      trustProxyHops: int('TRUST_PROXY_HOPS', 1),

      rateLimit: {
        joinAttempts: int('RATE_LIMIT_JOIN_ATTEMPTS', 10),
        joinWindowMs: int('RATE_LIMIT_JOIN_WINDOW_MS', 60_000),
        createPerHour: int('RATE_LIMIT_CREATE_PER_HOUR', 20),
        blockMs: int('RATE_LIMIT_BLOCK_MS', 15 * 60_000),
      },

      turn: {
        /**
         * coturn `static-auth-secret`. When set, the server issues
         * short-lived HMAC credentials instead of shipping a password
         * inside the app, where anyone could extract it.
         */
        secret: optional('TURN_SECRET', null),
        urls: list('TURN_URLS'),
        ttlSeconds: int('TURN_TTL_SECONDS', 12 * 3600),
      },

      stunUrls: list('STUN_URLS', [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ]),

      /** Serve the built webapp from the same process. */
      serveWebapp: optional('SERVE_WEBAPP', 'true') !== 'false',
    };

    if (isProduction) {
      if (!config.allowedOrigins || config.allowedOrigins.length === 0) {
        throw new Error('ALLOWED_ORIGINS must be set in production (comma-separated exact origins)');
      }
      if (config.allowedOrigins.includes('*')) {
        throw new Error('ALLOWED_ORIGINS must not be "*" in production');
      }
      if (!config.turn.secret || config.turn.urls.length === 0) {
        throw new Error(
          'TURN_SECRET and TURN_URLS must be set in production. ' +
          'Without a relay, connections fail on mobile networks. See docs/DEPLOYMENT.md'
        );
      }
    }

    return config;
  } finally {
    process.env = previous;
  }
}

export { required, optional, int, list };
