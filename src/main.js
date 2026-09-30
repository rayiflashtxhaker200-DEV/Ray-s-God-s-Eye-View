import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { isMobileRemote, mountMobileRemoteUI, startPcRemoteListener } from './mobileRemoteController.js';
import { mountPcPairingAndDestinationsPanel, getSharedUserCode } from './customDestinations.js';
import { mountRealismoPresentation } from './realismoPresentationUI.js';

let application = null;

if (isMobileRemote()) {
  // Mobile remote mode: lightweight controller without 3D Cesium loading
  mountMobileRemoteUI();
} else {
  // PC master mode
  application = createStandaloneApplication({
    googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
    cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
    allowQaRegistration: import.meta.env.DEV,
  });

  application.start().then(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionName = params.get('session') || getSharedUserCode;

    // Listen for mobile commands on the shared user code session
    startPcRemoteListener({
      sessionName,
      app: window.__godsEyeView,
    });

    // Mount PC pairing and custom destinations manager panel
    if (window.__godsEyeView?.viewer) {
      mountPcPairingAndDestinationsPanel(window.__godsEyeView.viewer);
    }

    // Mount the Realism Literature presentation Infocard component
    const presentation = mountRealismoPresentation({ viewer: window.__godsEyeView?.viewer });
    window.__realismoPresentation = presentation;
    window.__selectRealismoBlock = (idOrIdx, fly) => presentation.selectBlock(idOrIdx, fly);
    window.__nextRealismoBlock = (fly) => presentation.nextBlock(fly);
    window.__prevRealismoBlock = (fly) => presentation.prevBlock(fly);
  }).catch((error) => {
    console.error("God's Eye View initialization failed:", error);
    const loaderStatus = document.querySelector('#loading-screen .loader-status');
    if (loaderStatus) {
      loaderStatus.textContent = `Error: ${describeError(error)}`;
      loaderStatus.style.color = '#ff4444';
    }
  });
}

export { application };
