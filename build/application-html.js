/**
 * Application HTML Template Expander and Vite Plugin
 */

export const APPLICATION_TEMPLATES = [
  'scene-chrome',
  'cockpit',
  'display-controls',
  'command-dock',
  'layer-panels',
  'context',
  'welcome',
  'provider-settings',
  'hud-loading',
];

const TEMPLATE_MARKUP = {
  'scene-chrome': '<div id="cesiumContainer"></div><div id="loading-screen"><div class="loader-status"></div></div>',
  'cockpit': '<div id="cockpit-overlay"></div>',
  'display-controls': '<div id="display-controls"></div>',
  'command-dock': '<div id="command-dock"></div>',
  'layer-panels': '<div id="layer-panels"></div>',
  'context': '<div id="context-panel"></div>',
  'welcome': '<div id="first-run-launcher"></div>',
  'provider-settings': '<div id="provider-settings-panel"></div>',
  'hud-loading': '<div id="hud-loading-indicator"></div>',
};

export function expandApplicationHtml(sourceHtml = '') {
  return sourceHtml.replace(/<!--\s*gev:template\s+([^\s]+)\s*-->/g, (match, templateName) => {
    if (!APPLICATION_TEMPLATES.includes(templateName)) {
      throw new Error(`Unknown application template: ${templateName}`);
    }
    return TEMPLATE_MARKUP[templateName] || '';
  });
}

export function applicationHtmlPlugin() {
  return {
    name: 'application-html-plugin',
    transformIndexHtml(html) {
      return expandApplicationHtml(html);
    },
  };
}
