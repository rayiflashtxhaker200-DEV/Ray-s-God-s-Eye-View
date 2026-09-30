/**
 * Action Schemas for Voice Tools
 */

export const GEV_ACTION_SCHEMAS = [
  {
    name: 'fly_to_location',
    description: 'Fly to location',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
    },
  },
];

export function createActionTools(descriptions = {}) {
  return GEV_ACTION_SCHEMAS;
}
