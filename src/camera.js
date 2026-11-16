import * as Cesium from 'cesium';

/**
 * Set camera on load with a clean cinematic fly-in to a global/regional overview.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToAustin(viewer) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-3.7038, 40.4168, 7200000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-85),
      roll: 0.0,
    },
  });

  const timer = setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-3.7038, 40.4168, 2200000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-52),
        roll: 0.0,
      },
      duration: 2.6,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }, 450);

  return () => {
    clearTimeout(timer);
    if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
  };
}
