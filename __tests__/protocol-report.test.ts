import { describe, expect, it } from "vitest";
import { zlibSync } from "fflate";

import {
  MAX_SIGNATURE_IMAGE_BYTES,
  MAX_SIGNATURE_IMAGE_DECODED_BYTES,
  MAX_SIGNATURE_IMAGE_DIMENSION,
  MAX_SIGNATURE_IMAGE_PIXELS,
  MAX_SIGNATURE_JPEG_DECODE_MEMORY_MB,
  MAX_SIGNATURE_PNG_INFLATED_BYTES,
  buildFinalizedProtocolReport,
  buildFinalizedProtocolReportFromRecord,
  normalizeSignatureImageData,
} from "@/lib/protocol-report";
import { NO_VISIBLE_DEFECTS_CONFIRMED_MARKER } from "@/lib/dashboard-protocol";

const finalizedAt = "2026-07-29T21:30:00.000Z";
const pngSignature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAADklEQVR4nGP4DwYMEAoAU7oL9ZisIGcAAAAASUVORK5CYII=";
const jpegSignature =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABLAAEBAAAAAAAAAAAAAAAAAAAABwEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAAIAAgMBIgACEQADEQD/2gAMAwEAAhEDEQA/AL+AD//Z";
const progressiveJpegSignature =
  "data:image/jpeg;base64,/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAVAQEBAAAAAAAAAAAAAAAAAAAFB//aAAwDAQACEAMQAAABtQEp/wD/xAAWEAEBAQAAAAAAAAAAAAAAAAAEBgX/2gAIAQEAAQUCncoTZ/8A/8QAGBEAAgMAAAAAAAAAAAAAAAAAAAIDM3H/2gAIAQMBAT8BirXD/8QAFhEAAwAAAAAAAAAAAAAAAAAAAAIx/9oACAECAQE/AWp//8QAGxAAAwEAAwEAAAAAAAAAAAAAAQIDBAAFEUH/2gAIAQEABj8C6zRoxwveuWT0rSQZnYqPST9PP//EABcQAQADAAAAAAAAAAAAAAAAAAEAETH/2gAIAQEAAT8hex5KiWLRVV2f/9oADAMBAAIAAwAAABAH/8QAFxEAAwEAAAAAAAAAAAAAAAAAAAGhsf/aAAgBAwEBPxCRiP/EABYRAAMAAAAAAAAAAAAAAAAAAAAxcf/aAAgBAgEBPxBtP//EABUQAQEAAAAAAAAAAAAAAAAAAAEA/9oACAEBAAE/EHP0en8yMJUqqt//2Q==";

function decodeDataUri(source: string): [string, Uint8Array] {
  const [prefix, payload] = source.split(",");
  return [prefix, Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))];
}

function encodeDataUri(prefix: string, bytes: Uint8Array): string {
  return `${prefix},${btoa(String.fromCharCode(...bytes))}`;
}

function truncateDataUri(source: string, bytesToRemove: number): string {
  const [prefix, bytes] = decodeDataUri(source);
  return encodeDataUri(prefix, bytes.slice(0, -bytesToRemove));
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

function pngWithDimensions(source: string, width: number, height: number): string {
  const [prefix, bytes] = decodeDataUri(source);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);

  view.setUint32(29, pngCrc32(bytes, 12, 29));

  return encodeDataUri(prefix, bytes);
}

function pngWithBitDepth(source: string, bitDepth: number): string {
  const [prefix, bytes] = decodeDataUri(source);
  const view = new DataView(bytes.buffer);
  bytes[24] = bitDepth;
  view.setUint32(29, pngCrc32(bytes, 12, 29));
  return encodeDataUri(prefix, bytes);
}

function grayscalePng(width: number, height: number): string {
  const chunk = (type: string, data: Uint8Array) => {
    const bytes = new Uint8Array(12 + data.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, data.length);
    for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index);
    bytes.set(data, 8);
    view.setUint32(8 + data.length, pngCrc32(bytes, 4, 8 + data.length));
    return bytes;
  };
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8;
  const scanlines = new Uint8Array(height * (width + 1));
  const chunks = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlibSync(scanlines, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ];
  const byteLength = chunks.reduce((total, bytes) => total + bytes.length, 0);
  const png = new Uint8Array(byteLength);
  let offset = 0;
  for (const bytes of chunks) {
    png.set(bytes, offset);
    offset += bytes.length;
  }
  return encodeDataUri("data:image/png;base64", png);
}

function pngWithCorruptImageData(source: string): string {
  const [prefix, bytes] = decodeDataUri(source);
  const view = new DataView(bytes.buffer);
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const dataLength = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + dataLength;
    if (type === "IDAT") {
      // Retain the zlib header so this still passes the cheap structural checks.
      bytes[dataStart + 2] ^= 0xff;
      view.setUint32(dataEnd, pngCrc32(bytes, offset + 4, dataEnd));
      return encodeDataUri(prefix, bytes);
    }
    offset = dataEnd + 4;
  }

  throw new Error("PNG fixture has no IDAT chunk");
}

function pngWithCorruptAdlerTrailer(source: string): string {
  const [prefix, bytes] = decodeDataUri(source);
  const view = new DataView(bytes.buffer);
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const dataLength = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const dataEnd = offset + 8 + dataLength;
    if (type === "IDAT") {
      bytes[dataEnd - 1] ^= 0xff;
      view.setUint32(dataEnd, pngCrc32(bytes, offset + 4, dataEnd));
      return encodeDataUri(prefix, bytes);
    }
    offset = dataEnd + 4;
  }

  throw new Error("PNG fixture has no IDAT chunk");
}

function jpegWithDimensions(source: string, width: number, height: number): string {
  const [prefix, bytes] = decodeDataUri(source);
  const frameOffset = bytes.findIndex((byte, index) =>
    byte === 0xff && (bytes[index + 1] === 0xc0 || bytes[index + 1] === 0xc2)
  );
  const view = new DataView(bytes.buffer);
  view.setUint16(frameOffset + 5, height);
  view.setUint16(frameOffset + 7, width);
  return encodeDataUri(prefix, bytes);
}

function jpegWithoutScanData(source: string): string {
  const [prefix, bytes] = decodeDataUri(source);
  const scanOffset = bytes.findIndex((byte, index) => byte === 0xff && bytes[index + 1] === 0xda);
  const scanLength = bytes[scanOffset + 2] * 0x100 + bytes[scanOffset + 3];
  const headerEnd = scanOffset + 2 + scanLength;
  return encodeDataUri(prefix, new Uint8Array([...bytes.slice(0, headerEnd), 0xff, 0xd9]));
}

function jpegWithTruncatedEntropy(source: string): string {
  const [prefix, bytes] = decodeDataUri(source);
  const scanOffset = bytes.findIndex((byte, index) => byte === 0xff && bytes[index + 1] === 0xda);
  const scanLength = bytes[scanOffset + 2] * 0x100 + bytes[scanOffset + 3];
  const entropyStart = scanOffset + 2 + scanLength;
  return encodeDataUri(
    prefix,
    new Uint8Array([...bytes.slice(0, entropyStart + 1), 0xff, 0xd9])
  );
}

describe("buildFinalizedProtocolReport", () => {
  it("preserves source-bound finalized protocol evidence", () => {
    expect(
      buildFinalizedProtocolReport({
        defectDescription: "  Cracked balcony edge  ",
        noDefectsConfirmed: false,
        signatureCaptured: true,
        signatureData: pngSignature,
        linkedCaseId: "case-1",
        finalizedAt,
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: {
        kind: "documented",
        description: "Cracked balcony edge",
      },
      signatureCaptured: true,
      signatureImageData: pngSignature,
      linkedCaseId: "case-1",
      finalizedAt,
    });
  });

  it("distinguishes an explicit no-visible-defects confirmation", () => {
    expect(
      buildFinalizedProtocolReport({
        defectDescription: "",
        noDefectsConfirmed: true,
        signatureCaptured: true,
        linkedCaseId: null,
        finalizedAt,
      }).defectEvidence
    ).toEqual({ kind: "none-visible-confirmed" });
  });

  it("does not invent evidence when raw input is incomplete", () => {
    expect(
      buildFinalizedProtocolReport({
        defectDescription: "   ",
        noDefectsConfirmed: false,
        signatureCaptured: false,
        linkedCaseId: null,
        finalizedAt,
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: { kind: "not-recorded" },
      signatureCaptured: false,
      signatureImageData: null,
      linkedCaseId: null,
      finalizedAt,
    });
  });

  it("derives captured state when a valid signature image is present", () => {
    expect(
      buildFinalizedProtocolReport({
        defectDescription: "",
        noDefectsConfirmed: false,
        signatureCaptured: false,
        signatureData: pngSignature,
        linkedCaseId: null,
        finalizedAt,
      })
    ).toMatchObject({
      signatureCaptured: true,
      signatureImageData: pngSignature,
    });
  });
});

describe("normalizeSignatureImageData", () => {
  it("preserves exact PNG and baseline/progressive JPEG base64 data URIs", () => {
    expect(normalizeSignatureImageData(pngSignature)).toBe(pngSignature);
    expect(normalizeSignatureImageData(jpegSignature)).toBe(jpegSignature);
    expect(normalizeSignatureImageData(progressiveJpegSignature)).toBe(progressiveJpegSignature);
  });

  it("accepts a practical high-DPI signature at the exact pixel and dimension bounds", () => {
    const highDpiSignature = grayscalePng(
      MAX_SIGNATURE_IMAGE_DIMENSION,
      MAX_SIGNATURE_IMAGE_PIXELS / MAX_SIGNATURE_IMAGE_DIMENSION
    );

    expect(MAX_SIGNATURE_IMAGE_DIMENSION).toBe(2048);
    expect(MAX_SIGNATURE_IMAGE_PIXELS).toBe(2_097_152);
    expect(MAX_SIGNATURE_IMAGE_DECODED_BYTES).toBe(8_388_608);
    expect(MAX_SIGNATURE_PNG_INFLATED_BYTES).toBe(8_392_704);
    expect(MAX_SIGNATURE_JPEG_DECODE_MEMORY_MB).toBe(32);
    expect(normalizeSignatureImageData(highDpiSignature)).toBe(highDpiSignature);
  });

  it("rejects 16-bit PNG signature canvases", () => {
    expect(normalizeSignatureImageData(pngWithBitDepth(pngSignature, 16))).toBeNull();
  });

  it.each([
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "https://example.com/signature.png",
    "data:image/png;base64,not base64",
    "data:image/png;base64,AAA=AAAA",
    "data:image/png;base64,AB==",
    "data:image/png;base64,",
    "data:image/png;base64,QUJDRA==",
  ])("rejects an unsafe or non-canonical source: %s", (source) => {
    expect(normalizeSignatureImageData(source)).toBeNull();
  });

  it("rejects truncated PNG and JPEG data", () => {
    expect(normalizeSignatureImageData(truncateDataUri(pngSignature, 8))).toBeNull();
    expect(normalizeSignatureImageData(truncateDataUri(jpegSignature, 2))).toBeNull();
  });

  it("rejects a JPEG with a structurally valid header but no scan data", () => {
    expect(normalizeSignatureImageData(jpegWithoutScanData(jpegSignature))).toBeNull();
  });

  it("rejects PNG data with corrupt IDAT deflate and a recomputed chunk CRC", () => {
    expect(normalizeSignatureImageData(pngWithCorruptImageData(pngSignature))).toBeNull();
  });

  it("rejects PNG data with a corrupt zlib Adler trailer and recomputed chunk CRC", () => {
    expect(normalizeSignatureImageData(pngWithCorruptAdlerTrailer(pngSignature))).toBeNull();
  });

  it("rejects JPEG data whose entropy stream is structurally present but truncated", () => {
    expect(normalizeSignatureImageData(jpegWithTruncatedEntropy(jpegSignature))).toBeNull();
  });

  it("rejects data whose detected format does not match its declared MIME", () => {
    expect(normalizeSignatureImageData(pngSignature.replace("image/png", "image/jpeg"))).toBeNull();
    expect(normalizeSignatureImageData(jpegSignature.replace("image/jpeg", "image/png"))).toBeNull();
  });

  it("rejects zero, over-dimension, and over-pixel PNG canvases", () => {
    expect(normalizeSignatureImageData(pngWithDimensions(pngSignature, 0, 1))).toBeNull();
    expect(
      normalizeSignatureImageData(
        pngWithDimensions(pngSignature, MAX_SIGNATURE_IMAGE_DIMENSION + 1, 1)
      )
    ).toBeNull();
    expect(MAX_SIGNATURE_IMAGE_DIMENSION ** 2).toBeGreaterThan(MAX_SIGNATURE_IMAGE_PIXELS);
    expect(
      normalizeSignatureImageData(
        pngWithDimensions(
          pngSignature,
          MAX_SIGNATURE_IMAGE_DIMENSION,
          MAX_SIGNATURE_IMAGE_DIMENSION
        )
      )
    ).toBeNull();
  });

  it("applies the same canvas bounds to JPEG images", () => {
    expect(normalizeSignatureImageData(jpegWithDimensions(jpegSignature, 1, 0))).toBeNull();
    expect(
      normalizeSignatureImageData(
        jpegWithDimensions(jpegSignature, MAX_SIGNATURE_IMAGE_DIMENSION + 1, 1)
      )
    ).toBeNull();
    expect(
      normalizeSignatureImageData(
        jpegWithDimensions(
          jpegSignature,
          MAX_SIGNATURE_IMAGE_DIMENSION,
          MAX_SIGNATURE_IMAGE_DIMENSION
        )
      )
    ).toBeNull();
  });

  it("rejects payloads above the exported decoded-byte limit", () => {
    const oversizedPayload = "A".repeat(
      4 * Math.ceil((MAX_SIGNATURE_IMAGE_BYTES + 1) / 3)
    );

    expect(
      normalizeSignatureImageData(`data:image/png;base64,${oversizedPayload}`)
    ).toBeNull();
  });
});

describe("buildFinalizedProtocolReportFromRecord", () => {
  it("reconstructs documented finalized evidence from the persisted protocol row", () => {
    expect(
      buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: "  Cracked balcony edge  ",
        signature_data: jpegSignature,
        case_id: "case-1",
        finalized_at: finalizedAt,
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: { kind: "documented", description: "Cracked balcony edge" },
      signatureCaptured: true,
      signatureImageData: jpegSignature,
      linkedCaseId: "case-1",
      finalizedAt,
    });
  });

  it("interprets the persisted explicit no-visible-defects marker", () => {
    expect(
      buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: NO_VISIBLE_DEFECTS_CONFIRMED_MARKER,
        signature_data: pngSignature,
        case_id: "case-1",
        finalized_at: finalizedAt,
      }).defectEvidence
    ).toEqual({ kind: "none-visible-confirmed" });
  });

  it("does not invent evidence from missing persisted fields", () => {
    expect(
      buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: null,
        signature_data: null,
        case_id: null,
        finalized_at: finalizedAt,
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: { kind: "not-recorded" },
      signatureCaptured: false,
      signatureImageData: null,
      linkedCaseId: null,
      finalizedAt,
    });
  });

  it("treats empty and whitespace-only signature payloads as missing", () => {
    for (const signature_data of ["", "   "]) {
      expect(buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: null,
        signature_data,
        case_id: null,
        finalized_at: finalizedAt,
      })).toMatchObject({ signatureCaptured: false, signatureImageData: null });
    }
  });

  it("keeps historical capture state when an unsafe image cannot be rendered", () => {
    expect(buildFinalizedProtocolReportFromRecord({
      status: "finalized",
      defect_description: null,
      signature_data: "https://example.com/historical-signature.png",
      case_id: null,
      finalized_at: finalizedAt,
    })).toMatchObject({
      signatureCaptured: true,
      signatureImageData: null,
    });
  });

  it("keeps historical capture evidence when compressed image data is corrupt", () => {
    expect(buildFinalizedProtocolReportFromRecord({
      status: "finalized",
      defect_description: null,
      signature_data: pngWithCorruptImageData(pngSignature),
      case_id: null,
      finalized_at: finalizedAt,
    })).toMatchObject({
      signatureCaptured: true,
      signatureImageData: null,
    });
  });
});
