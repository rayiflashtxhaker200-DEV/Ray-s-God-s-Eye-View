/**
 * Shell DOM Element References Reader
 */

export function readShellElements() {
  if (typeof document === 'undefined') return {};
  return {
    _locationPills: document.getElementById('location-pills'),
    _poiRow: document.getElementById('poi-row'),
    _locationBarDivider: document.getElementById('location-bar-divider'),
    _locationSearch: document.getElementById('location-search'),
    _searchToggle: document.getElementById('search-toggle'),
    _resetGlobeBtn: document.getElementById('reset-globe-btn'),
    _cockpitResetGlobeBtn: document.getElementById('cockpit-reset-globe-btn'),
    _locationMiniCity: document.getElementById('location-mini-city'),
    _locationMiniPoi: document.getElementById('location-mini-poi'),
    _contextRadioDetailsBtn: document.getElementById('context-radio-details-btn'),
    _contextRadioDock: document.getElementById('context-radio-dock'),
    _leftPanelStack: document.getElementById('left-panel-stack'),
    _rightPanelStack: document.getElementById('right-panel-stack'),
    _ppToggles: document.querySelectorAll('.pp-toggle'),
  };
}
