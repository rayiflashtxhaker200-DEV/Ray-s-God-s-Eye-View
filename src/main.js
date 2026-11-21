import {
  isMobileRemote,
  mountMobileRemoteUI,
  startPcRemoteListener,
} from './mobileRemoteController.js';

let application = null;

function dismissLoader() {
  const loader = document.getElementById('loading-screen');
  if (!loader) return;
  loader.classList.add('hidden');
  loader.classList.add('fade-out');
  setTimeout(() => {
    loader.style.display = 'none';
  }, 450);
}

if (isMobileRemote()) {
  document.documentElement.lang = 'es';
  document.body.classList.add('is-mobile-remote');
  dismissLoader();
  mountMobileRemoteUI(document.body);
} else {
  const [
    { createStandaloneApplication },
    { describeError },
    { t },
    { mountPcPairingAndDestinationsPanel, getPcRemoteAuth, onPcAuthChange },
  ] = await Promise.all([
    import('./standalone/application.js'),
    import('./standalone/errors.js'),
    import('./i18n/index.js'),
    import('./customDestinations.js'),
  ]);

  // The Vite boundary exposes only undefined, null, or a validated URL.
  const photonSetting = import.meta.env.PHOTON_URL;
  let cesiumToken = String(import.meta.env.CESIUM_ION_TOKEN || '').trim();
  if (!cesiumToken && typeof globalThis.fetch === 'function') {
    try {
      const cfgResp = await globalThis.fetch('/api/client-config', {
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
      });
      if (cfgResp.ok) {
        const cfg = await cfgResp.json();
        if (typeof cfg?.cesiumToken === 'string' && cfg.cesiumToken.trim()) {
          cesiumToken = cfg.cesiumToken.trim();
        }
      }
    } catch {
      /* ignore runtime client-config fallback errors */
    }
  }

  application = createStandaloneApplication({
    googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
    cesiumToken,
    geospatial:
      photonSetting === undefined
        ? {}
        : { endpoints: { photon: photonSetting } },
    allowQaRegistration: import.meta.env.DEV,
  });

  // Fallback safety: ensure loading screen NEVER stays stuck in a loop
  const safetyDismissTimer = setTimeout(dismissLoader, 4500);

  application
    .start()
    .then((components) => {
      clearTimeout(safetyDismissTimer);
      dismissLoader();

      const viewer = components?.scene?.viewer || window.__godsEyeView?.viewer;
      const dataManager =
        components?.data?.dataManager || window.__godsEyeView?.dataManager;
      const sceneDirector =
        components?.tools?.sceneDirector || window.__godsEyeView?.sceneDirector;
      const styleManager =
        components?.controls?.styleManager ||
        window.__godsEyeView?.styleManager;
      const voiceCommands =
        components?.tools?.voiceCommands || window.__godsEyeView?.voiceCommands;
      const placeSearch =
        components?.placeSearch || styleManager?.placeSearch || null;
      const surfaceServices =
        components?.scene?.operations?.surface ||
        window.__godsEyeView?.surfaceServices ||
        null;

      mountPcPairingAndDestinationsPanel(viewer);
      startPcRemoteListener({
        getAuthToken: () => getPcRemoteAuth().token,
        onAuthChange: onPcAuthChange,
        sessionName: () => getPcRemoteAuth().user?.username || '',
        app: {
          viewer,
          dataManager,
          sceneDirector,
          styleManager,
          voiceCommands,
          placeSearch,
          surfaceServices,
        },
      });
    })
    .catch((error) => {
      console.error("Ray's Eye View initialization failed:", error);
      const loaderStatus = document.querySelector(
        '#loading-screen .loader-status',
      );
      if (loaderStatus) {
        loaderStatus.textContent = t('Error: {message}', {
          message: describeError(error),
        });
        loaderStatus.style.color = '#ff4444';
      }
      setTimeout(dismissLoader, 2500);
    });
}

export { application };
