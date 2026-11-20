import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { localProviderPlugins } from './providers/local.js';
import { localMcpPlugin } from './mcp/plugin.js';
import { apiNotFoundPlugin } from './standalone/api-not-found.js';
import { googleTokenUnavailablePlugin } from './standalone/google-token-unavailable.js';
import { standaloneVoiceTools } from './standalone/voiceTools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
});

const ASSET_EXTENSION_RE = /\.[a-z0-9]{1,12}$/i;

function loadEnvFiles(rootDir) {
  for (const filename of ['.env', '.env.local']) {
    const filePath = path.join(rootDir, filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = parseEnv(fs.readFileSync(filePath, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch (error) {
      console.warn(`[server] Failed to parse ${filename}:`, error?.message || error);
    }
  }
}

function createMiddlewareDispatcher() {
  const stack = [];

  function use(pathOrFn, maybeFn) {
    if (typeof pathOrFn === 'function') {
      stack.push({ route: '/', routeLower: '/', handle: pathOrFn });
      return app;
    }
    const rawRoute = String(pathOrFn || '/').trim() || '/';
    const route =
      rawRoute.length > 1 && rawRoute.endsWith('/')
        ? rawRoute.slice(0, -1)
        : rawRoute;
    if (typeof maybeFn !== 'function') {
      throw new TypeError(`Middleware for ${route} must be a function`);
    }
    stack.push({
      route,
      routeLower: route.toLowerCase(),
      handle: maybeFn,
    });
    return app;
  }

  function matchRoute(reqUrl, layer) {
    if (layer.route === '/') return { matched: true, subUrl: reqUrl };
    const qIdx = reqUrl.indexOf('?');
    const pathname = qIdx >= 0 ? reqUrl.slice(0, qIdx) : reqUrl;
    const query = qIdx >= 0 ? reqUrl.slice(qIdx) : '';
    const pathnameLower = pathname.toLowerCase();
    if (!pathnameLower.startsWith(layer.routeLower)) {
      return { matched: false, subUrl: reqUrl };
    }
    const nextChar = pathname[layer.routeLower.length];
    if (nextChar !== undefined && nextChar !== '/') {
      return { matched: false, subUrl: reqUrl };
    }
    const restPath = pathname.slice(layer.route.length) || '/';
    return {
      matched: true,
      subUrl: (restPath.startsWith('/') ? restPath : `/${restPath}`) + query,
    };
  }

  function app(req, res, done) {
    let idx = 0;
    const originalUrl = req.originalUrl || req.url || '/';
    if (!req.originalUrl) req.originalUrl = originalUrl;

    const next = (err) => {
      if (err) {
        if (typeof done === 'function') return done(err);
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
        return;
      }

      while (idx < stack.length) {
        const layer = stack[idx++];
        const currentUrl = req.url || '/';
        const { matched, subUrl } = matchRoute(currentUrl, layer);
        if (!matched) continue;

        req.url = subUrl;
        let finished = false;
        const restoreAndContinue = (stepErr) => {
          if (finished) return;
          finished = true;
          req.url = currentUrl;
          next(stepErr);
        };

        try {
          const result = layer.handle(req, res, restoreAndContinue);
          if (result && typeof result.then === 'function') {
            result.catch((asyncErr) => {
              if (finished || res.headersSent || res.writableEnded) return;
              console.error('[server] Middleware error:', asyncErr?.message || asyncErr);
              restoreAndContinue(asyncErr);
            });
          }
        } catch (syncErr) {
          if (!finished && !res.headersSent) {
            restoreAndContinue(syncErr);
          }
        }
        return;
      }

      if (typeof done === 'function') done();
    };

    next();
  }

  app.use = use;
  return app;
}

function sendStaticFile(req, res, filePath, { immutable = false } = {}) {
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': immutable
        ? 'public, max-age=31536000, immutable'
        : ext === '.html' || ext === '.webmanifest'
          ? 'no-cache'
          : 'public, max-age=3600',
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end();
    });
    stream.pipe(res);
  });
}

function createStaticHandler(distDir) {
  const resolvedDist = path.resolve(distDir);
  const distPrefix = `${resolvedDist}${path.sep}`;
  const indexHtml = path.join(resolvedDist, 'index.html');

  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed');
      return;
    }

    let pathname = '/';
    try {
      const parsed = new URL(req.url || '/', 'http://localhost');
      pathname = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }

    // Never fall back to HTML for any /api route
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ error: 'Unknown API route' }));
      return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = path.resolve(resolvedDist, relativePath);
    if (candidate !== resolvedDist && !candidate.startsWith(distPrefix)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const isImmutable = pathname.startsWith('/assets/');
    fs.stat(candidate, (err, stat) => {
      if (!err && stat.isFile()) {
        sendStaticFile(req, res, candidate, { immutable: isImmutable });
        return;
      }
      if (!err && stat.isDirectory()) {
        const dirIndex = path.join(candidate, 'index.html');
        if (fs.existsSync(dirIndex)) {
          sendStaticFile(req, res, dirIndex);
          return;
        }
      }
      // Missing explicit asset paths (.json, .js, .webp, etc.) must return 404, never HTML
      if (ASSET_EXTENSION_RE.test(pathname) && pathname !== '/index.html') {
        res.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end('Not found');
        return;
      }
      sendStaticFile(req, res, indexHtml);
    });
  };
}

export function createProductionServer({
  rootDir = ROOT_DIR,
  distDir = DIST_DIR,
} = {}) {
  loadEnvFiles(rootDir);

  const middlewares = createMiddlewareDispatcher();
  const tools = standaloneVoiceTools();
  let httpServer;

  // Security headers across all responses
  middlewares.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const urlLower = String(req.url || '').toLowerCase();
    if (urlLower === '/api' || urlLower.startsWith('/api/')) {
      if (!res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    }
    next();
  });

  // Expose only non-secret public client map config when set at runtime
  middlewares.use('/api/client-config', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    const cesiumToken = String(process.env.CESIUM_ION_TOKEN || '').trim();
    const body = JSON.stringify({ cesiumToken });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });

  const staticHandler = createStaticHandler(distDir);
  httpServer = http.createServer((req, res) => {
    middlewares(req, res, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
        return;
      }
      staticHandler(req, res);
    });
  });

  const plugins = [
    ...localProviderPlugins({
      realtime: { tools },
      gemini: { tools },
    }),
    localMcpPlugin(),
    googleTokenUnavailablePlugin(),
    apiNotFoundPlugin(),
  ];

  const previewServerApi = {
    middlewares,
    httpServer,
    config: {
      root: rootDir,
      server: { host: '0.0.0.0', allowedHosts: true },
      preview: { host: '0.0.0.0', allowedHosts: true },
    },
  };

  for (const plugin of plugins) {
    if (typeof plugin?.configurePreviewServer === 'function') {
      plugin.configurePreviewServer(previewServerApi);
    }
  }

  return httpServer;
}

const isMainEntry =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainEntry) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const server = createProductionServer();

  server.listen(port, host, () => {
    console.log(`[server] Production server listening on http://${host}:${port}`);
  });

  const shutdown = (signal) => {
    console.log(`[server] Received ${signal}, shutting down...`);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
