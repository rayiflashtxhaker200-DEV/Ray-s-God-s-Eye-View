import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';
import { localProviderPlugins } from './server/providers/local.js';
import { localMcpPlugin } from './server/mcp/plugin.js';
import { apiNotFoundPlugin } from './server/standalone/api-not-found.js';
import { googleTokenUnavailablePlugin } from './server/standalone/google-token-unavailable.js';
import { unwatchedRuntimeDirsPlugin } from './server/standalone/unwatched-cache.js';
import { standaloneVoiceTools } from './server/standalone/voiceTools.js';

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const tools = standaloneVoiceTools();

  return {
    root: './',
    base: '/',
    cacheDir: process.env.VITE_CACHE_DIR || '/tmp/.vite-gev-cache',
    plugins: [
      vue(),
      cesium({ devMinifyCesium: true }),
      ...localProviderPlugins({
        realtime: { tools },
        gemini: { tools },
      }),
      localMcpPlugin(),
      googleTokenUnavailablePlugin(),
      apiNotFoundPlugin(),
      unwatchedRuntimeDirsPlugin(),
    ],
    define: {
      'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(
        process.env.GOOGLE_MAPS_API_KEY || '',
      ),
      'import.meta.env.CESIUM_ION_TOKEN': JSON.stringify(
        process.env.CESIUM_ION_TOKEN || '',
      ),
      'import.meta.env.PHOTON_URL':
        process.env.PHOTON_URL === undefined
          ? 'undefined'
          : JSON.stringify(process.env.PHOTON_URL || null),
      'import.meta.env.MAPILLARY_CLIENT_TOKEN': JSON.stringify(
        process.env.MAPILLARY_CLIENT_TOKEN || '',
      ),
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
    },
    build: {
      target: 'esnext',
    },
  };
});
