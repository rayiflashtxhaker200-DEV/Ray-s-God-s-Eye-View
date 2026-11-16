export const NEIGHBORHOOD_NEAR_KM = 25;
export const PLACE_NEAR_KM = 50;

export function normalizePlaceName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export async function findNeighborhoodArea() {
  return null;
}

export async function findNeighborhoodAreaAt() {
  return null;
}

export async function findPlaceArea() {
  return null;
}

export async function findPlaceAreaAt() {
  return null;
}
