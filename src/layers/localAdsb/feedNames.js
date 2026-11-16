export function localReceiverFeedName(feed) {
  if (!feed || typeof feed !== 'object') return 'Receiver';
  if (typeof feed.label === 'string' && feed.label.trim()) return feed.label.trim();
  if (feed.band === '1090') return '1090 MHz';
  if (feed.band === '978') return '978 MHz UAT';
  return feed.id || 'Receiver';
}
