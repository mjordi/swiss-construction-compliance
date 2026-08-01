import { describe, expect, it } from "vitest";
import {
  CASE_EVIDENCE_MAX_BYTES,
  buildCaseEvidencePath,
  sanitizeCaseEvidenceDownloadName,
  validateCaseEvidenceFile,
} from "@/lib/case-evidence";

describe("case evidence helpers", () => {
  it.each(["application/pdf", "image/jpeg", "image/png"])("accepts %s at the 10 MiB boundary", (type) => {
    expect(validateCaseEvidenceFile({ type, size: CASE_EVIDENCE_MAX_BYTES })).toBeNull();
  });

  it("rejects empty, oversized, and unsupported files", () => {
    expect(validateCaseEvidenceFile({ type: "application/pdf", size: 0 })).toBe("empty");
    expect(validateCaseEvidenceFile({ type: "application/pdf", size: CASE_EVIDENCE_MAX_BYTES + 1 })).toBe("too-large");
    expect(validateCaseEvidenceFile({ type: "text/plain", size: 10 })).toBe("unsupported-type");
  });

  it.each([
    ["application/pdf", "pdf"],
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
  ])("builds a unique owner/case-rooted path with a fixed extension for %s", (type, extension) => {
    expect(buildCaseEvidencePath("user-1", "case-1", type, () => "unique-id"))
      .toBe(`user-1/case-1/unique-id.${extension}`);
  });

  it("never incorporates the original filename and rejects unsafe path segments", () => {
    const path = buildCaseEvidencePath("user-1", "case-1", "application/pdf", () => "fixed");
    expect(path).not.toContain("invoice.exe");
    expect(() => buildCaseEvidencePath("../user", "case-1", "image/png", () => "fixed")).toThrow();
    expect(() => buildCaseEvidencePath("user-1", "case/other", "image/png", () => "fixed")).toThrow();
  });

  it("sanitizes download names to a nonempty bounded basename", () => {
    expect(sanitizeCaseEvidenceDownloadName("../../reports\\final\u0000.pdf")).toBe("final.pdf");
    expect(sanitizeCaseEvidenceDownloadName("folder/\u0007")).toBe("evidence");
    expect(sanitizeCaseEvidenceDownloadName("a".repeat(300))).toHaveLength(180);
  });
});
