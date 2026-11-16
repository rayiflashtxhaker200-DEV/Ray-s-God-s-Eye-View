export const GHOSTMAPS_REPO = Object.freeze({
  owner: 'S2Underground',
  name: 'GhostMaps',
  url: 'https://github.com/S2Underground/GhostMaps',
  branch: 'main',
});

export const GHOSTMAPS_MAX_FILE_BYTES = 16 * 1024 * 1024;

export function parseGitRefAdvertisement(text) {
  if (typeof text !== 'string' || !text) return null;
  const branchRef = `refs/heads/${GHOSTMAPS_REPO.branch}`;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/^[0-9a-f]{4}/i, '');
    const match = /\b([0-9a-f]{40})\s+([^\s\0]+)/i.exec(clean);
    if (match && match[2] === branchRef) return match[1].toLowerCase();
  }
  const headMatch = /\b([0-9a-f]{40})\s+HEAD\b/i.exec(text);
  return headMatch ? headMatch[1].toLowerCase() : null;
}

function slugId(fileName) {
  return fileName
    .toLowerCase()
    .replace(/\.kmz$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'product';
}

export function buildGhostMapsCatalog(tree) {
  if (!Array.isArray(tree)) return [];
  const seenIds = new Set();
  const products = [];
  for (const entry of tree) {
    if (entry?.type !== 'blob' || typeof entry.path !== 'string') continue;
    if (!/\.kmz$/i.test(entry.path)) continue;
    if (Number(entry.size) > GHOSTMAPS_MAX_FILE_BYTES) continue;
    const fileName = entry.path.split('/').pop() || entry.path;
    const fileTitle = fileName.replace(/\.kmz$/i, '').replace(/[_-]+/g, ' ').trim();
    let id = slugId(fileName);
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${slugId(fileName).slice(0, 35)}-${suffix++}`;
    }
    seenIds.add(id);
    products.push({
      id,
      title: fileTitle || id,
      defaultOn: products.length === 0,
      fileName,
      fileTitle: fileTitle || id,
      path: entry.path,
      version: String(entry.sha || ''),
      size: Number(entry.size) || 0,
      dateMs: null,
    });
  }
  return products;
}

export function ghostMapsRawUrl(commit, filePath) {
  const safePath = String(filePath || '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `https://raw.githubusercontent.com/${GHOSTMAPS_REPO.owner}/${GHOSTMAPS_REPO.name}/${encodeURIComponent(commit)}/${safePath}`;
}
