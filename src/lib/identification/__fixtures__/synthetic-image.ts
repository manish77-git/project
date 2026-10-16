/**
 * Synthetic bill-image generator.
 *
 * Test-only helper: builds small, fully synthetic images (a rendered line of
 * text, or pure noise) with NO patient data and NO third-party image library.
 * It exists so the identification pipeline can be exercised with a real
 * decodable PNG/BMP that a real OCR engine can actually read.
 *
 * Why hand-rolled encoders: the project has no image dependency, and adding a
 * canvas/Sharp stack just to draw the word "HOSPITAL" onto a fixture would be a
 * heavy runtime dependency for test-only code. PNG (grayscale, filter 0) and
 * 24-bit BMP are both small and easy to emit exactly.
 *
 * LIMITATION — the bitmap font below is deliberately tiny (5x7) and crude. It
 * is fine for making a *valid, decodable* image, but an OCR shape model
 * misreads it (N as M, B as E, 0 as O), so never assert OCR text fidelity
 * against an image drawn with it. For assertions about what OCR actually reads,
 * use the rendered fixtures in this directory and `npm run test:ocr`.
 *
 * NOTE: nothing in the application imports this module.
 */
import { deflateSync } from "node:zlib";

/** 5x7 glyphs, one 5-bit row per entry, MSB = leftmost pixel. */
const GLYPHS: Record<string, readonly number[]> = {
  " ": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "-": [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  ":": [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
  ".": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00110, 0b00110],
  ",": [0b00000, 0b00000, 0b00000, 0b00000, 0b00110, 0b00100, 0b01000],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "#": [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  "&": [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "+": [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  "%": [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
};

/** Grayscale raster: 0 = black ink, 255 = white paper. */
export interface GrayRaster {
  width: number;
  height: number;
  /** One byte per pixel, row-major. */
  pixels: Uint8Array;
}

export interface RenderTextOptions {
  /**
   * Pixels per font pixel. Bigger reads better: OCR engines are trained on
   * rendered text, and a 5x7 bitmap below ~10px per font pixel is too coarse
   * for their shape models (letters such as N/M and B/E get confused).
   * Default 12.
   */
  scale?: number;
  /** Blank margin around the text block, in pixels. Default 24. */
  margin?: number;
  /** Blank lines inserted after each rendered line. Default 1. */
  lineGap?: number;
  /** Blank font pixels between glyphs. Default 2. */
  letterSpacing?: number;
}

function blankRaster(width: number, height: number): GrayRaster {
  const pixels = new Uint8Array(width * height).fill(255);
  return { width, height, pixels };
}

/** Renders text lines on a white background using the built-in bitmap font. */
export function renderTextToRaster(lines: readonly string[], options: RenderTextOptions = {}): GrayRaster {
  const scale = options.scale ?? 12;
  const margin = options.margin ?? 24;
  const lineGap = options.lineGap ?? 1;
  const letterSpacing = options.letterSpacing ?? 2;

  const charWidth = 5 * scale;
  const charAdvance = charWidth + letterSpacing * scale;
  const lineHeight = 7 * scale;
  const lineAdvance = lineHeight + lineGap * lineHeight;

  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = Math.max(1, longest * charAdvance + margin * 2);
  const height = Math.max(1, lines.length * lineAdvance + margin * 2 - (lineGap * lineHeight));
  const raster = blankRaster(width, height);

  lines.forEach((line, lineIndex) => {
    const originY = margin + lineIndex * lineAdvance;
    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
      const glyph = GLYPHS[line[charIndex].toUpperCase()] ?? GLYPHS[" "];
      const originX = margin + charIndex * charAdvance;
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          const ink = (glyph[row] >> (4 - col)) & 1;
          if (!ink) continue;
          for (let dy = 0; dy < scale; dy += 1) {
            const y = originY + row * scale + dy;
            if (y >= raster.height) continue;
            const rowOffset = y * raster.width;
            for (let dx = 0; dx < scale; dx += 1) {
              const x = originX + col * scale + dx;
              if (x >= raster.width) continue;
              raster.pixels[rowOffset + x] = 0;
            }
          }
        }
      }
    }
  });

  return raster;
}

/**
 * Deterministic pseudo-random noise — the "camera could not focus" fixture.
 * Seeded so the bytes are identical on every run.
 */
export function renderNoiseToRaster(width = 640, height = 240, seed = 1): GrayRaster {
  const raster = blankRaster(width, height);
  let state = seed >>> 0;
  for (let i = 0; i < raster.pixels.length; i += 1) {
    // xorshift32 — deterministic, no cryptographic use.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    raster.pixels[i] = state & 0xff;
  }
  return raster;
}

/** A blank white page: valid image, nothing to read. */
export function renderBlankRaster(width = 640, height = 240): GrayRaster {
  return blankRaster(width, height);
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((char) => char.charCodeAt(0)));
  const payload = new Uint8Array(typeBytes.length + data.length);
  payload.set(typeBytes, 0);
  payload.set(data, typeBytes.length);

  // Layout: [length:4][type:4][data][crc:4], where the CRC covers type+data.
  const chunk = new Uint8Array(8 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(payload, 4);
  view.setUint32(4 + payload.length, crc32(payload));
  return chunk;
}

/** Encodes a grayscale raster as a PNG (8-bit, colour type 0, filter 0). */
export function encodePng(raster: GrayRaster): Uint8Array {
  const raw = new Uint8Array(raster.height * (raster.width + 1));
  for (let y = 0; y < raster.height; y += 1) {
    const rowStart = y * (raster.width + 1);
    raw[rowStart] = 0; // filter type: none
    raw.set(raster.pixels.subarray(y * raster.width, (y + 1) * raster.width), rowStart + 1);
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, raster.width);
  ihdrView.setUint32(4, raster.height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: grayscale
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const parts = [
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Encodes a raster as an uncompressed 24-bit BMP (bottom-up, 4-byte rows). */
export function encodeBmp(raster: GrayRaster): Uint8Array {
  const rowStride = Math.ceil((raster.width * 3) / 4) * 4;
  const pixelBytes = rowStride * raster.height;
  const headerBytes = 54;
  const out = new Uint8Array(headerBytes + pixelBytes);
  const view = new DataView(out.buffer);

  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, out.length, true);
  view.setUint32(10, headerBytes, true);
  view.setUint32(14, 40, true); // DIB header size
  view.setInt32(18, raster.width, true);
  view.setInt32(22, raster.height, true);
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true); // ~72 DPI
  view.setInt32(42, 2835, true);

  for (let y = 0; y < raster.height; y += 1) {
    // BMP rows run bottom-up.
    const srcY = raster.height - 1 - y;
    for (let x = 0; x < raster.width; x += 1) {
      const value = raster.pixels[srcY * raster.width + x];
      const offset = headerBytes + y * rowStride + x * 3;
      out[offset] = value; // B
      out[offset + 1] = value; // G
      out[offset + 2] = value; // R
    }
  }

  return out;
}

/** A clean, synthetic bill image that a real OCR engine can read. */
export function syntheticBillPng(
  lines: readonly string[] = ["CITY GENERAL HOSPITAL", "Bill No: INV-2026-0042"],
  options: RenderTextOptions = {},
): Uint8Array {
  return encodePng(renderTextToRaster(lines, options));
}

/** The same synthetic bill, encoded as BMP instead of PNG. */
export function syntheticBillBmp(
  lines: readonly string[] = ["CITY GENERAL HOSPITAL", "Bill No: INV-2026-0042"],
  options: RenderTextOptions = {},
): Uint8Array {
  return encodeBmp(renderTextToRaster(lines, options));
}

/** A valid image with nothing legible in it. */
export function unreadablePng(): Uint8Array {
  return encodePng(renderNoiseToRaster());
}

/** A valid, blank image. */
export function blankPng(): Uint8Array {
  return encodePng(renderBlankRaster());
}
