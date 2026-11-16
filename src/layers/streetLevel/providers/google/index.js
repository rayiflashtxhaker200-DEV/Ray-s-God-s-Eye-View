/** Google Street View provider descriptor. */
export function createGoogleProvider({ getApiKey = () => null } = {}) {
  return {
    id: 'google',
    name: 'Google Street View',
    label: 'Google',
    color: '#4285f4',
    requiresKeyId: 'google-maps',
    groundClick: true,
    renderModes: false,
    filterControls: { pano: false, since: false },
    coverageLabel: { noun: 'streets', action: 'click a line for its nearest photo' },
    isKeyRequired: () => !getApiKey?.(),
    getApiKey: () => getApiKey?.() || null,
  };
}
