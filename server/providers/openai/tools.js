import { createActionTools } from '../../../src/voice/actionSchemas.js';
import { ACTION_DESCRIPTIONS } from './toolDescriptions.js';

export const GEV_REALTIME_TOOLS = createActionTools(ACTION_DESCRIPTIONS);

export function offeredTools(
  tools = GEV_REALTIME_TOOLS,
  { overpass = false } = {},
) {
  const list = Array.isArray(tools) ? tools : GEV_REALTIME_TOOLS;
  return overpass ? list : list.filter((tool) => tool?.name !== 'osm_query');
}

export function realtimeSessionTools(
  extraTools = [],
  { overpass = false } = {},
) {
  const merged = [...GEV_REALTIME_TOOLS];
  const seen = new Set(merged.map((tool) => tool.name));
  for (const tool of Array.isArray(extraTools) ? extraTools : []) {
    if (tool?.name && !seen.has(tool.name)) {
      seen.add(tool.name);
      merged.push(tool);
    }
  }
  return offeredTools(merged, { overpass });
}
