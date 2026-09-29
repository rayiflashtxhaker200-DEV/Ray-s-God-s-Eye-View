/**
 * Custom Destinations and Device Pairing for God's Eye View
 * Manages:
 * 1. sharedUserCode: Shared username/code (minimum 4 characters/digits) linking PC and mobile.
 * 2. customDestinationsList & Password Presets:
 *    - Each specific password loads its own unique set of pre-established destinations.
 *    - Allows saving custom sets per password on PC and loading them instantly on mobile.
 */

import {
  isLowSpecDevice,
  getOptimalPerformanceProfile,
  applyHardwareOptimizations,
  STORAGE_HARDWARE_MODE_KEY,
} from './hardwareProfile.js';

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
 * Mount PC Pairing & Password Presets Modal / Panel
 */
export function mountPcPairingAndDestinationsPanel(viewer) {
  if (typeof document === 'undefined') return;

  if (document.getElementById('gev-pc-pairing-btn')) return;

  const triggerBtn = document.createElement('button');
  triggerBtn.id = 'gev-pc-pairing-btn';
  triggerBtn.innerHTML = '📱 Conexión Móvil y Destinos';
  triggerBtn.style.cssText = `
    position: fixed; bottom: 18px; left: 18px; z-index: 9998;
    background: #0f172a; border: 1px solid #00e5ff; color: #00e5ff;
    padding: 8px 14px; border-radius: 6px; font-family: 'JetBrains Mono', monospace;
    font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center;
    gap: 8px; box-shadow: 0 4px 16px rgba(0, 229, 255, 0.15); transition: all 0.2s ease;
  `;

  triggerBtn.addEventListener('mouseenter', () => {
    triggerBtn.style.background = '#1e293b';
    triggerBtn.style.boxShadow = '0 4px 20px rgba(0, 229, 255, 0.3)';
  });
  triggerBtn.addEventListener('mouseleave', () => {
    triggerBtn.style.background = '#0f172a';
    triggerBtn.style.boxShadow = '0 4px 16px rgba(0, 229, 255, 0.15)';
  });

  document.body.appendChild(triggerBtn);

  const modal = document.createElement('div');
  modal.id = 'gev-pc-pairing-modal';
  modal.style.cssText = `
    display: none; position: fixed; inset: 0; z-index: 99999;
    background: rgba(4, 7, 13, 0.78); backdrop-filter: blur(4px);
    align-items: center; justify-content: center; padding: 16px;
    font-family: 'JetBrains Mono', monospace, sans-serif;
  `;

  let currentPassword = getActivePassword() || '';

  modal.innerHTML = `
    <div style="background: #0b1120; border: 1px solid #1e293b; border-radius: 10px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; color: #e2e8f0; padding: 20px; box-sizing: border-box; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="margin: 0; font-size: 16px; color: #fff; display: flex; align-items: center; gap: 8px;">
          <span>📱</span> Conexión Móvil y Perfiles con Contraseña
        </h2>
        <button id="gev-modal-close" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">✕</button>
      </div>

      <!-- Variable 1: Usuario compartido (minimo 4 digitos) -->
      <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #00e5ff; font-weight: 600; margin-bottom: 6px;">
          1. Nombre de Usuario Compartido (Mín. 4 caracteres)
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 10px;">
          Pon este mismo usuario en el móvil (?remote=mobile) para emparejarte a este mapa.
        </p>
        <div style="display: flex; gap: 8px;">
          <input id="gev-input-pc-user" type="text" value="${escapeHtml(getSharedUserCode())}" placeholder="Mínimo 4 caracteres (ej: user1234)"
            style="flex: 1; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 13px; font-family: inherit;" />
          <button id="gev-btn-save-user" style="background: #0284c7; color: #fff; border: none; border-radius: 6px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;">
            Guardar
          </button>
        </div>
        <div id="gev-user-feedback" style="font-size: 11px; margin-top: 6px; display: none;"></div>
      </div>

      <!-- Variable 2: Contrasena de Perfil de Destinos -->
      <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8; font-weight: 600; margin-bottom: 6px;">
          2. Contraseña del Perfil de Destinos
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 10px;">
          Con cada contraseña se carga un conjunto de destinos diferente. Puedes usar las claves del sistema (<strong>alfa1234</strong>, <strong>tactical2026</strong>, <strong>ciudades99</strong>) o escribir tu propia contraseña secreta:
        </p>
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <input id="gev-input-pc-password" type="text" value="${escapeHtml(currentPassword)}" placeholder="Ej: alfa1234, tactical2026, o tu clave..."
            style="flex: 1; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 13px; font-family: inherit;" />
          <button id="gev-btn-apply-password" style="background: #38bdf8; color: #020617; border: none; border-radius: 6px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer;">
            Cargar Clave
          </button>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="gev-btn-quick-pass" data-pass="alfa1234" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">🔑 alfa1234</button>
          <button class="gev-btn-quick-pass" data-pass="tactical2026" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">🔑 tactical2026</button>
          <button class="gev-btn-quick-pass" data-pass="ciudades99" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">🔑 ciudades99</button>
        </div>
      </div>

      <!-- Variable 3: Optimizacion de Servidor y PC Antigua (Dell i5 1ra Gen, AMD E-450, HDD 298GB) -->
      <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #10b981; font-weight: 600; margin-bottom: 6px;">
          ⚡ 3. Optimización para PC / Servidor Antiguo (Core i5 1ra Gen / AMD E-450 / HDD 5400 RPM)
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 10px;">
          Evita que la máquina se congele ("trabe"): limita a 30 FPS para evitar sobrecalentamiento, reduce la caché de tiles a 256 MB para no saturar el HDD de 298 GB con archivos de paginación, y desactiva MSAA pesado en gráficas Radeon 5000 / E-450.
        </p>
        <div style="display: flex; gap: 8px;">
          <button id="gev-btn-hw-low" style="flex: 1; background: #064e3b; border: 1px solid #059669; color: #34d399; border-radius: 6px; padding: 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
            ⚡ Modo Ahorro / PC Antigua
          </button>
          <button id="gev-btn-hw-auto" style="flex: 1; background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 6px; padding: 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
            Auto (Recomendado)
          </button>
          <button id="gev-btn-hw-high" style="flex: 1; background: #1e293b; border: 1px solid #334155; color: #94a3b8; border-radius: 6px; padding: 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
            Alta Calidad
          </button>
        </div>
        <div id="gev-hw-feedback" style="font-size: 11px; color: #34d399; margin-top: 6px; display: none;"></div>
      </div>

      <!-- Destinos del perfil actual -->
      <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #00e5ff; font-weight: 600;">
            Destinos de: <span id="gev-label-active-pass" style="color: #38bdf8;">${currentPassword || '(General)'}</span>
          </div>
          <button id="gev-btn-sync-all" style="background: #059669; color: #fff; border: none; border-radius: 4px; padding: 5px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
            🔄 Sincronizar Perfil
          </button>
        </div>

        <button id="gev-btn-capture-camera" style="
          width: 100%; background: #1e293b; border: 1px dashed #38bdf8; color: #38bdf8;
          border-radius: 6px; padding: 10px; font-size: 12px; font-weight: 600; cursor: pointer;
          margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;
        ">
          📍 Guardar vista actual de la cámara en este perfil
        </button>

        <!-- Formulario manual -->
        <div style="background: #070a11; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; margin-bottom: 14px;">
          <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 6px;">O agregar manualmente:</div>
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 6px; margin-bottom: 6px;">
            <input id="gev-input-dest-name" type="text" placeholder="Nombre" style="background: #0b1120; border: 1px solid #334155; border-radius: 4px; padding: 6px 8px; color: #fff; font-size: 11px;" />
            <input id="gev-input-dest-lat" type="number" step="any" placeholder="Latitud" style="background: #0b1120; border: 1px solid #334155; border-radius: 4px; padding: 6px 8px; color: #fff; font-size: 11px;" />
            <input id="gev-input-dest-lon" type="number" step="any" placeholder="Longitud" style="background: #0b1120; border: 1px solid #334155; border-radius: 4px; padding: 6px 8px; color: #fff; font-size: 11px;" />
          </div>
          <button id="gev-btn-add-manual-dest" style="background: #334155; color: #f1f5f9; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer; width: 100%;">
            + Agregar a esta contraseña
          </button>
        </div>

        <div id="gev-destinations-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto;">
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  function escapeHtml(t) {
    return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderList() {
    const listEl = modal.querySelector('#gev-destinations-list');
    const labelPass = modal.querySelector('#gev-label-active-pass');
    if (labelPass) labelPass.textContent = currentPassword || '(General)';

    const items = getDestinationsForPassword(currentPassword);
    if (!items.length) {
      listEl.innerHTML = `
        <div style="font-size: 11px; color: #64748b; text-align: center; padding: 12px;">
          No hay destinos guardados para esta contraseña aún.
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map((dest) => `
      <div style="display: flex; justify-content: space-between; align-items: center; background: #070a11; border: 1px solid #1e293b; border-radius: 6px; padding: 8px 10px;">
        <div>
          <div style="font-size: 12px; font-weight: 600; color: #f8fafc;">📍 ${escapeHtml(dest.name)}</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
            Lat: ${dest.lat}, Lon: ${dest.lon} | Alt: ${dest.height}m
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="gev-btn-fly" data-lat="${dest.lat}" data-lon="${dest.lon}" data-height="${dest.height}" style="background: #0284c7; color: #fff; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
            Volar
          </button>
          <button class="gev-btn-del" data-id="${dest.id}" style="background: #450a0a; color: #f87171; border: 1px solid #dc2626; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
            ✕
          </button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.gev-btn-fly').forEach((b) => {
      b.addEventListener('click', () => {
        const lat = Number(b.getAttribute('data-lat'));
        const lon = Number(b.getAttribute('data-lon'));
        const height = Number(b.getAttribute('data-height'));
        if (viewer?.camera?.flyTo) {
          if (typeof Cesium !== 'undefined' && Cesium.Cartesian3) {
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
              duration: 2.0,
            });
          }
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
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.color = '#34d399';
        feedback.textContent = `✅ Perfil "${currentPassword || 'General'}" sincronizado. Al poner esta clave en el móvil se cargarán estos destinos.`;
      }
    } catch {
      // ignore
    }
  }

  // Open / Close events
  triggerBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
    renderList();
  });

  modal.querySelector('#gev-modal-close').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Save User Code
  modal.querySelector('#gev-btn-save-user').addEventListener('click', () => {
    const input = modal.querySelector('#gev-input-pc-user');
    const feedback = modal.querySelector('#gev-user-feedback');
    const val = input.value.trim();
    const verdict = validateUserCode(val);

    feedback.style.display = 'block';
    if (!verdict.valid) {
      feedback.style.color = '#f87171';
      feedback.textContent = `❌ ${verdict.error}`;
      return;
    }

    setSharedUserCode(val);
    feedback.style.color = '#34d399';
    feedback.textContent = `✅ Usuario "${val}" guardado. Usa este mismo nombre en tu móvil.`;
    syncCurrentDestinations();
  });

  // Apply password
  modal.querySelector('#gev-btn-apply-password').addEventListener('click', () => {
    const passInput = modal.querySelector('#gev-input-pc-password');
    currentPassword = setActivePassword(passInput.value);
    renderList();
    syncCurrentDestinations();
  });

  modal.querySelectorAll('.gev-btn-quick-pass').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-pass');
      modal.querySelector('#gev-input-pc-password').value = p;
      currentPassword = setActivePassword(p);
      renderList();
      syncCurrentDestinations();
    });
  });

  // Capture current camera location
  modal.querySelector('#gev-btn-capture-camera').addEventListener('click', () => {
    const coords = getCurrentCameraCoordinates(viewer);
    if (!coords) {
      alert('No se pudo obtener la posición actual de la cámara.');
      return;
    }
    const name = prompt('Nombre para esta ubicación:', `Destino (${coords.lat}, ${coords.lon})`);
    if (name) {
      addCustomDestination({
        name,
        lat: coords.lat,
        lon: coords.lon,
        height: coords.height,
        password: currentPassword,
      });
      renderList();
      syncCurrentDestinations();
    }
  });

  // Add manual destination
  modal.querySelector('#gev-btn-add-manual-dest').addEventListener('click', () => {
    const nameInput = modal.querySelector('#gev-input-dest-name');
    const latInput = modal.querySelector('#gev-input-dest-lat');
    const lonInput = modal.querySelector('#gev-input-dest-lon');

    const name = nameInput.value.trim() || 'Punto de Interés';
    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);

    if (isNaN(lat) || isNaN(lon)) {
      alert('Por favor introduce latitud y longitud válidas.');
      return;
    }

    addCustomDestination({ name, lat, lon, height: 18000, password: currentPassword });
    nameInput.value = '';
    latInput.value = '';
    lonInput.value = '';

    renderList();
    syncCurrentDestinations();
  });

  // Hardware profile buttons
  const hwFeedback = modal.querySelector('#gev-hw-feedback');
  function updateHardwareUI(mode) {
    localStorage.setItem(STORAGE_HARDWARE_MODE_KEY, mode);
    applyHardwareOptimizations(viewer);
    const prof = getOptimalPerformanceProfile();
    if (hwFeedback) {
      hwFeedback.style.display = 'block';
      if (mode === 'low') {
        hwFeedback.textContent = `⚡ Modo PC Antigua activo: 30 FPS, caché de 256MB, antialiasing ligero (evita congelar HDD de 298GB y CPU i5/E-450).`;
      } else if (mode === 'high') {
        hwFeedback.textContent = `🚀 Modo Alta Calidad activo: 60 FPS, caché completa.`;
      } else {
        hwFeedback.textContent = `🔍 Modo Automático: Detectado ${prof.isLowSpec ? 'Hardware Legacy (Modo Ahorro)' : 'Hardware Estándar'}.`;
      }
    }
  }

  modal.querySelector('#gev-btn-hw-low').addEventListener('click', () => updateHardwareUI('low'));
  modal.querySelector('#gev-btn-hw-auto').addEventListener('click', () => updateHardwareUI('auto'));
  modal.querySelector('#gev-btn-hw-high').addEventListener('click', () => updateHardwareUI('high'));

  // Manual sync button
  modal.querySelector('#gev-btn-sync-all').addEventListener('click', syncCurrentDestinations);

  // Initial sync
  syncCurrentDestinations();
}
