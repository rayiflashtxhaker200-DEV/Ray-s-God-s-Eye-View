export function isLocalIpv4(address) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(
    String(address || '').trim(),
  );
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function parseTapAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let host;
  let portStr;
  if (raw.startsWith('[')) {
    const closeIdx = raw.indexOf(']');
    if (closeIdx < 0) return null;
    host = raw.slice(1, closeIdx);
    const rest = raw.slice(closeIdx + 1);
    if (!rest.startsWith(':')) return null;
    portStr = rest.slice(1);
  } else {
    const colonIdx = raw.lastIndexOf(':');
    if (colonIdx <= 0) return null;
    host = raw.slice(0, colonIdx);
    portStr = raw.slice(colonIdx + 1);
  }
  if (!/^\d+$/.test(portStr)) return null;
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const lower = host.toLowerCase();
  const allowed =
    lower === 'localhost' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    isLocalIpv4(lower);
  if (!allowed) return null;
  return { host: lower === '::1' ? '[::1]' : host, port };
}
