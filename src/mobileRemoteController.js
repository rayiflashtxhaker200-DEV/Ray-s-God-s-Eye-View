/**
 * Mobile Remote Controller for Ray's Eye View
 * Controls the PC master 3D globe from a smartphone or tablet without loading
 * Cesium 3D graphics or heavy geospatial tile caches on the remote device.
 */

import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from './renderGovernor.js';
import {
  validateUserCode,
  getDestinationsForPassword,
  getActivePassword,
  setActivePassword,
  getSharedUserCode,
  setSharedUserCode,
  addCustomDestination,
  syncDestinationsToServer,
} from './customDestinations.js';
import { CITY_POIS } from './cityPois.js';
import { voiceLayerAliasMap } from './voice/layerManifest.js';

const LAYER_ALIAS_MAP = voiceLayerAliasMap();

function resolveRemoteLayerId(rawLayer, dataManager) {
  const clean = String(rawLayer || '').trim();
  if (!clean) return '';
  if (dataManager?.layers?.has?.(clean)) return clean;
  const aliased = LAYER_ALIAS_MAP.get(clean.toLowerCase());
  if (aliased && (!dataManager?.layers || dataManager.layers.has(aliased))) {
    return aliased;
  }
  return aliased || clean;
}

const REMOTE_GEMINI_DELEGATED_ACTIONS = new Set([
  'fly_to_location',
  'zoom_to_globe',
  'set_visual_style',
  'adjust_camera_zoom',
  'move_camera',
  'set_hud',
  'set_map_stack',
  'set_post_processing',
  'control_scene',
  'control_cctv',
  'control_radio',
  'track_entity',
  'stop_tracking',
  'select_nearest_aircraft',
  'frame_overhead',
  'annotate_map',
  'clear_annotations',
  'analyst_query',
  'osm_query',
  'get_entity_context',
  'get_current_view_state',
  'set_context_mode',
  'show_data_layers_menu',
  'search_imagery',
  'set_layer_visibility',
]);

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

/**
 * Check if the current URL has mobile remote mode activated.
 * Accepts ?remote=mobile or ?device=mobile in query parameters.
 */
export function isMobileRemote(
  search = typeof window !== 'undefined' ? window.location.search : '',
) {
  if (!search) return false;
  const params = new URLSearchParams(
    search.startsWith('?') ? search : `?${search}`,
  );
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
 * Parse direct coordinate queries like "40.4168, -3.7038" or "40.4168 -3.7038".
 */
export function parseCoordinateQuery(query = '') {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s;]+\s*(-?\d+(?:\.\d+)?)\s*$/.exec(
    String(query || ''),
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }
  return { lat, lon };
}

/**
 * Search places using coordinates, bundled CITY_POIS, and live /api/geocode (with Photon fallback).
 */
export async function searchRemotePlaces(
  query,
  {
    serverUrl = '',
    signal,
    fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
  } = {},
) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];

  const results = [];
  const seen = new Set();
  const pushResult = (item) => {
    const key = `${item.name}|${Number(item.lat).toFixed(3)}|${Number(item.lon).toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  const parsedCoords = parseCoordinateQuery(trimmed);
  if (parsedCoords) {
    pushResult({
      name: `Coordenadas (${parsedCoords.lat.toFixed(4)}, ${parsedCoords.lon.toFixed(4)})`,
      subtitle: 'Coordenada directa',
      lat: parsedCoords.lat,
      lon: parsedCoords.lon,
      height: 12000,
    });
  }

  const lower = trimmed.toLowerCase();
  for (const city of Object.values(CITY_POIS)) {
    const cityMatches = city.name.toLowerCase().includes(lower);
    if (cityMatches && city.pois?.length) {
      const primary = city.pois[0];
      pushResult({
        name: city.name,
        subtitle: `Ciudad · ${primary.name}`,
        lat: primary.lat,
        lon: primary.lon,
        height: Math.max(4500, (primary.alt || 1200) * 6),
      });
    }
    for (const poi of city.pois || []) {
      if (poi.name.toLowerCase().includes(lower)) {
        pushResult({
          name: poi.name,
          subtitle: city.name,
          lat: poi.lat,
          lon: poi.lon,
          height: Math.max(2500, (poi.alt || 600) * 4),
        });
      }
    }
  }

  if (fetchImpl && trimmed.length >= 2 && !parsedCoords) {
    const base = normalizeServerUrl(serverUrl);
    try {
      const res = await fetchImpl(
        `${base}/api/geocode?q=${encodeURIComponent(trimmed)}&limit=6`,
        { signal, headers: { Accept: 'application/json' } },
      );
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];
        for (const item of items) {
          const lat = Number(item.lat ?? item.latitude);
          const lon = Number(item.lon ?? item.lng ?? item.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const display = String(item.display_name || item.name || trimmed);
          const parts = display.split(',').map((s) => s.trim());
          pushResult({
            name: parts[0] || display,
            subtitle: parts.slice(1, 3).join(', ') || 'Ubicación geográfica',
            lat,
            lon,
            height: 14000,
          });
        }
      }
    } catch {
      // Fallback to Photon public geocoder if local proxy fails
      try {
        const photonRes = await fetchImpl(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=5`,
          { signal },
        );
        if (photonRes.ok) {
          const photon = await photonRes.json();
          for (const feat of photon?.features || []) {
            const coords = feat?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) continue;
            const props = feat.properties || {};
            pushResult({
              name: props.name || props.city || trimmed,
              subtitle:
                [props.city, props.country].filter(Boolean).join(', ') ||
                'Ubicación',
              lat: Number(coords[1]),
              lon: Number(coords[0]),
              height: 14000,
            });
          }
        }
      } catch {
        // Offline or network blocked; return local matches
      }
    }
  }

  return results.slice(0, 12);
}

async function readRemoteResponseJson(response, operation) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    if (!response.ok) {
      const status = [response.status, response.statusText]
        .filter(Boolean)
        .join(' ');
      throw new Error(`${operation}: ${status}`);
    }
    const contentType = response.headers?.get?.('content-type');
    throw new Error(
      `El servidor remoto devolvió contenido no JSON${contentType ? ` (${contentType})` : ''}. Verifica que la URL apunte al servidor activo de Ray's Eye View y no a una página estática.`,
    );
  }

  if (!response.ok) {
    const status = [response.status, response.statusText]
      .filter(Boolean)
      .join(' ');
    throw new Error(data?.error || `${operation}: ${status}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(
      'El servidor remoto devolvió una respuesta JSON no válida.',
    );
  }
  return data;
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
  fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
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

  return readRemoteResponseJson(response, 'Failed to send command');
}

/**
 * Poll session status and pending commands via GET.
 */
export async function fetchRemoteSession({
  serverUrl = '',
  sessionName = 'default',
  password = '',
  since = 0,
  fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
}) {
  if (!fetchImpl) throw new Error('Fetch implementation is not available');
  const base = normalizeServerUrl(serverUrl);
  const query = new URLSearchParams({
    session: sessionName,
    since: String(since),
  });
  if (password) query.set('password', password);
  const endpoint = `${base}/api/remote/session?${query.toString()}`;

  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  return readRemoteResponseJson(response, 'Failed to fetch session');
}

/**
 * Execute a received remote command on the PC master instance.
 */
export function executeRemoteCommand(
  command,
  app = typeof window !== 'undefined' ? window.__godsEyeView : null,
) {
  if (!command || !command.action) return false;
  const { action, args = {} } = command;

  const viewer =
    app?.viewer ||
    (typeof window !== 'undefined' ? window.__godsEyeView?.viewer : null) ||
    (typeof window !== 'undefined' ? window.viewer : null);
  const dataManager =
    app?.dataManager ||
    (typeof window !== 'undefined' ? window.__godsEyeView?.dataManager : null);
  const sceneDirector =
    app?.sceneDirector ||
    (typeof window !== 'undefined'
      ? window.__godsEyeView?.sceneDirector
      : null);
  const styleManager =
    app?.styleManager ||
    (typeof window !== 'undefined' ? window.__godsEyeView?.styleManager : null);
  const voiceCommands =
    app?.voiceCommands ||
    (typeof window !== 'undefined'
      ? window.__godsEyeView?.voiceCommands
      : null);

  switch (action) {
    case 'zoom_to_globe': {
      if (viewer?.camera?.flyTo) {
        holdContinuousRender('remote-globe');
        governorRequestRender();
        const destination = degreesToCartesian3(0, 20, 20000000);
        viewer.camera.flyTo({
          destination,
          duration: 2.2,
          complete: () => {
            releaseContinuousRender('remote-globe');
            governorRequestRender();
          },
          cancel: () => {
            releaseContinuousRender('remote-globe');
            governorRequestRender();
          },
        });
        return true;
      }
      if (typeof voiceCommands?.runner === 'function') {
        void Promise.resolve(voiceCommands.runner('zoom_to_globe', args));
        return true;
      }
      return true;
    }

    case 'fly_to_location': {
      const hasNumericCoords =
        Number.isFinite(Number(args.lat ?? args.latitude)) &&
        Number.isFinite(Number(args.lon ?? args.longitude)) &&
        (args.lat !== undefined || args.latitude !== undefined) &&
        (args.lon !== undefined || args.longitude !== undefined);

      if (!hasNumericCoords && (args.query || args.locationId)) {
        if (typeof voiceCommands?.runner === 'function') {
          void Promise.resolve(voiceCommands.runner('fly_to_location', args));
          return true;
        }
        return false;
      }

      const lat = Number(args.lat ?? args.latitude ?? 0);
      const lon = Number(args.lon ?? args.longitude ?? 0);
      const height = Math.max(100, Number(args.height ?? 18000));

      if (viewer?.camera?.flyTo) {
        holdContinuousRender('remote-fly');
        governorRequestRender();
        const destination = degreesToCartesian3(lon, lat, height);
        viewer.camera.flyTo({
          destination,
          duration: 1.9,
          complete: () => {
            releaseContinuousRender('remote-fly');
            governorRequestRender();
          },
          cancel: () => {
            releaseContinuousRender('remote-fly');
            governorRequestRender();
          },
        });
      }
      return true;
    }

    case 'camera_delta': {
      const cam = viewer?.camera;
      if (!cam) return false;
      const dx = Number(args.dx ?? 0);
      const dy = Number(args.dy ?? 0);
      const zoomDelta = Number(args.zoomDelta ?? 0);
      const pitchDelta = Number(args.pitchDelta ?? 0);
      const mode = args.mode === 'orbit' ? 'orbit' : 'pan';
      const height = Math.max(
        120,
        Number(cam.positionCartographic?.height ?? 120000),
      );

      if (dx !== 0 || dy !== 0) {
        if (mode === 'orbit') {
          const angleScale = 0.0042;
          if (dx !== 0 && cam.lookRight) cam.lookRight(dx * angleScale);
          if (dy !== 0 && cam.lookUp) cam.lookUp(-dy * angleScale);
        } else {
          const moveScale = Math.max(35, height * 0.0022);
          if (dx !== 0 && cam.moveRight) cam.moveRight(dx * moveScale);
          if (dy !== 0 && cam.moveUp) cam.moveUp(-dy * moveScale);
        }
      }

      if (zoomDelta !== 0) {
        const zoomAmount = Math.max(
          80,
          height * Math.min(0.45, Math.abs(zoomDelta)),
        );
        if (zoomDelta > 0 && cam.zoomIn) cam.zoomIn(zoomAmount);
        if (zoomDelta < 0 && cam.zoomOut) cam.zoomOut(zoomAmount);
      }

      if (pitchDelta !== 0 && cam.setView) {
        const currentPitch = Number.isFinite(cam.pitch)
          ? cam.pitch
          : -Math.PI / 2;
        const nextPitch = Math.max(
          -Math.PI / 2,
          Math.min(-0.18, currentPitch + pitchDelta),
        );
        cam.setView({
          orientation: {
            heading: Number.isFinite(cam.heading) ? cam.heading : 0,
            pitch: nextPitch,
            roll: 0,
          },
        });
      }

      governorRequestRender();
      return true;
    }

    case 'reset_north': {
      const cam = viewer?.camera;
      if (cam?.setView) {
        cam.setView({
          orientation: {
            heading: 0,
            pitch: Number.isFinite(cam.pitch) ? cam.pitch : -Math.PI / 2,
            roll: 0,
          },
        });
        governorRequestRender();
      }
      return true;
    }

    case 'toggle_tilt': {
      const cam = viewer?.camera;
      if (cam?.setView) {
        const currentPitch = Number.isFinite(cam.pitch)
          ? cam.pitch
          : -Math.PI / 2;
        const isTopDown = currentPitch < -1.25;
        cam.setView({
          orientation: {
            heading: Number.isFinite(cam.heading) ? cam.heading : 0,
            pitch: isTopDown ? -Math.PI / 4 : -Math.PI / 2,
            roll: 0,
          },
        });
        governorRequestRender();
      }
      return true;
    }

    case 'set_layer_visibility': {
      const rawLayerId = args.layerId || args.layer;
      const layerId = resolveRemoteLayerId(rawLayerId, dataManager);
      const enabled = Boolean(args.enabled ?? args.visible ?? true);
      if (layerId && dataManager?.setEnabled) {
        dataManager.setEnabled(layerId, enabled, { origin: 'user' });
        governorRequestRender();
        return true;
      }
      if (layerId && typeof voiceCommands?.runner === 'function') {
        void Promise.resolve(
          voiceCommands.runner('set_layer_visibility', { layerId, enabled }),
        );
        return true;
      }
      return true;
    }

    case 'set_visual_style': {
      const style = String(args.style || '')
        .trim()
        .toLowerCase();
      if (style && typeof voiceCommands?.runner === 'function') {
        void Promise.resolve(
          voiceCommands.runner('set_visual_style', { style }),
        );
        return true;
      }
      if (style && styleManager?.setStyle) {
        styleManager.setStyle(style);
        governorRequestRender();
        return true;
      }
      return false;
    }

    case 'stop': {
      releaseContinuousRender('remote-fly');
      releaseContinuousRender('remote-globe');
      if (sceneDirector?.stop) {
        sceneDirector.stop();
      }
      if (viewer?.camera?.cancelFlight) {
        viewer.camera.cancelFlight();
      }
      governorRequestRender();
      return true;
    }

    case 'sync_custom_locations': {
      return true;
    }

    default: {
      if (
        REMOTE_GEMINI_DELEGATED_ACTIONS.has(action) &&
        typeof voiceCommands?.runner === 'function'
      ) {
        void Promise.resolve(voiceCommands.runner(action, args || {}));
        return true;
      }
      return false;
    }
  }
}

/**
 * Start polling the remote session on the PC master instance and executing commands.
 */
export function startPcRemoteListener({
  sessionName = 'default',
  serverUrl = '',
  pollInterval = 900,
  onCommand,
  fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
  app = typeof window !== 'undefined' ? window.__godsEyeView : null,
} = {}) {
  let lastTimestamp = Date.now() - 5000;
  let lastActivityTime = Date.now();
  let stopped = false;
  let timerId = null;

  function getCurrentSession() {
    if (typeof sessionName === 'function') {
      const val = sessionName();
      if (val && String(val).trim().length >= 4) return String(val).trim();
    }
    if (
      typeof sessionName === 'string' &&
      sessionName.trim().length >= 4 &&
      sessionName !== 'default'
    ) {
      return sessionName.trim();
    }
    return getSharedUserCode();
  }

  async function poll() {
    if (stopped) return;
    try {
      const activeSession = getCurrentSession();
      const data = await fetchRemoteSession({
        serverUrl,
        sessionName: activeSession,
        since: lastTimestamp,
        fetchImpl,
      });

      if (
        data?.sessionName &&
        data.sessionName !== activeSession &&
        typeof setSharedUserCode === 'function'
      ) {
        try {
          setSharedUserCode(data.sessionName);
        } catch {
          // ignore invalid auto-discovered names
        }
      }

      if (data?.commands?.length) {
        lastActivityTime = Date.now();
        for (const cmd of data.commands) {
          if (cmd.timestamp > lastTimestamp) {
            lastTimestamp = cmd.timestamp;
            executeRemoteCommand(
              cmd,
              app ||
                (typeof window !== 'undefined' ? window.__godsEyeView : null),
            );
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
        const isHidden = typeof document !== 'undefined' && document.hidden;
        const isIdle = Date.now() - lastActivityTime > 4000;
        let nextDelay = pollInterval;

        if (isHidden) {
          nextDelay = 5000;
        } else if (isIdle) {
          nextDelay = Math.max(pollInterval, 2200);
        }

        timerId = setTimeout(poll, nextDelay);
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
  { name: 'Madrid', lat: 40.4168, lon: -3.7038, height: 15000 },
  { name: 'Ciudad de México', lat: 19.4326, lon: -99.1332, height: 16000 },
  { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816, height: 16000 },
  { name: 'Nueva York', lat: 40.7128, lon: -74.006, height: 18000 },
  { name: 'Tokio', lat: 35.6762, lon: 139.6503, height: 18000 },
  { name: 'París', lat: 48.8566, lon: 2.3522, height: 16000 },
  { name: 'Londres', lat: 51.5074, lon: -0.1278, height: 16000 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194, height: 15000 },
];

/** Supported map layers for quick toggling */
export const REMOTE_LAYERS = [
  { id: 'flights', label: 'Vuelos en vivo', meta: 'ADS-B global' },
  { id: 'vessels', label: 'Buques (AIS)', meta: 'Tráfico marítimo' },
  { id: 'satellites', label: 'Satélites', meta: 'Órbitas en tiempo real' },
  { id: 'cctv', label: 'Cámaras CCTV', meta: 'Vistas urbanas' },
  { id: 'firms', label: 'Incendios (FIRMS)', meta: 'Anomalías térmicas' },
  { id: 'earthquakes', label: 'Terremotos', meta: 'Red sísmica USGS' },
  { id: 'traffic', label: 'Tráfico vial', meta: 'Flujo en tiempo real' },
];

/**
 * Mount the lightweight mobile remote interface in the DOM.
 */
export function mountMobileRemoteUI(
  container = document.body,
  initialOptions = {},
) {
  const loading = document.getElementById('loading-screen');
  if (loading) loading.style.display = 'none';
  const cesium = document.getElementById('cesiumContainer');
  if (cesium) cesium.style.display = 'none';

  const params = new URLSearchParams(window.location.search);
  const urlSession = params.get('session') || params.get('userCode') || '';
  const urlPass = params.get('pass') ?? params.get('password');
  const urlServer = params.get('server') || '';

  const validUrlSession = validateUserCode(urlSession).valid
    ? urlSession.trim()
    : '';

  if (validUrlSession) {
    localStorage.setItem('gev_shared_user_code', validUrlSession);
    localStorage.setItem('gev_remote_user', validUrlSession);
    localStorage.setItem('gev_remote_session', validUrlSession);
  }
  if (urlPass !== null) {
    const cleanUrlPass = String(urlPass).trim().toLowerCase();
    localStorage.setItem('gev_active_preset_password', cleanUrlPass);
    setActivePassword(cleanUrlPass);
  }
  if (urlServer) {
    localStorage.setItem('gev_remote_server', normalizeServerUrl(urlServer));
  }

  let userName =
    validUrlSession ||
    localStorage.getItem('gev_shared_user_code') ||
    localStorage.getItem('gev_remote_user') ||
    initialOptions.deviceName ||
    'user1234';
  let sessionName = validUrlSession || userName || 'user1234';
  let serverUrl =
    localStorage.getItem('gev_remote_server') ||
    initialOptions.serverUrl ||
    window.location.origin;
  let activePassword =
    urlPass !== null
      ? String(urlPass).trim().toLowerCase()
      : localStorage.getItem('gev_active_preset_password') || '';
  let customLocations = getDestinationsForPassword(activePassword);
  let activeTab = 'camera';
  let trackpadMode = 'pan';
  const layerState = new Map(REMOTE_LAYERS.map((l) => [l.id, false]));
  let searchResults = [];
  let searchQuery = '';
  let searchTimer = null;
  let searchAbort = null;
  const aiMessages = [];
  const aiHistory = [];
  let aiBusy = false;
  let aiTtsEnabled = true;
  let aiRecognition = null;
  let aiDictating = false;

  const root = document.createElement('div');
  root.id = 'gev-mobile-remote-app';
  root.className = 'rem-app';

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderConfigView() {
    root.innerHTML = `
      <div class="rem-setup-wrap">
        <header class="rem-setup-header">
          <div class="rem-brand-kicker">Ray's Eye View</div>
          <h1 class="rem-setup-title">Control Remoto Móvil</h1>
          <p class="rem-setup-desc">
            Vincula tu teléfono con la sesión de escritorio o escanea el código QR desde el botón móvil en tu PC.
          </p>
        </header>

        <section class="rem-card rem-stack">
          <div class="rem-field">
            <label for="gev-input-user" class="rem-label">Código de sesión PC (mín. 4 caracteres)</label>
            <input id="gev-input-user" type="text" class="rem-input rem-mono" value="${escapeHtml(userName)}" placeholder="Ej. user1234" autocomplete="off" />
            <div id="gev-user-error" class="rem-error-text" hidden></div>
          </div>

          <div class="rem-field">
            <label for="gev-input-password" class="rem-label">Clave de perfil de destinos (opcional)</label>
            <input id="gev-input-password" type="text" class="rem-input" value="${escapeHtml(activePassword)}" placeholder="Ej. alfa1234, tactical2026, ciudades99" autocomplete="off" />
          </div>

          <div class="rem-field">
            <label for="gev-input-server" class="rem-label">URL del servidor / túnel PC</label>
            <input id="gev-input-server" type="text" class="rem-input rem-mono" value="${escapeHtml(serverUrl)}" placeholder="https://tu-tunel.devtunnels.ms" autocomplete="off" />
          </div>

          <button id="gev-btn-enter" type="button" class="rem-btn rem-btn-primary rem-btn-lg">
            Conectar al control
          </button>
        </section>
      </div>
    `;

    root.querySelector('#gev-btn-enter').addEventListener('click', async () => {
      const u = root.querySelector('#gev-input-user').value.trim();
      const p = root.querySelector('#gev-input-password').value.trim();
      const srv =
        root.querySelector('#gev-input-server').value.trim() ||
        window.location.origin;
      const errEl = root.querySelector('#gev-user-error');

      const verdict = validateUserCode(u);
      if (!verdict.valid) {
        errEl.hidden = false;
        errEl.textContent = verdict.error;
        return;
      }

      userName = u;
      sessionName = u;
      activePassword = p.toLowerCase();
      serverUrl = normalizeServerUrl(srv);

      localStorage.setItem('gev_shared_user_code', userName);
      localStorage.setItem('gev_remote_user', userName);
      localStorage.setItem('gev_remote_session', sessionName);
      localStorage.setItem('gev_remote_server', serverUrl);
      localStorage.setItem('gev_active_preset_password', activePassword);

      customLocations = getDestinationsForPassword(activePassword);
      try {
        const sessionData = await fetchRemoteSession({
          serverUrl,
          sessionName,
          password: activePassword,
        });
        if (sessionData?.customLocations?.length) {
          customLocations = sessionData.customLocations;
        }
      } catch {
        // Fallback to local preset
      }

      renderControlView();
    });
  }

  function renderControlView() {
    root.innerHTML = `
      <header class="rem-topbar">
        <div class="rem-topbar-id">
          <div class="rem-topbar-brand">Ray's Eye View</div>
          <div class="rem-topbar-meta">
            <span>Sesión <strong class="rem-mono">${escapeHtml(userName)}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Perfil <strong id="gev-active-pass-badge">${escapeHtml(activePassword || 'General')}</strong></span>
          </div>
        </div>
        <button id="gev-btn-settings" type="button" class="rem-icon-btn" aria-label="Ajustes de conexión">
          <span class="material-symbols-outlined" aria-hidden="true">settings</span>
        </button>
      </header>

      <div id="gev-status-log" class="rem-status-bar" role="status" aria-live="polite">
        Listo para controlar la pantalla principal.
      </div>

      <main class="rem-main">
        <!-- TAB: CÁMARA (Trackpad + Controles) -->
        <section class="rem-panel ${activeTab === 'camera' ? 'is-active' : ''}" data-rem-panel="camera">
          <div class="rem-card rem-trackpad-card">
            <div class="rem-card-head">
              <div>
                <h2 class="rem-card-title">Trackpad táctil</h2>
                <p class="rem-card-sub">Desliza para mover u orbitar el globo en tiempo real</p>
              </div>
              <div class="rem-segmented" role="radiogroup" aria-label="Modo de trackpad">
                <button type="button" class="rem-seg-btn ${trackpadMode === 'pan' ? 'is-active' : ''}" data-pad-mode="pan">Desplazar</button>
                <button type="button" class="rem-seg-btn ${trackpadMode === 'orbit' ? 'is-active' : ''}" data-pad-mode="orbit">Orbitar</button>
              </div>
            </div>

            <div id="rem-trackpad" class="rem-trackpad" role="application" aria-label="Superficie táctil de cámara">
              <div class="rem-trackpad-grid" aria-hidden="true"></div>
              <div id="rem-trackpad-reticle" class="rem-trackpad-reticle" aria-hidden="true"></div>
              <span id="rem-trackpad-readout" class="rem-trackpad-readout">Arrastra aquí</span>
            </div>

            <div class="rem-zoom-row">
              <button id="rem-zoom-out" type="button" class="rem-btn rem-btn-surface">
                <span class="material-symbols-outlined" aria-hidden="true">remove</span>
                <span>Alejar</span>
              </button>
              <button id="rem-tilt-btn" type="button" class="rem-btn rem-btn-surface">
                <span class="material-symbols-outlined" aria-hidden="true">view_in_ar</span>
                <span>Inclinar 3D</span>
              </button>
              <button id="rem-zoom-in" type="button" class="rem-btn rem-btn-surface">
                <span class="material-symbols-outlined" aria-hidden="true">add</span>
                <span>Acercar</span>
              </button>
            </div>
          </div>

          <div class="rem-quick-actions">
            <button id="btn-zoom-globe" type="button" class="rem-btn rem-btn-surface">
              <span class="material-symbols-outlined" aria-hidden="true">public</span>
              <span>Vista global</span>
            </button>
            <button id="rem-north-btn" type="button" class="rem-btn rem-btn-surface">
              <span class="material-symbols-outlined" aria-hidden="true">navigation</span>
              <span>Norte</span>
            </button>
            <button id="btn-stop" type="button" class="rem-btn rem-btn-danger">
              <span class="material-symbols-outlined" aria-hidden="true">stop_circle</span>
              <span>Detener</span>
            </button>
          </div>
        </section>

        <!-- TAB: BUSCAR (Lugares y Coordenadas en vivo) -->
        <section class="rem-panel ${activeTab === 'search' ? 'is-active' : ''}" data-rem-panel="search">
          <div class="rem-card rem-stack">
            <div>
              <h2 class="rem-card-title">Búsqueda en vivo</h2>
              <p class="rem-card-sub">Escribe una ciudad, monumento o coordenadas (ej. 40.4168, -3.7038)</p>
            </div>
            <form id="rem-search-form" class="rem-search-bar">
              <input id="rem-search-input" type="search" class="rem-input" value="${escapeHtml(searchQuery)}" placeholder="Buscar lugar o lat, lon..." autocomplete="off" />
              <button type="submit" class="rem-btn rem-btn-primary">Buscar</button>
            </form>
            <div id="rem-search-results" class="rem-result-list"></div>
          </div>
        </section>

        <!-- TAB: DESTINOS -->
        <section class="rem-panel ${activeTab === 'destinations' ? 'is-active' : ''}" data-rem-panel="destinations">
          <div class="rem-card rem-stack">
            <div class="rem-card-head">
              <div>
                <h2 class="rem-card-title">Destinos del perfil</h2>
                <p class="rem-card-sub">Cambia la clave para alternar listas guardadas</p>
              </div>
              <button id="gev-btn-refresh-custom-dest" type="button" class="rem-btn rem-btn-surface rem-btn-sm">
                <span class="material-symbols-outlined" aria-hidden="true">sync</span>
                <span>Sincronizar</span>
              </button>
            </div>
            <div class="rem-row-gap">
              <input id="gev-mobile-pass-input" type="text" class="rem-input" value="${escapeHtml(activePassword)}" placeholder="Clave de perfil..." />
              <button id="gev-mobile-btn-apply-pass" type="button" class="rem-btn rem-btn-primary">Cargar</button>
            </div>
            <div class="rem-chip-row">
              <button type="button" class="btn-fast-pass rem-chip" data-pass="alfa1234">alfa1234</button>
              <button type="button" class="btn-fast-pass rem-chip" data-pass="tactical2026">tactical2026</button>
              <button type="button" class="btn-fast-pass rem-chip" data-pass="ciudades99">ciudades99</button>
            </div>
            <div id="gev-custom-destinations-container" class="rem-result-list"></div>
          </div>

          <div class="rem-card rem-stack">
            <h2 class="rem-card-title">Ciudades rápidas</h2>
            <div class="rem-preset-grid">
              ${REMOTE_PRESET_LOCATIONS.map(
                (loc, i) => `
                <button type="button" class="btn-location rem-preset-btn" data-index="${i}">
                  <span class="rem-preset-name">${escapeHtml(loc.name)}</span>
                  <span class="rem-preset-coords">${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}</span>
                </button>
              `,
              ).join('')}
            </div>
          </div>
        </section>

        <!-- TAB: CAPAS -->
        <section class="rem-panel ${activeTab === 'layers' ? 'is-active' : ''}" data-rem-panel="layers">
          <div class="rem-card rem-stack">
            <div>
              <h2 class="rem-card-title">Capas en tiempo real</h2>
              <p class="rem-card-sub">Activa o desactiva fuentes de datos en la pantalla principal</p>
            </div>
            <div class="rem-layer-list">
              ${REMOTE_LAYERS.map((layer) => {
                const isOn = Boolean(layerState.get(layer.id));
                return `
                  <button type="button" class="rem-layer-row ${isOn ? 'is-on' : ''}" data-layer="${escapeHtml(layer.id)}" aria-pressed="${isOn ? 'true' : 'false'}">
                    <span class="rem-layer-info">
                      <span class="rem-layer-name">${escapeHtml(layer.label)}</span>
                      <span class="rem-layer-meta">${escapeHtml(layer.meta)}</span>
                    </span>
                    <span class="rem-layer-state">${isOn ? 'Activa' : 'Inactiva'}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </section>

        <!-- TAB: VOZ AI (Gemini Voice + Respuestas Dinámicas) -->
        <section class="rem-panel ${activeTab === 'ai' ? 'is-active' : ''}" data-rem-panel="ai">
          <div class="rem-card rem-stack">
            <div class="rem-card-head">
              <div>
                <h2 class="rem-card-title">Asistente Voz AI</h2>
                <p class="rem-card-sub">Habla o escribe órdenes para Gemini y el globo 3D</p>
              </div>
              <button id="rem-ai-tts-btn" type="button" class="rem-btn rem-btn-surface rem-btn-sm ${aiTtsEnabled ? 'is-on' : ''}" aria-pressed="${aiTtsEnabled ? 'true' : 'false'}" title="Leer respuestas en voz alta">
                <span class="material-symbols-outlined" aria-hidden="true">${aiTtsEnabled ? 'volume_up' : 'volume_off'}</span>
                <span>Voz</span>
              </button>
            </div>

            <div class="rem-ai-mic-row">
              <button id="rem-ai-mic-btn" type="button" class="rem-btn rem-btn-primary rem-ai-mic-btn" aria-pressed="false">
                <span class="material-symbols-outlined" aria-hidden="true">mic</span>
                <span id="rem-ai-mic-label">Pulsa para hablar</span>
              </button>
            </div>

            <div class="rem-chip-row">
              <button type="button" class="rem-chip rem-ai-chip" data-ai-prompt="Vuela a Tokio">Vuela a Tokio</button>
              <button type="button" class="rem-chip rem-ai-chip" data-ai-prompt="Activa vuelos en vivo">Activa vuelos</button>
              <button type="button" class="rem-chip rem-ai-chip" data-ai-prompt="Cambia al estilo térmico FLIR">Modo térmico</button>
              <button type="button" class="rem-chip rem-ai-chip" data-ai-prompt="Muéstrame el globo completo">Vista global</button>
            </div>

            <div id="rem-ai-feed" class="rem-ai-feed" role="log" aria-live="polite"></div>

            <form id="rem-ai-form" class="rem-search-bar">
              <input id="rem-ai-input" type="text" class="rem-input" placeholder="Ej. Vuela a Madrid y activa satélites..." autocomplete="off" />
              <button id="rem-ai-send" type="submit" class="rem-btn rem-btn-primary" aria-label="Enviar orden a Gemini">
                <span class="material-symbols-outlined" aria-hidden="true">send</span>
              </button>
            </form>
          </div>
        </section>
      </main>

      <nav class="rem-bottom-nav" aria-label="Secciones del control remoto">
        <button type="button" class="rem-nav-btn ${activeTab === 'camera' ? 'is-active' : ''}" data-rem-tab="camera">
          <span class="material-symbols-outlined" aria-hidden="true">touch_app</span>
          <span>Cámara</span>
        </button>
        <button type="button" class="rem-nav-btn ${activeTab === 'search' ? 'is-active' : ''}" data-rem-tab="search">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
          <span>Buscar</span>
        </button>
        <button type="button" class="rem-nav-btn ${activeTab === 'destinations' ? 'is-active' : ''}" data-rem-tab="destinations">
          <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
          <span>Destinos</span>
        </button>
        <button type="button" class="rem-nav-btn ${activeTab === 'layers' ? 'is-active' : ''}" data-rem-tab="layers">
          <span class="material-symbols-outlined" aria-hidden="true">layers</span>
          <span>Capas</span>
        </button>
        <button type="button" class="rem-nav-btn ${activeTab === 'ai' ? 'is-active' : ''}" data-rem-tab="ai">
          <span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
          <span>Voz AI</span>
        </button>
      </nav>
    `;

    const statusLog = root.querySelector('#gev-status-log');
    function log(msg, isError = false) {
      if (!statusLog) return;
      statusLog.textContent = msg;
      statusLog.classList.toggle('is-error', isError);
    }

    async function dispatch(action, args = {}, label = '') {
      try {
        if (label) log(label);
        await sendRemoteCommand({
          serverUrl,
          sessionName,
          deviceName: userName,
          password: activePassword,
          command: { action, args },
        });
        if (label) log(`Enviado a PC: ${label}`);
      } catch (err) {
        log(`Error de conexión: ${err.message}`, true);
      }
    }

    function switchTab(tab) {
      activeTab = tab;
      root.querySelectorAll('[data-rem-panel]').forEach((el) => {
        el.classList.toggle(
          'is-active',
          el.getAttribute('data-rem-panel') === tab,
        );
      });
      root.querySelectorAll('[data-rem-tab]').forEach((el) => {
        el.classList.toggle(
          'is-active',
          el.getAttribute('data-rem-tab') === tab,
        );
      });
    }

    root.querySelectorAll('[data-rem-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab(btn.getAttribute('data-rem-tab'));
      });
    });

    // Trackpad logic (throttled ~90ms so PC polling receives smooth deltas)
    const trackpad = root.querySelector('#rem-trackpad');
    const reticle = root.querySelector('#rem-trackpad-reticle');
    const readout = root.querySelector('#rem-trackpad-readout');

    root.querySelectorAll('[data-pad-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        trackpadMode =
          btn.getAttribute('data-pad-mode') === 'orbit' ? 'orbit' : 'pan';
        root.querySelectorAll('[data-pad-mode]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
      });
    });

    let activePointerId = null;
    let lastPadX = 0;
    let lastPadY = 0;
    let accumDx = 0;
    let accumDy = 0;
    let lastSendMs = 0;
    let flushTimer = null;

    function flushTrackpadDelta() {
      flushTimer = null;
      if (Math.abs(accumDx) < 0.5 && Math.abs(accumDy) < 0.5) {
        accumDx = 0;
        accumDy = 0;
        return;
      }
      const dx = Math.round(accumDx);
      const dy = Math.round(accumDy);
      accumDx = 0;
      accumDy = 0;
      lastSendMs = Date.now();
      dispatch('camera_delta', { dx, dy, mode: trackpadMode });
    }

    if (trackpad) {
      trackpad.addEventListener('pointerdown', (e) => {
        activePointerId = e.pointerId;
        trackpad.setPointerCapture(e.pointerId);
        trackpad.classList.add('is-dragging');
        lastPadX = e.clientX;
        lastPadY = e.clientY;
        const rect = trackpad.getBoundingClientRect();
        if (reticle) {
          reticle.style.left = `${e.clientX - rect.left}px`;
          reticle.style.top = `${e.clientY - rect.top}px`;
        }
      });

      trackpad.addEventListener('pointermove', (e) => {
        if (e.pointerId !== activePointerId) return;
        const dx = e.clientX - lastPadX;
        const dy = e.clientY - lastPadY;
        lastPadX = e.clientX;
        lastPadY = e.clientY;
        accumDx += dx;
        accumDy += dy;

        const rect = trackpad.getBoundingClientRect();
        if (reticle) {
          const rx = Math.max(
            12,
            Math.min(rect.width - 12, e.clientX - rect.left),
          );
          const ry = Math.max(
            12,
            Math.min(rect.height - 12, e.clientY - rect.top),
          );
          reticle.style.left = `${rx}px`;
          reticle.style.top = `${ry}px`;
        }
        if (readout) {
          readout.textContent = `${trackpadMode === 'orbit' ? 'Órbita' : 'Desplazar'} · ${Math.round(accumDx)}, ${Math.round(accumDy)}`;
        }

        const now = Date.now();
        if (now - lastSendMs >= 90) {
          flushTrackpadDelta();
        } else if (!flushTimer) {
          flushTimer = setTimeout(flushTrackpadDelta, 90);
        }
      });

      const endDrag = (e) => {
        if (e.pointerId !== activePointerId) return;
        activePointerId = null;
        trackpad.classList.remove('is-dragging');
        if (reticle) {
          reticle.style.left = '50%';
          reticle.style.top = '50%';
        }
        if (readout) {
          readout.textContent = 'Arrastra aquí';
        }
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushTrackpadDelta();
      };

      trackpad.addEventListener('pointerup', endDrag);
      trackpad.addEventListener('pointercancel', endDrag);
    }

    root.querySelector('#rem-zoom-in')?.addEventListener('click', () => {
      dispatch('camera_delta', { zoomDelta: 0.28 }, 'Acercando vista');
    });
    root.querySelector('#rem-zoom-out')?.addEventListener('click', () => {
      dispatch('camera_delta', { zoomDelta: -0.32 }, 'Alejando vista');
    });
    root.querySelector('#rem-tilt-btn')?.addEventListener('click', () => {
      dispatch('toggle_tilt', {}, 'Alternando inclinación 3D');
    });
    root.querySelector('#rem-north-btn')?.addEventListener('click', () => {
      dispatch('reset_north', {}, 'Orientando al norte');
    });
    root.querySelector('#btn-zoom-globe')?.addEventListener('click', () => {
      dispatch('zoom_to_globe', {}, 'Mostrando globo completo');
    });
    root.querySelector('#btn-stop')?.addEventListener('click', () => {
      dispatch('stop', {}, 'Movimiento detenido');
    });

    // Live Place & Coordinate Search
    const searchForm = root.querySelector('#rem-search-form');
    const searchInput = root.querySelector('#rem-search-input');
    const searchResultsEl = root.querySelector('#rem-search-results');

    function renderSearchResults(loadingState = false) {
      if (!searchResultsEl) return;
      if (loadingState) {
        searchResultsEl.innerHTML = `<div class="rem-empty">Buscando lugares...</div>`;
        return;
      }
      if (!searchQuery.trim()) {
        searchResultsEl.innerHTML = `<div class="rem-empty">Introduce un nombre o coordenadas para buscar en vivo.</div>`;
        return;
      }
      if (!searchResults.length) {
        searchResultsEl.innerHTML = `<div class="rem-empty">No se encontraron resultados para "${escapeHtml(searchQuery)}".</div>`;
        return;
      }
      searchResultsEl.innerHTML = searchResults
        .map(
          (item, idx) => `
          <div class="rem-result-row">
            <div class="rem-result-info">
              <div class="rem-result-name">${escapeHtml(item.name)}</div>
              <div class="rem-result-meta">${escapeHtml(item.subtitle)} · ${item.lat.toFixed(4)}, ${item.lon.toFixed(4)}</div>
            </div>
            <div class="rem-result-actions">
              <button type="button" class="rem-btn rem-btn-primary rem-btn-sm" data-fly-idx="${idx}">Volar</button>
              <button type="button" class="rem-btn rem-btn-surface rem-btn-sm" data-save-idx="${idx}">Guardar</button>
            </div>
          </div>
        `,
        )
        .join('');

      searchResultsEl.querySelectorAll('[data-fly-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = searchResults[Number(btn.getAttribute('data-fly-idx'))];
          if (!item) return;
          dispatch(
            'fly_to_location',
            { lat: item.lat, lon: item.lon, height: item.height || 14000 },
            `Volando a ${item.name}`,
          );
        });
      });

      searchResultsEl.querySelectorAll('[data-save-idx]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const item = searchResults[Number(btn.getAttribute('data-save-idx'))];
          if (!item) return;
          addCustomDestination({
            name: item.name,
            lat: item.lat,
            lon: item.lon,
            height: item.height || 14000,
            password: activePassword,
          });
          customLocations = getDestinationsForPassword(activePassword);
          renderCustomLocations();
          log(
            `Guardado "${item.name}" en perfil ${activePassword || 'General'}.`,
          );
          try {
            await syncDestinationsToServer({
              serverUrl,
              sessionName,
              password: activePassword,
              destinations: customLocations,
            });
          } catch {
            // saved locally even if offline
          }
        });
      });
    }

    async function runSearch(q) {
      searchQuery = q;
      if (searchAbort) searchAbort.abort();
      if (!q.trim()) {
        searchResults = [];
        renderSearchResults(false);
        return;
      }
      searchAbort = new AbortController();
      renderSearchResults(true);
      searchResults = await searchRemotePlaces(q, {
        serverUrl,
        signal: searchAbort.signal,
      });
      renderSearchResults(false);
    }

    searchForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (searchTimer) clearTimeout(searchTimer);
      runSearch(searchInput?.value || '');
    });

    searchInput?.addEventListener('input', () => {
      const val = searchInput.value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(val), 320);
    });

    renderSearchResults(false);

    // Custom Destinations & Password Presets
    function renderCustomLocations() {
      const box = root.querySelector('#gev-custom-destinations-container');
      const badge = root.querySelector('#gev-active-pass-badge');
      if (badge) badge.textContent = activePassword || 'General';
      if (!box) return;

      if (!customLocations.length) {
        box.innerHTML = `
          <div class="rem-empty">
            Sin destinos en "${escapeHtml(activePassword || 'General')}". Prueba una clave rápida o guarda lugares desde Buscar.
          </div>
        `;
        return;
      }

      box.innerHTML = customLocations
        .map(
          (dest) => `
        <button type="button" class="btn-custom-dest rem-dest-btn" data-lat="${dest.lat}" data-lon="${dest.lon}" data-height="${dest.height || 15000}">
          <span>
            <span class="rem-result-name">${escapeHtml(dest.name)}</span>
            <span class="rem-result-meta">${Number(dest.lat).toFixed(4)}, ${Number(dest.lon).toFixed(4)}</span>
          </span>
          <span class="material-symbols-outlined rem-accent-icon" aria-hidden="true">flight</span>
        </button>
      `,
        )
        .join('');

      box.querySelectorAll('.btn-custom-dest').forEach((btn) => {
        btn.addEventListener('click', () => {
          const lat = Number(btn.getAttribute('data-lat'));
          const lon = Number(btn.getAttribute('data-lon'));
          const height = Number(btn.getAttribute('data-height'));
          const label =
            btn.querySelector('.rem-result-name')?.textContent || 'destino';
          dispatch(
            'fly_to_location',
            { lat, lon, height },
            `Volando a ${label}`,
          );
        });
      });
    }

    async function loadPasswordDestinations(pass) {
      activePassword = String(pass ?? '')
        .trim()
        .toLowerCase();
      localStorage.setItem('gev_active_preset_password', activePassword);
      setActivePassword(activePassword);

      customLocations = getDestinationsForPassword(activePassword);
      renderCustomLocations();
      log(`Cargando perfil "${activePassword || 'General'}"...`);

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
        log(
          `Perfil "${activePassword || 'General'}" sincronizado (${customLocations.length}).`,
        );
      } catch {
        log(`Destinos locales cargados (${customLocations.length}).`);
      }
    }

    renderCustomLocations();

    root
      .querySelector('#gev-btn-settings')
      ?.addEventListener('click', renderConfigView);
    root
      .querySelector('#gev-btn-refresh-custom-dest')
      ?.addEventListener('click', () =>
        loadPasswordDestinations(activePassword),
      );

    root
      .querySelector('#gev-mobile-btn-apply-pass')
      ?.addEventListener('click', () => {
        const p = root.querySelector('#gev-mobile-pass-input').value.trim();
        loadPasswordDestinations(p);
      });

    root.querySelectorAll('.btn-fast-pass').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-pass');
        const input = root.querySelector('#gev-mobile-pass-input');
        if (input) input.value = p;
        loadPasswordDestinations(p);
      });
    });

    root.querySelectorAll('.btn-location').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-index'));
        const loc = REMOTE_PRESET_LOCATIONS[idx];
        if (loc) {
          dispatch(
            'fly_to_location',
            { lat: loc.lat, lon: loc.lon, height: loc.height },
            `Volando a ${loc.name}`,
          );
        }
      });
    });

    root.querySelectorAll('.rem-layer-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const layer = btn.getAttribute('data-layer');
        const nextEnabled = !layerState.get(layer);
        layerState.set(layer, nextEnabled);
        btn.classList.toggle('is-on', nextEnabled);
        btn.setAttribute('aria-pressed', nextEnabled ? 'true' : 'false');
        const stateEl = btn.querySelector('.rem-layer-state');
        if (stateEl) stateEl.textContent = nextEnabled ? 'Activa' : 'Inactiva';
        dispatch(
          'set_layer_visibility',
          { layer, enabled: nextEnabled },
          `${layer}: ${nextEnabled ? 'activada' : 'desactivada'}`,
        );
      });
    });

    // Gemini Voz AI panel logic
    const aiFeed = root.querySelector('#rem-ai-feed');
    const aiInput = root.querySelector('#rem-ai-input');
    const aiForm = root.querySelector('#rem-ai-form');
    const aiMicBtn = root.querySelector('#rem-ai-mic-btn');
    const aiMicLabel = root.querySelector('#rem-ai-mic-label');
    const aiTtsBtn = root.querySelector('#rem-ai-tts-btn');

    function syncLayerRowUi(rawId, enabled) {
      const normalized =
        rawId === 'ais-live-vessels'
          ? 'vessels'
          : rawId === 'local-firms'
            ? 'firms'
            : rawId;
      if (!layerState.has(normalized)) return;
      layerState.set(normalized, Boolean(enabled));
      const row = root.querySelector(
        `.rem-layer-row[data-layer="${normalized}"]`,
      );
      if (row) {
        row.classList.toggle('is-on', Boolean(enabled));
        row.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        const stateEl = row.querySelector('.rem-layer-state');
        if (stateEl) stateEl.textContent = enabled ? 'Activa' : 'Inactiva';
      }
    }

    function speakAiReply(text) {
      if (!aiTtsEnabled || !text) return;
      const synth = globalThis.speechSynthesis;
      if (!synth || typeof globalThis.SpeechSynthesisUtterance !== 'function')
        return;
      try {
        synth.cancel();
        const u = new globalThis.SpeechSynthesisUtterance(String(text));
        u.lang = 'es-ES';
        u.rate = 1.03;
        synth.speak(u);
      } catch {
        /* ignore TTS error */
      }
    }

    function renderAiFeed() {
      if (!aiFeed) return;
      if (!aiMessages.length) {
        aiFeed.innerHTML = `<div class="rem-empty">Habla o escribe una orden natural para controlar la pantalla principal con Gemini AI.</div>`;
        return;
      }
      aiFeed.innerHTML = aiMessages
        .map(
          (m) => `
          <div class="rem-ai-msg ${m.role === 'user' ? 'is-user' : 'is-model'}">
            <div class="rem-ai-msg-role">${m.role === 'user' ? 'TÚ' : 'GEMINI AI'}</div>
            <div class="rem-ai-msg-text">${escapeHtml(m.text)}</div>
            ${
              m.tools?.length
                ? `<div class="rem-ai-tools">${m.tools.map((t) => `<span class="rem-ai-tool-badge">${escapeHtml(t)}</span>`).join('')}</div>`
                : ''
            }
          </div>
        `,
        )
        .join('');
      aiFeed.scrollTop = aiFeed.scrollHeight;
    }

    async function sendAiPrompt(promptText) {
      const clean = String(promptText || '').trim();
      if (!clean || aiBusy) return;
      aiBusy = true;
      aiMessages.push({ role: 'user', text: clean });
      renderAiFeed();
      log(`Consultando Gemini: "${clean}"`);

      try {
        const base = normalizeServerUrl(serverUrl);
        const enabledLayers = [...layerState.entries()]
          .filter(([, on]) => on)
          .map(([id]) => id);
        const response = await fetch(`${base}/api/gemini/voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: clean,
            context: {
              enabledLayers,
              locale: 'es',
              source: 'mobile-remote',
            },
            history: aiHistory.slice(-6),
          }),
        });
        let data = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        if (!response.ok) {
          throw new Error(
            data?.error || `Error Gemini HTTP ${response.status}`,
          );
        }

        const calls = Array.isArray(data?.functionCalls)
          ? data.functionCalls
          : [];
        const executedLabels = [];
        for (const call of calls) {
          const actionName = call?.name;
          const actionArgs = call?.args || {};
          if (!actionName) continue;
          await sendRemoteCommand({
            serverUrl,
            sessionName,
            deviceName: userName,
            password: activePassword,
            command: { action: actionName, args: actionArgs },
          });
          if (actionName === 'set_layer_visibility') {
            syncLayerRowUi(
              actionArgs.layerId || actionArgs.layer,
              actionArgs.enabled ?? true,
            );
          }
          executedLabels.push(actionName.replace(/_/g, ' '));
        }

        const reply =
          String(data?.text || '').trim() ||
          (executedLabels.length
            ? `Ejecutado en PC: ${executedLabels.join(', ')}.`
            : 'Listo.');

        aiHistory.push({ role: 'user', text: clean });
        aiHistory.push({ role: 'model', text: reply });
        aiMessages.push({ role: 'model', text: reply, tools: executedLabels });
        renderAiFeed();
        log(reply);
        speakAiReply(reply);
      } catch (err) {
        const errMsg = err?.message || 'Error al comunicar con Gemini AI.';
        aiMessages.push({ role: 'model', text: errMsg });
        renderAiFeed();
        log(errMsg, true);
      } finally {
        aiBusy = false;
      }
    }

    function stopRemoteDictation() {
      if (aiRecognition) {
        try {
          aiRecognition.stop();
        } catch {
          /* ignore */
        }
        aiRecognition = null;
      }
      aiDictating = false;
      aiMicBtn?.classList.remove('is-listening');
      aiMicBtn?.setAttribute('aria-pressed', 'false');
      if (aiMicLabel) aiMicLabel.textContent = 'Pulsa para hablar';
    }

    aiMicBtn?.addEventListener('click', () => {
      const Recognition =
        globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
      if (!Recognition) {
        log(
          'Dictado por voz no disponible en este navegador; escribe tu orden.',
          true,
        );
        aiInput?.focus();
        return;
      }
      if (aiDictating) {
        stopRemoteDictation();
        return;
      }
      stopRemoteDictation();
      const rec = new Recognition();
      aiRecognition = rec;
      aiDictating = true;
      rec.lang = 'es-ES';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      aiMicBtn.classList.add('is-listening');
      aiMicBtn.setAttribute('aria-pressed', 'true');
      if (aiMicLabel) aiMicLabel.textContent = 'Escuchando… (toca para parar)';

      let transcript = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const piece = e.results[i]?.[0]?.transcript || '';
          if (e.results[i].isFinal) transcript += `${piece} `;
          else interim += piece;
        }
        if (aiInput) aiInput.value = (transcript || interim).trim();
      };
      rec.onerror = (e) => {
        stopRemoteDictation();
        if (e?.error && e.error !== 'aborted' && e.error !== 'no-speech') {
          log(`Error de micrófono (${e.error}).`, true);
        }
      };
      rec.onend = () => {
        const finalClean = transcript.trim();
        stopRemoteDictation();
        if (finalClean) {
          if (aiInput) aiInput.value = '';
          void sendAiPrompt(finalClean);
        }
      };
      try {
        rec.start();
      } catch {
        stopRemoteDictation();
      }
    });

    aiTtsBtn?.addEventListener('click', () => {
      aiTtsEnabled = !aiTtsEnabled;
      aiTtsBtn.classList.toggle('is-on', aiTtsEnabled);
      aiTtsBtn.setAttribute('aria-pressed', aiTtsEnabled ? 'true' : 'false');
      const iconSpan = aiTtsBtn.querySelector('.material-symbols-outlined');
      if (iconSpan) {
        const glyph = aiTtsEnabled ? 'volume_up' : 'volume_off';
        iconSpan.replaceChildren(document.createTextNode(glyph));
      }
      if (!aiTtsEnabled) globalThis.speechSynthesis?.cancel?.();
    });

    root.querySelectorAll('.rem-ai-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-ai-prompt');
        if (prompt) void sendAiPrompt(prompt);
      });
    });

    aiForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = aiInput?.value || '';
      if (aiInput) aiInput.value = '';
      void sendAiPrompt(val);
    });

    renderAiFeed();

    if (activePassword) {
      loadPasswordDestinations(activePassword);
    }
  }

  if (validUrlSession) {
    renderControlView();
  } else {
    renderConfigView();
  }
  container.appendChild(root);

  return {
    destroy() {
      if (searchTimer) clearTimeout(searchTimer);
      if (searchAbort) searchAbort.abort();
      if (aiRecognition) {
        try {
          aiRecognition.stop();
        } catch {
          /* ignore */
        }
      }
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    },
  };
}
