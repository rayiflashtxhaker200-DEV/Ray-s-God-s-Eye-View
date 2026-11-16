/** KartaView street-level imagery provider descriptor. */
export function createKartaViewProvider() {
  return {
    id: 'kartaview',
    name: 'KartaView',
    label: 'KartaView',
    color: '#ff6d00',
    groundClick: true,
    renderModes: true,
    filterControls: { pano: true, since: true },
    coverageLabel: { noun: 'sequences', action: 'click a line for its nearest photo' },
    isKeyRequired: () => false,
  };
}
