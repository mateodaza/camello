/**
 * Minimal QR Code SVG generator — zero dependencies.
 * Supports byte-mode encoding, versions 1-10, error correction level M.
 * Generates an SVG string suitable for inline rendering or download.
 */

// GF(256) with polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x & 128 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenPoly(n: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGenPoly(ecLen);
  const buf = new Uint8Array(data.length + ecLen);
  buf.set(data);
  for (let i = 0; i < data.length; i++) {
    const coeff = buf[i];
    if (coeff !== 0) {
      for (let j = 0; j < gen.length; j++) {
        buf[i + j] ^= gfMul(gen[j], coeff);
      }
    }
  }
  return buf.slice(data.length);
}

// Version capacity table: [totalCodewords, ecCodewordsPerBlock, numBlocks, dataCodewords]
// Error correction level M only, byte mode
const VERSION_TABLE: Array<[number, number, number, number]> = [
  [0, 0, 0, 0], // placeholder v0
  [26, 10, 1, 16],    // v1: 25 modules
  [44, 16, 1, 28],    // v2: 29 modules
  [70, 26, 1, 44],    // v3: 33 modules
  [100, 18, 2, 64],   // v4: 37 modules
  [134, 24, 2, 86],   // v5: 41 modules
  [172, 16, 4, 108],  // v6: 45 modules
  [196, 18, 4, 124],  // v7: 49 modules
  [242, 22, 4, 154],  // v8: 53 modules
  [292, 22, 4, 182],  // v9: 57 modules (split: 2 blocks of 43 + 2 of 44)
  [346, 26, 4, 216],  // v10: 61 modules (split: 2 of 52 + 2 of 54)
];

// Alignment pattern locations per version
const ALIGN_POS: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 52],
];

function selectVersion(dataLen: number): number {
  for (let v = 1; v <= 10; v++) {
    // byte mode: 4-bit mode + 8/16-bit length + data + terminator
    const dataCap = VERSION_TABLE[v][3];
    // Byte mode overhead: mode(4) + charcount(8 for v1-9, 16 for v10+) + terminator(4)
    const overhead = v <= 9 ? 2 : 3; // bytes of overhead
    if (dataLen <= dataCap - overhead) return v;
  }
  throw new Error('Data too long for QR v1-10');
}

function encodeData(text: string, version: number): Uint8Array {
  const [total, ecPerBlock, numBlocks, dataCw] = VERSION_TABLE[version];
  const bytes = new TextEncoder().encode(text);
  const bits: number[] = [];

  // Mode indicator: 0100 (byte)
  bits.push(0, 1, 0, 0);

  // Character count (8 bits for v1-9, 16 for v10+)
  const countBits = version <= 9 ? 8 : 16;
  for (let i = countBits - 1; i >= 0; i--) bits.push((bytes.length >> i) & 1);

  // Data
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);

  // Terminator (up to 4 zeros)
  const maxBits = dataCw * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Convert to bytes
  const data = new Uint8Array(dataCw);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j];
    data[i] = byte;
  }

  // Pad with alternating 0xEC/0x11
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8; i < dataCw; i++) {
    data[i] = padBytes[(i - bits.length / 8) % 2];
  }

  // Split into blocks and compute EC
  const blockDataSizes: number[] = [];
  const baseSize = Math.floor(dataCw / numBlocks);
  const remainder = dataCw % numBlocks;
  for (let i = 0; i < numBlocks; i++) {
    blockDataSizes.push(baseSize + (i >= numBlocks - remainder ? 1 : 0));
  }

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const blockData = data.slice(offset, offset + blockDataSizes[i]);
    dataBlocks.push(blockData);
    ecBlocks.push(rsEncode(blockData, ecPerBlock));
    offset += blockDataSizes[i];
  }

  // Interleave data + EC codewords
  const result = new Uint8Array(total);
  let idx = 0;
  const maxDataLen = Math.max(...blockDataSizes);
  for (let j = 0; j < maxDataLen; j++) {
    for (let i = 0; i < numBlocks; i++) {
      if (j < dataBlocks[i].length) result[idx++] = dataBlocks[i][j];
    }
  }
  for (let j = 0; j < ecPerBlock; j++) {
    for (let i = 0; i < numBlocks; i++) {
      result[idx++] = ecBlocks[i][j];
    }
  }

  return result;
}

function createMatrix(version: number): { matrix: number[][]; size: number } {
  const size = version * 4 + 17;
  const matrix = Array.from({ length: size }, () => Array(size).fill(-1));

  // Finder patterns (7x7) at three corners
  const placeFinderPattern = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[rr][cc] = (inOuter || inInner) ? 1 : 0;
      }
    }
  };
  placeFinderPattern(0, 0);
  placeFinderPattern(0, size - 7);
  placeFinderPattern(size - 7, 0);

  // Alignment patterns
  const positions = ALIGN_POS[version];
  for (const r of positions) {
    for (const c of positions) {
      if (matrix[r][c] !== -1) continue; // skip if overlaps finder
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const inBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          matrix[r + dr][c + dc] = (inBorder || (dr === 0 && dc === 0)) ? 1 : 0;
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === -1) matrix[6][i] = i % 2 === 0 ? 1 : 0;
    if (matrix[i][6] === -1) matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Dark module
  matrix[size - 8][8] = 1;

  // Reserve format info areas
  for (let i = 0; i < 8; i++) {
    if (matrix[8][i] === -1) matrix[8][i] = 0;
    if (matrix[i][8] === -1) matrix[i][8] = 0;
    if (matrix[8][size - 1 - i] === -1) matrix[8][size - 1 - i] = 0;
    if (matrix[size - 1 - i][8] === -1) matrix[size - 1 - i][8] = 0;
  }
  if (matrix[8][8] === -1) matrix[8][8] = 0;

  return { matrix, size };
}

function placeData(matrix: number[][], size: number, data: Uint8Array): void {
  const bits: number[] = [];
  for (const b of data) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);

  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5; // skip timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);
    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0 || matrix[row][c] !== -1) continue;
        matrix[row][c] = bitIdx < bits.length ? bits[bitIdx++] : 0;
      }
    }
    upward = !upward;
  }
}

// Mask patterns
const MASKS = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number, _: number) => r % 2 === 0,
  (_: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r: number, c: number) => (r * c) % 2 + (r * c) % 3 === 0,
  (r: number, c: number) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r: number, c: number) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

// Format info strings for EC level M (10) + mask 0-7
const FORMAT_BITS: number[] = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b,
  0x45f9, 0x40ce, 0x4f97, 0x4aa0,
];

function applyMask(matrix: number[][], size: number, maskIdx: number): number[][] {
  const result = matrix.map((row) => [...row]);
  const mask = MASKS[maskIdx];
  // Create a reserved map (non -1 cells from the original pattern placement)
  // We apply mask only to data cells
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // We need to know which cells are "data" vs "function patterns"
      // Data cells were placed in placeData — they were -1 before placement
      // For simplicity, we mask all cells that aren't in function pattern areas
      if (isDataCell(r, c, size, matrix)) {
        if (mask(r, c)) result[r][c] ^= 1;
      }
    }
  }

  // Write format information
  const fmt = FORMAT_BITS[maskIdx];
  // Horizontal: left of finder
  for (let i = 0; i < 6; i++) result[8][i] = (fmt >> (14 - i)) & 1;
  result[8][7] = (fmt >> 8) & 1;
  result[8][8] = (fmt >> 7) & 1;
  result[7][8] = (fmt >> 6) & 1;
  for (let i = 0; i < 6; i++) result[5 - i][8] = (fmt >> (5 - i)) & 1;
  // Right and bottom
  for (let i = 0; i < 8; i++) result[8][size - 8 + i] = (fmt >> (14 - i)) & 1;
  for (let i = 0; i < 7; i++) result[size - 7 + i][8] = (fmt >> (6 - i)) & 1;

  return result;
}

function isDataCell(r: number, c: number, size: number, _matrix: number[][]): boolean {
  // Finder + separator areas
  if (r < 9 && c < 9) return false;
  if (r < 9 && c >= size - 8) return false;
  if (r >= size - 8 && c < 9) return false;
  // Timing
  if (r === 6 || c === 6) return false;
  return true;
}

function penaltyScore(matrix: number[][], size: number): number {
  let score = 0;
  // Rule 1: runs of same color (5+)
  for (let r = 0; r < size; r++) {
    let count = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        count++;
        if (count === 5) score += 3;
        else if (count > 5) score++;
      } else count = 1;
    }
  }
  for (let c = 0; c < size; c++) {
    let count = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) {
        count++;
        if (count === 5) score += 3;
        else if (count > 5) score++;
      } else count = 1;
    }
  }
  // Rule 4: proportion of dark modules
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (matrix[r][c]) dark++;
  const pct = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/**
 * Generate a QR Code as an SVG string.
 * @param text - The text/URL to encode
 * @param opts - Optional: moduleSize (px per module, default 4), margin (quiet zone modules, default 2), dark/light colors
 */
export function generateQrSvg(
  text: string,
  opts?: { moduleSize?: number; margin?: number; dark?: string; light?: string },
): string {
  const moduleSize = opts?.moduleSize ?? 4;
  const margin = opts?.margin ?? 2;
  const dark = opts?.dark ?? '#16161D';
  const light = opts?.light ?? '#ffffff';

  const version = selectVersion(new TextEncoder().encode(text).length);
  const data = encodeData(text, version);
  const { matrix, size } = createMatrix(version);
  placeData(matrix, size, data);

  // Try all masks, pick lowest penalty
  let bestMask = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const masked = applyMask(matrix, size, m);
    const score = penaltyScore(masked, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = m;
    }
  }

  const final = applyMask(matrix, size, bestMask);
  const totalSize = (size + margin * 2) * moduleSize;

  const rects: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (final[r][c] === 1) {
        rects.push(
          `<rect x="${(c + margin) * moduleSize}" y="${(r + margin) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`,
        );
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}">`,
    `<rect width="100%" height="100%" fill="${light}"/>`,
    `<g fill="${dark}">`,
    ...rects,
    '</g>',
    '</svg>',
  ].join('');
}
