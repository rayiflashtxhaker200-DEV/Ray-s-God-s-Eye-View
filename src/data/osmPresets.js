export const OSM_PRESETS = Object.freeze({
  hospital: Object.freeze({
    id: 'hospital',
    label: 'hospitals',
    synonyms: ['hospital', 'hospitals', 'medical center', 'clinic', 'er'],
    tags: Object.freeze([['amenity', 'hospital']]),
  }),
  pharmacy: Object.freeze({
    id: 'pharmacy',
    label: 'pharmacies',
    synonyms: ['pharmacy', 'pharmacies', 'drugstore', 'chemist'],
    tags: Object.freeze([['amenity', 'pharmacy']]),
  }),
  school: Object.freeze({
    id: 'school',
    label: 'schools',
    synonyms: ['school', 'schools', 'elementary school', 'high school'],
    tags: Object.freeze([['amenity', 'school']]),
  }),
  university: Object.freeze({
    id: 'university',
    label: 'universities',
    synonyms: ['university', 'universities', 'college', 'colleges'],
    tags: Object.freeze([['amenity', 'university']]),
  }),
  police: Object.freeze({
    id: 'police',
    label: 'police stations',
    synonyms: ['police', 'police station', 'police stations'],
    tags: Object.freeze([['amenity', 'police']]),
  }),
  fire_station: Object.freeze({
    id: 'fire_station',
    label: 'fire stations',
    synonyms: ['fire station', 'fire stations', 'firehouse'],
    tags: Object.freeze([['amenity', 'fire_station']]),
  }),
  fuel: Object.freeze({
    id: 'fuel',
    label: 'gas stations',
    synonyms: ['gas station', 'gas stations', 'fuel', 'petrol station'],
    tags: Object.freeze([['amenity', 'fuel']]),
  }),
  charging_station: Object.freeze({
    id: 'charging_station',
    label: 'EV chargers',
    synonyms: ['ev charger', 'ev chargers', 'charging station', 'charging stations'],
    tags: Object.freeze([['amenity', 'charging_station']]),
  }),
  parking: Object.freeze({
    id: 'parking',
    label: 'parking',
    synonyms: ['parking', 'parking lot', 'parking garage'],
    tags: Object.freeze([['amenity', 'parking']]),
  }),
  restaurant: Object.freeze({
    id: 'restaurant',
    label: 'restaurants',
    synonyms: ['restaurant', 'restaurants', 'dining'],
    tags: Object.freeze([['amenity', 'restaurant']]),
  }),
  cafe: Object.freeze({
    id: 'cafe',
    label: 'cafes',
    synonyms: ['cafe', 'cafes', 'coffee shop', 'coffee shops', 'coffee'],
    tags: Object.freeze([['amenity', 'cafe']]),
  }),
  supermarket: Object.freeze({
    id: 'supermarket',
    label: 'supermarkets',
    synonyms: ['supermarket', 'supermarkets', 'grocery', 'grocery store'],
    tags: Object.freeze([['shop', 'supermarket']]),
  }),
  library: Object.freeze({
    id: 'library',
    label: 'libraries',
    synonyms: ['library', 'libraries'],
    tags: Object.freeze([['amenity', 'library']]),
  }),
  bank: Object.freeze({
    id: 'bank',
    label: 'banks',
    synonyms: ['bank', 'banks'],
    tags: Object.freeze([['amenity', 'bank']]),
  }),
  park: Object.freeze({
    id: 'park',
    label: 'parks',
    synonyms: ['park', 'parks'],
    tags: Object.freeze([['leisure', 'park']]),
  }),
  hotel: Object.freeze({
    id: 'hotel',
    label: 'hotels',
    synonyms: ['hotel', 'hotels', 'lodging'],
    tags: Object.freeze([['tourism', 'hotel']]),
  }),
  museum: Object.freeze({
    id: 'museum',
    label: 'museums',
    synonyms: ['museum', 'museums'],
    tags: Object.freeze([['tourism', 'museum']]),
  }),
  train_station: Object.freeze({
    id: 'train_station',
    label: 'train stations',
    synonyms: ['train station', 'train stations', 'railway station'],
    tags: Object.freeze([['railway', 'station']]),
  }),
  aerodrome: Object.freeze({
    id: 'aerodrome',
    label: 'airports',
    synonyms: ['airport', 'airports', 'airfield', 'aerodrome'],
    tags: Object.freeze([['aeroway', 'aerodrome']]),
  }),
  helipad: Object.freeze({
    id: 'helipad',
    label: 'helipads',
    synonyms: ['helipad', 'helipads', 'heliport'],
    tags: Object.freeze([['aeroway', 'helipad']]),
  }),
});

export function matchOsmPreset(raw) {
  const query = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!query) return null;
  if (Object.hasOwn(OSM_PRESETS, raw)) return OSM_PRESETS[raw];
  const under = query.replace(/\s+/g, '_');
  if (Object.hasOwn(OSM_PRESETS, under)) return OSM_PRESETS[under];
  for (const preset of Object.values(OSM_PRESETS)) {
    if (
      preset.label.toLowerCase() === query ||
      preset.synonyms.some((syn) => syn === query)
    ) {
      return preset;
    }
  }
  return null;
}
