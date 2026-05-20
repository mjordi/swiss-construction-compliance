import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

let currentSearch = "";
let caseResponseFactory: () =>
  | { data: Array<Record<string, unknown>> | null; error: { message: string } | null }
  | Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let caseResponsesQueue: Array<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let allowRecovery = false;
let lastComplianceRecordCaseId: string | null | undefined;
let insertedProtocols: Array<Record<string, unknown>>;
let signaturePadIsEmpty = true;
let signaturePadEndStrokeHandler: (() => void) | null = null;
const authState = { user: { id: "user-1" } };
const supabaseMock = {
  from: (table: string) => {
    if (table === "cases") {
      return {
        select: (columns?: string) => ({
          eq: () => {
            if (columns === "checklist") {
              return {
                single: () => Promise.resolve({ data: { checklist: null }, error: null }),
              };
            }

            return {
              order: () => {
                if (caseResponsesQueue.length > 0) {
                  return Promise.resolve(caseResponsesQueue.shift());
                }

                return Promise.resolve().then(() => caseResponseFactory());
              },
            };
          },
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }

    if (table === "protocols") {
      return {
        insert: (payload: Record<string, unknown>) => {
          insertedProtocols.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  },
};

vi.mock("next/navigation", () => ({
  useSearchParams: () => {
    const params = new URLSearchParams(currentSearch);
    return {
      get: (key: string) => params.get(key),
      toString: () => params.toString(),
    };
  },
}));

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
      return signaturePadIsEmpty;
    }
    addEventListener(eventName: string, callback: () => void) {
      if (eventName === "endStroke") {
        signaturePadEndStrokeHandler = callback;
      }
    }
    removeEventListener(eventName: string) {
      if (eventName === "endStroke") {
        signaturePadEndStrokeHandler = null;
      }
    }
    off() {}
    clear() {
      signaturePadIsEmpty = true;
    }
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
    currentSearch = "";
    window.localStorage.clear();
    caseResponsesQueue = [];
    allowRecovery = false;
    lastComplianceRecordCaseId = undefined;
    insertedProtocols = [];
    signaturePadIsEmpty = true;
    signaturePadEndStrokeHandler = null;
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

  it("preserves the selected linked case when finalizing during an in-flight same-user refresh after a prior success", async () => {
    let resolveRefreshLoad: ((value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => void) | null = null;

    window.localStorage.setItem(
      "baucompliance:wizard-project-draft",
      JSON.stringify({
        selectedCaseId: "case-1",
        name: "Alpine Tower",
        contractor: "Builder AG",
        client: "Owner GmbH",
        updatedAt: "2026-05-15T09:00:00.000Z",
      })
    );
    caseResponsesQueue = [{ data: [buildCase()], error: null }];
    caseResponseFactory = () =>
      new Promise((resolve) => {
        resolveRefreshLoad = resolve;
      });

    const { rerender } = render(<DashboardPage />);

    expect(await screen.findByRole("option", { name: "Alpine Tower (ZH)" })).toBeTruthy();
    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBe("case-1");
    });

    authState.user = { id: "user-1" };
    rerender(<DashboardPage />);

    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBe("case-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "btn-next" }));
    fireEvent.click(screen.getByRole("checkbox"));
    signaturePadIsEmpty = false;
    await act(async () => {
      signaturePadEndStrokeHandler?.();
    });

    const finalizeButton = await screen.findByRole("button", { name: "btn-finalize" });
    await waitFor(() => {
      expect(finalizeButton.getAttribute("disabled")).toBeNull();
    });
    fireEvent.click(finalizeButton);

    await waitFor(() => {
      expect(insertedProtocols).toHaveLength(1);
      expect(insertedProtocols[0]?.case_id).toBe("case-1");
    });

    resolveRefreshLoad?.({ data: [buildCase()], error: null });

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
      expect(lastComplianceRecordCaseId).toBe("case-1");
    });
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

  it("does not finalize protocols against an unvalidated URL case before cases finish loading", async () => {
    let resolveCaseLoad: ((value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => void) | null = null;

    currentSearch = "case=case-missing";
    caseResponseFactory = () =>
      new Promise((resolve) => {
        resolveCaseLoad = resolve;
      });

    render(<DashboardPage />);

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
    fireEvent.click(screen.getByRole("checkbox"));
    signaturePadIsEmpty = false;
    await act(async () => {
      signaturePadEndStrokeHandler?.();
    });

    const finalizeButton = await screen.findByRole("button", { name: "btn-finalize" });
    await waitFor(() => {
      expect(finalizeButton.getAttribute("disabled")).toBeNull();
    });
    fireEvent.click(finalizeButton);

    await waitFor(() => {
      expect(insertedProtocols).toHaveLength(1);
      expect(insertedProtocols[0]?.case_id).toBeNull();
    });

    await act(async () => {
      resolveCaseLoad?.({ data: [buildCase()], error: null });
    });
  });

  it("hydrates a requested linked case from the dashboard URL handoff", async () => {
    currentSearch = "case=case-1";
    window.localStorage.setItem(
      "baucompliance:wizard-project-draft",
      JSON.stringify({
        selectedCaseId: null,
        name: "Stale Draft Name",
        contractor: "Builder AG",
        client: "Owner GmbH",
        updatedAt: "2026-05-15T09:00:00.000Z",
      })
    );
    caseResponseFactory = () => ({ data: [buildCase()], error: null });

    render(<DashboardPage />);

    expect(await screen.findByRole("option", { name: "Alpine Tower (ZH)" })).toBeTruthy();
    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBe("case-1");
    });
    expect((screen.getByLabelText("wizard-case-selector") as HTMLSelectElement).value).toBe("case-1");
    await waitFor(() => {
      expect((screen.getByPlaceholderText("dashboard-project-placeholder") as HTMLInputElement).value).toBe("Alpine Tower");
    });

    fireEvent.click(screen.getByRole("button", { name: "btn-next" }));
    fireEvent.click(screen.getByRole("checkbox"));
    signaturePadIsEmpty = false;
    await act(async () => {
      signaturePadEndStrokeHandler?.();
    });

    const finalizeButton = await screen.findByRole("button", { name: "btn-finalize" });
    await waitFor(() => {
      expect(finalizeButton.getAttribute("disabled")).toBeNull();
    });
    fireEvent.click(finalizeButton);

    await waitFor(() => {
      expect(insertedProtocols).toHaveLength(1);
      expect(insertedProtocols[0]?.case_id).toBe("case-1");
      expect(insertedProtocols[0]?.project_name).toBe("Alpine Tower");
    });
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
