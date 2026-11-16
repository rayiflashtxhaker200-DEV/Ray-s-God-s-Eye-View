export function tleCatalogNumber(line1) {
  if (typeof line1 !== 'string' || !line1.startsWith('1 ')) return null;
  const raw = line1.slice(2, 7).trim();
  const num = Number(raw);
  return Number.isInteger(num) ? num : raw || null;
}

export function parseTleText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const entries = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (line.startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      entries.push({
        name: `NORAD ${tleCatalogNumber(line) || ''}`.trim(),
        line1: line,
        line2: lines[i + 1],
      });
      i += 2;
    } else if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
      entries.push({
        name: line.trim(),
        line1: lines[i + 1],
        line2: lines[i + 2],
      });
      i += 3;
    } else {
      i += 1;
    }
  }
  return entries;
}
