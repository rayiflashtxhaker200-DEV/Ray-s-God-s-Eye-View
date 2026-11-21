import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_RELATIVE_PATH = path.join('data', 'remote-users.sqlite');

export const VALID_USER_ROLES = new Set(['admin', 'operator', 'viewer']);
export const VALID_DEVICE_TYPES = new Set(['pc', 'mobile', 'tablet']);
export const VALID_DEVICE_STATUSES = new Set(['pending', 'approved', 'revoked']);

const ROLE_DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const AUTH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const AUTH_MAX_FAILURES = 6;
const AUTH_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const COMMAND_RETENTION_CAP = 120;
const AUDIT_RETENTION_CAP = 300;

const USERNAME_RE = /^[a-zA-Z0-9_.-]{4,32}$/;

function resolveSigningSecret() {
  const fromEnv =
    process.env.REMOTE_AUTH_SECRET || process.env.SESSION_SECRET || '';
  if (fromEnv.trim().length >= 16) {
    return fromEnv.trim();
  }
  if (!globalThis.__gevRemoteAuthEphemeralSecret) {
    globalThis.__gevRemoteAuthEphemeralSecret = crypto
      .randomBytes(32)
      .toString('hex');
  }
  return globalThis.__gevRemoteAuthEphemeralSecret;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hmacHex(secret, value) {
  return crypto
    .createHmac('sha256', String(secret))
    .update(String(value))
    .digest('hex');
}

function timingSafeHexEqual(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string') return false;
  if (aHex.length !== bHex.length || aHex.length === 0) return false;
  try {
    const aBuf = Buffer.from(aHex, 'hex');
    const bBuf = Buffer.from(bHex, 'hex');
    if (aBuf.length !== bBuf.length || aBuf.length === 0) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

export function hashPasswordScrypt(password, salt = crypto.randomBytes(16).toString('hex')) {
  const clean = String(password ?? '');
  const hash = crypto.scryptSync(clean, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPasswordScrypt(password, expectedHash, salt) {
  if (!expectedHash || !salt) return false;
  const computed = crypto.scryptSync(String(password ?? ''), salt, 64).toString('hex');
  return timingSafeHexEqual(computed, expectedHash);
}

export function normalizeUsername(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

export function validateUsername(raw) {
  const normalized = normalizeUsername(raw);
  if (!USERNAME_RE.test(normalized)) {
    return {
      ok: false,
      error:
        'El usuario debe tener entre 4 y 32 caracteres (letras, números, ".", "_" o "-").',
    };
  }
  return { ok: true, username: normalized };
}

export function validatePasswordStrength(password) {
  const raw = String(password ?? '');
  if (raw.length < 6 || raw.length > 128) {
    return {
      ok: false,
      error: 'La contraseña debe tener entre 6 y 128 caracteres.',
    };
  }
  return { ok: true };
}

export function sanitizeDeviceName(raw, fallback = 'Dispositivo') {
  const clean = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 48);
  return clean || fallback;
}

export function sanitizeProfileKey(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 64);
}

export function sanitizeLocationList(locations) {
  if (!Array.isArray(locations)) return [];
  const out = [];
  for (let i = 0; i < Math.min(locations.length, 200); i++) {
    const loc = locations[i];
    if (!loc || typeof loc !== 'object') continue;
    const lat = Number(loc.lat ?? loc.latitude);
    const lon = Number(loc.lon ?? loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const rawHeight = Number(loc.height ?? loc.rangeM ?? 15000);
    const height = Number.isFinite(rawHeight)
      ? Math.max(100, Math.min(25000000, rawHeight))
      : 15000;
    const name =
      String(loc.name || 'Destino')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 80) || 'Destino';
    const id =
      String(loc.id || `loc_${Date.now()}_${i}`)
        .replace(/[^a-zA-Z0-9_.-]/g, '')
        .slice(0, 64) || `loc_${i}`;
    out.push({ id, name, lat, lon, height });
  }
  return out;
}

function makeSignedSessionToken() {
  const tokenId = crypto.randomBytes(12).toString('hex');
  const secretNonce = crypto.randomBytes(24).toString('hex');
  const sig = hmacHex(resolveSigningSecret(), `${tokenId}.${secretNonce}`);
  const rawToken = `gev1.${tokenId}.${secretNonce}.${sig}`;
  return {
    tokenId,
    rawToken,
    tokenHash: sha256Hex(rawToken),
  };
}

export function verifySignedTokenFormat(rawToken) {
  if (typeof rawToken !== 'string') return null;
  const parts = rawToken.trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'gev1') return null;
  const [, tokenId, secretNonce, sig] = parts;
  if (!tokenId || !secretNonce || !sig) return null;
  const expectedSig = hmacHex(resolveSigningSecret(), `${tokenId}.${secretNonce}`);
  if (!timingSafeHexEqual(sig, expectedSig)) return null;
  return {
    tokenId,
    tokenHash: sha256Hex(rawToken.trim()),
  };
}

function generateNumericPin() {
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, '0');
}

function defaultDbFilePath() {
  const configured = String(process.env.GEV_REMOTE_DB_PATH || '').trim();
  if (configured) {
    return configured === ':memory:' ? ':memory:' : path.resolve(configured);
  }
  return path.resolve(process.cwd(), DEFAULT_DB_RELATIVE_PATH);
}

function openSqliteDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  initSchema(db);
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'operator', 'viewer')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS remote_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES remote_users(id) ON DELETE CASCADE,
      device_name TEXT NOT NULL,
      device_type TEXT NOT NULL DEFAULT 'mobile' CHECK (device_type IN ('pc', 'mobile', 'tablet')),
      role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'viewer')),
      status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'revoked')),
      ip_hint TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      last_seen_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_remote_devices_user ON remote_devices(user_id, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS remote_sessions (
      token_hash TEXT PRIMARY KEY,
      token_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES remote_users(id) ON DELETE CASCADE,
      device_id TEXT REFERENCES remote_devices(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      ip_hint TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_remote_sessions_user ON remote_sessions(user_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_remote_sessions_device ON remote_sessions(device_id);

    CREATE TABLE IF NOT EXISTS remote_pairing_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES remote_users(id) ON DELETE CASCADE,
      created_by_device_id TEXT,
      role_grant TEXT NOT NULL DEFAULT 'operator' CHECK (role_grant IN ('operator', 'viewer')),
      requires_approval INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      consumed_by_device_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_remote_pairing_user ON remote_pairing_tokens(user_id, expires_at);

    CREATE TABLE IF NOT EXISTS remote_destinations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES remote_users(id) ON DELETE CASCADE,
      profile_key TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      height REAL NOT NULL DEFAULT 15000,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_remote_destinations_scope ON remote_destinations(user_id, profile_key, sort_order);

    CREATE TABLE IF NOT EXISTS remote_commands (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES remote_users(id) ON DELETE CASCADE,
      device_id TEXT,
      device_name TEXT NOT NULL DEFAULT 'anonymous',
      action TEXT NOT NULL,
      args_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_remote_commands_poll ON remote_commands(user_id, created_at);

    CREATE TABLE IF NOT EXISTS remote_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES remote_users(id) ON DELETE CASCADE,
      actor_device_id TEXT,
      actor_name TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      ip_hint TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_remote_audit_user ON remote_audit_logs(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS remote_auth_attempts (
      attempt_key TEXT PRIMARY KEY,
      fail_count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL,
      locked_until INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function publicUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
  };
}

function publicDeviceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    deviceName: row.device_name,
    deviceType: row.device_type,
    role: row.role,
    status: row.status,
    ipHint: row.ip_hint || '',
    lastSeen: row.last_seen_at,
    createdAt: row.created_at,
  };
}

export function createRemoteSqlStore({ dbPath } = {}) {
  let activeDbPath = dbPath || defaultDbFilePath();
  let db = openSqliteDatabase(activeDbPath);

  function runInTransaction(fn) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        /* ignore rollback failure */
      }
      throw err;
    }
  }

  function appendAuditLog({
    userId = null,
    actorDeviceId = null,
    actorName = '',
    eventType,
    detail = {},
    ipHint = '',
    now = Date.now(),
  }) {
    db.prepare(
      `INSERT INTO remote_audit_logs (user_id, actor_device_id, actor_name, event_type, detail_json, ip_hint, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      actorDeviceId,
      String(actorName || '').slice(0, 64),
      String(eventType || 'event').slice(0, 48),
      JSON.stringify(detail || {}),
      String(ipHint || '').slice(0, 64),
      now,
    );

    if (userId) {
      db.prepare(
        `DELETE FROM remote_audit_logs
         WHERE user_id = ?
           AND id NOT IN (
             SELECT id FROM remote_audit_logs
             WHERE user_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?
           )`,
      ).run(userId, userId, AUDIT_RETENTION_CAP);
    }
  }

  function checkRateLimit(attemptKey, now = Date.now()) {
    const row = db
      .prepare(
        `SELECT attempt_key, fail_count, window_start, locked_until
         FROM remote_auth_attempts WHERE attempt_key = ?`,
      )
      .get(attemptKey);
    if (!row) return { blocked: false, retryAfterSec: 0 };
    if (row.locked_until > now) {
      return {
        blocked: true,
        retryAfterSec: Math.max(1, Math.ceil((row.locked_until - now) / 1000)),
      };
    }
    if (now - row.window_start > AUTH_WINDOW_MS) {
      db.prepare(`DELETE FROM remote_auth_attempts WHERE attempt_key = ?`).run(
        attemptKey,
      );
    }
    return { blocked: false, retryAfterSec: 0 };
  }

  function recordAuthFailure(attemptKey, now = Date.now()) {
    const row = db
      .prepare(
        `SELECT attempt_key, fail_count, window_start, locked_until
         FROM remote_auth_attempts WHERE attempt_key = ?`,
      )
      .get(attemptKey);
    if (!row || now - row.window_start > AUTH_WINDOW_MS) {
      db.prepare(
        `INSERT OR REPLACE INTO remote_auth_attempts (attempt_key, fail_count, window_start, locked_until)
         VALUES (?, 1, ?, 0)`,
      ).run(attemptKey, now);
      return { failCount: 1, lockedUntil: 0 };
    }
    const nextCount = row.fail_count + 1;
    const lockedUntil =
      nextCount >= AUTH_MAX_FAILURES ? now + AUTH_LOCKOUT_MS : 0;
    db.prepare(
      `UPDATE remote_auth_attempts
       SET fail_count = ?, locked_until = ?
       WHERE attempt_key = ?`,
    ).run(nextCount, lockedUntil, attemptKey);
    return { failCount: nextCount, lockedUntil };
  }

  function clearAuthFailures(attemptKey) {
    db.prepare(`DELETE FROM remote_auth_attempts WHERE attempt_key = ?`).run(
      attemptKey,
    );
  }

  function issueSessionForDevice({
    userId,
    deviceId,
    role,
    ipHint = '',
    userAgent = '',
    ttlMs = ROLE_DEFAULT_SESSION_TTL_MS,
    now = Date.now(),
  }) {
    const { tokenId, rawToken, tokenHash } = makeSignedSessionToken();
    const expiresAt = now + ttlMs;
    db.prepare(
      `INSERT INTO remote_sessions (
         token_hash, token_id, user_id, device_id, role, expires_at, revoked_at, ip_hint, user_agent, created_at, last_used_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    ).run(
      tokenHash,
      tokenId,
      userId,
      deviceId,
      role,
      expiresAt,
      String(ipHint || '').slice(0, 64),
      String(userAgent || '').slice(0, 180),
      now,
      now,
    );
    // Prune expired sessions for this user
    db.prepare(
      `DELETE FROM remote_sessions WHERE user_id = ? AND expires_at < ?`,
    ).run(userId, now - 60 * 60 * 1000);
    return { token: rawToken, tokenId, expiresAt };
  }

  function registerUser({
    username,
    password,
    displayName = '',
    deviceName = 'PC Principal',
    deviceType = 'pc',
    ipHint = '',
    userAgent = '',
  }) {
    const uCheck = validateUsername(username);
    if (!uCheck.ok) return { ok: false, status: 400, error: uCheck.error };

    const pCheck = validatePasswordStrength(password);
    if (!pCheck.ok) return { ok: false, status: 400, error: pCheck.error };

    const cleanDeviceType = VALID_DEVICE_TYPES.has(deviceType)
      ? deviceType
      : 'pc';
    const cleanDeviceName = sanitizeDeviceName(deviceName, 'PC Principal');
    const cleanDisplayName =
      String(displayName || '').trim().slice(0, 48) || uCheck.username;
    const now = Date.now();
    const { hash, salt } = hashPasswordScrypt(password);

    return runInTransaction(() => {
      const existing = db
        .prepare(`SELECT id FROM remote_users WHERE username = ?`)
        .get(uCheck.username);
      if (existing) {
        return {
          ok: false,
          status: 409,
          error: 'Ese nombre de usuario ya existe. Inicia sesión con tu contraseña.',
        };
      }

      const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(
        `INSERT INTO remote_users (
           id, username, display_name, password_hash, password_salt, role, is_active, created_at, updated_at, last_login_at
         ) VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?, ?)`,
      ).run(userId, uCheck.username, cleanDisplayName, hash, salt, now, now, now);

      const deviceId = `dev_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(
        `INSERT INTO remote_devices (
           id, user_id, device_name, device_type, role, status, ip_hint, user_agent, last_seen_at, created_at
         ) VALUES (?, ?, ?, ?, 'admin', 'approved', ?, ?, ?, ?)`,
      ).run(
        deviceId,
        userId,
        cleanDeviceName,
        cleanDeviceType,
        String(ipHint || '').slice(0, 64),
        String(userAgent || '').slice(0, 180),
        now,
        now,
      );

      const session = issueSessionForDevice({
        userId,
        deviceId,
        role: 'admin',
        ipHint,
        userAgent,
        now,
      });

      appendAuditLog({
        userId,
        actorDeviceId: deviceId,
        actorName: cleanDeviceName,
        eventType: 'user_registered',
        detail: { username: uCheck.username, deviceType: cleanDeviceType },
        ipHint,
        now,
      });

      const userRow = db
        .prepare(`SELECT * FROM remote_users WHERE id = ?`)
        .get(userId);
      const deviceRow = db
        .prepare(`SELECT * FROM remote_devices WHERE id = ?`)
        .get(deviceId);

      return {
        ok: true,
        status: 201,
        token: session.token,
        expiresAt: session.expiresAt,
        user: publicUserRow(userRow),
        device: publicDeviceRow(deviceRow),
      };
    });
  }

  function loginUser({
    username,
    password,
    deviceName = 'Navegador',
    deviceType = 'pc',
    ipHint = '',
    userAgent = '',
  }) {
    const uCheck = validateUsername(username);
    if (!uCheck.ok) {
      return { ok: false, status: 400, error: uCheck.error };
    }
    const now = Date.now();
    const rateKey = `login:${ipHint || 'local'}:${uCheck.username}`;
    const limit = checkRateLimit(rateKey, now);
    if (limit.blocked) {
      return {
        ok: false,
        status: 429,
        retryAfterSec: limit.retryAfterSec,
        error: `Demasiados intentos fallidos. Espera ${limit.retryAfterSec}s antes de volver a intentar.`,
      };
    }

    const userRow = db
      .prepare(`SELECT * FROM remote_users WHERE username = ?`)
      .get(uCheck.username);

    if (!userRow || !userRow.is_active) {
      recordAuthFailure(rateKey, now);
      return {
        ok: false,
        status: 401,
        error: 'Usuario o contraseña incorrectos.',
      };
    }

    const valid = verifyPasswordScrypt(
      password,
      userRow.password_hash,
      userRow.password_salt,
    );
    if (!valid) {
      recordAuthFailure(rateKey, now);
      appendAuditLog({
        userId: userRow.id,
        actorName: sanitizeDeviceName(deviceName, 'Desconocido'),
        eventType: 'login_failed',
        detail: { reason: 'bad_password' },
        ipHint,
        now,
      });
      return {
        ok: false,
        status: 401,
        error: 'Usuario o contraseña incorrectos.',
      };
    }

    clearAuthFailures(rateKey);
    const cleanDeviceType = VALID_DEVICE_TYPES.has(deviceType)
      ? deviceType
      : 'pc';
    const cleanDeviceName = sanitizeDeviceName(
      deviceName,
      cleanDeviceType === 'pc' ? 'PC Principal' : 'Dispositivo Móvil',
    );
    const deviceRole = cleanDeviceType === 'pc' ? userRow.role : 'operator';

    return runInTransaction(() => {
      db.prepare(
        `UPDATE remote_users SET last_login_at = ?, updated_at = ? WHERE id = ?`,
      ).run(now, now, userRow.id);

      const deviceId = `dev_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(
        `INSERT INTO remote_devices (
           id, user_id, device_name, device_type, role, status, ip_hint, user_agent, last_seen_at, created_at
         ) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`,
      ).run(
        deviceId,
        userRow.id,
        cleanDeviceName,
        cleanDeviceType,
        deviceRole,
        String(ipHint || '').slice(0, 64),
        String(userAgent || '').slice(0, 180),
        now,
        now,
      );

      const session = issueSessionForDevice({
        userId: userRow.id,
        deviceId,
        role: deviceRole,
        ipHint,
        userAgent,
        now,
      });

      appendAuditLog({
        userId: userRow.id,
        actorDeviceId: deviceId,
        actorName: cleanDeviceName,
        eventType: 'login_success',
        detail: { deviceType: cleanDeviceType, role: deviceRole },
        ipHint,
        now,
      });

      const freshUser = db
        .prepare(`SELECT * FROM remote_users WHERE id = ?`)
        .get(userRow.id);
      const deviceRow = db
        .prepare(`SELECT * FROM remote_devices WHERE id = ?`)
        .get(deviceId);

      return {
        ok: true,
        status: 200,
        token: session.token,
        expiresAt: session.expiresAt,
        user: publicUserRow(freshUser),
        device: publicDeviceRow(deviceRow),
      };
    });
  }

  function authenticateBearer(rawToken) {
    const parsed = verifySignedTokenFormat(rawToken);
    if (!parsed) return null;
    const now = Date.now();
    const row = db
      .prepare(
        `SELECT
           s.token_hash AS s_token_hash,
           s.token_id AS s_token_id,
           s.user_id AS s_user_id,
           s.device_id AS s_device_id,
           s.role AS s_role,
           s.expires_at AS s_expires_at,
           s.revoked_at AS s_revoked_at,
           u.username AS u_username,
           u.display_name AS u_display_name,
           u.role AS u_role,
           u.is_active AS u_is_active,
           u.created_at AS u_created_at,
           u.last_login_at AS u_last_login_at,
           d.id AS d_id,
           d.device_name AS d_name,
           d.device_type AS d_type,
           d.role AS d_role,
           d.status AS d_status,
           d.ip_hint AS d_ip_hint,
           d.last_seen_at AS d_last_seen_at,
           d.created_at AS d_created_at
         FROM remote_sessions s
         JOIN remote_users u ON u.id = s.user_id
         LEFT JOIN remote_devices d ON d.id = s.device_id
         WHERE s.token_hash = ?`,
      )
      .get(parsed.tokenHash);

    if (!row) return null;
    if (!row.u_is_active) return null;
    if (row.s_revoked_at !== null && row.s_revoked_at !== undefined) return null;
    if (row.s_expires_at <= now) return null;
    if (row.d_id && row.d_status === 'revoked') return null;

    db.prepare(
      `UPDATE remote_sessions SET last_used_at = ? WHERE token_hash = ?`,
    ).run(now, parsed.tokenHash);
    if (row.d_id) {
      db.prepare(
        `UPDATE remote_devices SET last_seen_at = ? WHERE id = ?`,
      ).run(now, row.d_id);
    }

    const effectiveRole = row.d_role || row.s_role || 'viewer';
    const deviceStatus = row.d_status || 'approved';

    return {
      tokenHash: row.s_token_hash,
      tokenId: row.s_token_id,
      expiresAt: row.s_expires_at,
      effectiveRole,
      deviceStatus,
      user: {
        id: row.s_user_id,
        username: row.u_username,
        displayName: row.u_display_name,
        role: row.u_role,
        isActive: Boolean(row.u_is_active),
        createdAt: row.u_created_at,
        lastLoginAt: row.u_last_login_at ?? null,
      },
      device: row.d_id
        ? {
            id: row.d_id,
            userId: row.s_user_id,
            deviceName: row.d_name,
            deviceType: row.d_type,
            role: row.d_role,
            status: row.d_status,
            ipHint: row.d_ip_hint || '',
            lastSeen: now,
            createdAt: row.d_created_at,
          }
        : null,
    };
  }

  function logoutToken(rawToken, ipHint = '') {
    const auth = authenticateBearer(rawToken);
    if (!auth) return { ok: false, status: 401, error: 'Sesión no válida.' };
    const now = Date.now();
    db.prepare(
      `UPDATE remote_sessions SET revoked_at = ? WHERE token_hash = ?`,
    ).run(now, auth.tokenHash);
    appendAuditLog({
      userId: auth.user.id,
      actorDeviceId: auth.device?.id || null,
      actorName: auth.device?.deviceName || auth.user.username,
      eventType: 'logout',
      detail: { tokenId: auth.tokenId },
      ipHint,
      now,
    });
    return { ok: true, status: 200 };
  }

  function changePassword({
    userId,
    deviceId = null,
    actorName = '',
    currentPassword,
    newPassword,
    revokeOtherSessions = false,
    currentTokenHash = '',
    ipHint = '',
  }) {
    const pCheck = validatePasswordStrength(newPassword);
    if (!pCheck.ok) return { ok: false, status: 400, error: pCheck.error };

    const userRow = db
      .prepare(`SELECT * FROM remote_users WHERE id = ?`)
      .get(userId);
    if (!userRow) return { ok: false, status: 404, error: 'Usuario no encontrado.' };

    if (
      !verifyPasswordScrypt(
        currentPassword,
        userRow.password_hash,
        userRow.password_salt,
      )
    ) {
      return {
        ok: false,
        status: 401,
        error: 'La contraseña actual no coincide.',
      };
    }

    const now = Date.now();
    const { hash, salt } = hashPasswordScrypt(newPassword);
    return runInTransaction(() => {
      db.prepare(
        `UPDATE remote_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?`,
      ).run(hash, salt, now, userId);

      if (revokeOtherSessions) {
        db.prepare(
          `UPDATE remote_sessions SET revoked_at = ?
           WHERE user_id = ? AND token_hash != ? AND revoked_at IS NULL`,
        ).run(now, userId, currentTokenHash || '');
      }

      appendAuditLog({
        userId,
        actorDeviceId: deviceId,
        actorName: actorName || userRow.username,
        eventType: 'password_changed',
        detail: { revokeOtherSessions: Boolean(revokeOtherSessions) },
        ipHint,
        now,
      });

      return { ok: true, status: 200 };
    });
  }

  function createPairingToken({
    userId,
    createdByDeviceId = null,
    actorName = '',
    roleGrant = 'operator',
    requiresApproval = false,
    ttlSeconds = 300,
    ipHint = '',
  }) {
    const cleanRole =
      roleGrant === 'viewer' || roleGrant === 'operator'
        ? roleGrant
        : 'operator';
    const cleanTtlMs = Math.max(
      30_000,
      Math.min(30 * 60 * 1000, (Number(ttlSeconds) || 300) * 1000),
    );
    const now = Date.now();
    const expiresAt = now + cleanTtlMs;
    const pairToken = `ptok_${crypto.randomBytes(18).toString('base64url')}`;
    const pin = generateNumericPin();
    const pairingId = `pair_${crypto.randomBytes(6).toString('hex')}`;

    const tokenHash = sha256Hex(pairToken);
    const pinHash = sha256Hex(`${userId}:${pin}`);

    return runInTransaction(() => {
      // Remove stale expired or already consumed tokens older than 1 hour
      db.prepare(
        `DELETE FROM remote_pairing_tokens
         WHERE user_id = ? AND (expires_at < ? OR consumed_at IS NOT NULL)`,
      ).run(userId, now - 60_000);

      db.prepare(
        `INSERT INTO remote_pairing_tokens (
           id, token_hash, pin_hash, user_id, created_by_device_id, role_grant, requires_approval, expires_at, consumed_at, consumed_by_device_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      ).run(
        pairingId,
        tokenHash,
        pinHash,
        userId,
        createdByDeviceId,
        cleanRole,
        requiresApproval ? 1 : 0,
        expiresAt,
        now,
      );

      appendAuditLog({
        userId,
        actorDeviceId: createdByDeviceId,
        actorName: actorName || 'PC Host',
        eventType: 'pairing_created',
        detail: {
          pairingId,
          roleGrant: cleanRole,
          requiresApproval: Boolean(requiresApproval),
          expiresAt,
        },
        ipHint,
        now,
      });

      return {
        ok: true,
        status: 201,
        pairingId,
        pairToken,
        pin,
        roleGrant: cleanRole,
        requiresApproval: Boolean(requiresApproval),
        expiresAt,
      };
    });
  }

  function claimPairing({
    username,
    pairToken = '',
    pin = '',
    deviceName = 'Móvil Remoto',
    deviceType = 'mobile',
    ipHint = '',
    userAgent = '',
  }) {
    const uCheck = validateUsername(username);
    if (!uCheck.ok) return { ok: false, status: 400, error: uCheck.error };

    const cleanPairToken = String(pairToken || '').trim();
    const cleanPin = String(pin || '').replace(/\D/g, '').trim();
    if (!cleanPairToken && cleanPin.length !== 6) {
      return {
        ok: false,
        status: 400,
        error: 'Proporciona un código QR de un solo uso o un PIN de 6 dígitos.',
      };
    }

    const now = Date.now();
    const rateKey = `pair:${ipHint || 'local'}:${uCheck.username}`;
    const limit = checkRateLimit(rateKey, now);
    if (limit.blocked) {
      return {
        ok: false,
        status: 429,
        retryAfterSec: limit.retryAfterSec,
        error: `Demasiados intentos de vinculación. Espera ${limit.retryAfterSec}s.`,
      };
    }

    const cleanDeviceType = VALID_DEVICE_TYPES.has(deviceType)
      ? deviceType
      : 'mobile';
    const cleanDeviceName = sanitizeDeviceName(deviceName, 'Móvil Remoto');

    return runInTransaction(() => {
      const userRow = db
        .prepare(`SELECT * FROM remote_users WHERE username = ?`)
        .get(uCheck.username);
      if (!userRow || !userRow.is_active) {
        recordAuthFailure(rateKey, now);
        return {
          ok: false,
          status: 404,
          error: 'No se encontró esa cuenta de usuario en el servidor.',
        };
      }

      let pairingRow = null;
      if (cleanPairToken) {
        pairingRow = db
          .prepare(
            `SELECT * FROM remote_pairing_tokens
             WHERE user_id = ? AND token_hash = ?`,
          )
          .get(userRow.id, sha256Hex(cleanPairToken));
      } else {
        pairingRow = db
          .prepare(
            `SELECT * FROM remote_pairing_tokens
             WHERE user_id = ? AND pin_hash = ? AND consumed_at IS NULL AND expires_at > ?
             ORDER BY created_at DESC LIMIT 1`,
          )
          .get(userRow.id, sha256Hex(`${userRow.id}:${cleanPin}`), now);
      }

      if (!pairingRow) {
        recordAuthFailure(rateKey, now);
        appendAuditLog({
          userId: userRow.id,
          actorName: cleanDeviceName,
          eventType: 'pairing_rejected',
          detail: { reason: cleanPairToken ? 'invalid_token' : 'invalid_pin' },
          ipHint,
          now,
        });
        return {
          ok: false,
          status: 401,
          error: 'Código QR o PIN incorrecto o expirado.',
        };
      }

      if (pairingRow.consumed_at !== null) {
        recordAuthFailure(rateKey, now);
        appendAuditLog({
          userId: userRow.id,
          actorName: cleanDeviceName,
          eventType: 'pairing_rejected',
          detail: { reason: 'already_consumed', pairingId: pairingRow.id },
          ipHint,
          now,
        });
        return {
          ok: false,
          status: 410,
          error: 'Este código de vinculación ya fue utilizado. Genera uno nuevo en el PC.',
        };
      }

      if (pairingRow.expires_at <= now) {
        recordAuthFailure(rateKey, now);
        appendAuditLog({
          userId: userRow.id,
          actorName: cleanDeviceName,
          eventType: 'pairing_rejected',
          detail: { reason: 'expired', pairingId: pairingRow.id },
          ipHint,
          now,
        });
        return {
          ok: false,
          status: 410,
          error: 'El código de vinculación expiró. Genera uno nuevo en el PC.',
        };
      }

      clearAuthFailures(rateKey);

      const deviceId = `dev_${crypto.randomBytes(8).toString('hex')}`;
      const deviceStatus = pairingRow.requires_approval ? 'pending' : 'approved';
      const grantedRole = pairingRow.role_grant || 'operator';

      db.prepare(
        `INSERT INTO remote_devices (
           id, user_id, device_name, device_type, role, status, ip_hint, user_agent, last_seen_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        deviceId,
        userRow.id,
        cleanDeviceName,
        cleanDeviceType,
        grantedRole,
        deviceStatus,
        String(ipHint || '').slice(0, 64),
        String(userAgent || '').slice(0, 180),
        now,
        now,
      );

      db.prepare(
        `UPDATE remote_pairing_tokens
         SET consumed_at = ?, consumed_by_device_id = ?
         WHERE id = ? AND consumed_at IS NULL`,
      ).run(now, deviceId, pairingRow.id);

      const session = issueSessionForDevice({
        userId: userRow.id,
        deviceId,
        role: grantedRole,
        ipHint,
        userAgent,
        now,
      });

      appendAuditLog({
        userId: userRow.id,
        actorDeviceId: deviceId,
        actorName: cleanDeviceName,
        eventType: 'pairing_claimed',
        detail: {
          pairingId: pairingRow.id,
          role: grantedRole,
          status: deviceStatus,
          method: cleanPairToken ? 'qr_token' : 'pin',
        },
        ipHint,
        now,
      });

      const deviceRow = db
        .prepare(`SELECT * FROM remote_devices WHERE id = ?`)
        .get(deviceId);

      return {
        ok: true,
        status: 200,
        token: session.token,
        expiresAt: session.expiresAt,
        pendingApproval: deviceStatus === 'pending',
        user: publicUserRow(userRow),
        device: publicDeviceRow(deviceRow),
      };
    });
  }

  function listDevicesAndAudit(userId) {
    const now = Date.now();
    const devices = db
      .prepare(
        `SELECT * FROM remote_devices WHERE user_id = ? ORDER BY last_seen_at DESC`,
      )
      .all(userId)
      .map(publicDeviceRow);

    const activePairings = db
      .prepare(
        `SELECT id, role_grant, requires_approval, expires_at, created_at
         FROM remote_pairing_tokens
         WHERE user_id = ? AND consumed_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC`,
      )
      .all(userId, now)
      .map((r) => ({
        id: r.id,
        roleGrant: r.role_grant,
        requiresApproval: Boolean(r.requires_approval),
        expiresAt: r.expires_at,
        createdAt: r.created_at,
      }));

    const auditLogs = db
      .prepare(
        `SELECT id, actor_device_id, actor_name, event_type, detail_json, ip_hint, created_at
         FROM remote_audit_logs
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 30`,
      )
      .all(userId)
      .map((r) => {
        let detail = {};
        try {
          detail = JSON.parse(r.detail_json || '{}');
        } catch {
          detail = {};
        }
        return {
          id: r.id,
          actorDeviceId: r.actor_device_id,
          actorName: r.actor_name,
          eventType: r.event_type,
          detail,
          ipHint: r.ip_hint,
          createdAt: r.created_at,
        };
      });

    return { devices, activePairings, auditLogs };
  }

  function getSqlMonitorSnapshot(
    userId,
    { limitAudit = 40, limitCommands = 30 } = {},
  ) {
    const { devices, activePairings, auditLogs } = listDevicesAndAudit(userId);
    const cleanAuditLimit = Math.max(1, Math.min(100, Number(limitAudit) || 40));
    const cleanCmdLimit = Math.max(1, Math.min(100, Number(limitCommands) || 30));

    const recentAudit =
      cleanAuditLimit === 30
        ? auditLogs
        : db
            .prepare(
              `SELECT id, actor_device_id, actor_name, event_type, detail_json, ip_hint, created_at
               FROM remote_audit_logs
               WHERE user_id = ?
               ORDER BY created_at DESC, id DESC
               LIMIT ?`,
            )
            .all(userId, cleanAuditLimit)
            .map((r) => {
              let detail = {};
              try {
                detail = JSON.parse(r.detail_json || '{}');
              } catch {
                detail = {};
              }
              return {
                id: r.id,
                actorDeviceId: r.actor_device_id,
                actorName: r.actor_name,
                eventType: r.event_type,
                detail,
                ipHint: r.ip_hint,
                createdAt: r.created_at,
              };
            });

    const commands = db
      .prepare(
        `SELECT id, device_id, device_name, action, args_json, created_at
         FROM remote_commands
         WHERE user_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(userId, cleanCmdLimit)
      .map((r) => {
        let args = {};
        try {
          args = JSON.parse(r.args_json || '{}');
        } catch {
          args = {};
        }
        return {
          id: r.id,
          deviceId: r.device_id,
          deviceName: r.device_name,
          action: r.action,
          args,
          timestamp: r.created_at,
        };
      });

    const destinationProfiles = db
      .prepare(
        `SELECT profile_key, COUNT(*) AS total
         FROM remote_destinations
         WHERE user_id = ?
         GROUP BY profile_key
         ORDER BY profile_key ASC`,
      )
      .all(userId)
      .map((r) => ({
        profileKey: r.profile_key || '',
        count: Number(r.total) || 0,
      }));

    return {
      devices,
      activePairings,
      auditLogs: recentAudit,
      commands,
      destinationProfiles,
      serverTime: Date.now(),
    };
  }

  function deleteAuditLog({ userId, auditId }) {
    const cleanId = Number(auditId);
    if (!Number.isInteger(cleanId) || cleanId <= 0) {
      return {
        ok: false,
        status: 400,
        error: 'Identificador de registro inválido.',
      };
    }
    const info = db
      .prepare(`DELETE FROM remote_audit_logs WHERE id = ? AND user_id = ?`)
      .run(cleanId, userId);
    if (!info.changes) {
      return {
        ok: false,
        status: 404,
        error: 'Cambio o registro de consola no encontrado.',
      };
    }
    return { ok: true, status: 200, deletedId: cleanId };
  }

  function clearAuditLogs({ userId }) {
    const info = db
      .prepare(`DELETE FROM remote_audit_logs WHERE user_id = ?`)
      .run(userId);
    return {
      ok: true,
      status: 200,
      clearedCount: Number(info.changes) || 0,
    };
  }

  function updateDevice({
    userId,
    targetDeviceId,
    actorDeviceId = null,
    actorName = '',
    status,
    role,
    deviceName,
    ipHint = '',
  }) {
    const existing = db
      .prepare(`SELECT * FROM remote_devices WHERE id = ? AND user_id = ?`)
      .get(targetDeviceId, userId);
    if (!existing) {
      return { ok: false, status: 404, error: 'Dispositivo no encontrado.' };
    }

    if (
      actorDeviceId &&
      actorDeviceId === targetDeviceId &&
      status === 'revoked'
    ) {
      return {
        ok: false,
        status: 400,
        error: 'No puedes revocar tu propia sesión activa desde aquí; usa Cerrar sesión.',
      };
    }

    const nextStatus =
      status && VALID_DEVICE_STATUSES.has(status) ? status : existing.status;
    const nextRole =
      role && VALID_USER_ROLES.has(role) ? role : existing.role;
    const nextName =
      deviceName !== undefined
        ? sanitizeDeviceName(deviceName, existing.device_name)
        : existing.device_name;
    const now = Date.now();

    return runInTransaction(() => {
      db.prepare(
        `UPDATE remote_devices
         SET status = ?, role = ?, device_name = ?
         WHERE id = ? AND user_id = ?`,
      ).run(nextStatus, nextRole, nextName, targetDeviceId, userId);

      if (nextStatus === 'revoked') {
        db.prepare(
          `UPDATE remote_sessions SET revoked_at = ?
           WHERE device_id = ? AND revoked_at IS NULL`,
        ).run(now, targetDeviceId);
        appendAuditLog({
          userId,
          actorDeviceId,
          actorName,
          eventType: 'device_revoked',
          detail: { targetDeviceId, deviceName: nextName },
          ipHint,
          now,
        });
      } else {
        if (nextStatus === 'approved' && existing.status !== 'approved') {
          appendAuditLog({
            userId,
            actorDeviceId,
            actorName,
            eventType: 'device_approved',
            detail: { targetDeviceId, deviceName: nextName, role: nextRole },
            ipHint,
            now,
          });
        }
        if (nextRole !== existing.role) {
          db.prepare(
            `UPDATE remote_sessions SET role = ? WHERE device_id = ? AND revoked_at IS NULL`,
          ).run(nextRole, targetDeviceId);
          appendAuditLog({
            userId,
            actorDeviceId,
            actorName,
            eventType: 'device_role_changed',
            detail: {
              targetDeviceId,
              deviceName: nextName,
              from: existing.role,
              to: nextRole,
            },
            ipHint,
            now,
          });
        }
      }

      const updated = db
        .prepare(`SELECT * FROM remote_devices WHERE id = ?`)
        .get(targetDeviceId);
      return { ok: true, status: 200, device: publicDeviceRow(updated) };
    });
  }

  function deleteDevice({
    userId,
    targetDeviceId,
    actorDeviceId = null,
    actorName = '',
    ipHint = '',
  }) {
    if (actorDeviceId && actorDeviceId === targetDeviceId) {
      return {
        ok: false,
        status: 400,
        error: 'No puedes eliminar el dispositivo actual en uso.',
      };
    }
    const existing = db
      .prepare(`SELECT * FROM remote_devices WHERE id = ? AND user_id = ?`)
      .get(targetDeviceId, userId);
    if (!existing) {
      return { ok: false, status: 404, error: 'Dispositivo no encontrado.' };
    }
    const now = Date.now();
    return runInTransaction(() => {
      db.prepare(`DELETE FROM remote_devices WHERE id = ? AND user_id = ?`).run(
        targetDeviceId,
        userId,
      );
      appendAuditLog({
        userId,
        actorDeviceId,
        actorName,
        eventType: 'device_removed',
        detail: { targetDeviceId, deviceName: existing.device_name },
        ipHint,
        now,
      });
      return { ok: true, status: 200 };
    });
  }

  function addCommand({ userId, deviceId = null, deviceName = 'anonymous', command }) {
    if (!command || typeof command !== 'object' || !command.action) {
      throw new Error('Comando inválido.');
    }
    const action = String(command.action).trim().slice(0, 64);
    const args =
      command.args && typeof command.args === 'object' && !Array.isArray(command.args)
        ? command.args
        : {};
    const now = Date.now();
    const id = `cmd_${now}_${crypto.randomBytes(4).toString('hex')}`;
    const cleanDeviceName = sanitizeDeviceName(deviceName, 'anonymous');

    return runInTransaction(() => {
      db.prepare(
        `INSERT INTO remote_commands (id, user_id, device_id, device_name, action, args_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, userId, deviceId, cleanDeviceName, action, JSON.stringify(args), now);

      db.prepare(
        `DELETE FROM remote_commands
         WHERE user_id = ?
           AND id NOT IN (
             SELECT id FROM remote_commands
             WHERE user_id = ?
             ORDER BY created_at DESC, rowid DESC
             LIMIT ?
           )`,
      ).run(userId, userId, COMMAND_RETENTION_CAP);

      return {
        id,
        action,
        args,
        deviceId,
        deviceName: cleanDeviceName,
        timestamp: now,
      };
    });
  }

  function getDestinations(userId, profileKey = '') {
    const cleanProfile = sanitizeProfileKey(profileKey);
    return db
      .prepare(
        `SELECT id, name, lat, lon, height, created_at
         FROM remote_destinations
         WHERE user_id = ? AND profile_key = ?
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(userId, cleanProfile)
      .map((r) => ({
        id: r.id,
        name: r.name,
        lat: r.lat,
        lon: r.lon,
        height: r.height,
        createdAt: r.created_at,
      }));
  }

  function replaceDestinations(userId, locations = [], profileKey = '') {
    const cleanProfile = sanitizeProfileKey(profileKey);
    const sanitized = sanitizeLocationList(locations);
    const now = Date.now();

    return runInTransaction(() => {
      db.prepare(
        `DELETE FROM remote_destinations WHERE user_id = ? AND profile_key = ?`,
      ).run(userId, cleanProfile);

      const insert = db.prepare(
        `INSERT INTO remote_destinations (
           id, user_id, profile_key, name, lat, lon, height, sort_order, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (let i = 0; i < sanitized.length; i++) {
        const loc = sanitized[i];
        insert.run(
          `${userId}_${cleanProfile || 'default'}_${loc.id}_${i}`,
          userId,
          cleanProfile,
          loc.name,
          loc.lat,
          loc.lon,
          loc.height,
          i,
          now,
        );
      }
      return sanitized;
    });
  }

  function getSessionState({ userId, since = 0, profileKey = '' }) {
    const sinceTime = Math.max(0, Number(since) || 0);
    const userRow = db
      .prepare(`SELECT * FROM remote_users WHERE id = ?`)
      .get(userId);
    if (!userRow) return null;

    const commands = db
      .prepare(
        `SELECT id, device_id, device_name, action, args_json, created_at
         FROM remote_commands
         WHERE user_id = ? AND created_at > ?
         ORDER BY created_at ASC, rowid ASC
         LIMIT 100`,
      )
      .all(userId, sinceTime)
      .map((r) => {
        let args = {};
        try {
          args = JSON.parse(r.args_json || '{}');
        } catch {
          args = {};
        }
        return {
          id: r.id,
          sessionName: userRow.username,
          deviceId: r.device_id,
          deviceName: r.device_name,
          action: r.action,
          args,
          timestamp: r.created_at,
        };
      });

    const devices = db
      .prepare(
        `SELECT * FROM remote_devices WHERE user_id = ? ORDER BY last_seen_at DESC`,
      )
      .all(userId)
      .map(publicDeviceRow);

    const customLocations = getDestinations(userId, profileKey);
    const lastActiveAt = devices.reduce(
      (max, d) => Math.max(max, d.lastSeen || 0),
      userRow.last_login_at || userRow.created_at,
    );

    return {
      sessionName: userRow.username,
      matchedSessionName: userRow.username,
      devices,
      commands,
      customLocations,
      lastActiveAt,
    };
  }

  function logDeniedCommand({ userId, deviceId, actorName, action, role, ipHint = '' }) {
    appendAuditLog({
      userId,
      actorDeviceId: deviceId,
      actorName,
      eventType: 'command_denied',
      detail: { action, role },
      ipHint,
    });
  }

  // Ensures a workspace user exists for programmatic/legacy store operations in tests
  function ensureWorkspaceUser(username) {
    const clean = normalizeUsername(username || 'user1234');
    const existing = db
      .prepare(`SELECT * FROM remote_users WHERE username = ?`)
      .get(clean);
    if (existing) return existing;

    const now = Date.now();
    const { hash, salt } = hashPasswordScrypt(crypto.randomBytes(16).toString('hex'));
    const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(
      `INSERT INTO remote_users (
         id, username, display_name, password_hash, password_salt, role, is_active, created_at, updated_at, last_login_at
       ) VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?, ?)`,
    ).run(userId, clean, clean, hash, salt, now, now, now);
    return db.prepare(`SELECT * FROM remote_users WHERE id = ?`).get(userId);
  }

  function findUserByUsername(username) {
    return (
      db
        .prepare(`SELECT * FROM remote_users WHERE username = ?`)
        .get(normalizeUsername(username)) || null
    );
  }

  function clearAll() {
    runInTransaction(() => {
      db.exec(`
        DELETE FROM remote_audit_logs;
        DELETE FROM remote_commands;
        DELETE FROM remote_destinations;
        DELETE FROM remote_pairing_tokens;
        DELETE FROM remote_sessions;
        DELETE FROM remote_devices;
        DELETE FROM remote_users;
        DELETE FROM remote_auth_attempts;
      `);
    });
  }

  function reopen(nextPath = activeDbPath) {
    try {
      db.close();
    } catch {
      /* ignore close errors */
    }
    activeDbPath = nextPath;
    db = openSqliteDatabase(activeDbPath);
  }

  function close() {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }

  return {
    get dbPath() {
      return activeDbPath;
    },
    registerUser,
    loginUser,
    authenticateBearer,
    logoutToken,
    changePassword,
    createPairingToken,
    claimPairing,
    listDevicesAndAudit,
    getSqlMonitorSnapshot,
    deleteAuditLog,
    clearAuditLogs,
    updateDevice,
    deleteDevice,
    addCommand,
    getDestinations,
    replaceDestinations,
    getSessionState,
    logDeniedCommand,
    ensureWorkspaceUser,
    findUserByUsername,
    clearAll,
    reopen,
    close,
  };
}

let sharedStore = null;

export function getSharedRemoteSqlStore() {
  if (!sharedStore) {
    sharedStore = createRemoteSqlStore();
  }
  return sharedStore;
}

export function resetSharedRemoteSqlStore(options = {}) {
  if (sharedStore) {
    sharedStore.close();
    sharedStore = null;
  }
  if (options.dbPath) {
    sharedStore = createRemoteSqlStore({ dbPath: options.dbPath });
  }
  return sharedStore;
}
