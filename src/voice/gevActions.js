/**
 * GEV Actions and Basemap Context Resolver
 */

export async function getBasemapLabelContext(viewer, options = {}) {
  return [];
}

export function createGevActionRunner(options = {}) {
  return async (action, args = {}) => {
    console.info(`[ActionRunner] ${action}`, args);
    return { ok: true, action, args };
  };
}
