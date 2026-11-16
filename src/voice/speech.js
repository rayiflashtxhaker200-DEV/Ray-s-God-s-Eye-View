/**
 * Speech/progress narration and structured result-envelope formatting for voice and cards.
 */

const MAX_DISPLAY_TITLE_CHARS = 64;

function truncateTitle(text, max = MAX_DISPLAY_TITLE_CHARS) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

export function narrationLabel(name, args = {}) {
  if (args?.query) return String(args.query);
  if (args?.what) return String(args.what);
  if (args?.locationId) return String(args.locationId);
  if (args?.layerId) return String(args.layerId);
  return String(name || 'command');
}

export function progressLine(step, label = '') {
  const target = String(label || '').trim();
  switch (step) {
    case 'still':
      return target ? `Still working on ${target}.` : 'Still working.';
    case 'find-place':
    case 'resolve-area':
    case 'geocode':
      return target ? `Finding ${target} on the map.` : 'Finding that on the map.';
    case 'outline-area':
      return target ? `Outlining ${target}.` : 'Outlining that area.';
    case 'osm-search':
      return target
        ? `Searching OpenStreetMap for ${target}.`
        : 'Searching OpenStreetMap.';
    case 'drape':
      return 'Loading the image.';
    case 'catalog':
      return target ? `Searching imagery for ${target}.` : 'Searching imagery.';
    default:
      return target ? `${step}: ${target}.` : `${step}.`;
  }
}

const LAYER_NOUNS = {
  flights: ['aircraft', 'aircraft'],
  military: ['military aircraft', 'military aircraft'],
  'ais-live-vessels': ['vessel', 'vessels'],
  satellites: ['satellite', 'satellites'],
  earthquakes: ['earthquake', 'earthquakes'],
  cctv: ['camera', 'cameras'],
  bikeshare: ['bike station', 'bike stations'],
  radio: ['radio station', 'radio stations'],
  'local-firms': ['hotspot', 'hotspots'],
  'fire-perimeters': ['fire perimeter', 'fire perimeters'],
};

function nounForAnalyst(result, count) {
  const layerKey = result?.coverage?.layersQueried?.[0]?.layerKey;
  const pair = LAYER_NOUNS[layerKey];
  if (pair) return count === 1 ? pair[0] : pair[1];
  return count === 1 ? 'record' : 'records';
}

export const SPEECH_BUILDERS = {
  analyst_query(result) {
    if (!result || result.ok === false) return null;
    const count = Number(result.count) || 0;
    const noun = nounForAnalyst(result, count);
    const scope = result.scopeLabel ? ` ${result.scopeLabel}` : '';
    const prefix =
      result.complete === false
        ? `At least ${count.toLocaleString('en-US')}`
        : count.toLocaleString('en-US');
    const rawTitle = `${prefix} ${noun}${scope}`;
    const title = truncateTitle(rawTitle);
    const say = title.endsWith('…') ? title : `${title}.`;
    const total = Number(result.coverage?.layersQueried?.[0]?.total);
    const notes = [];
    if (result.complete === false && Number.isFinite(total) && total > count) {
      notes.push(`counted ${count.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`);
    }
    return {
      say,
      display: {
        title,
        lines: [],
        notes,
        referents: Array.isArray(result.referents) ? result.referents : [],
      },
    };
  },
};

export function attachVoiceResult(
  name,
  result,
  args = {},
  builders = SPEECH_BUILDERS,
) {
  if (!result || typeof result !== 'object') return result;
  const builder = builders?.[name];
  const built = typeof builder === 'function' ? builder(result, args) : null;
  if (!built) return result;
  return {
    ...result,
    ...(result.say === undefined && built.say ? { say: built.say } : {}),
    ...(result.display === undefined && built.display
      ? { display: built.display }
      : {}),
  };
}
