import { msg } from '../i18n/index.js';

export const PANEL_RAIL_FALLBACK_ICON = 'tune';

export const PANEL_RAIL_ITEMS = Object.freeze({
  'data-panel': Object.freeze({
    icon: 'layers',
    label: msg('Data Layers'),
  }),
  'utilities-panel': Object.freeze({
    icon: 'handyman',
    label: msg('Utilities'),
  }),
  'scene-panel': Object.freeze({
    icon: 'movie',
    label: msg('Scenes'),
  }),
  'cctv-panel': Object.freeze({
    icon: 'videocam',
    label: msg('Live Feeds'),
  }),
  'street-level-panel': Object.freeze({
    icon: 'streetview',
    label: msg('Street Level'),
  }),
  'pp-toggles': Object.freeze({
    icon: 'tune',
    label: msg('Display'),
  }),
  'weather-panel': Object.freeze({
    icon: 'partly_cloudy_day',
    label: msg('Weather'),
  }),
  'recent-imagery-panel': Object.freeze({
    icon: 'satellite_alt',
    label: msg('Imagery'),
  }),
  'global-context-panel': Object.freeze({
    icon: 'public',
    label: msg('Context'),
  }),
  'radio-panel': Object.freeze({
    icon: 'radio',
    label: msg('Radio'),
  }),
});
