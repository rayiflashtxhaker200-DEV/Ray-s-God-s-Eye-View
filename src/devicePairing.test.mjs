import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMobileRemote,
  normalizeServerUrl,
  executeRemoteCommand,
  parseCoordinateQuery,
} from './mobileRemoteController.js';
import {
  validateUserCode,
  getDestinationsForPassword,
  saveDestinationsForPassword,
  buildMobilePairingUrl,
  DEFAULT_PASSWORD_PRESETS,
} from './customDestinations.js';
import { renderQrCodeSvg, encodeQrMatrix } from './qrCodeSvg.js';
import { getOptimalPerformanceProfile } from './hardwareProfile.js';
import { remoteSessionStore } from '../server/providers/remote-session.js';

test('detects mobile remote mode from query parameters', () => {
  assert.equal(isMobileRemote('?remote=mobile'), true);
  assert.equal(isMobileRemote('?device=mobile'), true);
  assert.equal(isMobileRemote('?device=mobile&session=test'), true);
  assert.equal(isMobileRemote('?remote=desktop'), false);
  assert.equal(isMobileRemote('?other=value'), false);
  assert.equal(isMobileRemote(''), false);
});

test('normalizes server and tunnel URLs properly', () => {
  assert.equal(
    normalizeServerUrl('https://021125bp-4173.use2.devtunnels.ms/'),
    'https://021125bp-4173.use2.devtunnels.ms',
  );
  assert.equal(
    normalizeServerUrl('http://localhost:3000/'),
    'http://localhost:3000',
  );
  assert.equal(
    normalizeServerUrl('my-tunnel.devtunnels.ms/'),
    'https://my-tunnel.devtunnels.ms',
  );
  assert.equal(
    normalizeServerUrl('   https://custom-domain.com///   '),
    'https://custom-domain.com',
  );
});

test('generates valid QR code SVG and pairing URLs', () => {
  const url = buildMobilePairingUrl({
    baseUrl: 'https://rayseye.local:3000/',
    sessionName: 'operador1',
    password: 'ciudades99',
  });
  assert.equal(
    url,
    'https://rayseye.local:3000/?remote=mobile&session=operador1&pass=ciudades99',
  );
  const { size, modules } = encodeQrMatrix(url);
  assert.ok(size >= 21);
  assert.equal(modules.length, size);
  const svg = renderQrCodeSvg(url, { sizePx: 180 });
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /<path d="/);
  assert.match(svg, /<\/svg>$/);
});

test('parses live coordinate search inputs safely', () => {
  assert.deepEqual(parseCoordinateQuery('40.4168, -3.7038'), {
    lat: 40.4168,
    lon: -3.7038,
  });
  assert.deepEqual(parseCoordinateQuery('-34.6037 -58.3816'), {
    lat: -34.6037,
    lon: -58.3816,
  });
  assert.equal(parseCoordinateQuery('Madrid, España'), null);
  assert.equal(parseCoordinateQuery('95.0, 10.0'), null);
});

test('loads different preset destinations for each specific password', () => {
  assert.equal(validateUserCode('1234').valid, true);
  assert.equal(validateUserCode('operador1').valid, true);
  assert.equal(validateUserCode('123').valid, false);

  const alfaDests = getDestinationsForPassword('alfa1234');
  assert.equal(alfaDests.length, DEFAULT_PASSWORD_PRESETS.alfa1234.length);
  assert.equal(alfaDests[0].name, 'Base Ártica Thule');

  const tacticalDests = getDestinationsForPassword('tactical2026');
  assert.equal(tacticalDests.length, DEFAULT_PASSWORD_PRESETS.tactical2026.length);
  assert.equal(tacticalDests[0].name, 'Estrecho de Gibraltar');

  const cityDests = getDestinationsForPassword('ciudades99');
  assert.equal(cityDests.length, DEFAULT_PASSWORD_PRESETS.ciudades99.length);
  assert.equal(cityDests[0].name, 'Times Square, Nueva York');

  assert.notEqual(alfaDests[0].name, tacticalDests[0].name);
  assert.notEqual(tacticalDests[0].name, cityDests[0].name);

  const customSecretKey = 'mypassword777';
  const myCustomDests = [
    { id: 'c1', name: 'Mi Refugio Secreto', lat: 42.123, lon: -3.456, height: 8000 },
    { id: 'c2', name: 'Pista de Aterrizaje', lat: 42.987, lon: -3.876, height: 6000 },
  ];
  saveDestinationsForPassword(customSecretKey, myCustomDests);

  const loadedCustom = getDestinationsForPassword(customSecretKey);
  assert.equal(loadedCustom.length, 2);
  assert.equal(loadedCustom[0].name, 'Mi Refugio Secreto');

  remoteSessionStore.clear();
  remoteSessionStore.setCustomLocations('user1234', alfaDests, 'alfa1234');
  remoteSessionStore.setCustomLocations('user1234', myCustomDests, customSecretKey);

  const sessionAlfa = remoteSessionStore.getSession('user1234', 0, 'alfa1234');
  assert.equal(sessionAlfa.customLocations[0].name, 'Base Ártica Thule');

  const sessionCustom = remoteSessionStore.getSession('user1234', 0, customSecretKey);
  assert.equal(sessionCustom.customLocations[0].name, 'Mi Refugio Secreto');
});

test('executes remote commands including camera_delta, reset_north, and toggle_tilt', () => {
  const calls = {
    flyTo: [],
    setEnabled: [],
    moveRight: 0,
    moveUp: 0,
    lookRight: 0,
    lookUp: 0,
    zoomIn: 0,
    setView: [],
    stopDirector: false,
    cancelFlight: false,
  };

  const mockApp = {
    viewer: {
      camera: {
        heading: 1.1,
        pitch: -1.5,
        positionCartographic: { height: 50000 },
        flyTo(opts) {
          calls.flyTo.push(opts);
        },
        moveRight(v) {
          calls.moveRight += v;
        },
        moveUp(v) {
          calls.moveUp += v;
        },
        lookRight(v) {
          calls.lookRight += v;
        },
        lookUp(v) {
          calls.lookUp += v;
        },
        zoomIn(v) {
          calls.zoomIn += v;
        },
        setView(opts) {
          calls.setView.push(opts);
        },
        cancelFlight() {
          calls.cancelFlight = true;
        },
      },
    },
    dataManager: {
      setEnabled(id, val) {
        calls.setEnabled.push({ id, val });
      },
    },
    sceneDirector: {
      stop() {
        calls.stopDirector = true;
      },
    },
  };

  assert.equal(
    executeRemoteCommand({ action: 'zoom_to_globe' }, mockApp),
    true,
  );
  assert.equal(calls.flyTo.length, 1);

  assert.equal(
    executeRemoteCommand(
      { action: 'fly_to_location', args: { lat: 40.71, lon: -74.0, height: 12000 } },
      mockApp,
    ),
    true,
  );
  assert.equal(calls.flyTo.length, 2);

  assert.equal(
    executeRemoteCommand(
      { action: 'camera_delta', args: { dx: 12, dy: -8, mode: 'pan', zoomDelta: 0.25 } },
      mockApp,
    ),
    true,
  );
  assert.ok(calls.moveRight > 0);
  assert.ok(calls.moveUp > 0);
  assert.ok(calls.zoomIn > 0);

  assert.equal(
    executeRemoteCommand(
      { action: 'camera_delta', args: { dx: 10, dy: 5, mode: 'orbit' } },
      mockApp,
    ),
    true,
  );
  assert.ok(calls.lookRight !== 0);
  assert.ok(calls.lookUp !== 0);

  assert.equal(executeRemoteCommand({ action: 'reset_north' }, mockApp), true);
  assert.equal(calls.setView.at(-1).orientation.heading, 0);

  assert.equal(executeRemoteCommand({ action: 'toggle_tilt' }, mockApp), true);
  assert.equal(calls.setView.at(-1).orientation.pitch, -Math.PI / 4);

  assert.equal(
    executeRemoteCommand(
      { action: 'set_layer_visibility', args: { layer: 'flights', enabled: true } },
      mockApp,
    ),
    true,
  );
  assert.deepEqual(calls.setEnabled[0], { id: 'flights', val: true });

  assert.equal(executeRemoteCommand({ action: 'stop' }, mockApp), true);
  assert.equal(calls.stopDirector, true);
  assert.equal(calls.cancelFlight, true);
});

test('provides hardware optimization profile for low-spec Dell i5 1st Gen and AMD E-450', () => {
  const profile = getOptimalPerformanceProfile();
  assert.ok(profile);
  assert.ok(profile.targetFrameRate <= 60);
  assert.ok(profile.tileCacheBytes <= 1024 * 1024 * 1024);
  assert.ok(profile.maximumScreenSpaceError >= 16);
  assert.ok(profile.msaaSamples <= 2);
});
