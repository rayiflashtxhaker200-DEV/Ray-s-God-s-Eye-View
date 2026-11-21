import { readRequestBodyCapped } from './common/request.js';
import {
  getSharedRemoteSqlStore,
  sanitizeProfileKey,
} from './remote-db.js';

const MAX_JSON_BODY_BYTES = 256 * 1024;

function extractClientIp(req) {
  const fwd = String(req.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  if (fwd && !/[\s]/.test(fwd)) return fwd.slice(0, 64);
  return String(req.socket?.remoteAddress || 'local').slice(0, 64);
}

function resolveAllowedOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  if (!origin) return { allowed: true, originHeader: '' };

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return { allowed: false, originHeader: '' };
  }
  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    return { allowed: false, originHeader: '' };
  }

  const envAllow = String(process.env.GEV_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (envAllow.includes(parsedOrigin.origin)) {
    return { allowed: true, originHeader: parsedOrigin.origin };
  }

  const hostHeader = String(req.headers?.host || '').trim().toLowerCase();
  const fwdHost = String(req.headers?.['x-forwarded-host'] || '')
    .trim()
    .toLowerCase();
  const safeFwdHost =
    fwdHost && !fwdHost.includes(',') && !/[\s/?#@\\]/.test(fwdHost)
      ? fwdHost
      : '';

  const originHost = parsedOrigin.host.toLowerCase();
  if (
    (hostHeader && originHost === hostHeader) ||
    (safeFwdHost && originHost === safeFwdHost)
  ) {
    return { allowed: true, originHeader: parsedOrigin.origin };
  }

  return { allowed: false, originHeader: '' };
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (v !== undefined && v !== null) res.setHeader(k, String(v));
  }
  res.end(JSON.stringify(payload));
}

async function readJsonPayload(req) {
  const raw = await readRequestBodyCapped(req, MAX_JSON_BODY_BYTES);
  const text = raw.toString('utf8').trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El cuerpo JSON debe ser un objeto válido.');
  }
  return parsed;
}

function extractBearerToken(req) {
  const auth = String(req.headers?.authorization || '').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

/**
 * Store facade backed by the local SQLite database (`remote-db.js`).
 */
export const remoteSessionStore = {
  getOrCreate(sessionName = 'default') {
    const store = getSharedRemoteSqlStore();
    return store.ensureWorkspaceUser(sessionName);
  },

  addCommand(sessionName = 'default', command, deviceName = 'anonymous') {
    const store = getSharedRemoteSqlStore();
    const user = store.ensureWorkspaceUser(sessionName);
    return store.addCommand({
      userId: user.id,
      deviceName,
      command,
    });
  },

  setCustomLocations(sessionName = 'default', locations = [], password = '') {
    const store = getSharedRemoteSqlStore();
    const user = store.ensureWorkspaceUser(sessionName);
    return store.replaceDestinations(user.id, locations, password);
  },

  getCustomLocationsForPassword(sessionName = 'default', password = '') {
    const store = getSharedRemoteSqlStore();
    const user = store.findUserByUsername(sessionName);
    if (!user) return [];
    return store.getDestinations(user.id, password);
  },

  getSession(sessionName = 'default', since = 0, password = '') {
    const store = getSharedRemoteSqlStore();
    const user = store.findUserByUsername(sessionName);
    if (!user) return null;
    return store.getSessionState({
      userId: user.id,
      since,
      profileKey: password,
    });
  },

  clear() {
    getSharedRemoteSqlStore().clearAll();
  },
};

/**
 * Create the HTTP middleware handler for `/api/remote/*`.
 * Accepts an optional `sqlStore` for isolated unit/integration tests.
 */
export function createRemoteMiddlewareHandler({ sqlStore } = {}) {
  const resolveStore = () => sqlStore || getSharedRemoteSqlStore();

  return async (req, res) => {
    const originCheck = resolveAllowedOrigin(req);
    if (originCheck.originHeader) {
      res.setHeader('Access-Control-Allow-Origin', originCheck.originHeader);
      res.setHeader('Vary', 'Origin');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PATCH, DELETE, OPTIONS',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization',
      );
    }

    if (!originCheck.allowed) {
      return sendJson(res, 403, {
        ok: false,
        error: 'Origen externo no autorizado para la API remota.',
      });
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }

    const url = new URL(req.url || '/', 'http://localhost');
    const pathname =
      url.pathname.length > 1 && url.pathname.endsWith('/')
        ? url.pathname.slice(0, -1)
        : url.pathname;
    const method = String(req.method || 'GET').toUpperCase();
    const ipHint = extractClientIp(req);
    const userAgent = String(req.headers?.['user-agent'] || '').slice(0, 180);
    const store = resolveStore();

    try {
      // GET /api/remote/health
      if (method === 'GET' && pathname === '/health') {
        return sendJson(res, 200, {
          ok: true,
          engine: 'sqlite',
          status: 'ready',
        });
      }

      // POST /api/remote/auth/register
      if (method === 'POST' && pathname === '/auth/register') {
        const body = await readJsonPayload(req);
        const result = store.registerUser({
          username: body.username,
          password: body.password,
          displayName: body.displayName,
          deviceName: body.deviceName || 'PC Principal',
          deviceType: body.deviceType || 'pc',
          ipHint,
          userAgent,
        });
        return sendJson(res, result.status || 400, result);
      }

      // POST /api/remote/auth/login
      if (method === 'POST' && pathname === '/auth/login') {
        const body = await readJsonPayload(req);
        const result = store.loginUser({
          username: body.username,
          password: body.password,
          deviceName: body.deviceName || 'Dispositivo',
          deviceType: body.deviceType || 'pc',
          ipHint,
          userAgent,
        });
        const extra = result.retryAfterSec
          ? { 'Retry-After': result.retryAfterSec }
          : {};
        return sendJson(res, result.status || 401, result, extra);
      }

      // POST /api/remote/pairing/claim (one-time QR token or 6-digit PIN)
      if (method === 'POST' && pathname === '/pairing/claim') {
        const body = await readJsonPayload(req);
        const result = store.claimPairing({
          username: body.username || body.sessionName,
          pairToken: body.pairToken,
          pin: body.pin,
          deviceName: body.deviceName || 'Móvil Remoto',
          deviceType: body.deviceType || 'mobile',
          ipHint,
          userAgent,
        });
        const extra = result.retryAfterSec
          ? { 'Retry-After': result.retryAfterSec }
          : {};
        return sendJson(res, result.status || 401, result, extra);
      }

      // All remaining endpoints require a valid Bearer session token
      const rawToken = extractBearerToken(req);
      const auth = store.authenticateBearer(rawToken);
      if (!auth) {
        return sendJson(res, 401, {
          ok: false,
          code: 'UNAUTHORIZED',
          error: 'Sesión no autenticada, expirada o revocada.',
        });
      }

      // POST /api/remote/auth/logout
      if (method === 'POST' && pathname === '/auth/logout') {
        const result = store.logoutToken(rawToken, ipHint);
        return sendJson(res, result.status, result);
      }

      // GET /api/remote/auth/me (accessible while pending so mobile can check approval)
      if (method === 'GET' && pathname === '/auth/me') {
        return sendJson(res, 200, {
          ok: true,
          user: auth.user,
          device: auth.device,
          pendingApproval: auth.deviceStatus === 'pending',
          session: {
            tokenId: auth.tokenId,
            role: auth.effectiveRole,
            status: auth.deviceStatus,
            expiresAt: auth.expiresAt,
          },
        });
      }

      // Enforce device approval for operational endpoints
      if (auth.deviceStatus !== 'approved') {
        return sendJson(res, 403, {
          ok: false,
          code: 'PENDING_APPROVAL',
          pendingApproval: auth.deviceStatus === 'pending',
          error: 'Dispositivo pendiente de aprobación por el administrador en el PC.',
        });
      }

      // POST /api/remote/auth/change-password (admin only)
      if (method === 'POST' && pathname === '/auth/change-password') {
        if (auth.effectiveRole !== 'admin') {
          return sendJson(res, 403, {
            ok: false,
            error: 'Solo un administrador puede cambiar la contraseña de la cuenta.',
          });
        }
        const body = await readJsonPayload(req);
        const result = store.changePassword({
          userId: auth.user.id,
          deviceId: auth.device?.id || null,
          actorName: auth.device?.deviceName || auth.user.username,
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
          revokeOtherSessions: Boolean(body.revokeOtherSessions),
          currentTokenHash: auth.tokenHash,
          ipHint,
        });
        return sendJson(res, result.status, result);
      }

      // POST /api/remote/pairing (admin only)
      if (method === 'POST' && pathname === '/pairing') {
        if (auth.effectiveRole !== 'admin') {
          return sendJson(res, 403, {
            ok: false,
            error: 'Solo el administrador puede generar códigos QR o PIN de vinculación.',
          });
        }
        const body = await readJsonPayload(req);
        const result = store.createPairingToken({
          userId: auth.user.id,
          createdByDeviceId: auth.device?.id || null,
          actorName: auth.device?.deviceName || auth.user.username,
          roleGrant: body.roleGrant === 'viewer' ? 'viewer' : 'operator',
          requiresApproval: Boolean(body.requiresApproval),
          ttlSeconds: Number(body.ttlSeconds) || 300,
          ipHint,
        });
        return sendJson(res, result.status, result);
      }

      // GET /api/remote/devices (admin only)
      if (method === 'GET' && pathname === '/devices') {
        if (auth.effectiveRole !== 'admin') {
          return sendJson(res, 403, {
            ok: false,
            error: 'Acceso restringido al administrador de la sesión.',
          });
        }
        const data = store.listDevicesAndAudit(auth.user.id);
        return sendJson(res, 200, {
          ok: true,
          currentDeviceId: auth.device?.id || null,
          ...data,
        });
      }

      // PATCH / DELETE /api/remote/devices/:id (admin only)
      const deviceMatch = /^\/devices\/([a-zA-Z0-9_-]{4,64})$/.exec(pathname);
      if (deviceMatch) {
        if (auth.effectiveRole !== 'admin') {
          return sendJson(res, 403, {
            ok: false,
            error: 'Solo el administrador puede gestionar dispositivos.',
          });
        }
        const targetDeviceId = deviceMatch[1];
        if (method === 'PATCH') {
          const body = await readJsonPayload(req);
          const result = store.updateDevice({
            userId: auth.user.id,
            targetDeviceId,
            actorDeviceId: auth.device?.id || null,
            actorName: auth.device?.deviceName || auth.user.username,
            status: body.status,
            role: body.role,
            deviceName: body.deviceName,
            ipHint,
          });
          return sendJson(res, result.status, result);
        }
        if (method === 'DELETE') {
          const result = store.deleteDevice({
            userId: auth.user.id,
            targetDeviceId,
            actorDeviceId: auth.device?.id || null,
            actorName: auth.device?.deviceName || auth.user.username,
            ipHint,
          });
          return sendJson(res, result.status, result);
        }
      }

      // GET /api/remote/monitor (Control / Operator / Admin read-only SQL monitor)
      if (method === 'GET' && pathname === '/monitor') {
        const snapshot = store.getSqlMonitorSnapshot(auth.user.id);
        return sendJson(res, 200, {
          ok: true,
          engine: 'sqlite',
          role: auth.effectiveRole,
          user: auth.user,
          device: auth.device,
          ...snapshot,
        });
      }

      // DELETE /api/remote/audit or /api/remote/audit/:id (admin only)
      if (method === 'DELETE' && pathname === '/audit') {
        if (auth.effectiveRole !== 'admin') {
          return sendJson(res, 403, {
            ok: false,
            error: 'Solo el administrador puede limpiar la consola de cambios.',
          });
        }
        const result = store.clearAuditLogs({ userId: auth.user.id });
        return sendJson(res, result.status, result);
      }

      const auditMatch = /^\/audit\/(\d{1,12})$/.exec(pathname);
      if (auditMatch && method === 'DELETE') {
        if (auth.effectiveRole !== 'admin') {
          return sendJson(res, 403, {
            ok: false,
            error: 'Solo el administrador puede eliminar registros de la consola.',
          });
        }
        const result = store.deleteAuditLog({
          userId: auth.user.id,
          auditId: Number(auditMatch[1]),
        });
        return sendJson(res, result.status, result);
      }

      // GET / POST /api/remote/session
      if (pathname === '/session' || pathname === '/') {
        if (method === 'GET') {
          const since = Number(url.searchParams.get('since') || 0);
          const profileKey = sanitizeProfileKey(
            url.searchParams.get('profile') ??
              url.searchParams.get('password') ??
              url.searchParams.get('pass') ??
              '',
          );
          const state = store.getSessionState({
            userId: auth.user.id,
            since,
            profileKey,
          });
          return sendJson(res, 200, {
            ok: true,
            role: auth.effectiveRole,
            device: auth.device,
            ...(state || {
              sessionName: auth.user.username,
              devices: [],
              commands: [],
              customLocations: [],
              lastActiveAt: Date.now(),
            }),
          });
        }

        if (method === 'POST') {
          if (auth.effectiveRole === 'viewer') {
            store.logDeniedCommand({
              userId: auth.user.id,
              deviceId: auth.device?.id || null,
              actorName: auth.device?.deviceName || auth.user.username,
              action: 'session_mutation',
              role: auth.effectiveRole,
              ipHint,
            });
            return sendJson(res, 403, {
              ok: false,
              code: 'READ_ONLY_VIEWER',
              error:
                'Este dispositivo está en modo "Control" (monitor SQL). Pide permisos de Operador en el PC para enviar comandos.',
            });
          }

          const payload = await readJsonPayload(req);
          const profileKey = sanitizeProfileKey(
            payload.profile ?? payload.password ?? payload.pass ?? '',
          );

          if (Array.isArray(payload.customLocations)) {
            store.replaceDestinations(
              auth.user.id,
              payload.customLocations,
              profileKey,
            );
          }

          let command = null;
          if (payload.command) {
            command = store.addCommand({
              userId: auth.user.id,
              deviceId: auth.device?.id || null,
              deviceName:
                auth.device?.deviceName ||
                payload.deviceName ||
                auth.user.username,
              command: payload.command,
            });
            if (
              payload.command.action === 'sync_custom_locations' &&
              Array.isArray(payload.command.args?.locations)
            ) {
              store.replaceDestinations(
                auth.user.id,
                payload.command.args.locations,
                payload.command.args.profile ??
                  payload.command.args.password ??
                  profileKey,
              );
            }
          }

          return sendJson(res, 200, {
            ok: true,
            sessionName: auth.user.username,
            role: auth.effectiveRole,
            commandId: command ? command.id : null,
            command,
            customLocations: store.getDestinations(auth.user.id, profileKey),
          });
        }
      }

      return sendJson(res, 404, {
        ok: false,
        error: 'Ruta remota no encontrada.',
      });
    } catch (err) {
      if (err?.code === 'BODY_TOO_LARGE') {
        return sendJson(res, 413, {
          ok: false,
          error: 'El cuerpo de la petición excede el límite permitido.',
        });
      }
      return sendJson(res, 400, {
        ok: false,
        error: err?.message || 'Error al procesar la petición remota.',
      });
    }
  };
}

/** Vite / HTTP server middleware plugin for `/api/remote/*` */
export function remoteSessionPlugin(options = {}) {
  const handler = createRemoteMiddlewareHandler(options);
  return {
    name: 'remote-session-plugin',
    configureServer(server) {
      server.middlewares.use('/api/remote', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/remote', handler);
    },
  };
}
