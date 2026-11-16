export function normalizeVesselType(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim().toLowerCase();
  if (!text || text === '0' || text === 'unknown' || text === 'not available') {
    return '';
  }
  const code = Number(text);
  if (Number.isInteger(code)) {
    if (code >= 70 && code <= 79) return 'cargo';
    if (code >= 80 && code <= 89) return 'tanker';
    if (code >= 60 && code <= 69) return 'passenger';
    if (code === 30) return 'fishing';
    if (code === 31 || code === 32 || code === 52) return 'tug';
    if (code === 35) return 'military';
    if (code === 36) return 'sailing';
    if (code === 37) return 'pleasure';
    if (code >= 40 && code <= 49) return 'high-speed';
    if (code === 50) return 'pilot';
    if (code === 51) return 'sar';
    return 'other';
  }
  return text;
}
