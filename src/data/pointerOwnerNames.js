import { msg } from '../i18n/marker.js';

const OWNER_NAMES = Object.freeze({
  draw: msg('Drawing tool'),
  'recent-imagery': msg('Recent imagery'),
  measure: msg('Measurement tool'),
  cctv: msg('Camera tool'),
  voice: msg('Voice pointer'),
});

export function pointerOwnerName(ownerId) {
  const key = String(ownerId || '').trim();
  return OWNER_NAMES[key] || key || msg('Another tool');
}
