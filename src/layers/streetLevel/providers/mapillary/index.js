/** Mapillary street-level imagery provider descriptor. */
export function createMapillaryProvider({ source } = {}) {
  return {
    id: 'mapillary',
    name: 'Mapillary',
    label: 'Mapillary',
    color: '#05cb63',
    requiresKeyId: 'mapillary',
    groundClick: false,
    renderModes: true,
    filterControls: { pano: true, since: true },
    coverageLabel: { noun: 'sequences', action: 'click a line for its photos' },
    isKeyRequired: () => (source?.isConfigured ? !source.isConfigured() : true),
    async checkKey({ signal } = {}) {
      if (!source?.checkStatus) return { configured: false };
      return source.checkStatus({ signal });
    },
    getTileUrl: () => source?.getCoverageTileUrl?.() || null,
  };
}
