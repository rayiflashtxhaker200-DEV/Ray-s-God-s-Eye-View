import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';
import { localProviderPlugins } from './server/providers/local.js';
import { googleTokenUnavailablePlugin } from './server/standalone/google-token-unavailable.js';
import { apiNotFoundPlugin } from './server/standalone/api-not-found.js';

export default defineConfig({
  root: './',
  base: '/',
  plugins: [
    vue(),
    cesium(),
    ...localProviderPlugins(),
    googleTokenUnavailablePlugin(),
    apiNotFoundPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    target: 'esnext',
  },
});