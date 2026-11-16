/** Panoramax street-level imagery provider descriptor. */
export function createPanoramaxProvider() {
  return {
    id: 'panoramax',
    name: 'Panoramax',
    label: 'Panoramax',
    color: '#a855f7',
    groundClick: true,
    renderModes: true,
    filterControls: { pano: true, since: true },
    coverageLabel: { noun: 'sequences', action: 'click a line for its nearest photo' },
    isKeyRequired: () => false,
  };
}
