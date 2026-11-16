/**
 * Pure JavaScript QR Code SVG generator (Byte mode, Error Correction Level M).
 * Produces crisp, offline-capable vector QR codes for rapid mobile pairing.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(ecLength) {
  let poly = [1];
  for (let i = 0; i < ecLength; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEc(data, ecLength) {
  const gen = rsGeneratorPoly(ecLength);
  const res = new Uint8Array(data.length + ecLength);
  res.set(data);
  for (let i = 0; i < data.length; i += 1) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j += 1) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

// Versions 1..10, Error Correction Level M
// Each entry: [totalDataCodewords, ecCodewordsPerBlock, group1Blocks, group1DataCw, group2Blocks, group2DataCw, alignmentCenters]
const VERSION_TABLE = [
  null,
  [16, 10, 1, 16, 0, 0, []],
  [28, 16, 1, 28, 0, 0, [6, 18]],
  [44, 26, 1, 44, 0, 0, [6, 22]],
  [64, 18, 2, 32, 0, 0, [6, 26]],
  [86, 24, 2, 43, 0, 0, [6, 30]],
  [108, 16, 4, 27, 0, 0, [6, 34]],
  [124, 18, 4, 31, 0, 0, [6, 22, 38]],
  [154, 22, 2, 38, 2, 39, [6, 24, 42]],
  [182, 22, 3, 36, 2, 37, [6, 26, 46]],
  [216, 26, 4, 43, 1, 44, [6, 28, 50]],
];

const REMAINDER_BITS = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

function chooseVersion(byteLen) {
  for (let v = 1; v < VERSION_TABLE.length; v += 1) {
    const totalDataCw = VERSION_TABLE[v][0];
    const headerBits = v <= 9 ? 4 + 8 : 4 + 16;
    const capacityBytes = Math.floor((totalDataCw * 8 - headerBits) / 8);
    if (byteLen <= capacityBytes) return v;
  }
  return VERSION_TABLE.length - 1;
}

function encodeDataCodewords(bytes, version) {
  const [totalDataCw, ecPerBlock, g1Blocks, g1DataCw, g2Blocks, g2DataCw] = VERSION_TABLE[version];
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i -= 1) {
      bits.push((val >>> i) & 1);
    }
  };

  // Byte mode indicator (0100)
  pushBits(0b0100, 4);
  const countBits = version <= 9 ? 8 : 16;
  const maxBytes = Math.floor((totalDataCw * 8 - 4 - countBits) / 8);
  const clipped = bytes.slice(0, maxBytes);
  pushBits(clipped.length, countBits);
  for (const b of clipped) pushBits(b, 8);

  // Terminator
  const totalBits = totalDataCw * 8;
  const termLen = Math.min(4, totalBits - bits.length);
  pushBits(0, termLen);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j += 1) val = (val << 1) | bits[i + j];
    dataCw.push(val);
  }
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataCw.length < totalDataCw) {
    dataCw.push(padBytes[padIdx % 2]);
    padIdx += 1;
  }

  // Split into RS blocks and interleave
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < g1Blocks; i += 1) {
    const slice = dataCw.slice(offset, offset + g1DataCw);
    blocks.push({ data: slice, ec: rsComputeEc(slice, ecPerBlock) });
    offset += g1DataCw;
  }
  for (let i = 0; i < g2Blocks; i += 1) {
    const slice = dataCw.slice(offset, offset + g2DataCw);
    blocks.push({ data: slice, ec: rsComputeEc(slice, ecPerBlock) });
    offset += g2DataCw;
  }

  const interleaved = [];
  const maxDataLen = Math.max(g1DataCw, g2DataCw);
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const blk of blocks) {
      if (i < blk.data.length) interleaved.push(blk.data[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const blk of blocks) interleaved.push(blk.ec[i]);
  }

  return interleaved;
}

function createMatrix(version) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Int8Array(size));
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

  const setFunc = (r, c, dark) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark ? 1 : 0;
    isFunc[r][c] = 1;
  };

  const drawFinder = (row, col) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const r = row + dy;
        const c = col + dx;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        setFunc(r, c, dist !== 2 && dist !== 4);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment patterns
  const centers = VERSION_TABLE[version][6];
  if (centers.length > 0) {
    for (const r of centers) {
      for (const c of centers) {
        if (isFunc[r][c]) continue;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            setFunc(r + dy, c + dx, dist !== 1);
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    if (!isFunc[6][i]) setFunc(6, i, i % 2 === 0);
    if (!isFunc[i][6]) setFunc(i, 6, i % 2 === 0);
  }

  // Dark module
  setFunc(size - 8, 8, true);

  // Reserve format info areas
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      isFunc[8][i] = 1;
      isFunc[i][8] = 1;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    isFunc[8][size - 1 - i] = 1;
    isFunc[size - 1 - i][8] = 1;
  }

  // Reserve version info if version >= 7
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        isFunc[i][size - 11 + j] = 1;
        isFunc[size - 11 + j][i] = 1;
      }
    }
  }

  return { size, modules, isFunc };
}

function drawFormatBits(modules, size, maskPattern) {
  // Error Correction Level M = 00
  const data = (0b00 << 3) | maskPattern;
  let rem = data;
  for (let i = 0; i < 10; i += 1) {
    rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i += 1) modules[8][i] = (bits >>> i) & 1;
  modules[8][7] = (bits >>> 6) & 1;
  modules[8][8] = (bits >>> 7) & 1;
  modules[7][8] = (bits >>> 8) & 1;
  for (let i = 9; i < 15; i += 1) modules[14 - i][8] = (bits >>> i) & 1;

  for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = (bits >>> i) & 1;
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = (bits >>> i) & 1;
}

function drawVersionBits(modules, size, version) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i += 1) {
    rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
  }
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i += 1) {
    const bit = (bits >>> i) & 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[b][a] = bit;
    modules[a][b] = bit;
  }
}

function maskCondition(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function placeCodewords(modules, isFunc, size, codewords, version) {
  const totalBits = codewords.length * 8 + REMAINDER_BITS[version];
  let bitIdx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunc[r][c] && bitIdx < totalBits) {
          const cwIdx = bitIdx >>> 3;
          const bit = cwIdx < codewords.length ? (codewords[cwIdx] >>> (7 - (bitIdx & 7))) & 1 : 0;
          modules[r][c] = bit;
          bitIdx += 1;
        }
      }
    }
  }
}

function penaltyScore(modules, size) {
  let score = 0;
  // Horizontal & vertical runs
  for (let r = 0; r < size; r += 1) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c += 1) {
      if (modules[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c += 1) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r += 1) {
      if (modules[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  // 2x2 blocks
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const color = modules[r][c];
      if (color === modules[r][c + 1] && color === modules[r + 1][c] && color === modules[r + 1][c + 1]) {
        score += 3;
      }
    }
  }
  return score;
}

/**
 * Generate a QR code matrix (2D array of 0/1) for any UTF-8 string.
 * @param {string} text
 * @returns {{ size: number, modules: Int8Array[] }}
 */
export function encodeQrMatrix(text) {
  const utf8 = new TextEncoder().encode(String(text ?? ''));
  const version = chooseVersion(utf8.length);
  const codewords = encodeDataCodewords(utf8, version);
  const { size, modules, isFunc } = createMatrix(version);
  placeCodewords(modules, isFunc, size, codewords, version);
  drawVersionBits(modules, size, version);

  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = modules.map((row) => new Int8Array(row));
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!isFunc[r][c] && maskCondition(mask, r, c)) {
          candidate[r][c] ^= 1;
        }
      }
    }
    drawFormatBits(candidate, size, mask);
    const score = penaltyScore(candidate, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!isFunc[r][c] && maskCondition(bestMask, r, c)) {
        modules[r][c] ^= 1;
      }
    }
  }
  drawFormatBits(modules, size, bestMask);
  return { size, modules };
}

/**
 * Render a crisp vector QR Code SVG string with quiet zone.
 * @param {string} text
 * @param {{ sizePx?: number, margin?: number, darkColor?: string, lightColor?: string }} [options]
 * @returns {string}
 */
export function renderQrCodeSvg(
  text,
  { sizePx = 196, margin = 3, darkColor = '#090c12', lightColor = '#ffffff' } = {},
) {
  const { size, modules } = encodeQrMatrix(text);
  const total = size + margin * 2;
  const paths = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (modules[r][c]) {
        paths.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" role="img" aria-label="Código QR de emparejamiento móvil"><rect width="${total}" height="${total}" fill="${lightColor}" rx="2"/><path d="${paths.join('')}" fill="${darkColor}"/></svg>`;
}
