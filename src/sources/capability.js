export function isUnavailableCapability(value) {
  return Boolean(value && typeof value === 'object' && value.unavailable === true);
}
