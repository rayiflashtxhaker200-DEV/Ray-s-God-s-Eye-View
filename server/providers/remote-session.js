const remoteSessions = new Map();

export const remoteSessionStore = {
  getOrCreate(sessionName = 'default') {
    if (!remoteSessions.has(sessionName)) {
      remoteSessions.set(sessionName, {
        sessionName,
        devices: new Map(),
        commands: [],
        customLocations: [],
        passwordPresets: {},
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    }
    return remoteSessions.get(sessionName);
  },

  addCommand(sessionName = 'default', command, deviceName = 'anonymous') {
    const session = this.getOrCreate(sessionName);
    session.lastActiveAt = Date.now();
    const cmd = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action: command.action,
      args: command.args || {},
      deviceName,
      timestamp: Date.now(),
    };
    session.commands.push(cmd);
    if (session.commands.length > 100) {
      session.commands.shift();
    }
    return cmd;
  },

  registerDevice(sessionName = 'default', { deviceType = 'mobile', deviceName = 'Mobile Device', deviceId } = {}) {
    const session = this.getOrCreate(sessionName);
    session.lastActiveAt = Date.now();
    const id = deviceId || `dev_${Math.random().toString(36).slice(2, 9)}`;
    const dev = {
      id,
      deviceType,
      deviceName,
      lastSeen: Date.now(),
    };
    session.devices.set(id, dev);
    return dev;
  },

  setCustomLocations(sessionName = 'default', locations = [], password = '') {
    const session = this.getOrCreate(sessionName);
    session.lastActiveAt = Date.now();
    const list = Array.isArray(locations) ? locations : [];
    session.customLocations = list;
    if (password) {
      if (!session.passwordPresets) session.passwordPresets = {};
      session.passwordPresets[password] = list;
    }
    return list;
  },

  getCustomLocationsForPassword(sessionName = 'default', password = '') {
    const session = this.getOrCreate(sessionName);
    if (password) {
      return session.passwordPresets?.[password] || [];
    }
    return session.customLocations || [];
  },

  addCustomLocation(sessionName = 'default', location, password = '') {
    const session = this.getOrCreate(sessionName);
    session.lastActiveAt = Date.now();
    if (!session.customLocations) session.customLocations = [];
    const item = {
      id: location.id || `loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: location.name || 'Destino',
      lat: Number(location.lat ?? location.latitude ?? 0),
      lon: Number(location.lon ?? location.longitude ?? 0),
      height: Number(location.height ?? 18000),
    };
    session.customLocations.push(item);
    if (password) {
      if (!session.passwordPresets) session.passwordPresets = {};
      if (!session.passwordPresets[password]) session.passwordPresets[password] = [];
      session.passwordPresets[password].push(item);
    }
    return item;
  },

  getSession(sessionName = 'default', since = 0, password = '') {
    const session = remoteSessions.get(sessionName);
    if (!session) return null;
    const sinceTime = Number(since) || 0;
    const commands = sinceTime > 0
      ? session.commands.filter((c) => c.timestamp > sinceTime)
      : [...session.commands];

    let customLocations = session.customLocations || [];
    if (password) {
      customLocations = session.passwordPresets?.[password] || [];
    }

    return {
      sessionName,
      devices: Array.from(session.devices.values()),
      commands,
      customLocations,
      passwordPresets: session.passwordPresets || {},
      lastActiveAt: session.lastActiveAt,
    };
  },

  clear() {
    remoteSessions.clear();
  },
};

/** Vite middleware plugin for /api/remote/session */
export function remoteSessionPlugin() {
  const handler = (req, res) => {
    // Enable CORS for tunnels and cross-device communication
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Prevent 5400 RPM mechanical HDD thrashing with browser temporary disk cache files
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const sessionName = url.searchParams.get('session') || url.searchParams.get('sessionName') || 'default';
      const since = url.searchParams.get('since') || 0;
      const password = url.searchParams.get('password') || url.searchParams.get('pass') || '';

      const data = remoteSessionStore.getSession(sessionName, since, password) || {
        sessionName,
        devices: [],
        commands: [],
        customLocations: [],
        passwordPresets: {},
        lastActiveAt: Date.now(),
      };
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, ...data }));
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const sessionName = payload.sessionName || 'default';
          const deviceName = payload.deviceName || 'Mobile';
          const deviceType = payload.deviceType || 'mobile';
          const password = payload.password || payload.pass || '';

          remoteSessionStore.registerDevice(sessionName, {
            deviceId: payload.deviceId,
            deviceName,
            deviceType,
          });

          if (payload.customLocations && Array.isArray(payload.customLocations)) {
            remoteSessionStore.setCustomLocations(sessionName, payload.customLocations, password);
          }

          let command = null;
          if (payload.command) {
            command = remoteSessionStore.addCommand(sessionName, payload.command, deviceName);
            if (payload.command.action === 'sync_custom_locations' && payload.command.args?.locations) {
              remoteSessionStore.setCustomLocations(
                sessionName,
                payload.command.args.locations,
                payload.command.args.password || password,
              );
            }
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            ok: true,
            sessionName,
            commandId: command ? command.id : null,
            command,
            customLocations: remoteSessionStore.getCustomLocationsForPassword(sessionName, password),
          }));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  };

  return {
    name: 'remote-session-plugin',
    configureServer(server) {
      server.middlewares.use('/api/remote/session', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/remote/session', handler);
    },
  };
}
