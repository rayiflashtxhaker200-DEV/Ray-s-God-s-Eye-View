/**
 * Custom Destinations and Device Pairing for Ray's Eye View
 * Manages:
 * 1. sharedUserCode: Shared username/code (minimum 4 characters/digits) linking PC and mobile.
 * 2. customDestinationsList & Password Presets:
 *    - Each specific password loads its own unique set of pre-established destinations.
 *    - Allows saving custom sets per password on PC and loading them instantly on mobile.
 */

import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from './renderGovernor.js';
import {
  getOptimalPerformanceProfile,
  applyHardwareOptimizations,
  STORAGE_HARDWARE_MODE_KEY,
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

// Key constants
export const STORAGE_USER_CODE_KEY = 'gev_shared_user_code';
export const STORAGE_DESTINATIONS_KEY = 'gev_custom_destinations';
export const STORAGE_ACTIVE_PASSWORD_KEY = 'gev_active_preset_password';

/**
 * Default preset packs hardcoded for specific passwords.
 * If the user inputs one of these passwords on mobile or PC, this exact preset pack is loaded.
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

/**
 * Validate that the username/code has at least 4 characters/digits.
 */
export function validateUserCode(code) {
  const trimmed = String(code ?? '').trim();
  if (trimmed.length < 4) {
    return {
      valid: false,
      error: 'El nombre de usuario o código debe tener al menos 4 caracteres o dígitos.',
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
  const clean = code.trim();
  getStorage().setItem(STORAGE_USER_CODE_KEY, clean);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gev:user-code-changed', { detail: clean }));
    const input = document.getElementById('gev-input-pc-user');
    if (input && input.value !== clean) input.value = clean;
  }
  return clean;
}

/**
 * Retrieve the active password key for destinations.
 */
export function getActivePassword() {
  return getStorage().getItem(STORAGE_ACTIVE_PASSWORD_KEY) || '';
}

/**
 * Set the active password key.
 */
export function setActivePassword(password = '') {
  const clean = String(password ?? '').trim().toLowerCase();
  getStorage().setItem(STORAGE_ACTIVE_PASSWORD_KEY, clean);
  return clean;
}

/**
 * Retrieve destinations associated with a specific password.
 * Checks user custom overrides first, then hardcoded default presets, or returns empty.
 */
export function getDestinationsForPassword(password = '') {
  const key = String(password ?? '').trim().toLowerCase();
  if (!key) {
    return getCustomDestinations();
  }

  // 1. Check user custom storage for this password
  try {
    const raw = getStorage().getItem(`gev_preset_pass_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    // ignore
  }

  // 2. Check built-in code presets
  if (DEFAULT_PASSWORD_PRESETS[key]) {
    return [...DEFAULT_PASSWORD_PRESETS[key]];
  }

  return [];
}

/**
 * Save custom destinations associated with a specific password.
 */
export function saveDestinationsForPassword(password = '', destinations = []) {
  const key = String(password ?? '').trim().toLowerCase();
  const list = Array.isArray(destinations) ? destinations : [];
  if (!key) {
    saveCustomDestinations(list);
    return list;
  }
  getStorage().setItem(`gev_preset_pass_${key}`, JSON.stringify(list));
  return list;
}

/**
 * Retrieve the current default custom destinations list.
 */
export function getCustomDestinations() {
  try {
    const raw = getStorage().getItem(STORAGE_DESTINATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save custom destinations list to local storage.
 */
export function saveCustomDestinations(destinations) {
  const list = Array.isArray(destinations) ? destinations : [];
  getStorage().setItem(STORAGE_DESTINATIONS_KEY, JSON.stringify(list));
  return list;
}

/**
 * Add a new destination to a password profile (or default profile).
 */
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

/**
 * Remove a custom destination by id from a password profile.
 */
export function removeCustomDestination(id, password = '') {
  const passKey = String(password ?? '').trim().toLowerCase();
  const list = (passKey ? getDestinationsForPassword(passKey) : getCustomDestinations()).filter((d) => d.id !== id);
  if (passKey) {
    saveDestinationsForPassword(passKey, list);
  } else {
    saveCustomDestinations(list);
  }
  return list;
}

/**
 * Extract the current camera coordinates from Cesium viewer.
 */
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

/**
 * Push custom destinations for a password to the remote server session.
 */
export async function syncDestinationsToServer({
  serverUrl = '',
  sessionName = 'default',
  destinations,
  password = '',
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
} = {}) {
  if (!fetchImpl) return null;
  const base = serverUrl.replace(/\/+$/, '');
  const endpoint = `${base}/api/remote/session`;

  const passKey = String(password ?? '').trim().toLowerCase();
  const list = destinations ?? (passKey ? getDestinationsForPassword(passKey) : getCustomDestinations());

  const payload = {
    sessionName,
    password: passKey,
    deviceName: 'PC Master',
    deviceType: 'pc',
    customLocations: list,
    command: {
      action: 'sync_custom_locations',
      args: { locations: list, password: passKey },
    },
  };

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch custom destinations from the remote server session for a specific password.
 */
export async function fetchDestinationsFromServer({
  serverUrl = '',
  sessionName = 'default',
  password = '',
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
} = {}) {
  if (!fetchImpl) return [];
  const base = serverUrl.replace(/\/+$/, '');
  const passKey = String(password ?? '').trim().toLowerCase();
  const query = new URLSearchParams({ session: sessionName });
  if (passKey) query.set('password', passKey);
  const endpoint = `${base}/api/remote/session?${query.toString()}`;

  const res = await fetchImpl(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.customLocations || [];
}

/**
 * Build the direct mobile remote pairing URL with session and optional profile password.
 */
export function buildMobilePairingUrl({
  baseUrl = typeof window !== 'undefined' ? window.location.origin : '',
  sessionName = getSharedUserCode(),
  password = getActivePassword(),
} = {}) {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  const params = new URLSearchParams({
    remote: 'mobile',
    session: String(sessionName || 'user1234').trim(),
  });
  if (password) {
    params.set('pass', String(password).trim().toLowerCase());
  }
  return `${cleanBase}/?${params.toString()}`;
}

/**
 * Mount PC Pairing (with live QR code) & Password Presets Modal.
 * Binds to #remote-pairing-btn in the top bar when present.
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
    triggerBtn.textContent = 'Control Móvil · QR';
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

  let currentPassword = getActivePassword() || '';
  let customBaseUrl =
    getStorage().getItem('gev_pairing_base_url') ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  modal.innerHTML = `
    <div class="rey-pairing-dialog">
      <header class="rey-pairing-header">
        <div>
          <p class="rey-pairing-kicker">Ray's Eye View · Vinculación Móvil</p>
          <h2 id="rey-pairing-title">Control Remoto y Destinos</h2>
        </div>
        <button id="gev-modal-close" type="button" class="rey-icon-close" aria-label="Cerrar panel de control remoto">✕</button>
      </header>

      <div class="rey-pairing-grid">
        <!-- Columna izquierda: QR + Sesión -->
        <section class="rey-pairing-section rey-qr-card">
          <div class="rey-section-title">Emparejamiento rápido por QR</div>
          <p class="rey-section-desc">
            Escanea este código con tu teléfono para abrir el mando táctil conectado directamente a esta pantalla.
          </p>
          <div id="rey-qr-preview" class="rey-qr-preview"></div>
          <div class="rey-qr-url-row">
            <input id="rey-qr-url-display" type="text" readonly class="rey-input rey-mono" aria-label="Enlace directo de control remoto" />
            <button id="rey-btn-copy-url" type="button" class="rey-btn rey-btn-accent">Copiar</button>
          </div>
          <div id="rey-copy-feedback" class="rey-inline-feedback" hidden></div>

          <div class="rey-field-group">
            <label for="rey-input-base-url" class="rey-label">URL base / Túnel LAN</label>
            <input id="rey-input-base-url" type="text" value="${escapeHtml(customBaseUrl)}" placeholder="https://tu-tunel.devtunnels.ms" class="rey-input rey-mono" />
          </div>

          <div class="rey-field-group">
            <label for="gev-input-pc-user" class="rey-label">Código de sesión (mín. 4 caracteres)</label>
            <div class="rey-row-gap">
              <input id="gev-input-pc-user" type="text" value="${escapeHtml(getSharedUserCode())}" placeholder="user1234" class="rey-input rey-mono" />
              <button id="gev-btn-save-user" type="button" class="rey-btn rey-btn-primary">Guardar</button>
            </div>
            <div id="gev-user-feedback" class="rey-inline-feedback" hidden></div>
          </div>
        </section>

        <!-- Columna derecha: Destinos + Rendimiento -->
        <div class="rey-pairing-col">
          <section class="rey-pairing-section">
            <div class="rey-section-header-row">
              <div class="rey-section-title">Perfiles de destinos · <span id="gev-label-active-pass" class="rey-accent-text">${escapeHtml(currentPassword || 'General')}</span></div>
              <button id="gev-btn-sync-all" type="button" class="rey-btn rey-btn-ghost">Sincronizar</button>
            </div>

            <div class="rey-row-gap">
              <input id="gev-input-pc-password" type="text" value="${escapeHtml(currentPassword)}" placeholder="Clave de perfil (ej: ciudades99)" class="rey-input" />
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

          <section class="rey-pairing-section">
            <div class="rey-section-title">Perfil de rendimiento gráfico</div>
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

  function escapeHtml(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setInlineFeedback(el, text, isError = false) {
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-error', isError);
    el.classList.toggle('is-success', !isError);
  }

  function refreshQr() {
    const baseInput = modal.querySelector('#rey-input-base-url');
    const urlInput = modal.querySelector('#rey-qr-url-display');
    const qrHost = modal.querySelector('#rey-qr-preview');
    const baseVal = (baseInput?.value || customBaseUrl || window.location.origin).trim();
    const pairingUrl = buildMobilePairingUrl({
      baseUrl: baseVal,
      sessionName: getSharedUserCode(),
      password: currentPassword,
    });
    if (urlInput) urlInput.value = pairingUrl;
    if (qrHost) {
      qrHost.innerHTML = renderQrCodeSvg(pairingUrl, { sizePx: 184 });
    }
  }

  function renderList() {
    const listEl = modal.querySelector('#gev-destinations-list');
    const labelPass = modal.querySelector('#gev-label-active-pass');
    if (labelPass) labelPass.textContent = currentPassword || 'General';

    const items = getDestinationsForPassword(currentPassword);
    if (!items.length) {
      listEl.innerHTML = `
        <div class="rey-empty-state">
          No hay destinos guardados para este perfil aún.
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map((dest) => `
      <div class="rey-dest-row">
        <div class="rey-dest-info">
          <div class="rey-dest-name">${escapeHtml(dest.name)}</div>
          <div class="rey-dest-coords">${Number(dest.lat).toFixed(4)}, ${Number(dest.lon).toFixed(4)} · ${Math.round(dest.height || 15000)} m</div>
        </div>
        <div class="rey-dest-actions">
          <button type="button" class="gev-btn-fly rey-btn rey-btn-accent" data-lat="${dest.lat}" data-lon="${dest.lon}" data-height="${dest.height}">Ir</button>
          <button type="button" class="gev-btn-del rey-btn rey-btn-danger" data-id="${dest.id}" aria-label="Eliminar destino">✕</button>
        </div>
      </div>
    `).join('');

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
        removeCustomDestination(id, currentPassword);
        renderList();
        syncCurrentDestinations();
      });
    });
  }

  async function syncCurrentDestinations() {
    const feedback = modal.querySelector('#gev-user-feedback');
    try {
      const code = getSharedUserCode();
      const list = getDestinationsForPassword(currentPassword);
      await syncDestinationsToServer({
        sessionName: code,
        password: currentPassword,
        destinations: list,
      });
      setInlineFeedback(
        feedback,
        `Perfil "${currentPassword || 'General'}" sincronizado con la sesión "${code}".`,
      );
    } catch {
      // ignore offline/transient errors
    }
  }

  const openModal = () => {
    modal.hidden = false;
    modal.classList.add('is-open');
    renderList();
    refreshQr();
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.hidden = true;
  };

  triggerBtn.addEventListener('click', openModal);
  modal.querySelector('#gev-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  modal.querySelector('#rey-input-base-url').addEventListener('input', (e) => {
    customBaseUrl = e.target.value.trim();
    getStorage().setItem('gev_pairing_base_url', customBaseUrl);
    refreshQr();
  });

  modal.querySelector('#rey-btn-copy-url').addEventListener('click', async () => {
    const urlVal = modal.querySelector('#rey-qr-url-display')?.value || '';
    const copyFb = modal.querySelector('#rey-copy-feedback');
    try {
      await navigator.clipboard.writeText(urlVal);
      setInlineFeedback(copyFb, 'Enlace copiado al portapapeles.');
    } catch {
      setInlineFeedback(copyFb, 'Selecciona y copia el enlace manualmente.', true);
    }
  });

  modal.querySelector('#gev-btn-save-user').addEventListener('click', () => {
    const input = modal.querySelector('#gev-input-pc-user');
    const feedback = modal.querySelector('#gev-user-feedback');
    const val = input.value.trim();
    const verdict = validateUserCode(val);

    if (!verdict.valid) {
      setInlineFeedback(feedback, verdict.error, true);
      return;
    }

    setSharedUserCode(val);
    refreshQr();
    setInlineFeedback(feedback, `Sesión "${val}" guardada. Código QR actualizado.`);
    syncCurrentDestinations();
  });

  modal.querySelector('#gev-btn-apply-password').addEventListener('click', () => {
    const passInput = modal.querySelector('#gev-input-pc-password');
    currentPassword = setActivePassword(passInput.value);
    renderList();
    refreshQr();
    syncCurrentDestinations();
  });

  modal.querySelectorAll('.gev-btn-quick-pass').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-pass');
      modal.querySelector('#gev-input-pc-password').value = p;
      currentPassword = setActivePassword(p);
      renderList();
      refreshQr();
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
      password: currentPassword,
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

    addCustomDestination({ name, lat, lon, height: 18000, password: currentPassword });
    nameInput.value = '';
    latInput.value = '';
    lonInput.value = '';

    setInlineFeedback(captureFb, `"${name}" agregado.`);
    renderList();
    syncCurrentDestinations();
  });

  const hwFeedback = modal.querySelector('#gev-hw-feedback');
  function updateHardwareUI(mode) {
    localStorage.setItem(STORAGE_HARDWARE_MODE_KEY, mode);
    applyHardwareOptimizations(viewer);
    const prof = getOptimalPerformanceProfile();
    if (mode === 'low') {
      setInlineFeedback(hwFeedback, 'Modo ahorro activo: 30 FPS y caché ligera.');
    } else if (mode === 'high') {
      setInlineFeedback(hwFeedback, 'Modo alta calidad activo: 60 FPS.');
    } else {
      setInlineFeedback(
        hwFeedback,
        `Modo automático: ${prof.isLowSpec ? 'hardware ligero' : 'hardware estándar'}.`,
      );
    }
  }

  modal.querySelector('#gev-btn-hw-low').addEventListener('click', () => updateHardwareUI('low'));
  modal.querySelector('#gev-btn-hw-auto').addEventListener('click', () => updateHardwareUI('auto'));
  modal.querySelector('#gev-btn-hw-high').addEventListener('click', () => updateHardwareUI('high'));

  modal.querySelector('#gev-btn-sync-all').addEventListener('click', syncCurrentDestinations);

  syncCurrentDestinations();
}
