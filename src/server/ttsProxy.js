/**
 * Server-side HTTP handler for the Text-to-Speech (TTS) intermediary proxy scaffold.
 *
 * NOTE: This scaffold is INACTIVE and OUTSIDE the current delivery scope.
 * External TTS setup and audio generation are not part of this delivery unless
 * separately agreed; client supplies production content and audio files.
 * This scaffold is not production-ready: CORS origin filtering alone does not provide
 * user authentication, anti-abuse protection, or rate limiting.
 *
 * Security & Architectural Rules:
 * 1. Provider credentials (e.g. Google Cloud, OpenAI, Azure keys) are accessed ONLY
 *    here on the server via environment variables, never on the client.
 * 2. Origin validation enforces strict CORS headers against allowlisted origins,
 *    rejecting unauthorized browser cross-origin OPTIONS preflight AND POST requests with 403.
 * 3. Input validation enforces bounded string lengths and valid language codes.
 * 4. Pluggable provider adapter interface decouples the HTTP transport from
 *    the specific vendor.
 * 5. Returns 503 TTS_SERVICE_UNCONFIGURED if no vendor adapter or credentials exist.
 */

const MAX_TEXT_LENGTH = 1000;
const SUPPORTED_LANGUAGES = new Set(['zh', 'ja', 'zh-cn', 'zh-tw', 'ja-jp']);

export function resolveCorsHeaders(reqOrigin, allowedOriginsRaw = '') {
  const allowedList = allowedOriginsRaw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const normalizedReq = (reqOrigin || '').trim().replace(/\/+$/, '');
  const isAllowed = allowedList.includes(normalizedReq);

  return {
    isAllowed,
    headers: {
      'Access-Control-Allow-Origin': isAllowed ? reqOrigin : '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  };
}

export function createTtsHttpHandler({ getEnv, ttsAdapter = null } = {}) {
  return async function handleTtsRequest(request) {
    const env = (typeof getEnv === 'function' ? getEnv() : {}) || {};
    const allowedOrigins = env.ALLOWED_ORIGINS || '';
    const reqOrigin = request.headers.get('Origin') || request.headers.get('origin') || '';

    const cors = resolveCorsHeaders(reqOrigin, allowedOrigins);

    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      if (reqOrigin && !cors.isAllowed) {
        return new Response(JSON.stringify({ error: 'CORS_ORIGIN_DENIED' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, {
        status: 200,
        headers: cors.headers,
      });
    }

    // Response helper with CORS
    const jsonResponse = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...(cors.isAllowed ? { 'Access-Control-Allow-Origin': reqOrigin } : {}),
        },
      });

    // 2. Enforce POST
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED', message: 'Only POST and OPTIONS are supported.' });
    }

    // 3. Reject disallowed browser cross-origin requests before invoking adapter
    if (reqOrigin && !cors.isAllowed) {
      return new Response(JSON.stringify({ error: 'CORS_ORIGIN_DENIED', message: 'Origin not allowed by CORS policy.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Parse and validate body
    let body = null;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: 'INVALID_JSON', message: 'Request body must be valid JSON.' });
    }

    const { text, language, speed = 1.0 } = body || {};

    if (typeof text !== 'string' || text.trim().length === 0) {
      return jsonResponse(400, { error: 'MISSING_TEXT', message: 'Field "text" is required.' });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return jsonResponse(400, {
        error: 'TEXT_TOO_LONG',
        message: `Field "text" exceeds maximum length of ${MAX_TEXT_LENGTH} characters.`,
      });
    }

    const normLang = typeof language === 'string' ? language.trim().toLowerCase() : '';
    if (!SUPPORTED_LANGUAGES.has(normLang)) {
      return jsonResponse(400, {
        error: 'UNSUPPORTED_LANGUAGE',
        message: `Language "${language}" is not supported. Supported: zh, ja.`,
      });
    }

    const numSpeed = Number(speed);
    if (!Number.isFinite(numSpeed) || numSpeed < 0.5 || numSpeed > 2.0) {
      return jsonResponse(400, {
        error: 'INVALID_SPEED',
        message: 'Speed must be a number between 0.5 and 2.0.',
      });
    }

    // 4. Verify adapter availability
    if (!ttsAdapter || typeof ttsAdapter !== 'function') {
      return jsonResponse(503, {
        error: 'TTS_SERVICE_UNCONFIGURED',
        message: 'No external TTS provider configured on the server. Operator configuration required.',
      });
    }

    // 5. Invoke provider adapter
    try {
      const result = await ttsAdapter({
        text: text.trim(),
        language: normLang,
        speed: numSpeed,
        env,
      });

      if (!result || !result.audioBuffer) {
        return jsonResponse(502, {
          error: 'TTS_PROVIDER_EMPTY_RESPONSE',
          message: 'External TTS provider returned empty audio content.',
        });
      }

      return new Response(result.audioBuffer, {
        status: 200,
        headers: {
          'Content-Type': result.contentType || 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400, immutable',
          ...(cors.isAllowed ? { 'Access-Control-Allow-Origin': reqOrigin } : {}),
        },
      });
    } catch (err) {
      return jsonResponse(500, {
        error: 'TTS_SYNTHESIS_FAILED',
        message: err?.message || 'External TTS synthesis failed.',
      });
    }
  };
}

