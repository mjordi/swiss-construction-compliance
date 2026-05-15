import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

let caseResponseFactory: () =>
  | { data: Array<Record<string, unknown>> | null; error: { message: string } | null }
  | Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let caseResponsesQueue: Array<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let allowRecovery = false;
let lastComplianceRecordCaseId: string | null | undefined;
const authState = { user: { id: "user-1" } };
const supabaseMock = {
  from: (table: string) => {
    if (table !== "cases") {
      throw new Error(`Unexpected table ${table}`);
    }

    return {
      select: () => ({
        eq: () => ({
          order: () => {
            if (caseResponsesQueue.length > 0) {
              return Promise.resolve(caseResponsesQueue.shift());
            }

            return Promise.resolve().then(() => caseResponseFactory());
          },
        }),
      }),
    };
  },
};

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => <div {...props}>{children}</div>,
  },
}));

vi.mock("signature_pad", () => ({
  default: class SignaturePadMock {
    isEmpty() {
      return true;
    }
    addEventListener() {}
    removeEventListener() {}
    off() {}
    clear() {}
    toDataURL() {
      return "data:image/png;base64,mock";
    }
  },
}));

vi.mock("@react-pdf/renderer", () => ({
  pdf: () => ({
    toBlob: async () => new Blob(),
  }),
}));

vi.mock("@/components/dashboard/AuditReportPDF", () => ({
  AuditReportPDF: () => null,
}));

vi.mock("@/lib/compliance-record", () => ({
  buildComplianceRecord: ({ caseId }: { caseId: string | null }) => ({
    ...(lastComplianceRecordCaseId = caseId, {}),
    caseId,
    checklist: {
      projectData: false,
      defectLog: false,
      signature: false,
      exportReady: false,
    },
  }),
}));

vi.mock("@/lib/legal-utils", () => ({
  calculateRuegefrist: () => ({
    ruegefrist60: {
      status: "ok",
      date: new Date("2026-06-01T00:00:00.000Z"),
    },
  }),
  determineLegalRegime: () => "new",
  formatDateCH: () => "01.06.2026",
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => supabaseMock,
}));

import DashboardPage from "@/app/dashboard/page";

function buildCase(id = "case-1", projectName = "Alpine Tower") {
  return {
    id,
    user_id: "user-1",
    project_name: projectName,
    canton: "ZH",
    contract_date: "2026-03-01T00:00:00.000Z",
    discovery_date: "2026-03-21T00:00:00.000Z",
    checklist: null,
    created_at: "2026-03-21T00:00:00.000Z",
    updated_at: "2026-03-21T00:00:00.000Z",
    status: "active",
  };
}

describe("dashboard linked-case loading retry", () => {
  beforeEach(() => {
    window.localStorage.clear();
    caseResponsesQueue = [];
    allowRecovery = false;
    lastComplianceRecordCaseId = undefined;
    authState.user = { id: "user-1" };
    caseResponseFactory = () => ({ data: [], error: null });
  });

  it("preserves a restored linked case while the initial case fetch is still in flight", async () => {
    let resolveCaseLoad: ((value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => void) | null = null;

    window.localStorage.setItem(
      "baucompliance:wizard-project-draft",
      JSON.stringify({ selectedCaseId: "case-1", updatedAt: "2026-05-15T09:00:00.000Z" })
    );
    caseResponseFactory = () =>
      new Promise((resolve) => {
        resolveCaseLoad = resolve;
      });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBe("case-1");
    });

    resolveCaseLoad?.({ data: null, error: { message: "boom" } });
    expect((await screen.findByRole("alert")).textContent).toContain("dashboard-linked-case-load-error");
  });

  it("surfaces linked-case loading failures with a retry action while preserving standalone creation", async () => {
    window.localStorage.setItem(
      "baucompliance:wizard-project-draft",
      JSON.stringify({ selectedCaseId: "case-1", updatedAt: "2026-05-15T09:00:00.000Z" })
    );
    caseResponseFactory = () => ({ data: null, error: { message: "boom" } });

    render(<DashboardPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("dashboard-linked-case-load-error");
    expect(screen.getByRole("button", { name: "dashboard-linked-case-retry" })).toBeTruthy();
    expect(screen.getByPlaceholderText("dashboard-project-placeholder")).toBeTruthy();
    expect(screen.queryByLabelText("wizard-case-selector")).toBeNull();
    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBeNull();
    });
  });

  it("keeps linked-case finalization disabled while a retry is still in flight after a load failure", async () => {
    let resolveRetryLoad: ((value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => void) | null = null;

    window.localStorage.setItem(
      "baucompliance:wizard-project-draft",
      JSON.stringify({ selectedCaseId: "case-1", updatedAt: "2026-05-15T09:00:00.000Z" })
    );
    caseResponsesQueue = [{ data: null, error: { message: "initial failure" } }];
    caseResponseFactory = () =>
      new Promise((resolve) => {
        resolveRetryLoad = resolve;
      });

    render(<DashboardPage />);

    const retryButton = await screen.findByRole("button", { name: "dashboard-linked-case-retry" });
    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBeNull();
    });

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBeNull();
    });

    resolveRetryLoad?.({ data: [buildCase()], error: null });
    expect(await screen.findByRole("option", { name: "Alpine Tower (ZH)" })).toBeTruthy();
  });

  it("retries linked-case loading and restores the case selector after recovery", async () => {
    caseResponseFactory = () =>
      allowRecovery
        ? { data: [buildCase()], error: null }
        : { data: null, error: { message: "boom" } };

    render(<DashboardPage />);

    const retryButton = await screen.findByRole("button", { name: "dashboard-linked-case-retry" });
    allowRecovery = true;
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });

    expect(screen.getByLabelText("wizard-case-selector")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Alpine Tower (ZH)" })).toBeTruthy();
  });

  it("clears stale linked-case options when a later refresh fails after a previous success", async () => {
    caseResponsesQueue = [{ data: [buildCase()], error: null }];
    caseResponseFactory = () => ({ data: null, error: { message: "second load failed" } });

    const { rerender } = render(<DashboardPage />);

    expect(await screen.findByLabelText("wizard-case-selector")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Alpine Tower (ZH)" })).toBeTruthy();

    authState.user = { id: "user-2" };
    rerender(<DashboardPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("dashboard-linked-case-load-error");
    expect(screen.queryByLabelText("wizard-case-selector")).toBeNull();
    expect(screen.queryByRole("option", { name: "Alpine Tower (ZH)" })).toBeNull();
    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBeNull();
    });
  });

  it("ignores stale linked-case request results after a newer refresh succeeds", async () => {
    let resolveFirstRequest: ((value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => void) | null = null;
    let invocationCount = 0;

    caseResponseFactory = () => {
      invocationCount += 1;

      if (invocationCount === 1) {
        return new Promise((resolve) => {
          resolveFirstRequest = resolve;
        });
      }

      return { data: [buildCase("case-2", "River Hall")], error: null };
    };

    const { rerender } = render(<DashboardPage />);

    authState.user = { id: "user-2" };
    rerender(<DashboardPage />);

    expect(await screen.findByRole("option", { name: "River Hall (ZH)" })).toBeTruthy();

    resolveFirstRequest?.({ data: null, error: { message: "late failure" } });

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(screen.getByLabelText("wizard-case-selector")).toBeTruthy();
    expect(screen.getByRole("option", { name: "River Hall (ZH)" })).toBeTruthy();
  });
});
