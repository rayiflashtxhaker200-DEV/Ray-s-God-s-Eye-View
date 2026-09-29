import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMobileRemote,
  normalizeServerUrl,
  executeRemoteCommand,
} from './mobileRemoteController.js';
import {
  validateUserCode,
  addCustomDestination,
  getDestinationsForPassword,
  saveDestinationsForPassword,
  DEFAULT_PASSWORD_PRESETS,
} from './customDestinations.js';
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

test('loads different preset destinations for each specific password', () => {
  // 1. Minimum 4-character user code validation
  assert.equal(validateUserCode('1234').valid, true);
  assert.equal(validateUserCode('operador1').valid, true);
  assert.equal(validateUserCode('123').valid, false);

  // 2. Built-in password presets in code
  const alfaDests = getDestinationsForPassword('alfa1234');
  assert.equal(alfaDests.length, DEFAULT_PASSWORD_PRESETS.alfa1234.length);
  assert.equal(alfaDests[0].name, 'Base Ártica Thule');

  const tacticalDests = getDestinationsForPassword('tactical2026');
  assert.equal(tacticalDests.length, DEFAULT_PASSWORD_PRESETS.tactical2026.length);
  assert.equal(tacticalDests[0].name, 'Estrecho de Gibraltar');

  const cityDests = getDestinationsForPassword('ciudades99');
  assert.equal(cityDests.length, DEFAULT_PASSWORD_PRESETS.ciudades99.length);
  assert.equal(cityDests[0].name, 'Times Square, Nueva York');

  // Verify that different passwords yield completely different destinations
  assert.notEqual(alfaDests[0].name, tacticalDests[0].name);
  assert.notEqual(tacticalDests[0].name, cityDests[0].name);

  // 3. Custom password profile creation from PC
  const customSecretKey = 'mypassword777';
  const myCustomDests = [
    { id: 'c1', name: 'Mi Refugio Secreto', lat: 42.123, lon: -3.456, height: 8000 },
    { id: 'c2', name: 'Pista de Aterrizaje', lat: 42.987, lon: -3.876, height: 6000 },
  ];
  saveDestinationsForPassword(customSecretKey, myCustomDests);

  const loadedCustom = getDestinationsForPassword(customSecretKey);
  assert.equal(loadedCustom.length, 2);
  assert.equal(loadedCustom[0].name, 'Mi Refugio Secreto');

  // 4. Remote session store handles password-isolated presets
  remoteSessionStore.clear();
  remoteSessionStore.setCustomLocations('user1234', alfaDests, 'alfa1234');
  remoteSessionStore.setCustomLocations('user1234', myCustomDests, customSecretKey);

  const sessionAlfa = remoteSessionStore.getSession('user1234', 0, 'alfa1234');
  assert.equal(sessionAlfa.customLocations[0].name, 'Base Ártica Thule');

  const sessionCustom = remoteSessionStore.getSession('user1234', 0, customSecretKey);
  assert.equal(sessionCustom.customLocations[0].name, 'Mi Refugio Secreto');
});

test('executes remote commands and dispatches on master application', () => {
  const calls = {
    flyTo: [],
    setEnabled: [],
    stopDirector: false,
    cancelFlight: false,
  };

  const mockApp = {
    viewer: {
      camera: {
        flyTo(opts) {
          calls.flyTo.push(opts);
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
