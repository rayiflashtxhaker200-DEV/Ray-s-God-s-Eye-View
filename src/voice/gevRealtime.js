/**
 * Real-time Voice Controller Adapter for God's Eye View
 */

import * as Cesium from 'cesium';
import { createGeminiSession } from './geminiSession.js';

export function initGevVoiceCommands(options = {}) {
  const runner = async (action, args = {}) => {
    console.info(`[VoiceCommand] Executing action: "${action}"`, args);
    const viewer = options.viewer || (typeof window !== 'undefined' ? window.__godsEyeView?.viewer : null);

    if (action === 'fly_to_location') {
      const lat = Number(args.latitude ?? args.lat);
      const lon = Number(args.longitude ?? args.lon);
      const height = Number(args.rangeM ?? args.height ?? 18000);
      if (!isNaN(lat) && !isNaN(lon) && viewer?.camera?.flyTo) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
          duration: 2.2,
        });
        return { ok: true };
      }
      if ((args.query || args.locationId) && options.searchNavigation) {
        return options.searchNavigation(args.query || args.locationId, options.signal);
      }
    }

    if (action === 'zoom_to_globe' && viewer?.camera?.flyTo) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(0, 20, 20000000),
        duration: 2.5,
      });
      return { ok: true };
    }

    if (action === 'set_layer_visibility' && options.dataManager?.setEnabled) {
      options.dataManager.setEnabled(args.layerId, Boolean(args.enabled));
      return { ok: true };
    }

    if (action === 'apply_visual_style' && options.styleManager?.setStyle) {
      options.styleManager.setStyle(args.style);
      return { ok: true };
    }

    if (action === 'stop_all_motion') {
      if (viewer?.camera?.cancelFlight) viewer.camera.cancelFlight();
      if (options.sceneDirector?.stop) options.sceneDirector.stop();
      return { ok: true };
    }

    return { ok: true };
  };

  const session = createGeminiSession({
    emit: (evt) => {
      // Event listener
    },
    runAction: runner,
    ui: {
      root: typeof document !== 'undefined' ? document.getElementById('voice-hud') : null,
      detail: typeof document !== 'undefined' ? document.querySelector('.voice-detail') : null,
    },
    runner,
    signal: options.signal,
  });

  if (typeof window !== 'undefined') {
    session.bindControls?.();
  }

  return {
    start: (opts) => session.start(opts),
    stop: () => session.stop(),
    session,
  };
}
