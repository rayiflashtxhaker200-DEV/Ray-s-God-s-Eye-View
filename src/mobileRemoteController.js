/**
 * Mobile Remote Controller for God's Eye View
 * Allows a smartphone or secondary device to control the PC master instance
 * without loading heavy Cesium 3D graphics or geospatial tile caches.
 * Fully compatible with local servers, PC tunnels, and password-based destination presets.
 */

import {
  validateUserCode,
  getDestinationsForPassword,
  getActivePassword,
  setActivePassword,
} from './customDestinations.js';

/**
 * Check if the current URL has mobile remote mode activated.
 * Accepts ?remote=mobile or ?device=mobile in query parameters.
 */
export function isMobileRemote(search = (typeof window !== 'undefined' ? window.location.search : '')) {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return params.get('remote') === 'mobile' || params.get('device') === 'mobile';
}

/**
 * Normalize the PC server or tunnel URL.
 * Strips whitespace, trailing slashes, and ensures http/https scheme.
 */
export function normalizeServerUrl(url = '') {
  let trimmed = String(url || '').trim();
  if (!trimmed) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return '';
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return trimmed.replace(/\/+$/, '');
}

/**
 * Send a remote command to the server session via POST.
 */
export async function sendRemoteCommand({
  serverUrl = '',
  sessionName = 'default',
  deviceName = 'Mobile Device',
  deviceType = 'mobile',
  password = '',
  command,
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
}) {
  if (!fetchImpl) throw new Error('Fetch implementation is not available');
  const base = normalizeServerUrl(serverUrl);
  const endpoint = `${base}/api/remote/session`;

  const payload = {
    sessionName,
    deviceType,
    deviceName,
    password,
    command,
  };

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to send command: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Poll session status and pending commands via GET.
 */
export async function fetchRemoteSession({
  serverUrl = '',
  sessionName = 'default',
  password = '',
  since = 0,
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
}) {
  if (!fetchImpl) throw new Error('Fetch implementation is not available');
  const base = normalizeServerUrl(serverUrl);
  const query = new URLSearchParams({ session: sessionName, since: String(since) });
  if (password) query.set('password', password);
  const endpoint = `${base}/api/remote/session?${query.toString()}`;

  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.status}`);
  }

  return response.json();
}

/**
 * Execute a received remote command on the PC master instance.
 */
export function executeRemoteCommand(command, app = (typeof window !== 'undefined' ? window.__godsEyeView : null)) {
  if (!command || !command.action) return false;
  const { action, args = {} } = command;

  switch (action) {
    case 'zoom_to_globe': {
      if (app?.viewer?.camera?.flyTo) {
        if (typeof Cesium !== 'undefined' && Cesium.Cartesian3) {
          app.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(0, 20, 20000000),
            duration: 2.5,
          });
        } else {
          app.viewer.camera.flyTo({
            destination: { x: 0, y: 0, z: 20000000 },
            duration: 2.5,
          });
        }
      }
      return true;
    }

    case 'fly_to_location': {
      const lat = Number(args.lat ?? args.latitude ?? 0);
      const lon = Number(args.lon ?? args.longitude ?? 0);
      const height = Number(args.height ?? 18000);
      if (app?.viewer?.camera?.flyTo) {
        if (typeof Cesium !== 'undefined' && Cesium.Cartesian3) {
          app.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
            duration: 2.5,
          });
        } else {
          app.viewer.camera.flyTo({
            destination: { lat, lon, height },
            duration: 2.5,
          });
        }
      }
      return true;
    }

    case 'set_layer_visibility': {
      const layerId = args.layer || args.layerId;
      const enabled = Boolean(args.enabled ?? args.visible ?? true);
      if (layerId && app?.dataManager?.setEnabled) {
        app.dataManager.setEnabled(layerId, enabled);
      }
      return true;
    }

    case 'stop': {
      if (app?.sceneDirector?.stop) {
        app.sceneDirector.stop();
      }
      if (app?.viewer?.camera?.cancelFlight) {
        app.viewer.camera.cancelFlight();
      }
      return true;
    }

    case 'sync_custom_locations': {
      return true;
    }

    default:
      console.warn(`[Remote] Unknown action: ${action}`);
      return false;
  }
}

/**
 * Start polling the remote session on the PC master instance and executing commands.
 */
export function startPcRemoteListener({
  sessionName = 'default',
  serverUrl = '',
  pollInterval = 1000,
  onCommand,
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  app = (typeof window !== 'undefined' ? window.__godsEyeView : null),
} = {}) {
  let lastTimestamp = Date.now();
  let stopped = false;
  let timerId = null;

  async function poll() {
    if (stopped) return;
    try {
      const data = await fetchRemoteSession({
        serverUrl,
        sessionName,
        since: lastTimestamp,
        fetchImpl,
      });

      if (data?.commands?.length) {
        for (const cmd of data.commands) {
          if (cmd.timestamp > lastTimestamp) {
            lastTimestamp = cmd.timestamp;
            executeRemoteCommand(cmd, app || window.__godsEyeView);
            if (typeof onCommand === 'function') {
              onCommand(cmd);
            }
          }
        }
      }
    } catch {
      // Silently retry on next poll cycle
    } finally {
      if (!stopped) {
        timerId = setTimeout(poll, pollInterval);
      }
    }
  }

  timerId = setTimeout(poll, pollInterval);

  return () => {
    stopped = true;
    if (timerId) clearTimeout(timerId);
  };
}

/** Preset cities for quick navigation from mobile */
export const REMOTE_PRESET_LOCATIONS = [
  { name: 'Nueva York', lat: 40.7128, lon: -74.006, height: 18000 },
  { name: 'Tokio', lat: 35.6762, lon: 139.6503, height: 18000 },
  { name: 'Londres', lat: 51.5074, lon: -0.1278, height: 18000 },
  { name: 'París', lat: 48.8566, lon: 2.3522, height: 18000 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194, height: 18000 },
  { name: 'Austin', lat: 30.2672, lon: -97.7431, height: 18000 },
];

/** Supported map layers for quick toggling */
export const REMOTE_LAYERS = [
  { id: 'flights', label: '✈️ Vuelos en vivo' },
  { id: 'vessels', label: '🚢 Buques (AIS)' },
  { id: 'satellites', label: '🛰️ Satélites' },
  { id: 'cctv', label: '📷 Cámaras CCTV' },
  { id: 'firms', label: '🔥 Incendios (FIRMS)' },
  { id: 'earthquakes', label: '⚡ Terremotos' },
  { id: 'traffic', label: '🚗 Tráfico' },
];

/**
 * Mount the lightweight mobile remote interface in the DOM.
 */
export function mountMobileRemoteUI(container = document.body, initialOptions = {}) {
  // Clear any existing 3D viewer elements to keep the phone light
  const loading = document.getElementById('loading-screen');
  if (loading) loading.style.display = 'none';
  const cesium = document.getElementById('cesiumContainer');
  if (cesium) cesium.style.display = 'none';

  // State
  const params = new URLSearchParams(window.location.search);
  let userName = localStorage.getItem('gev_shared_user_code') || localStorage.getItem('gev_remote_user') || initialOptions.deviceName || 'user1234';
  let sessionName = params.get('session') || userName || 'user1234';
  let serverUrl = localStorage.getItem('gev_remote_server') || initialOptions.serverUrl || window.location.origin;
  let activePassword = localStorage.getItem('gev_active_preset_password') || '';
  let customLocations = getDestinationsForPassword(activePassword);

  const root = document.createElement('div');
  root.id = 'gev-mobile-remote-app';
  root.style.cssText = `
    position: fixed; inset: 0; background: #070a11; color: #e2e8f0;
    font-family: 'JetBrains Mono', monospace, -apple-system, sans-serif;
    display: flex; flex-direction: column; overflow-y: auto; z-index: 99999;
    padding: 16px; box-sizing: border-box; -webkit-tap-highlight-color: transparent;
  `;

  // Render Setup / Config Screen
  function renderConfigView() {
    root.innerHTML = `
      <div style="max-width: 480px; margin: auto; width: 100%; display: flex; flex-direction: column; gap: 16px;">
        <div style="text-align: center; margin-bottom: 8px;">
          <div style="font-size: 11px; letter-spacing: 2px; color: #00e5ff; text-transform: uppercase;">God's Eye View</div>
          <h1 style="font-size: 22px; margin: 4px 0 8px; color: #fff;">Control Remoto Móvil</h1>
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            Conecta tu teléfono como mando introduciendo el usuario de tu PC (mínimo 4 caracteres) y opcionalmente tu contraseña de destinos.
          </p>
        </div>

        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 14px;">
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px;">
              Nombre de Usuario / Código PC (Mín. 4 caracteres)
            </label>
            <input id="gev-input-user" type="text" value="${escapeHtml(userName)}" placeholder="Mínimo 4 caracteres (ej. user1234)"
              style="width: 100%; box-sizing: border-box; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 14px; font-family: inherit;" />
            <div id="gev-user-error" style="font-size: 11px; color: #f87171; margin-top: 4px; display: none;"></div>
          </div>

          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px;">
              Contraseña de Destinos (Opcional)
            </label>
            <input id="gev-input-password" type="text" value="${escapeHtml(activePassword)}" placeholder="Ej: alfa1234, tactical2026, ciudades99..."
              style="width: 100%; box-sizing: border-box; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 14px; font-family: inherit;" />
            <span style="font-size: 11px; color: #64748b; margin-top: 4px; display: block;">
              Cada contraseña carga un conjunto de destinos preestablecidos diferente.
            </span>
          </div>

          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px;">
              URL Servidor / Túnel PC
            </label>
            <input id="gev-input-server" type="text" value="${escapeHtml(serverUrl)}" placeholder="https://...devtunnels.ms"
              style="width: 100%; box-sizing: border-box; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 14px; font-family: inherit;" />
            <span style="font-size: 11px; color: #64748b; margin-top: 4px; display: block;">
              Si usas un túnel de VS Code o ngrok en la PC, escribe la dirección aquí.
            </span>
          </div>

          <button id="gev-btn-enter" style="
            margin-top: 6px; background: #0284c7; color: #fff; border: none;
            border-radius: 6px; padding: 12px; font-size: 15px; font-weight: 600; cursor: pointer;
            letter-spacing: 0.5px; transition: background 0.2s;
          ">
            Entrar al control
          </button>
        </div>
      </div>
    `;

    root.querySelector('#gev-btn-enter').addEventListener('click', async () => {
      const u = root.querySelector('#gev-input-user').value.trim();
      const p = root.querySelector('#gev-input-password').value.trim();
      const srv = root.querySelector('#gev-input-server').value.trim() || window.location.origin;
      const errEl = root.querySelector('#gev-user-error');

      const verdict = validateUserCode(u);
      if (!verdict.valid) {
        errEl.textContent = verdict.error;
        errEl.style.display = 'block';
        return;
      }

      userName = u;
      sessionName = u;
      activePassword = p;
      serverUrl = normalizeServerUrl(srv);

      localStorage.setItem('gev_shared_user_code', userName);
      localStorage.setItem('gev_remote_user', userName);
      localStorage.setItem('gev_remote_session', sessionName);
      localStorage.setItem('gev_remote_server', serverUrl);
      localStorage.setItem('gev_active_preset_password', activePassword);

      // Load destinations for this password
      customLocations = getDestinationsForPassword(activePassword);
      try {
        const sessionData = await fetchRemoteSession({ serverUrl, sessionName, password: activePassword });
        if (sessionData?.customLocations?.length) {
          customLocations = sessionData.customLocations;
        }
      } catch {
        // fallback to local preset
      }

      renderControlView();
    });
  }

  // Render Control View
  function renderControlView() {
    root.innerHTML = `
      <div style="max-width: 480px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 14px; padding-bottom: 24px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 10px 14px;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
              <span style="font-size: 13px; font-weight: 600; color: #fff;">Usuario: ${escapeHtml(userName)}</span>
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
              Perfil Clave: <strong id="gev-active-pass-badge" style="color: #38bdf8;">${escapeHtml(activePassword || '(General)')}</strong>
            </div>
          </div>
          <button id="gev-btn-settings" style="background: transparent; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 6px 10px; font-size: 11px; cursor: pointer;">
            ⚙️ Ajustes
          </button>
        </div>

        <!-- Status log -->
        <div id="gev-status-log" style="font-size: 11px; color: #00e5ff; background: rgba(0,229,255,0.06); border: 1px solid rgba(0,229,255,0.2); border-radius: 6px; padding: 8px 12px; min-height: 18px; text-align: center;">
          Conectado. Listo para controlar la PC.
        </div>

        <!-- Password Switcher Section -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8; font-weight: 600; margin-bottom: 6px;">
            🔑 Cargar Destinos por Contraseña
          </div>
          <div style="display: flex; gap: 6px; margin-bottom: 6px;">
            <input id="gev-mobile-pass-input" type="text" value="${escapeHtml(activePassword)}" placeholder="Escribe contraseña..."
              style="flex: 1; background: #070a11; border: 1px solid #334155; border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 12px; font-family: inherit;" />
            <button id="gev-mobile-btn-apply-pass" style="background: #0284c7; color: #fff; border: none; border-radius: 6px; padding: 8px 12px; font-size: 11px; font-weight: 600; cursor: pointer;">
              Cargar
            </button>
          </div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            <button class="btn-fast-pass" data-pass="alfa1234" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 6px; font-size: 10px; cursor: pointer;">🔑 alfa1234</button>
            <button class="btn-fast-pass" data-pass="tactical2026" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 6px; font-size: 10px; cursor: pointer;">🔑 tactical2026</button>
            <button class="btn-fast-pass" data-pass="ciudades99" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 4px; padding: 4px 6px; font-size: 10px; cursor: pointer;">🔑 ciudades99</button>
          </div>
        </div>

        <!-- Camera Controls -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px;">
            Control de Cámara
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="btn-zoom-globe" style="background: #1e293b; border: 1px solid #334155; color: #38bdf8; border-radius: 6px; padding: 12px; font-size: 13px; font-weight: 600; cursor: pointer;">
              🌍 Vista Global
            </button>
            <button id="btn-stop" style="background: #1e293b; border: 1px solid #334155; color: #f87171; border-radius: 6px; padding: 12px; font-size: 13px; font-weight: 600; cursor: pointer;">
              ⏹️ Detener
            </button>
          </div>
        </div>

        <!-- Custom Destinations Loaded by Password -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8; font-weight: 600;">
              ⭐ Destinos del Perfil Activo
            </div>
            <button id="gev-btn-refresh-custom-dest" style="background: #0369a1; color: #fff; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
              🔄 Sincronizar
            </button>
          </div>
          <div id="gev-custom-destinations-container" style="display: flex; flex-direction: column; gap: 6px;">
          </div>
        </div>

        <!-- Global Preset Locations -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px;">
            Destinos Rápidos Globales
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${REMOTE_PRESET_LOCATIONS.map((loc, i) => `
              <button class="btn-location" data-index="${i}" style="background: #1e293b; border: 1px solid #334155; color: #f1f5f9; border-radius: 6px; padding: 10px; font-size: 12px; cursor: pointer; text-align: left;">
                📍 ${escapeHtml(loc.name)}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Layer Toggles -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px;">
            Capas del Mapa
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${REMOTE_LAYERS.map((layer) => `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #070a11; border: 1px solid #1e293b; border-radius: 6px; padding: 8px 12px;">
                <span style="font-size: 13px; color: #e2e8f0;">${escapeHtml(layer.label)}</span>
                <div style="display: flex; gap: 6px;">
                  <button class="btn-layer-on" data-layer="${escapeHtml(layer.id)}" style="background: #064e3b; border: 1px solid #059669; color: #34d399; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">ON</button>
                  <button class="btn-layer-off" data-layer="${escapeHtml(layer.id)}" style="background: #450a0a; border: 1px solid #dc2626; color: #f87171; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">OFF</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    const statusLog = root.querySelector('#gev-status-log');
    function log(msg, isError = false) {
      if (!statusLog) return;
      statusLog.textContent = msg;
      statusLog.style.color = isError ? '#f87171' : '#00e5ff';
      statusLog.style.borderColor = isError ? 'rgba(248,113,113,0.3)' : 'rgba(0,229,255,0.2)';
    }

    async function dispatch(action, args = {}) {
      try {
        log(`Enviando: ${action}...`);
        await sendRemoteCommand({
          serverUrl,
          sessionName,
          deviceName: userName,
          password: activePassword,
          command: { action, args },
        });
        log(`✅ Ejecutado en PC: ${action}`);
      } catch (err) {
        log(`❌ Error al enviar: ${err.message}`, true);
      }
    }

    function renderCustomLocations() {
      const container = root.querySelector('#gev-custom-destinations-container');
      const badge = root.querySelector('#gev-active-pass-badge');
      if (badge) badge.textContent = activePassword || '(General)';
      if (!container) return;

      if (!customLocations.length) {
        container.innerHTML = `
          <div style="font-size: 11px; color: #64748b; text-align: center; padding: 8px;">
            No hay destinos para la contraseña "${escapeHtml(activePassword || 'General')}".
            Puedes guardarlos desde la PC o usar una contraseña como <strong>alfa1234</strong> o <strong>tactical2026</strong>.
          </div>
        `;
        return;
      }

      container.innerHTML = customLocations.map((dest) => `
        <button class="btn-custom-dest" data-lat="${dest.lat}" data-lon="${dest.lon}" data-height="${dest.height || 15000}" style="
          background: #1e293b; border: 1px solid #0284c7; color: #f8fafc; border-radius: 6px;
          padding: 10px 12px; font-size: 12px; cursor: pointer; text-align: left; display: flex;
          justify-content: space-between; align-items: center;
        ">
          <span>⭐ ${escapeHtml(dest.name)}</span>
          <span style="font-size: 10px; color: #38bdf8;">Volar ➔</span>
        </button>
      `).join('');

      container.querySelectorAll('.btn-custom-dest').forEach((btn) => {
        btn.addEventListener('click', () => {
          const lat = Number(btn.getAttribute('data-lat'));
          const lon = Number(btn.getAttribute('data-lon'));
          const height = Number(btn.getAttribute('data-height'));
          dispatch('fly_to_location', { lat, lon, height });
        });
      });
    }

    async function loadPasswordDestinations(pass) {
      activePassword = String(pass ?? '').trim().toLowerCase();
      localStorage.setItem('gev_active_preset_password', activePassword);
      setActivePassword(activePassword);

      customLocations = getDestinationsForPassword(activePassword);
      renderCustomLocations();
      log(`Cargando perfil para contraseña "${activePassword || 'General'}"...`);

      try {
        const sessionData = await fetchRemoteSession({
          serverUrl,
          sessionName,
          password: activePassword,
        });
        if (sessionData?.customLocations?.length) {
          customLocations = sessionData.customLocations;
          renderCustomLocations();
        }
        log(`✅ Perfil "${activePassword || 'General'}" cargado (${customLocations.length} destinos).`);
      } catch {
        log(`✅ Destinos locales cargados (${customLocations.length}).`);
      }
    }

    renderCustomLocations();

    root.querySelector('#gev-btn-settings').addEventListener('click', renderConfigView);
    root.querySelector('#btn-zoom-globe').addEventListener('click', () => dispatch('zoom_to_globe'));
    root.querySelector('#btn-stop').addEventListener('click', () => dispatch('stop'));
    root.querySelector('#gev-btn-refresh-custom-dest').addEventListener('click', () => loadPasswordDestinations(activePassword));

    root.querySelector('#gev-mobile-btn-apply-pass').addEventListener('click', () => {
      const p = root.querySelector('#gev-mobile-pass-input').value.trim();
      loadPasswordDestinations(p);
    });

    root.querySelectorAll('.btn-fast-pass').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-pass');
        root.querySelector('#gev-mobile-pass-input').value = p;
        loadPasswordDestinations(p);
      });
    });

    root.querySelectorAll('.btn-location').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-index'));
        const loc = REMOTE_PRESET_LOCATIONS[idx];
        if (loc) {
          dispatch('fly_to_location', { lat: loc.lat, lon: loc.lon, height: loc.height });
        }
      });
    });

    root.querySelectorAll('.btn-layer-on').forEach((btn) => {
      btn.addEventListener('click', () => {
        const layer = btn.getAttribute('data-layer');
        dispatch('set_layer_visibility', { layer, enabled: true });
      });
    });

    root.querySelectorAll('.btn-layer-off').forEach((btn) => {
      btn.addEventListener('click', () => {
        const layer = btn.getAttribute('data-layer');
        dispatch('set_layer_visibility', { layer, enabled: false });
      });
    });

    // Auto-refresh on entry
    if (activePassword) {
      loadPasswordDestinations(activePassword);
    }
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  renderConfigView();
  container.appendChild(root);

  return {
    destroy() {
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    },
  };
}
