import { describe, expect, it } from "vitest";

import {
  buildProtocolDefectDescription,
  buildWizardDraft,
  NO_VISIBLE_DEFECTS_CONFIRMED_MARKER,
} from "../lib/dashboard-protocol";

describe("dashboard protocol helpers", () => {
  it("stores a stable no-defects marker when no defects are confirmed", () => {
    expect(
      buildProtocolDefectDescription("   ", true)
    ).toBe(NO_VISIBLE_DEFECTS_CONFIRMED_MARKER);
  });

  it("prefers a trimmed defect description over the no-defects marker", () => {
    expect(
      buildProtocolDefectDescription("  Crack by balcony door  ", true)
    ).toBe("Crack by balcony door");
  });

  it("serializes draft state including no-defects confirmation", () => {
    expect(
      buildWizardDraft({
        name: "Residentia West",
        contractor: "Muster Bau AG",
        client: "Eva Example",
        defectDescription: "",
        noDefectsConfirmed: true,
        selectedCaseId: "case-123",
        updatedAt: "2026-04-29T10:00:00.000Z",
      })
    ).toEqual({
      name: "Residentia West",
      contractor: "Muster Bau AG",
      client: "Eva Example",
      defectDescription: "",
      noDefectsConfirmed: true,
      selectedCaseId: "case-123",
      updatedAt: "2026-04-29T10:00:00.000Z",
    });
  });
});
