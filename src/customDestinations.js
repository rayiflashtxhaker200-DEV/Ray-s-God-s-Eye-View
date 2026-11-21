/**
 * Custom Destinations, Local SQL Account Auth, One-Time QR/PIN Pairing & Device RBAC
 * for Ray's Eye View.
 *
 * Security notes:
 * - Bearer session tokens are held strictly in JS memory (never in localStorage/sessionStorage).
 * - QR pairing links carry single-use expiring pairing tokens (`pair=`), never account passwords.
 */

import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from './renderGovernor.js';
import {
  getHardwareMode,
  setHardwareMode,
  getOptimalPerformanceProfile,
  applyHardwareOptimizations,
} from './hardwareProfile.js';
import { renderQrCodeSvg } from './qrCodeSvg.js';

function degreesToCartesian3(lonDeg, latDeg, height = 0) {
  if (globalThis.Cesium?.Cartesian3?.fromDegrees) {
    return globalThis.Cesium.Cartesian3.fromDegrees(lonDeg, latDeg, height);
  }
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const a = 6378137.0;
  const e2 = 0.00669437999014;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return {
    x: (n + height) * cosLat * Math.cos(lon),
    y: (n + height) * cosLat * Math.sin(lon),
    z: (n * (1 - e2) + height) * sinLat,
  };
}

// Non-secret client preference storage keys
export const STORAGE_USER_CODE_KEY = 'gev_shared_user_code';
export const STORAGE_DESTINATIONS_KEY = 'gev_custom_destinations';
export const STORAGE_ACTIVE_PASSWORD_KEY = 'gev_active_preset_password';

/**
 * Built-in destination packs selectable by profile tag.
 */
export const DEFAULT_PASSWORD_PRESETS = {
  alfa1234: [
    { id: 'def_alfa_1', name: 'Base Ártica Thule', lat: 76.5312, lon: -68.7032, height: 15000 },
    { id: 'def_alfa_2', name: 'Nevada Test Range (Área 51)', lat: 37.2431, lon: -115.793, height: 10000 },
    { id: 'def_alfa_3', name: 'Observatorio Mauna Kea', lat: 19.8206, lon: -155.4681, height: 12000 },
  ],
  tactical2026: [
    { id: 'def_tact_1', name: 'Estrecho de Gibraltar', lat: 35.98, lon: -5.6, height: 28000 },
    { id: 'def_tact_2', name: 'Canal de Suez', lat: 30.5852, lon: 32.2654, height: 22000 },
    { id: 'def_tact_3', name: 'Canal de Panamá', lat: 9.08, lon: -79.68, height: 20000 },
    { id: 'def_tact_4', name: 'Estrecho de Malaca', lat: 1.43, lon: 103.1, height: 25000 },
  ],
  ciudades99: [
    { id: 'def_city_1', name: 'Times Square, Nueva York', lat: 40.758, lon: -73.9855, height: 3500 },
    { id: 'def_city_2', name: 'Cruce de Shibuya, Tokio', lat: 35.6595, lon: 139.7004, height: 3500 },
    { id: 'def_city_3', name: 'Torre Eiffel, París', lat: 48.8584, lon: 2.2945, height: 3500 },
    { id: 'def_city_4', name: 'Big Ben, Londres', lat: 51.5007, lon: -0.1246, height: 3500 },
  ],
};

const memoryStorage = new Map();
function getStorage() {
  if (typeof localStorage !== 'undefined') return localStorage;
  return {
    getItem: (k) => memoryStorage.get(k) ?? null,
    setItem: (k, v) => memoryStorage.set(k, String(v)),
    removeItem: (k) => memoryStorage.delete(k),
  };
}

// In-memory PC authentication state (never written to localStorage/sessionStorage)
const pcAuthState = {
  token: '',
  user: null,
  device: null,
  expiresAt: 0,
};
const pcAuthListeners = new Set();

export function getPcRemoteAuth() {
  return {
    token: pcAuthState.token,
    user: pcAuthState.user,
    device: pcAuthState.device,
    expiresAt: pcAuthState.expiresAt,
    isAuthenticated: Boolean(pcAuthState.token && pcAuthState.user),
  };
}

export function setPcRemoteAuth({ token = '', user = null, device = null, expiresAt = 0 } = {}) {
  pcAuthState.token = String(token || '');
  pcAuthState.user = user || null;
  pcAuthState.device = device || null;
  pcAuthState.expiresAt = Number(expiresAt) || 0;
  if (user?.username) {
    try {
      setSharedUserCode(user.username);
    } catch {
      /* ignore invalid */
    }
  }
  const snapshot = getPcRemoteAuth();
  for (const listener of pcAuthListeners) {
    try {
      listener(snapshot);
    } catch {
      /* ignore listener errors */
    }
  }
  return snapshot;
}

export function onPcAuthChange(listener) {
  if (typeof listener !== 'function') return () => {};
  pcAuthListeners.add(listener);
  return () => pcAuthListeners.delete(listener);
}

/**
 * Validate that the username/code has 4..32 safe characters.
 */
export function validateUserCode(code) {
  const trimmed = String(code ?? '').trim();
  if (trimmed.length < 4) {
    return {
      valid: false,
      error: 'El nombre de usuario debe tener al menos 4 caracteres o dígitos.',
    };
  }
  if (!/^[a-zA-Z0-9_.-]{4,32}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Usa solo letras, números, ".", "_" o "-" (máx. 32 caracteres).',
    };
  }
  return { valid: true };
}

/**
 * Get the stored shared user code, defaulting to 'user1234'.
 */
export function getSharedUserCode() {
  const stored = getStorage().getItem(STORAGE_USER_CODE_KEY);
  return stored && stored.trim().length >= 4 ? stored.trim() : 'user1234';
}

/**
 * Save the shared user code after validation.
 */
export function setSharedUserCode(code) {
  const result = validateUserCode(code);
  if (!result.valid) {
    throw new Error(result.error);
  }
  const clean = code.trim().toLowerCase();
  getStorage().setItem(STORAGE_USER_CODE_KEY, clean);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gev:user-code-changed', { detail: clean }));
    const input = document.getElementById('gev-input-pc-user');
    if (input && input.value !== clean) input.value = clean;
  }
  return clean;
}

/**
 * Retrieve the active destination profile key.
 */
export function getActivePassword() {
  return getStorage().getItem(STORAGE_ACTIVE_PASSWORD_KEY) || '';
}

/**
 * Set the active destination profile key.
 */
export function setActivePassword(profileKey = '') {
  const clean = String(profileKey ?? '').trim().toLowerCase();
  getStorage().setItem(STORAGE_ACTIVE_PASSWORD_KEY, clean);
  return clean;
}

/**
 * Retrieve destinations associated with a profile key.
 */
export function getDestinationsForPassword(profileKey = '') {
  const key = String(profileKey ?? '').trim().toLowerCase();
  if (!key) {
    return getCustomDestinations();
  }

  try {
    const raw = getStorage().getItem(`gev_preset_pass_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    // ignore
  }

  if (DEFAULT_PASSWORD_PRESETS[key]) {
    return [...DEFAULT_PASSWORD_PRESETS[key]];
  }

  return [];
}

/**
 * Save custom destinations associated with a profile key.
 */
export function saveDestinationsForPassword(profileKey = '', destinations = []) {
  const key = String(profileKey ?? '').trim().toLowerCase();
  const list = Array.isArray(destinations) ? destinations : [];
  if (!key) {
    saveCustomDestinations(list);
    return list;
  }
  getStorage().setItem(`gev_preset_pass_${key}`, JSON.stringify(list));
  return list;
}

export function getCustomDestinations() {
  try {
    const raw = getStorage().getItem(STORAGE_DESTINATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomDestinations(destinations) {
  const list = Array.isArray(destinations) ? destinations : [];
  getStorage().setItem(STORAGE_DESTINATIONS_KEY, JSON.stringify(list));
  return list;
}

export function addCustomDestination({ name, lat, lon, height = 15000, password = '' }) {
  const passKey = String(password ?? '').trim().toLowerCase();
  const list = passKey ? getDestinationsForPassword(passKey) : getCustomDestinations();
  const newDest = {
    id: `dest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || 'Mi Destino').trim(),
    lat: Number(lat),
    lon: Number(lon),
    height: Number(height || 15000),
    createdAt: Date.now(),
  };
  list.push(newDest);
  if (passKey) {
    saveDestinationsForPassword(passKey, list);
  } else {
    saveCustomDestinations(list);
  }
  return newDest;
}

export function removeCustomDestination(id, password = '') {
  const passKey = String(password ?? '').trim().toLowerCase();
  const list = (passKey ? getDestinationsForPassword(passKey) : getCustomDestinations()).filter(
    (d) => d.id !== id,
  );
  if (passKey) {
    saveDestinationsForPassword(passKey, list);
  } else {
    saveCustomDestinations(list);
  }
  return list;
}

export function getCurrentCameraCoordinates(viewer) {
  if (!viewer?.camera) return null;
  try {
    const carto = viewer.camera.positionCartographic;
    if (carto) {
      const lat = (carto.latitude * 180) / Math.PI;
      const lon = (carto.longitude * 180) / Math.PI;
      const height = Math.round(carto.height);
      return {
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
        height: Math.max(500, height),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function remoteApiRequest(
  pathSuffix,
  {
    serverUrl = '',
    method = 'GET',
    body,
    authToken = pcAuthState.token,
    fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
  } = {},
) {
  if (!fetchImpl) throw new Error('Fetch no disponible');
  const base = String(serverUrl || '').trim().replace(/\/+$/, '');
  const endpoint = `${base}/api/remote${pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`}`;
  const headers = { Accept: 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetchImpl(endpoint, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    throw new Error('Respuesta no JSON del servidor remoto.');
  }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

/**
 * Push custom destinations for a profile to the authenticated SQL server session.
 */
export async function syncDestinationsToServer({
  serverUrl = '',
  sessionName = 'default',
  destinations,
  password = '',
  authToken = pcAuthState.token,
  fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
} = {}) {
  if (!fetchImpl || !authToken) return null;
  const base = serverUrl.replace(/\/+$/, '');
  const endpoint = `${base}/api/remote/session`;

  const profileKey = String(password ?? '').trim().toLowerCase();
  const list =
    destinations ??
    (profileKey ? getDestinationsForPassword(profileKey) : getCustomDestinations());

  const payload = {
    sessionName,
    profile: profileKey,
    deviceName: pcAuthState.device?.deviceName || 'PC Principal',
    deviceType: 'pc',
    customLocations: list,
    command: {
      action: 'sync_custom_locations',
      args: { locations: list, profile: profileKey },
    },
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch custom destinations from the authenticated SQL server session.
 */
export async function fetchDestinationsFromServer({
  serverUrl = '',
  sessionName = 'default',
  password = '',
  authToken = pcAuthState.token,
  fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
} = {}) {
  if (!fetchImpl || !authToken) return [];
  const base = serverUrl.replace(/\/+$/, '');
  const profileKey = String(password ?? '').trim().toLowerCase();
  const query = new URLSearchParams({ session: sessionName });
  if (profileKey) query.set('profile', profileKey);
  const endpoint = `${base}/api/remote/session?${query.toString()}`;

  const res = await fetchImpl(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.customLocations || [];
}

/**
 * Build the mobile remote pairing URL using a short-lived one-time pairing token.
 * Account credentials and profile secrets are NEVER placed in the URL query string.
 */
export function buildMobilePairingUrl({
  baseUrl = typeof window !== 'undefined' ? window.location.origin : '',
  sessionName = getSharedUserCode(),
  pairToken = '',
} = {}) {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  const params = new URLSearchParams({
    remote: 'mobile',
    session: String(sessionName || 'user1234').trim().toLowerCase(),
  });
  if (pairToken) {
    params.set('pair', String(pairToken).trim());
  }
  return `${cleanBase}/?${params.toString()}`;
}

const AUDIT_EVENT_LABELS = {
  user_registered: 'Cuenta SQL creada',
  login_success: 'Inicio de sesión',
  login_failed: 'Intento fallido',
  pairing_created: 'Código QR/PIN generado',
  pairing_claimed: 'Dispositivo vinculado',
  pairing_rejected: 'Vinculación rechazada',
  device_approved: 'Dispositivo aprobado',
  device_revoked: 'Acceso revocado',
  device_role_changed: 'Rol actualizado',
  device_removed: 'Dispositivo eliminado',
  password_changed: 'Contraseña actualizada',
  logout: 'Sesión cerrada',
  command_denied: 'Comando denegado (modo Control)',
};

function formatRoleLabel(role) {
  if (role === 'admin') return 'ADMIN';
  if (role === 'viewer') return 'CONTROL';
  return 'OPERADOR';
}

function formatAuditDetailText(ev) {
  const detail = ev?.detail && typeof ev.detail === 'object' ? ev.detail : {};
  const parts = [];
  if (ev?.actorName) parts.push(ev.actorName);
  if (detail.deviceName && detail.deviceName !== ev.actorName) {
    parts.push(detail.deviceName);
  }
  if (ev?.eventType === 'device_role_changed' && detail.to) {
    parts.push(`→ ${formatRoleLabel(detail.to)}`);
  } else if (ev?.eventType === 'pairing_created' && detail.roleGrant) {
    parts.push(`rol ${formatRoleLabel(detail.roleGrant)}`);
  }
  return parts.join(' · ');
}

/**
 * Mount PC Pairing (SQL Auth + One-Time QR/PIN + RBAC Devices + Destinations) Modal.
 */
export function mountPcPairingAndDestinationsPanel(viewer) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('gev-pc-pairing-modal')) return;

  const existingTopBtn = document.getElementById('remote-pairing-btn');
  let triggerBtn = existingTopBtn;

  if (!triggerBtn) {
    triggerBtn = document.createElement('button');
    triggerBtn.id = 'gev-pc-pairing-btn';
    triggerBtn.type = 'button';
    triggerBtn.textContent = 'Control Móvil · SQL';
    triggerBtn.className = 'rey-pairing-fallback-btn';
    document.body.appendChild(triggerBtn);
  }

  const modal = document.createElement('div');
  modal.id = 'gev-pc-pairing-modal';
  modal.className = 'rey-pairing-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'rey-pairing-title');
  modal.hidden = true;

  let currentProfile = getActivePassword() || '';
  let customBaseUrl =
    getStorage().getItem('gev_pairing_base_url') ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  let authMode = 'login'; // 'login' | 'register'
  let rightTab = 'devices'; // 'devices' | 'destinations' | 'system'
  let activePairing = null; // { pairToken, pin, expiresAt, roleGrant, requiresApproval }
  let pairingCountdownTimer = null;
  let devicesPollTimer = null;
  let cachedDevices = [];
  let cachedAuditLogs = [];

  function escapeHtml(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  modal.innerHTML = `
    <div class="rey-pairing-dialog">
      <header class="rey-pairing-header">
        <div>
          <p class="rey-pairing-kicker">Ray's Eye View · Servidor SQL Local</p>
          <h2 id="rey-pairing-title">Control Remoto Seguro y Dispositivos</h2>
        </div>
        <button id="gev-modal-close" type="button" class="rey-icon-close" aria-label="Cerrar panel de control remoto">✕</button>
      </header>

      <div class="rey-pairing-grid">
        <!-- Columna izquierda: Cuenta SQL y Emparejamiento un solo uso -->
        <div class="rey-pairing-col">
          <!-- Vista sin sesión -->
          <section id="rey-auth-card" class="rey-pairing-section">
            <div class="rey-section-header-row">
              <div class="rey-section-title">Autenticación SQL Local</div>
              <span class="rey-role-badge">SQLite · scrypt</span>
            </div>
            <p class="rey-section-desc">
              Inicia sesión o crea una cuenta local para emitir códigos QR temporales, PIN de un solo uso y gestionar permisos por dispositivo.
            </p>
            <div class="rey-tabs" role="tablist">
              <button type="button" class="rey-tab-btn is-active" data-auth-mode="login">Iniciar sesión</button>
              <button type="button" class="rey-tab-btn" data-auth-mode="register">Crear cuenta</button>
            </div>
            <form id="rey-auth-form" class="rey-pairing-col" style="gap: 9px;">
              <div class="rey-field-group">
                <label for="gev-input-pc-user" class="rey-label">Usuario (mín. 4 caracteres)</label>
                <input id="gev-input-pc-user" type="text" value="${escapeHtml(getSharedUserCode())}" placeholder="operador1" class="rey-input rey-mono" autocomplete="username" />
              </div>
              <div id="rey-register-name-wrap" class="rey-field-group" hidden>
                <label for="rey-input-display-name" class="rey-label">Nombre visible</label>
                <input id="rey-input-display-name" type="text" placeholder="Ej. Sala de Control" class="rey-input" autocomplete="name" />
              </div>
              <div class="rey-field-group">
                <label for="rey-input-pc-auth-pass" class="rey-label">Contraseña (mín. 6 caracteres)</label>
                <input id="rey-input-pc-auth-pass" type="password" placeholder="••••••••" class="rey-input" autocomplete="current-password" />
              </div>
              <div class="rey-field-group">
                <label for="rey-input-pc-device-name" class="rey-label">Nombre de este equipo</label>
                <input id="rey-input-pc-device-name" type="text" value="PC Principal" placeholder="PC Principal" class="rey-input" />
              </div>
              <button id="rey-btn-auth-submit" type="submit" class="rey-btn rey-btn-primary rey-full">Iniciar sesión segura</button>
              <div id="rey-auth-feedback" class="rey-inline-feedback" hidden></div>
            </form>
          </section>

          <!-- Vista autenticada: QR + PIN temporal -->
          <section id="rey-pairing-card" class="rey-pairing-section" hidden>
            <div class="rey-auth-bar">
              <div class="rey-auth-user-meta">
                <span class="material-symbols-outlined rey-accent-text" aria-hidden="true">verified_user</span>
                <div>
                  <strong id="rey-auth-username-label">@user</strong>
                  <span id="rey-auth-role-badge" class="rey-role-badge">ADMIN</span>
                </div>
              </div>
              <button id="rey-btn-logout" type="button" class="rey-btn rey-btn-ghost rey-btn-sm">Salir</button>
            </div>

            <div class="rey-section-header-row">
              <div class="rey-section-title">Código QR y PIN (Un solo uso · 5 min)</div>
              <button id="rey-btn-regen-pair" type="button" class="rey-btn rey-btn-accent rey-btn-sm">Generar nuevo</button>
            </div>

            <div class="rey-row-gap">
              <div class="rey-field-group" style="flex: 1;">
                <label for="rey-pair-role" class="rey-label">Permiso para el móvil</label>
                <select id="rey-pair-role" class="rey-select">
                  <option value="operator">Operador (Control total)</option>
                  <option value="viewer">Control (Monitor SQL)</option>
                </select>
              </div>
            </div>

            <label class="rey-check-row">
              <input id="rey-pair-require-approval" type="checkbox" />
              <span>Requerir aprobación manual antes de permitir comandos</span>
            </label>

            <div class="rey-pin-card">
              <div>
                <div class="rey-label">PIN temporal de acceso</div>
                <div id="rey-pin-display" class="rey-pin-value">------</div>
              </div>
              <div id="rey-pin-ttl" class="rey-pin-ttl">Generando...</div>
            </div>

            <div id="rey-qr-preview" class="rey-qr-preview"></div>
            <div class="rey-qr-url-row">
              <input id="rey-qr-url-display" type="text" readonly class="rey-input rey-mono" aria-label="Enlace temporal de vinculación" />
              <button id="rey-btn-copy-url" type="button" class="rey-btn rey-btn-accent">Copiar</button>
            </div>
            <div id="rey-copy-feedback" class="rey-inline-feedback" hidden></div>

            <div class="rey-field-group">
              <label for="rey-input-base-url" class="rey-label">URL base / Túnel LAN</label>
              <input id="rey-input-base-url" type="text" value="${escapeHtml(customBaseUrl)}" placeholder="https://tu-tunel.devtunnels.ms" class="rey-input rey-mono" />
            </div>
          </section>
        </div>

        <!-- Columna derecha: Dispositivos, Destinos SQL y Sistema -->
        <div class="rey-pairing-col">
          <div class="rey-subtabs" role="tablist">
            <button type="button" class="rey-tab-btn is-active" data-right-tab="devices">Dispositivos</button>
            <button type="button" class="rey-tab-btn" data-right-tab="destinations">Destinos SQL</button>
            <button type="button" class="rey-tab-btn" data-right-tab="system">Seguridad</button>
          </div>

          <!-- TAB: Dispositivos y Auditoría -->
          <section class="rey-pairing-section" data-right-panel="devices">
            <div class="rey-section-header-row">
              <div class="rey-section-title">Dispositivos conectados y sesiones</div>
              <button id="rey-btn-refresh-devices" type="button" class="rey-btn rey-btn-ghost rey-btn-sm">Actualizar</button>
            </div>
            <div id="rey-devices-feedback" class="rey-inline-feedback" hidden></div>
            <div id="rey-devices-list" class="rey-device-list">
              <div class="rey-empty-state">Inicia sesión en el panel izquierdo para ver los dispositivos vinculados y el historial SQL.</div>
            </div>

            <div class="rey-section-header-row" style="margin-top: 6px;">
              <div class="rey-section-title">Consola de cambios de dispositivos</div>
              <button id="rey-btn-clear-audit" type="button" class="rey-btn rey-btn-danger rey-btn-sm">Limpiar consola</button>
            </div>
            <div id="rey-audit-list" class="rey-audit-list">
              <div class="rey-empty-state">Sin eventos registrados aún.</div>
            </div>
          </section>

          <!-- TAB: Destinos SQL -->
          <section class="rey-pairing-section" data-right-panel="destinations" hidden>
            <div class="rey-section-header-row">
              <div class="rey-section-title">Perfiles de destinos · <span id="gev-label-active-pass" class="rey-accent-text">${escapeHtml(currentProfile || 'General')}</span></div>
              <button id="gev-btn-sync-all" type="button" class="rey-btn rey-btn-ghost rey-btn-sm">Sincronizar SQL</button>
            </div>
            <div id="gev-user-feedback" class="rey-inline-feedback" hidden></div>

            <div class="rey-row-gap">
              <input id="gev-input-pc-password" type="text" value="${escapeHtml(currentProfile)}" placeholder="Etiqueta de perfil (ej: ciudades99)" class="rey-input" />
              <button id="gev-btn-apply-password" type="button" class="rey-btn rey-btn-primary">Cargar</button>
            </div>

            <div class="rey-chip-row">
              <button type="button" class="gev-btn-quick-pass rey-chip-btn" data-pass="alfa1234">alfa1234</button>
              <button type="button" class="gev-btn-quick-pass rey-chip-btn" data-pass="tactical2026">tactical2026</button>
              <button type="button" class="gev-btn-quick-pass rey-chip-btn" data-pass="ciudades99">ciudades99</button>
            </div>

            <div class="rey-capture-box">
              <div class="rey-row-gap">
                <input id="rey-capture-name" type="text" placeholder="Nombre de la vista actual..." class="rey-input" />
                <button id="gev-btn-capture-camera" type="button" class="rey-btn rey-btn-accent">Guardar vista</button>
              </div>
              <div id="rey-capture-feedback" class="rey-inline-feedback" hidden></div>
            </div>

            <details class="rey-manual-details">
              <summary>Agregar coordenadas manualmente</summary>
              <div class="rey-manual-grid">
                <input id="gev-input-dest-name" type="text" placeholder="Nombre" class="rey-input" />
                <input id="gev-input-dest-lat" type="number" step="any" placeholder="Latitud" class="rey-input rey-mono" />
                <input id="gev-input-dest-lon" type="number" step="any" placeholder="Longitud" class="rey-input rey-mono" />
              </div>
              <button id="gev-btn-add-manual-dest" type="button" class="rey-btn rey-btn-ghost rey-full">Agregar coordenada</button>
            </details>

            <div id="gev-destinations-list" class="rey-dest-list"></div>
          </section>

          <!-- TAB: Rendimiento y Contraseña -->
          <section class="rey-pairing-section" data-right-panel="system" hidden>
            <div class="rey-section-title">Cambiar contraseña de la cuenta SQL</div>
            <form id="rey-change-pass-form" class="rey-pairing-col" style="gap: 8px;">
              <input id="rey-cur-pass" type="password" placeholder="Contraseña actual" class="rey-input" autocomplete="current-password" />
              <input id="rey-new-pass" type="password" placeholder="Nueva contraseña (mín. 6 caracteres)" class="rey-input" autocomplete="new-password" />
              <label class="rey-check-row">
                <input id="rey-revoke-others" type="checkbox" checked />
                <span>Cerrar sesión en otros dispositivos al cambiarla</span>
              </label>
              <button type="submit" class="rey-btn rey-btn-accent">Actualizar contraseña</button>
              <div id="rey-changepass-feedback" class="rey-inline-feedback" hidden></div>
            </form>

            <div class="rey-section-title" style="margin-top: 6px;">Perfil de rendimiento gráfico</div>
            <div class="rey-perf-grid">
              <button id="gev-btn-hw-low" type="button" class="rey-btn rey-btn-ghost">Ahorro (30 FPS)</button>
              <button id="gev-btn-hw-auto" type="button" class="rey-btn rey-btn-ghost">Automático</button>
              <button id="gev-btn-hw-high" type="button" class="rey-btn rey-btn-ghost">Alta calidad</button>
            </div>
            <div id="gev-hw-feedback" class="rey-inline-feedback" hidden></div>
          </section>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  function setInlineFeedback(el, text, isError = false) {
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-error', isError);
    el.classList.toggle('is-success', !isError);
  }

  function formatRelTime(ts) {
    if (!ts) return '—';
    const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (diffSec < 10) return 'ahora';
    if (diffSec < 60) return `hace ${diffSec}s`;
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `hace ${diffMin}m`;
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function stopTimers() {
    if (pairingCountdownTimer) {
      clearInterval(pairingCountdownTimer);
      pairingCountdownTimer = null;
    }
    if (devicesPollTimer) {
      clearInterval(devicesPollTimer);
      devicesPollTimer = null;
    }
  }

  function refreshQrDisplay() {
    const baseInput = modal.querySelector('#rey-input-base-url');
    const urlInput = modal.querySelector('#rey-qr-url-display');
    const qrHost = modal.querySelector('#rey-qr-preview');
    const pinEl = modal.querySelector('#rey-pin-display');
    const baseVal = (baseInput?.value || customBaseUrl || window.location.origin).trim();
    const user = pcAuthState.user?.username || getSharedUserCode();

    const pairingUrl = buildMobilePairingUrl({
      baseUrl: baseVal,
      sessionName: user,
      pairToken: activePairing?.pairToken || '',
    });
    if (urlInput) urlInput.value = pairingUrl;
    if (qrHost) {
      qrHost.innerHTML = renderQrCodeSvg(pairingUrl, { sizePx: 172 });
    }
    if (pinEl) {
      pinEl.textContent = activePairing?.pin || '------';
    }
  }

  function startCountdownLoop() {
    if (pairingCountdownTimer) clearInterval(pairingCountdownTimer);
    const update = () => {
      const ttlEl = modal.querySelector('#rey-pin-ttl');
      if (!ttlEl) return;
      if (!activePairing?.expiresAt) {
        ttlEl.textContent = 'Sin código';
        return;
      }
      const remSec = Math.max(0, Math.ceil((activePairing.expiresAt - Date.now()) / 1000));
      if (remSec <= 0) {
        ttlEl.textContent = 'Expirado';
        return;
      }
      const mins = String(Math.floor(remSec / 60)).padStart(2, '0');
      const secs = String(remSec % 60).padStart(2, '0');
      ttlEl.textContent = `Expira ${mins}:${secs}`;
    };
    update();
    pairingCountdownTimer = setInterval(update, 1000);
  }

  async function generateNewPairingCode() {
    if (!pcAuthState.token) return;
    const roleSelect = modal.querySelector('#rey-pair-role');
    const reqApproval = modal.querySelector('#rey-pair-require-approval');
    try {
      const data = await remoteApiRequest('/pairing', {
        method: 'POST',
        body: {
          roleGrant: roleSelect?.value === 'viewer' ? 'viewer' : 'operator',
          requiresApproval: Boolean(reqApproval?.checked),
          ttlSeconds: 300,
        },
      });
      activePairing = data;
      refreshQrDisplay();
      startCountdownLoop();
    } catch (err) {
      const fb = modal.querySelector('#rey-copy-feedback');
      setInlineFeedback(fb, err.message, true);
    }
  }

  function renderDevicesAndAudit() {
    const devList = modal.querySelector('#rey-devices-list');
    const auditList = modal.querySelector('#rey-audit-list');
    const auth = getPcRemoteAuth();

    if (!auth.isAuthenticated) {
      devList.innerHTML = `<div class="rey-empty-state">Inicia sesión para gestionar dispositivos, aprobaciones y roles desde SQLite.</div>`;
      auditList.innerHTML = `<div class="rey-empty-state">Sin eventos activos.</div>`;
      return;
    }

    if (!cachedDevices.length) {
      devList.innerHTML = `<div class="rey-empty-state">No hay otros dispositivos vinculados todavía. Escanea el QR o usa el PIN en tu móvil.</div>`;
    } else {
      devList.innerHTML = cachedDevices
        .map((dev) => {
          const isCurrent = auth.device?.id === dev.id;
          const isPending = dev.status === 'pending';
          const isRevoked = dev.status === 'revoked';
          const icon = dev.deviceType === 'pc' ? 'devices' : 'smartphone';
          const statusLabel =
            dev.status === 'pending'
              ? 'Pendiente'
              : dev.status === 'revoked'
                ? 'Revocado'
                : 'Aprobado';
          const statusClass =
            dev.status === 'pending'
              ? 'is-pending'
              : dev.status === 'revoked'
                ? 'is-revoked'
                : '';
          return `
            <div class="rey-device-row ${isPending ? 'is-pending' : ''}">
              <div class="rey-device-top">
                <div class="rey-device-id">
                  <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
                  <div>
                    <div class="rey-dest-name">${escapeHtml(dev.deviceName)}${isCurrent ? ' (Este equipo)' : ''}</div>
                    <div class="rey-dest-coords">${escapeHtml(dev.ipHint || 'local')} · ${formatRelTime(dev.lastSeen)}</div>
                  </div>
                </div>
                <span class="rey-role-badge ${statusClass}">${statusLabel}</span>
              </div>
              ${
                !isCurrent
                  ? `
                <div class="rey-device-actions">
                  <select class="rey-select rey-device-role-select" data-dev-id="${escapeHtml(dev.id)}" aria-label="Rol de ${escapeHtml(dev.deviceName)}">
                    <option value="operator" ${dev.role === 'operator' ? 'selected' : ''}>Operador</option>
                    <option value="viewer" ${dev.role === 'viewer' ? 'selected' : ''}>Control (Monitor SQL)</option>
                    <option value="admin" ${dev.role === 'admin' ? 'selected' : ''}>Admin</option>
                  </select>
                  ${
                    isPending || isRevoked
                      ? `<button type="button" class="rey-btn rey-btn-accent rey-btn-sm rey-dev-approve" data-dev-id="${escapeHtml(dev.id)}">Aprobar</button>`
                      : `<button type="button" class="rey-btn rey-btn-danger rey-btn-sm rey-dev-revoke" data-dev-id="${escapeHtml(dev.id)}">Revocar</button>`
                  }
                  <button type="button" class="rey-btn rey-btn-ghost rey-btn-sm rey-dev-delete" data-dev-id="${escapeHtml(dev.id)}" aria-label="Eliminar dispositivo">Eliminar</button>
                </div>
              `
                  : ''
              }
            </div>
          `;
        })
        .join('');

      devList.querySelectorAll('.rey-device-role-select').forEach((sel) => {
        sel.addEventListener('change', async () => {
          const id = sel.getAttribute('data-dev-id');
          try {
            await remoteApiRequest(`/devices/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body: { role: sel.value },
            });
            await refreshDevices();
          } catch (err) {
            setInlineFeedback(modal.querySelector('#rey-devices-feedback'), err.message, true);
          }
        });
      });

      devList.querySelectorAll('.rey-dev-approve').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-dev-id');
          try {
            await remoteApiRequest(`/devices/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body: { status: 'approved' },
            });
            await refreshDevices();
          } catch (err) {
            setInlineFeedback(modal.querySelector('#rey-devices-feedback'), err.message, true);
          }
        });
      });

      devList.querySelectorAll('.rey-dev-revoke').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-dev-id');
          try {
            await remoteApiRequest(`/devices/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body: { status: 'revoked' },
            });
            await refreshDevices();
          } catch (err) {
            setInlineFeedback(modal.querySelector('#rey-devices-feedback'), err.message, true);
          }
        });
      });

      devList.querySelectorAll('.rey-dev-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-dev-id');
          try {
            await remoteApiRequest(`/devices/${encodeURIComponent(id)}`, {
              method: 'DELETE',
            });
            await refreshDevices();
          } catch (err) {
            setInlineFeedback(modal.querySelector('#rey-devices-feedback'), err.message, true);
          }
        });
      });
    }

    const clearBtn = modal.querySelector('#rey-btn-clear-audit');
    if (clearBtn) {
      clearBtn.hidden = !cachedAuditLogs.length;
    }

    if (!cachedAuditLogs.length) {
      auditList.innerHTML = `<div class="rey-empty-state">Sin cambios ni eventos recientes en la consola.</div>`;
    } else {
      auditList.innerHTML = cachedAuditLogs
        .slice(0, 20)
        .map((ev) => {
          const label = AUDIT_EVENT_LABELS[ev.eventType] || ev.eventType;
          const detailText = formatAuditDetailText(ev);
          const actorSuffix = detailText ? ` · ${escapeHtml(detailText)}` : '';
          return `
            <div class="rey-audit-row">
              <span class="rey-audit-event">${escapeHtml(label)}${actorSuffix}</span>
              <span class="rey-audit-meta">
                <span class="rey-audit-time">${formatRelTime(ev.createdAt)}</span>
                <button type="button" class="rey-audit-del" data-audit-id="${Number(ev.id) || 0}" aria-label="Eliminar cambio de la consola" title="Eliminar de la consola">
                  <span class="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
              </span>
            </div>
          `;
        })
        .join('');

      auditList.querySelectorAll('.rey-audit-del').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.getAttribute('data-audit-id'));
          if (!Number.isInteger(id) || id <= 0) return;
          btn.disabled = true;
          try {
            await remoteApiRequest(`/audit/${id}`, { method: 'DELETE' });
            cachedAuditLogs = cachedAuditLogs.filter((entry) => Number(entry.id) !== id);
            renderDevicesAndAudit();
          } catch (err) {
            btn.disabled = false;
            setInlineFeedback(modal.querySelector('#rey-devices-feedback'), err.message, true);
          }
        });
      });
    }
  }

  async function refreshDevices() {
    if (!pcAuthState.token) return;
    try {
      const data = await remoteApiRequest('/devices', { method: 'GET' });
      cachedDevices = data.devices || [];
      cachedAuditLogs = data.auditLogs || [];
      renderDevicesAndAudit();
    } catch {
      /* ignore transient error */
    }
  }

  function renderAuthPanels() {
    const authCard = modal.querySelector('#rey-auth-card');
    const pairCard = modal.querySelector('#rey-pairing-card');
    const auth = getPcRemoteAuth();

    authCard.hidden = auth.isAuthenticated;
    pairCard.hidden = !auth.isAuthenticated;

    if (auth.isAuthenticated) {
      modal.querySelector('#rey-auth-username-label').textContent = `@${auth.user.username}`;
      modal.querySelector('#rey-auth-role-badge').textContent = formatRoleLabel(auth.user.role);
      refreshQrDisplay();
      renderDevicesAndAudit();
    } else {
      activePairing = null;
      cachedDevices = [];
      cachedAuditLogs = [];
      stopTimers();
      renderDevicesAndAudit();
    }
  }

  function renderList() {
    const listEl = modal.querySelector('#gev-destinations-list');
    const labelPass = modal.querySelector('#gev-label-active-pass');
    if (labelPass) labelPass.textContent = currentProfile || 'General';

    const items = getDestinationsForPassword(currentProfile);
    if (!items.length) {
      listEl.innerHTML = `<div class="rey-empty-state">No hay destinos guardados para este perfil aún.</div>`;
      return;
    }

    listEl.innerHTML = items
      .map(
        (dest) => `
      <div class="rey-dest-row">
        <div class="rey-dest-info">
          <div class="rey-dest-name">${escapeHtml(dest.name)}</div>
          <div class="rey-dest-coords">${Number(dest.lat).toFixed(4)}, ${Number(dest.lon).toFixed(4)} · ${Math.round(dest.height || 15000)} m</div>
        </div>
        <div class="rey-dest-actions">
          <button type="button" class="gev-btn-fly rey-btn rey-btn-accent" data-lat="${Number(dest.lat) || 0}" data-lon="${Number(dest.lon) || 0}" data-height="${Number(dest.height) || 15000}">Ir</button>
          <button type="button" class="gev-btn-del rey-btn rey-btn-danger" data-id="${escapeHtml(dest.id)}" aria-label="Eliminar destino">✕</button>
        </div>
      </div>
    `,
      )
      .join('');

    listEl.querySelectorAll('.gev-btn-fly').forEach((b) => {
      b.addEventListener('click', () => {
        const lat = Number(b.getAttribute('data-lat'));
        const lon = Number(b.getAttribute('data-lon'));
        const height = Number(b.getAttribute('data-height'));
        if (viewer?.camera?.flyTo) {
          holdContinuousRender('custom-dest-fly');
          governorRequestRender();
          viewer.camera.flyTo({
            destination: degreesToCartesian3(lon, lat, height),
            duration: 2.0,
            complete: () => {
              releaseContinuousRender('custom-dest-fly');
              governorRequestRender();
            },
            cancel: () => {
              releaseContinuousRender('custom-dest-fly');
              governorRequestRender();
            },
          });
        }
      });
    });

    listEl.querySelectorAll('.gev-btn-del').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        removeCustomDestination(id, currentProfile);
        renderList();
        syncCurrentDestinations();
      });
    });
  }

  async function syncCurrentDestinations() {
    const feedback = modal.querySelector('#gev-user-feedback');
    if (!pcAuthState.token) return;
    try {
      const code = pcAuthState.user?.username || getSharedUserCode();
      const list = getDestinationsForPassword(currentProfile);
      await syncDestinationsToServer({
        sessionName: code,
        password: currentProfile,
        destinations: list,
      });
      setInlineFeedback(
        feedback,
        `Perfil "${currentProfile || 'General'}" guardado en SQLite para @${code}.`,
      );
    } catch {
      /* ignore offline errors */
    }
  }

  const openModal = () => {
    modal.hidden = false;
    modal.classList.add('is-open');
    renderAuthPanels();
    renderList();
    if (pcAuthState.token) {
      refreshDevices();
      if (!devicesPollTimer) {
        devicesPollTimer = setInterval(refreshDevices, 4500);
      }
      if (!activePairing || activePairing.expiresAt <= Date.now()) {
        void generateNewPairingCode();
      }
    }
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.hidden = true;
    stopTimers();
  };

  triggerBtn.addEventListener('click', openModal);
  modal.querySelector('#gev-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Left Auth tabs (login vs register)
  modal.querySelectorAll('[data-auth-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      authMode = btn.getAttribute('data-auth-mode') === 'register' ? 'register' : 'login';
      modal.querySelectorAll('[data-auth-mode]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      modal.querySelector('#rey-register-name-wrap').hidden = authMode !== 'register';
      modal.querySelector('#rey-btn-auth-submit').textContent =
        authMode === 'register' ? 'Crear cuenta SQL y conectar' : 'Iniciar sesión segura';
      const fb = modal.querySelector('#rey-auth-feedback');
      if (fb) fb.hidden = true;
    });
  });

  // Right column subtabs
  modal.querySelectorAll('[data-right-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      rightTab = btn.getAttribute('data-right-tab') || 'devices';
      modal.querySelectorAll('[data-right-tab]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      modal.querySelectorAll('[data-right-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-right-panel') !== rightTab;
      });
    });
  });

  // Auth submit (Login or Register)
  modal.querySelector('#rey-auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = modal.querySelector('#gev-input-pc-user').value.trim();
    const password = modal.querySelector('#rey-input-pc-auth-pass').value;
    const displayName = modal.querySelector('#rey-input-display-name').value.trim();
    const deviceName = modal.querySelector('#rey-input-pc-device-name').value.trim() || 'PC Principal';
    const fb = modal.querySelector('#rey-auth-feedback');

    const verdict = validateUserCode(username);
    if (!verdict.valid) {
      setInlineFeedback(fb, verdict.error, true);
      return;
    }
    if (!password || password.length < 6) {
      setInlineFeedback(fb, 'La contraseña debe tener al menos 6 caracteres.', true);
      return;
    }

    try {
      const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
      const data = await remoteApiRequest(endpoint, {
        method: 'POST',
        authToken: '',
        body: {
          username,
          password,
          displayName,
          deviceName,
          deviceType: 'pc',
        },
      });
      modal.querySelector('#rey-input-pc-auth-pass').value = '';
      setPcRemoteAuth({
        token: data.token,
        user: data.user,
        device: data.device,
        expiresAt: data.expiresAt,
      });
      renderAuthPanels();
      await generateNewPairingCode();
      await refreshDevices();
      if (!devicesPollTimer) {
        devicesPollTimer = setInterval(refreshDevices, 4500);
      }
      await syncCurrentDestinations();
    } catch (err) {
      setInlineFeedback(fb, err.message, true);
    }
  });

  modal.querySelector('#rey-btn-logout').addEventListener('click', async () => {
    try {
      if (pcAuthState.token) {
        await remoteApiRequest('/auth/logout', { method: 'POST' });
      }
    } catch {
      /* ignore */
    }
    setPcRemoteAuth({ token: '', user: null, device: null, expiresAt: 0 });
    renderAuthPanels();
  });

  modal.querySelector('#rey-btn-regen-pair').addEventListener('click', () => {
    void generateNewPairingCode();
  });

  modal.querySelector('#rey-btn-refresh-devices').addEventListener('click', () => {
    void refreshDevices();
  });

  modal.querySelector('#rey-btn-clear-audit')?.addEventListener('click', async () => {
    if (!pcAuthState.token) return;
    try {
      await remoteApiRequest('/audit', { method: 'DELETE' });
      cachedAuditLogs = [];
      renderDevicesAndAudit();
      setInlineFeedback(
        modal.querySelector('#rey-devices-feedback'),
        'Consola de cambios limpiada en SQLite.',
      );
    } catch (err) {
      setInlineFeedback(
        modal.querySelector('#rey-devices-feedback'),
        err.message,
        true,
      );
    }
  });

  modal.querySelector('#rey-input-base-url').addEventListener('input', (e) => {
    customBaseUrl = e.target.value.trim();
    getStorage().setItem('gev_pairing_base_url', customBaseUrl);
    refreshQrDisplay();
  });

  modal.querySelector('#rey-btn-copy-url').addEventListener('click', async () => {
    const urlVal = modal.querySelector('#rey-qr-url-display')?.value || '';
    const copyFb = modal.querySelector('#rey-copy-feedback');
    try {
      await navigator.clipboard.writeText(urlVal);
      setInlineFeedback(copyFb, 'Enlace temporal copiado al portapapeles.');
    } catch {
      setInlineFeedback(copyFb, 'Selecciona y copia el enlace manualmente.', true);
    }
  });

  // Change account password
  modal.querySelector('#rey-change-pass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fb = modal.querySelector('#rey-changepass-feedback');
    if (!pcAuthState.token) {
      setInlineFeedback(fb, 'Inicia sesión primero.', true);
      return;
    }
    const currentPassword = modal.querySelector('#rey-cur-pass').value;
    const newPassword = modal.querySelector('#rey-new-pass').value;
    const revokeOtherSessions = modal.querySelector('#rey-revoke-others').checked;
    try {
      await remoteApiRequest('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword, revokeOtherSessions },
      });
      modal.querySelector('#rey-cur-pass').value = '';
      modal.querySelector('#rey-new-pass').value = '';
      setInlineFeedback(fb, 'Contraseña actualizada correctamente en SQLite.');
      await refreshDevices();
    } catch (err) {
      setInlineFeedback(fb, err.message, true);
    }
  });

  modal.querySelector('#gev-btn-apply-password').addEventListener('click', () => {
    const passInput = modal.querySelector('#gev-input-pc-password');
    currentProfile = setActivePassword(passInput.value);
    renderList();
    syncCurrentDestinations();
  });

  modal.querySelectorAll('.gev-btn-quick-pass').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-pass');
      modal.querySelector('#gev-input-pc-password').value = p;
      currentProfile = setActivePassword(p);
      renderList();
      syncCurrentDestinations();
    });
  });

  modal.querySelector('#gev-btn-capture-camera').addEventListener('click', () => {
    const captureFb = modal.querySelector('#rey-capture-feedback');
    const nameInput = modal.querySelector('#rey-capture-name');
    const coords = getCurrentCameraCoordinates(viewer);
    if (!coords) {
      setInlineFeedback(captureFb, 'No se pudo leer la posición actual de la cámara.', true);
      return;
    }
    const label = nameInput.value.trim() || `Vista (${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)})`;
    addCustomDestination({
      name: label,
      lat: coords.lat,
      lon: coords.lon,
      height: coords.height,
      password: currentProfile,
    });
    nameInput.value = '';
    setInlineFeedback(captureFb, `"${label}" guardado en el perfil.`);
    renderList();
    syncCurrentDestinations();
  });

  modal.querySelector('#gev-btn-add-manual-dest').addEventListener('click', () => {
    const nameInput = modal.querySelector('#gev-input-dest-name');
    const latInput = modal.querySelector('#gev-input-dest-lat');
    const lonInput = modal.querySelector('#gev-input-dest-lon');
    const captureFb = modal.querySelector('#rey-capture-feedback');

    const name = nameInput.value.trim() || 'Punto de interés';
    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setInlineFeedback(captureFb, 'Introduce latitud y longitud válidas.', true);
      return;
    }

    addCustomDestination({ name, lat, lon, height: 18000, password: currentProfile });
    nameInput.value = '';
    latInput.value = '';
    lonInput.value = '';

    setInlineFeedback(captureFb, `"${name}" agregado.`);
    renderList();
    syncCurrentDestinations();
  });

  const hwFeedback = modal.querySelector('#gev-hw-feedback');
  const hwButtons = [
    { mode: 'low', el: modal.querySelector('#gev-btn-hw-low') },
    { mode: 'auto', el: modal.querySelector('#gev-btn-hw-auto') },
    { mode: 'high', el: modal.querySelector('#gev-btn-hw-high') },
  ];

  function renderHardwareStatus(mode, prof) {
    for (const item of hwButtons) {
      const isSelected = item.mode === mode;
      item.el?.classList.toggle('is-active', isSelected);
      item.el?.setAttribute('aria-pressed', String(isSelected));
    }
    const cacheMb = Math.round(prof.tileCacheBytes / 1024 / 1024);
    if (mode === 'low') {
      setInlineFeedback(
        hwFeedback,
        `Ahorro 30 FPS activo (AMD E-350 / HD 6310): ${prof.targetFrameRate} FPS · escala ${prof.resolutionScale}x · caché ${cacheMb} MB · MSAA/FXAA desactivados.`,
      );
    } else if (mode === 'high') {
      setInlineFeedback(
        hwFeedback,
        `Alta calidad activa: ${prof.targetFrameRate} FPS · escala ${prof.resolutionScale}x · caché ${cacheMb} MB · MSAA ${prof.msaaSamples}x.`,
      );
    } else {
      setInlineFeedback(
        hwFeedback,
        `Automático (${prof.isLowSpec ? 'perfil ligero 30 FPS' : 'hardware estándar 60 FPS'}): ${prof.targetFrameRate} FPS · escala ${prof.resolutionScale}x · caché ${cacheMb} MB.`,
      );
    }
  }

  function updateHardwareUI(mode) {
    const savedMode = setHardwareMode(mode);
    const prof = applyHardwareOptimizations(viewer);
    renderHardwareStatus(savedMode, prof);
  }

  renderHardwareStatus(getHardwareMode(), getOptimalPerformanceProfile());

  modal.querySelector('#gev-btn-hw-low').addEventListener('click', () => updateHardwareUI('low'));
  modal.querySelector('#gev-btn-hw-auto').addEventListener('click', () => updateHardwareUI('auto'));
  modal.querySelector('#gev-btn-hw-high').addEventListener('click', () => updateHardwareUI('high'));

  modal.querySelector('#gev-btn-sync-all').addEventListener('click', syncCurrentDestinations);
}
