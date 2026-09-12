import { NO_VISIBLE_DEFECTS_CONFIRMED_MARKER } from "@/lib/dashboard-protocol";
import { unzlibSync } from "fflate";
import { decode as decodePng } from "fast-png";
import { decode as decodeJpeg } from "jpeg-js";

export const MAX_SIGNATURE_IMAGE_BYTES = 256 * 1024;
// SignaturePad canvases are small, but high-DPI devices can multiply their backing size.
// These limits leave practical headroom while bounding renderer memory consumption.
export const MAX_SIGNATURE_IMAGE_DIMENSION = 4096;
export const MAX_SIGNATURE_IMAGE_PIXELS = 8 * 1024 * 1024;

const SIGNATURE_IMAGE_DATA_URI_PATTERN =
  /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_BIT_DEPTHS = new Map<number, number[]>([
  [0, [1, 2, 4, 8, 16]],
  [2, [8, 16]],
  [3, [1, 2, 4, 8]],
  [4, [8, 16]],
  [6, [8, 16]],
]);
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const SUPPORTED_JPEG_SOF_MARKERS = new Set([0xc0, 0xc2]);
const MAX_JPEG_DECODE_MEMORY_MB = 128;

interface ImageDimensions {
  width: number;
  height: number;
  pngCompressedData?: Uint8Array;
  pngInflatedByteLength?: number;
}

const PNG_CHANNELS_BY_COLOR_TYPE = new Map([
  [0, 1],
  [2, 3],
  [3, 1],
  [4, 2],
  [6, 4],
]);

function getPngInflatedByteLength(
  width: number,
  height: number,
  bitDepth: number,
  colorType: number,
  interlaceMethod: number
): number {
  const bitsPerPixel = bitDepth * (PNG_CHANNELS_BY_COLOR_TYPE.get(colorType) ?? 0);
  const passStarts = interlaceMethod === 0
    ? [[0, 0, 1, 1]]
    : [
      [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
      [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
    ];

  return passStarts.reduce((total, [startX, startY, stepX, stepY]) => {
    const passWidth = width > startX ? Math.ceil((width - startX) / stepX) : 0;
    const passHeight = height > startY ? Math.ceil((height - startY) / stepY) : 0;
    return passWidth === 0 || passHeight === 0
      ? total
      : total + passHeight * (1 + Math.ceil((passWidth * bitsPerPixel) / 8));
  }, 0);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function hasSafeDimensions(width: number, height: number): boolean {
  return (
    width > 0 &&
    height > 0 &&
    width <= MAX_SIGNATURE_IMAGE_DIMENSION &&
    height <= MAX_SIGNATURE_IMAGE_DIMENSION &&
    width * height <= MAX_SIGNATURE_IMAGE_PIXELS
  );
}

function decodeBase64(payload: string, decodedByteLength: number): Uint8Array | null {
  const bytes = new Uint8Array(decodedByteLength);
  let outputOffset = 0;

  for (let offset = 0; offset < payload.length; offset += 4) {
    const first = BASE64_ALPHABET.indexOf(payload[offset]);
    const second = BASE64_ALPHABET.indexOf(payload[offset + 1]);
    const third = payload[offset + 2] === "=" ? 0 : BASE64_ALPHABET.indexOf(payload[offset + 2]);
    const fourth = payload[offset + 3] === "=" ? 0 : BASE64_ALPHABET.indexOf(payload[offset + 3]);
    if (first < 0 || second < 0 || third < 0 || fourth < 0) return null;

    const value = first * 0x40000 + second * 0x1000 + third * 0x40 + fourth;
    if (outputOffset < decodedByteLength) bytes[outputOffset++] = value >>> 16;
    if (outputOffset < decodedByteLength) bytes[outputOffset++] = value >>> 8;
    if (outputOffset < decodedByteLength) bytes[outputOffset++] = value;
  }

  return bytes;
}

function pngCrc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc ^= bytes[offset];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isValidPng(bytes: Uint8Array, dimensions: ImageDimensions): boolean {
  if (
    bytes.length < 45 ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) return false;

  let offset = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  let hasImageDataChunk = false;
  let hasImageData = false;
  let imageDataEnded = false;
  let hasPalette = false;
  let colorType = -1;
  let bitDepth = -1;
  let interlaceMethod = -1;
  const compressedData: number[] = [];

  while (offset + 12 <= bytes.length) {
    const dataLength = readUint32(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + dataLength;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.length) return false;

    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    if (!/^[A-Za-z]{4}$/.test(type)) return false;
    // PNG reserves the lowercase form of the third type byte for future use.
    if ((typeBytes[2] & 0x20) !== 0) return false;
    if ((typeBytes[0] & 0x20) === 0 && !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) {
      return false;
    }
    // fast-png inflates embedded ICC profiles without an output-size limit.
    if (type === "iCCP") return false;
    if (pngCrc32(bytes, offset + 4, dataEnd) !== readUint32(bytes, dataEnd)) return false;

    if (chunkIndex === 0) {
      if (type !== "IHDR" || dataLength !== 13) return false;
      const width = readUint32(bytes, dataStart);
      const height = readUint32(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlaceMethod = bytes[dataStart + 12];
      const validBitDepth = PNG_BIT_DEPTHS.get(colorType)?.includes(bitDepth);
      if (
        !hasSafeDimensions(width, height) ||
        !validBitDepth ||
        bytes[dataStart + 10] !== 0 ||
        bytes[dataStart + 11] !== 0 ||
        interlaceMethod > 1
      ) return false;
      dimensions.width = width;
      dimensions.height = height;
    } else if (type === "IHDR") {
      return false;
    }

    if (type === "PLTE") {
      if (
        hasPalette || hasImageDataChunk ||
        colorType === 0 || colorType === 4 ||
        dataLength === 0 || dataLength % 3 !== 0 || dataLength > 768 ||
        (colorType === 3 && dataLength / 3 > 2 ** bitDepth)
      ) return false;
      hasPalette = true;
    } else if (type === "IDAT") {
      if (imageDataEnded || (colorType === 3 && !hasPalette)) return false;
      hasImageDataChunk = true;
      hasImageData = hasImageData || dataLength > 0;
      for (let index = dataStart; index < dataEnd; index += 1) compressedData.push(bytes[index]);
    } else if (hasImageDataChunk && type !== "IEND") {
      imageDataEnded = true;
    }

    if (type === "IEND") {
      if (
        dataLength !== 0 || !hasImageData || chunkEnd !== bytes.length ||
        (colorType === 3 && !hasPalette) || compressedData.length < 6
      ) return false;

      const compressionMethod = compressedData[0] & 0x0f;
      const compressionInfo = compressedData[0] >>> 4;
      const header = compressedData[0] * 0x100 + compressedData[1];
      const hasValidZlibHeader = compressionMethod === 8 && compressionInfo <= 7 &&
        header % 31 === 0 && (compressedData[1] & 0x20) === 0;
      if (!hasValidZlibHeader) return false;

      dimensions.pngCompressedData = Uint8Array.from(compressedData);
      dimensions.pngInflatedByteLength = getPngInflatedByteLength(
        dimensions.width,
        dimensions.height,
        bitDepth,
        colorType,
        interlaceMethod
      );
      return true;
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  return false;
}

function isValidJpeg(bytes: Uint8Array, dimensions: ImageDimensions): boolean {
  if (bytes.length < 14 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;

  let offset = 2;
  let frameMarker: number | null = null;
  let frameComponents = new Set<number>();
  const scannedComponents = new Set<number>();
  let hasQuantizationTable = false;
  let hasHuffmanTable = false;
  let hasScan = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;

    const marker = bytes[offset++];
    if (marker === 0xd9) {
      return frameMarker !== null && hasQuantizationTable && hasHuffmanTable && hasScan &&
        scannedComponents.size === frameComponents.size && offset === bytes.length;
    }
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      return false;
    }
    if (offset + 2 > bytes.length) return false;

    const segmentLength = bytes[offset] * 0x100 + bytes[offset + 1];
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) return false;

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (frameMarker !== null || !SUPPORTED_JPEG_SOF_MARKERS.has(marker) ||
        segmentLength < 11 || bytes[offset + 2] !== 8) return false;
      const height = bytes[offset + 3] * 0x100 + bytes[offset + 4];
      const width = bytes[offset + 5] * 0x100 + bytes[offset + 6];
      const components = bytes[offset + 7];
      if (!hasSafeDimensions(width, height) || ![1, 3, 4].includes(components) ||
        segmentLength !== 8 + 3 * components) {
        return false;
      }
      dimensions.width = width;
      dimensions.height = height;

      frameComponents = new Set<number>();
      for (let index = 0; index < components; index += 1) {
        const componentOffset = offset + 8 + index * 3;
        const componentId = bytes[componentOffset];
        const sampling = bytes[componentOffset + 1];
        const horizontalSampling = sampling >>> 4;
        const verticalSampling = sampling & 0x0f;
        if (
          frameComponents.has(componentId) || horizontalSampling === 0 || horizontalSampling > 4 ||
          verticalSampling === 0 || verticalSampling > 4 || bytes[componentOffset + 2] > 3
        ) return false;
        frameComponents.add(componentId);
      }
      frameMarker = marker;
    } else if (marker === 0xdb) {
      let tableOffset = offset + 2;
      let tableCount = 0;
      while (tableOffset < segmentEnd) {
        const tableInfo = bytes[tableOffset++];
        const precision = tableInfo >>> 4;
        if (precision > 1 || (tableInfo & 0x0f) > 3) return false;
        tableOffset += 64 * (precision + 1);
        tableCount += 1;
      }
      if (tableCount === 0 || tableOffset !== segmentEnd) return false;
      hasQuantizationTable = true;
    } else if (marker === 0xc4) {
      let tableOffset = offset + 2;
      let tableCount = 0;
      while (tableOffset < segmentEnd) {
        const tableInfo = bytes[tableOffset++];
        if ((tableInfo >>> 4) > 1 || (tableInfo & 0x0f) > 3 || tableOffset + 16 > segmentEnd) {
          return false;
        }
        let symbolCount = 0;
        for (let index = 0; index < 16; index += 1) symbolCount += bytes[tableOffset + index];
        tableOffset += 16 + symbolCount;
        tableCount += 1;
      }
      if (tableCount === 0 || tableOffset !== segmentEnd) return false;
      hasHuffmanTable = true;
    } else if (marker === 0xdd && segmentLength !== 4) {
      return false;
    }

    if (marker === 0xda) {
      const components = bytes[offset + 2];
      if (frameMarker === null || components === 0 || components > frameComponents.size ||
        segmentLength !== 6 + 2 * components) return false;
      const scanComponents = new Set<number>();
      for (let index = 0; index < components; index += 1) {
        const componentOffset = offset + 3 + index * 2;
        const componentId = bytes[componentOffset];
        const tables = bytes[componentOffset + 1];
        if (!frameComponents.has(componentId) || scanComponents.has(componentId) ||
          (tables >>> 4) > 3 || (tables & 0x0f) > 3) return false;
        scanComponents.add(componentId);
        scannedComponents.add(componentId);
      }
      const spectralStart = bytes[segmentEnd - 3];
      const spectralEnd = bytes[segmentEnd - 2];
      const approximation = bytes[segmentEnd - 1];
      if (frameMarker === 0xc0) {
        if (spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0) return false;
      } else if (
        spectralStart > spectralEnd || spectralEnd > 63 ||
        (spectralStart === 0 && spectralEnd !== 0) ||
        (spectralStart > 0 && components !== 1) ||
        (approximation >>> 4) > 13 || (approximation & 0x0f) > 13
      ) return false;
      hasScan = true;
      offset = segmentEnd;
      let hasEntropyData = false;

      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          hasEntropyData = true;
          offset += 1;
          continue;
        }
        const markerStart = offset;
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
        if (offset >= bytes.length) return false;
        const scanMarker = bytes[offset];
        if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
          if (scanMarker === 0x00) hasEntropyData = true;
          offset += 1;
          continue;
        }
        if (!hasEntropyData) return false;
        offset = markerStart;
        break;
      }
    } else {
      offset = segmentEnd;
    }
  }

  return false;
}

function hasMatchingDecodedDimensions(
  bytes: Uint8Array,
  format: "png" | "jpeg",
  expected: ImageDimensions
): boolean {
  try {
    if (format === "png") {
      if (!expected.pngCompressedData || expected.pngInflatedByteLength === undefined) return false;
      const inflated = unzlibSync(expected.pngCompressedData, {
        // One extra byte makes oversized deflate streams observable without unbounded output.
        out: new Uint8Array(expected.pngInflatedByteLength + 1),
      });
      if (inflated.length !== expected.pngInflatedByteLength) return false;
    }

    const decoded = format === "png"
      ? decodePng(bytes, { checkCrc: true })
      : decodeJpeg(bytes, {
        useTArray: true,
        formatAsRGBA: false,
        tolerantDecoding: false,
        maxResolutionInMP: MAX_SIGNATURE_IMAGE_PIXELS / 1_000_000,
        maxMemoryUsageInMB: MAX_JPEG_DECODE_MEMORY_MB,
      });
    return decoded.width === expected.width && decoded.height === expected.height;
  } catch {
    return false;
  }
}

export function normalizeSignatureImageData(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const maximumEncodedLength = 4 * Math.ceil(MAX_SIGNATURE_IMAGE_BYTES / 3);
  if (value.length > "data:image/jpeg;base64,".length + maximumEncodedLength) return null;

  const match = SIGNATURE_IMAGE_DATA_URI_PATTERN.exec(value);
  if (!match) return null;

  const declaredFormat = match[1];
  const payload = match[2];
  if (payload.length % 4 !== 0) return null;

  const paddingLength = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const unpaddedLength = payload.length - paddingLength;
  if (payload.slice(0, unpaddedLength).includes("=")) return null;

  if (paddingLength === 2) {
    const finalSextet = BASE64_ALPHABET.indexOf(payload[unpaddedLength - 1]);
    if (finalSextet < 0 || (finalSextet & 0b1111) !== 0) return null;
  } else if (paddingLength === 1) {
    const finalSextet = BASE64_ALPHABET.indexOf(payload[unpaddedLength - 1]);
    if (finalSextet < 0 || (finalSextet & 0b11) !== 0) return null;
  }

  const decodedByteLength = (payload.length / 4) * 3 - paddingLength;
  if (decodedByteLength === 0 || decodedByteLength > MAX_SIGNATURE_IMAGE_BYTES) return null;

  const bytes = decodeBase64(payload, decodedByteLength);
  if (!bytes) return null;

  const detectedFormat = PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
    ? "png"
    : bytes[0] === 0xff && bytes[1] === 0xd8
      ? "jpeg"
      : null;
  if (!detectedFormat || detectedFormat !== declaredFormat) return null;

  const dimensions = { width: 0, height: 0 };
  const isStructurallyValid = detectedFormat === "png"
    ? isValidPng(bytes, dimensions)
    : isValidJpeg(bytes, dimensions);

  return isStructurallyValid && hasMatchingDecodedDimensions(bytes, detectedFormat, dimensions)
    ? value
    : null;
}

export type ProtocolDefectEvidence =
  | { kind: "documented"; description: string }
  | { kind: "none-visible-confirmed" }
  | { kind: "not-recorded" };

type ProtocolSignatureEvidence =
  | { signatureCaptured: false; signatureImageData: null }
  | { signatureCaptured: true; signatureImageData: string | null };

export type FinalizedProtocolReport = {
  status: "finalized";
  defectEvidence: ProtocolDefectEvidence;
  linkedCaseId: string | null;
  finalizedAt: string;
} & ProtocolSignatureEvidence;

export interface FinalizedProtocolReportInput {
  defectDescription: string;
  noDefectsConfirmed: boolean;
  signatureCaptured: boolean;
  signatureData?: string | null;
  linkedCaseId: string | null;
  finalizedAt: string;
}

export interface PersistedFinalizedProtocolReportInput {
  status: "finalized";
  defect_description: string | null;
  signature_data: string | null;
  case_id: string | null;
  finalized_at: string;
}

export function buildFinalizedProtocolReport(
  input: FinalizedProtocolReportInput
): FinalizedProtocolReport {
  const description = input.defectDescription.trim();
  const defectEvidence: ProtocolDefectEvidence = description
    ? { kind: "documented", description }
    : input.noDefectsConfirmed
      ? { kind: "none-visible-confirmed" }
      : { kind: "not-recorded" };
  const signatureImageData = normalizeSignatureImageData(input.signatureData);
  const signatureEvidence: ProtocolSignatureEvidence = signatureImageData
    ? { signatureCaptured: true, signatureImageData }
    : { signatureCaptured: input.signatureCaptured, signatureImageData: null };

  return {
    status: "finalized",
    defectEvidence,
    ...signatureEvidence,
    linkedCaseId: input.linkedCaseId,
    finalizedAt: input.finalizedAt,
  };
}

export function buildFinalizedProtocolReportFromRecord(
  record: PersistedFinalizedProtocolReportInput
): FinalizedProtocolReport {
  const noDefectsConfirmed =
    record.defect_description === NO_VISIBLE_DEFECTS_CONFIRMED_MARKER;

  return buildFinalizedProtocolReport({
    defectDescription: noDefectsConfirmed ? "" : (record.defect_description ?? ""),
    noDefectsConfirmed,
    signatureCaptured: Boolean(record.signature_data?.trim()),
    signatureData: record.signature_data,
    linkedCaseId: record.case_id,
    finalizedAt: record.finalized_at,
  });
}
