import sceneChromeHtml from '../templates/scene-chrome.html?raw';
import cockpitHtml from '../templates/cockpit.html?raw';
import displayControlsHtml from '../templates/display-controls.html?raw';
import commandDockHtml from '../templates/command-dock.html?raw';
import layerPanelsHtml from '../templates/layer-panels.html?raw';
import contextHtml from '../templates/context.html?raw';
import welcomeHtml from '../templates/welcome.html?raw';
import providerSettingsHtml from '../templates/provider-settings.html?raw';
import hudLoadingHtml from '../templates/hud-loading.html?raw';

export const APPLICATION_VIEWS = Object.freeze([
  'scene-chrome',
  'cockpit',
  'display-controls',
  'command-dock',
  'layer-panels',
  'context',
  'welcome',
  'provider-settings',
  'intel-hud',
]);

const VIEW_TEMPLATES = Object.freeze({
  'scene-chrome': sceneChromeHtml,
  cockpit: cockpitHtml,
  'display-controls': displayControlsHtml,
  'command-dock': commandDockHtml,
  'layer-panels': layerPanelsHtml,
  context: contextHtml,
  welcome: welcomeHtml,
  'provider-settings': providerSettingsHtml,
  'intel-hud': hudLoadingHtml,
});

/**
 * Mount the application's static view templates into `[data-gev-view]` hosts.
 * Preserves an already-rendered `#loading-screen` so custom branding in
 * `index.html` stays intact.
 */
export function mountApplicationViews(
  documentRef = globalThis.document,
  { omit = [] } = {},
) {
  if (!documentRef?.querySelector) return [];
  const omitted = new Set(omit || []);
  const mounted = [];

  for (const name of APPLICATION_VIEWS) {
    if (omitted.has(name)) continue;
    const host = documentRef.querySelector(`[data-gev-view="${name}"]`);
    if (!host) continue;
    if (host.childElementCount === 0) {
      if (name === 'intel-hud' && documentRef.getElementById('loading-screen')) {
        host.innerHTML = '<div id="intel-hud"></div>';
      } else {
        host.innerHTML = VIEW_TEMPLATES[name] || '';
      }
    }
    mounted.push(name);
  }
  return mounted;
}
