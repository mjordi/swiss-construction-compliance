import { describe, expect, it } from "vitest";

import { buildCaseHandoffHref, parseCaseHandoffId } from "@/lib/case-handoff";

describe("case handoff", () => {
  it("parses a valid case id", () => {
    expect(parseCaseHandoffId("case-123")).toBe("case-123");
  });

  it("trims a case id while parsing", () => {
    expect(parseCaseHandoffId("  case-123  ")).toBe("case-123");
  });

  it("returns null for an empty or missing case id", () => {
    expect(parseCaseHandoffId("")).toBeNull();
    expect(parseCaseHandoffId("   ")).toBeNull();
    expect(parseCaseHandoffId(null)).toBeNull();
  });

  it("trims and encodes a case id in the handoff href", () => {
    expect(buildCaseHandoffHref("  case / 123?  ")).toBe(
      "/dashboard/cases?case=case+%2F+123%3F"
    );
  });

  it("falls back to the cases dashboard for an empty case id", () => {
    expect(buildCaseHandoffHref("")).toBe("/dashboard/cases");
    expect(buildCaseHandoffHref("   ")).toBe("/dashboard/cases");
  });
});
