import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
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
import { createRemoteSqlStore } from '../server/providers/remote-db.js';
import {
  remoteSessionStore,
  createRemoteMiddlewareHandler,
} from '../server/providers/remote-session.js';

function startTestServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url?.startsWith('/api/remote')) {
        const rest = req.url.slice('/api/remote'.length) || '/';
        req.url = rest.startsWith('/') ? rest : `/${rest}`;
        handler(req, res);
        return;
      }
      res.statusCode = 404;
      res.end('Not found');
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

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

test('generates valid QR code SVG and one-time pairing URLs without exposing passwords', () => {
  const url = buildMobilePairingUrl({
    baseUrl: 'https://rayseye.local:3000/',
    sessionName: 'operador1',
    pairToken: 'ptok_one_time_12345',
  });
  assert.equal(
    url,
    'https://rayseye.local:3000/?remote=mobile&session=operador1&pair=ptok_one_time_12345',
  );
  assert.equal(url.includes('pass='), false);

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

test('loads different preset destinations for each profile', () => {
  assert.equal(validateUserCode('1234').valid, true);
  assert.equal(validateUserCode('operador1').valid, true);
  assert.equal(validateUserCode('123').valid, false);
  assert.equal(validateUserCode('bad user!').valid, false);

  const alfaDests = getDestinationsForPassword('alfa1234');
  assert.equal(alfaDests.length, DEFAULT_PASSWORD_PRESETS.alfa1234.length);
  assert.equal(alfaDests[0].name, 'Base Ártica Thule');

  const tacticalDests = getDestinationsForPassword('tactical2026');
  assert.equal(tacticalDests.length, DEFAULT_PASSWORD_PRESETS.tactical2026.length);
  assert.equal(tacticalDests[0].name, 'Estrecho de Gibraltar');

  const cityDests = getDestinationsForPassword('ciudades99');
  assert.equal(cityDests.length, DEFAULT_PASSWORD_PRESETS.ciudades99.length);
  assert.equal(cityDests[0].name, 'Times Square, Nueva York');

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

test('SQLite store persists accounts, hashed passwords, destinations, and sessions across DB reopen', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-sqlite-'));
  const dbPath = path.join(tmpDir, 'remote-test.sqlite');
  const store = createRemoteSqlStore({ dbPath });

  try {
    const reg = store.registerUser({
      username: 'Comandante1',
      password: 'clave_super_segura_99',
      displayName: 'Sala Norte',
      deviceName: 'Estación PC',
      deviceType: 'pc',
      ipHint: '127.0.0.1',
    });
    assert.equal(reg.ok, true);
    assert.equal(reg.user.username, 'comandante1');
    assert.ok(reg.token.startsWith('gev1.'));

    store.replaceDestinations(
      reg.user.id,
      [{ id: 'd1', name: 'Observatorio SQL', lat: 28.76, lon: -17.89, height: 9000 }],
      'alfa1234',
    );

    // Reopen SQLite file from disk to verify persistence
    store.reopen(dbPath);

    const authAfterReopen = store.authenticateBearer(reg.token);
    assert.ok(authAfterReopen);
    assert.equal(authAfterReopen.user.username, 'comandante1');

    const destsAfterReopen = store.getDestinations(reg.user.id, 'alfa1234');
    assert.equal(destsAfterReopen.length, 1);
    assert.equal(destsAfterReopen[0].name, 'Observatorio SQL');

    const badLogin = store.loginUser({
      username: 'comandante1',
      password: 'wrong-password',
      ipHint: '127.0.0.1',
    });
    assert.equal(badLogin.ok, false);
    assert.equal(badLogin.status, 401);

    const goodLogin = store.loginUser({
      username: 'comandante1',
      password: 'clave_super_segura_99',
      deviceName: 'Portátil 2',
      deviceType: 'pc',
      ipHint: '127.0.0.1',
    });
    assert.equal(goodLogin.ok, true);
    assert.ok(goodLogin.token.startsWith('gev1.'));
  } finally {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('HTTP remote API enforces Bearer auth, single-use QR/PIN, RBAC, device revocation, isolation, and CORS', async () => {
  const store = createRemoteSqlStore({ dbPath: ':memory:' });
  const handler = createRemoteMiddlewareHandler({ sqlStore: store });
  const srv = await startTestServer(handler);

  try {
    // 1. Unauthenticated /session access is rejected with 401
    const unauthRes = await fetch(`${srv.baseUrl}/api/remote/session`);
    assert.equal(unauthRes.status, 401);

    // 2. Foreign Origin is rejected with 403 and no wildcard CORS header
    const evilOriginRes = await fetch(`${srv.baseUrl}/api/remote/health`, {
      headers: { Origin: 'https://evil.attacker.example' },
    });
    assert.equal(evilOriginRes.status, 403);
    assert.equal(evilOriginRes.headers.get('access-control-allow-origin'), null);

    // 3. Register two isolated accounts: alice & bob
    const aliceRegRes = await fetch(`${srv.baseUrl}/api/remote/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'alice_ops',
        password: 'AliceSecret2026!',
        deviceName: 'Alice PC',
      }),
    });
    assert.equal(aliceRegRes.status, 201);
    const alice = await aliceRegRes.json();
    assert.ok(alice.token);

    const bobRegRes = await fetch(`${srv.baseUrl}/api/remote/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'bob_ops',
        password: 'BobSecret2026!',
        deviceName: 'Bob PC',
      }),
    });
    assert.equal(bobRegRes.status, 201);
    const bob = await bobRegRes.json();

    // 4. Alice generates a one-time pairing token + 6-digit PIN requiring approval for a viewer
    const pairCreateRes = await fetch(`${srv.baseUrl}/api/remote/pairing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        roleGrant: 'viewer',
        requiresApproval: true,
        ttlSeconds: 300,
      }),
    });
    assert.equal(pairCreateRes.status, 201);
    const pairData = await pairCreateRes.json();
    assert.match(pairData.pin, /^\d{6}$/);
    assert.ok(pairData.pairToken.startsWith('ptok_'));

    // 5. Mobile claims pairing via 6-digit PIN -> enters pendingApproval
    const claimRes = await fetch(`${srv.baseUrl}/api/remote/pairing/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'alice_ops',
        pin: pairData.pin,
        deviceName: 'Pixel 9 Móvil',
        deviceType: 'mobile',
      }),
    });
    assert.equal(claimRes.status, 200);
    const mobileAuth = await claimRes.json();
    assert.equal(mobileAuth.pendingApproval, true);
    assert.ok(mobileAuth.token);

    // 6. Second claim attempt with same one-time QR token must fail with 410 Gone
    const reuseRes = await fetch(`${srv.baseUrl}/api/remote/pairing/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'alice_ops',
        pairToken: pairData.pairToken,
        deviceName: 'Clonador',
      }),
    });
    assert.equal(reuseRes.status, 410);

    // 7. Pending mobile cannot poll or post /session yet (403 PENDING_APPROVAL)
    const pendingSessionRes = await fetch(`${srv.baseUrl}/api/remote/session`, {
      headers: { Authorization: `Bearer ${mobileAuth.token}` },
    });
    assert.equal(pendingSessionRes.status, 403);

    // 8. Alice approves mobile (stays 'viewer' role)
    const approveRes = await fetch(
      `${srv.baseUrl}/api/remote/devices/${mobileAuth.device.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({ status: 'approved' }),
      },
    );
    assert.equal(approveRes.status, 200);

    // 9. Approved Control (viewer) can GET /session & GET /monitor, but POST command returns 403 READ_ONLY_VIEWER
    const viewerGetRes = await fetch(`${srv.baseUrl}/api/remote/session`, {
      headers: { Authorization: `Bearer ${mobileAuth.token}` },
    });
    assert.equal(viewerGetRes.status, 200);

    const monitorRes = await fetch(`${srv.baseUrl}/api/remote/monitor`, {
      headers: { Authorization: `Bearer ${mobileAuth.token}` },
    });
    assert.equal(monitorRes.status, 200);
    const monitorSnap = await monitorRes.json();
    assert.equal(monitorSnap.engine, 'sqlite');
    assert.equal(monitorSnap.role, 'viewer');
    assert.ok(Array.isArray(monitorSnap.devices));
    assert.ok(Array.isArray(monitorSnap.auditLogs));
    assert.ok(monitorSnap.devices.every((d) => d.userId === alice.user.id));

    // Control (viewer) cannot delete console audit logs (403)
    const firstAuditId = monitorSnap.auditLogs[0]?.id;
    assert.ok(firstAuditId);
    const viewerDelAuditRes = await fetch(
      `${srv.baseUrl}/api/remote/audit/${firstAuditId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${mobileAuth.token}` },
      },
    );
    assert.equal(viewerDelAuditRes.status, 403);

    // Bob (another admin) cannot delete Alice's audit log (404)
    const bobDelAliceAuditRes = await fetch(
      `${srv.baseUrl}/api/remote/audit/${firstAuditId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bob.token}` },
      },
    );
    assert.equal(bobDelAliceAuditRes.status, 404);

    const viewerPostRes = await fetch(`${srv.baseUrl}/api/remote/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mobileAuth.token}`,
      },
      body: JSON.stringify({ command: { action: 'zoom_to_globe', args: {} } }),
    });
    assert.equal(viewerPostRes.status, 403);

    // 10. Promote mobile to 'operator' -> POST command succeeds and goes only to Alice (never Bob!)
    await fetch(`${srv.baseUrl}/api/remote/devices/${mobileAuth.device.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ role: 'operator' }),
    });

    const opPostRes = await fetch(`${srv.baseUrl}/api/remote/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mobileAuth.token}`,
      },
      body: JSON.stringify({ command: { action: 'zoom_to_globe', args: {} } }),
    });
    assert.equal(opPostRes.status, 200);

    const bobSessionRes = await fetch(`${srv.baseUrl}/api/remote/session`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    const bobSession = await bobSessionRes.json();
    assert.equal(bobSession.commands.length, 0);
    assert.equal(bobSession.sessionName, 'bob_ops');

    // 11. Revoke mobile device -> mobile Bearer token immediately gets 401
    await fetch(`${srv.baseUrl}/api/remote/devices/${mobileAuth.device.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ status: 'revoked' }),
    });

    const afterRevokeRes = await fetch(`${srv.baseUrl}/api/remote/session`, {
      headers: { Authorization: `Bearer ${mobileAuth.token}` },
    });
    assert.equal(afterRevokeRes.status, 401);

    // 12. Verify audit log recorded pairing, denial, role change, and revocation, and allow Alice to delete & clear console
    const devAuditRes = await fetch(`${srv.baseUrl}/api/remote/devices`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const devAudit = await devAuditRes.json();
    const eventTypes = new Set(devAudit.auditLogs.map((e) => e.eventType));
    assert.equal(eventTypes.has('user_registered'), true);
    assert.equal(eventTypes.has('pairing_created'), true);
    assert.equal(eventTypes.has('pairing_claimed'), true);
    assert.equal(eventTypes.has('command_denied'), true);
    assert.equal(eventTypes.has('device_revoked'), true);

    const targetDelId = devAudit.auditLogs[0].id;
    const delSingleRes = await fetch(
      `${srv.baseUrl}/api/remote/audit/${targetDelId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${alice.token}` },
      },
    );
    assert.equal(delSingleRes.status, 200);

    const clearAllRes = await fetch(`${srv.baseUrl}/api/remote/audit`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert.equal(clearAllRes.status, 200);

    const afterClearAuditRes = await fetch(`${srv.baseUrl}/api/remote/devices`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const afterClearAudit = await afterClearAuditRes.json();
    assert.equal(afterClearAudit.auditLogs.length, 0);

    // 13. Brute-force PIN attempts trigger 429 rate limit
    for (let i = 0; i < 6; i++) {
      await fetch(`${srv.baseUrl}/api/remote/pairing/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice_ops', pin: '000000' }),
      });
    }
    const lockedRes = await fetch(`${srv.baseUrl}/api/remote/pairing/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice_ops', pin: '000000' }),
    });
    assert.equal(lockedRes.status, 429);
  } finally {
    await srv.close();
    store.close();
  }
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
