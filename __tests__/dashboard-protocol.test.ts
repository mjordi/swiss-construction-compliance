import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dashboardMocks = vi.hoisted(() => ({
  buildFinalizedProtocolReport: vi.fn((input: Record<string, unknown>) => ({
    status: "finalized",
    defectEvidence: { kind: "none-visible-confirmed" },
    signatureCaptured: true,
    signatureImageData: input.signatureData,
    linkedCaseId: input.linkedCaseId,
    finalizedAt: input.finalizedAt,
  })),
  insert: vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>()
    .mockResolvedValue({ error: null }),
  toDataURL: vi.fn(() => "data:image/png;base64,captured-signature"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
}));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("framer-motion", () => ({ motion: { div: "div" } }));
vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ lang: "en", t: (key: string) => key }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => table === "protocols"
      ? { insert: dashboardMocks.insert }
      : {
        select: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        }),
      },
  }),
}));
vi.mock("signature_pad", () => ({
  default: class SignaturePadMock {
    private endStroke?: () => void;
    isEmpty() { return false; }
    addEventListener(_event: string, callback: () => void) { this.endStroke = callback; }
    removeEventListener() {}
    on() { this.endStroke?.(); }
    off() {}
    clear() {}
    toDataURL() { return dashboardMocks.toDataURL(); }
  },
}));
vi.mock("@react-pdf/renderer", () => ({ pdf: () => ({ toBlob: async () => new Blob() }) }));
vi.mock("@/components/dashboard/AuditReportPDF", () => ({ AuditReportPDF: () => null }));
vi.mock("@/lib/protocol-report", () => ({
  buildFinalizedProtocolReport: dashboardMocks.buildFinalizedProtocolReport,
}));
vi.mock("@/lib/legal-utils", () => ({
  getMillisecondsUntilNextSwissCalendarDay: () => 3_600_000,
}));

import DashboardPage from "../app/dashboard/page";

import {
  buildProtocolDefectDescription,
  buildWizardDraft,
  getProtocolFinalizeReadiness,
  NO_VISIBLE_DEFECTS_CONFIRMED_MARKER,
} from "../lib/dashboard-protocol";

describe("dashboard protocol finalization", () => {
  beforeEach(() => {
    window.localStorage.clear();
    dashboardMocks.buildFinalizedProtocolReport.mockClear();
    dashboardMocks.insert.mockClear();
    dashboardMocks.toDataURL.mockClear();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      scale: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it("reuses one captured signature for persistence and the fresh report", async () => {
    render(createElement(DashboardPage));

    fireEvent.change(screen.getByPlaceholderText("dashboard-project-placeholder"), {
      target: { value: "Alpine Tower" },
    });
    fireEvent.change(screen.getByPlaceholderText("dashboard-contractor-placeholder"), {
      target: { value: "Builder AG" },
    });
    fireEvent.change(screen.getByPlaceholderText("dashboard-client-placeholder"), {
      target: { value: "Owner GmbH" },
    });
    fireEvent.click(screen.getByRole("button", { name: "btn-next" }));

    fireEvent.click(await screen.findByRole("checkbox", {
      name: "dashboard-no-defects-confirmed",
    }));
    const finalizeButton = await screen.findByRole("button", { name: "btn-finalize" });
    await waitFor(() => expect(finalizeButton.getAttribute("disabled")).toBeNull());
    fireEvent.click(finalizeButton);

    await waitFor(() => expect(dashboardMocks.buildFinalizedProtocolReport).toHaveBeenCalledTimes(1));
    const persistedSignature = dashboardMocks.insert.mock.calls[0]![0].signature_data;
    expect(persistedSignature).toBe("data:image/png;base64,captured-signature");
    expect(dashboardMocks.buildFinalizedProtocolReport).toHaveBeenCalledWith(
      expect.objectContaining({ signatureData: persistedSignature })
    );
    expect(dashboardMocks.toDataURL).toHaveBeenCalledTimes(1);
  });
});

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

  it("marks finalize ready only when defect capture and signature requirements are both satisfied", () => {
    expect(getProtocolFinalizeReadiness("", false, false)).toEqual({
      hasDefectInput: false,
      hasSignature: false,
      canFinalize: false,
    });

    expect(getProtocolFinalizeReadiness(" Crack by balcony door ", false, true)).toEqual({
      hasDefectInput: true,
      hasSignature: true,
      canFinalize: true,
    });

    expect(getProtocolFinalizeReadiness("", true, true)).toEqual({
      hasDefectInput: true,
      hasSignature: true,
      canFinalize: true,
    });
  });
});
