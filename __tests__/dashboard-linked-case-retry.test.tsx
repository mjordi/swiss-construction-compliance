import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

let currentSearch = "";
const replaceMock = vi.fn();
let caseResponseFactory: () =>
  | { data: Array<Record<string, unknown>> | null; error: { message: string } | null }
  | Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let caseResponsesQueue: Array<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
let allowRecovery = false;
let lastComplianceRecordCaseId: string | null | undefined;
let insertedProtocols: Array<Record<string, unknown>>;
let protocolInsertFactory: (payload: Record<string, unknown>) => Promise<{ error: null }> | { error: null };
let signaturePadIsEmpty = true;
let signaturePadEndStrokeHandler: (() => void) | null = null;
let pdfToBlobFactory: () => Promise<Blob>;
const createObjectURLMock = vi.fn(() => "blob:dashboard-pdf");
const revokeObjectURLMock = vi.fn();
const anchorClickMock = vi.fn();
const authState = { user: { id: "user-1" } };
type CaseLoadResolution = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
type DeferredBlob = {
  promise: Promise<Blob>;
  resolve: (value: Blob) => void;
  reject: (error: unknown) => void;
};

function resolveCaseLoadPromise(
  resolver: ((value: CaseLoadResolution) => void) | null,
  value: CaseLoadResolution,
) {
  expect(resolver).not.toBeNull();
  (resolver as unknown as (value: CaseLoadResolution) => void)(value);
}

function resolveProtocolInsertPromise(
  resolver: ((value: { error: null }) => void) | null,
  value: { error: null },
) {
  expect(resolver).not.toBeNull();
  (resolver as unknown as (value: { error: null }) => void)(value);
}

function createDeferredBlob(): DeferredBlob {
  let resolve: (value: Blob) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<Blob>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

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
          return protocolInsertFactory(payload);
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  },
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: replaceMock }),
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
    on() {}
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
    toBlob: () => pdfToBlobFactory(),
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

async function completeProtocolToDownload() {
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

  return screen.findByRole("button", { name: "btn-download" });
}

describe("dashboard linked-case loading retry", () => {
  beforeEach(() => {
    currentSearch = "";
    replaceMock.mockClear();
    window.localStorage.clear();
    caseResponsesQueue = [];
    allowRecovery = false;
    lastComplianceRecordCaseId = undefined;
    insertedProtocols = [];
    protocolInsertFactory = () => Promise.resolve({ error: null });
    signaturePadIsEmpty = true;
    signaturePadEndStrokeHandler = null;
    pdfToBlobFactory = () => Promise.resolve(new Blob(["pdf"], { type: "application/pdf" }));
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    anchorClickMock.mockClear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: anchorClickMock,
    });
    authState.user = { id: "user-1" };
    caseResponseFactory = () => ({ data: [], error: null });
  });

  it("exposes handover wizard project fields by their visible labels", async () => {
    caseResponseFactory = () => ({ data: [], error: null });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("label-project")).toBeInstanceOf(HTMLInputElement);
      expect(screen.getByLabelText("label-contractor")).toBeInstanceOf(HTMLInputElement);
      expect(screen.getByLabelText("label-client")).toBeInstanceOf(HTMLInputElement);
    });
  });

  it("shows a protocol final-review summary before standalone finalization", async () => {
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

    expect(await screen.findByText("dashboard-final-review-title")).toBeTruthy();
    expect(screen.getByText("dashboard-final-review-standalone")).toBeTruthy();
    expect(screen.getByText("dashboard-final-review-defects-missing")).toBeTruthy();
    expect(screen.getByText("dashboard-final-review-signature-missing")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox"));
    signaturePadIsEmpty = false;
    await act(async () => {
      signaturePadEndStrokeHandler?.();
    });

    expect(screen.getByText("dashboard-final-review-no-defects")).toBeTruthy();
    expect(screen.getByText("dashboard-final-review-signature-ready")).toBeTruthy();
  });

  it("keeps the persisted wizard draft cleared after the user discards it", async () => {
    caseResponseFactory = () => ({ data: [], error: null });

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

    await waitFor(() => {
      expect(window.localStorage.getItem("baucompliance:wizard-project-draft")).toContain("Alpine Tower");
    });

    fireEvent.click(screen.getByRole("button", { name: "dashboard-draft-discard" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("baucompliance:wizard-project-draft")).toBeNull();
    });

    fireEvent.change(screen.getByPlaceholderText("dashboard-project-placeholder"), {
      target: { value: "Second Tower" },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("baucompliance:wizard-project-draft")).toContain("Second Tower");
    });
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

    resolveCaseLoadPromise(resolveCaseLoad, { data: null, error: { message: "boom" } });
    expect((await screen.findByRole("alert")).textContent).toContain("dashboard-linked-case-load-error");
  });

  it("does not summarize an in-flight restored linked case as standalone", async () => {
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
    caseResponseFactory = () => new Promise(() => {});

    render(<DashboardPage />);

    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBe("case-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "btn-next" }));

    expect(await screen.findByText("dashboard-final-review-title")).toBeTruthy();
    expect(screen.queryByText("dashboard-final-review-standalone")).toBeNull();
    expect(screen.getByText("dashboard-final-review-linked-case-pending")).toBeTruthy();
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

    resolveCaseLoadPromise(resolveRetryLoad, { data: [buildCase()], error: null });
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

    resolveCaseLoadPromise(resolveRefreshLoad, { data: [buildCase()], error: null });

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
      expect(lastComplianceRecordCaseId).toBe("case-1");
    });
  });

  it("locks protocol finalization controls and ignores duplicate finalize clicks while saving", async () => {
    let resolveProtocolInsert: ((value: { error: null }) => void) | null = null;
    protocolInsertFactory = () =>
      new Promise<{ error: null }>((resolve) => {
        resolveProtocolInsert = resolve;
      });
    window.localStorage.setItem(
      "baucompliance:wizard-project-draft",
      JSON.stringify({
        name: "Alpine Tower",
        contractor: "Builder AG",
        client: "Owner GmbH",
        updatedAt: "2026-05-15T09:00:00.000Z",
      })
    );
    caseResponseFactory = () => ({ data: [], error: null });

    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "btn-next" }));
    const noDefectsCheckbox = screen.getByRole("checkbox");
    fireEvent.click(noDefectsCheckbox);
    signaturePadIsEmpty = false;
    await act(async () => {
      signaturePadEndStrokeHandler?.();
    });

    const finalizeButton = await screen.findByRole("button", { name: "btn-finalize" });
    await waitFor(() => {
      expect(finalizeButton.getAttribute("disabled")).toBeNull();
    });

    fireEvent.click(finalizeButton);
    fireEvent.click(finalizeButton);

    await waitFor(() => {
      expect(insertedProtocols).toHaveLength(1);
      expect((screen.getByPlaceholderText("defect-placeholder") as HTMLTextAreaElement).disabled).toBe(true);
      expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "btn-clear" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "btn-back" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "btn-generating" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText("sign-here").parentElement?.getAttribute("aria-disabled")).toBe("true");
    });

    await act(async () => {
      resolveProtocolInsertPromise(resolveProtocolInsert, { error: null });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "btn-download" })).toBeTruthy();
    });
  });

  it("shows localized success feedback and disables the dashboard PDF download while pending", async () => {
    const pendingDownload = createDeferredBlob();
    pdfToBlobFactory = () => pendingDownload.promise;

    render(<DashboardPage />);

    const downloadButton = await completeProtocolToDownload();
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "btn-generating" }) as HTMLButtonElement).disabled).toBe(true);
    });

    await act(async () => {
      pendingDownload.resolve(new Blob(["pdf"], { type: "application/pdf" }));
    });

    expect(await screen.findByText("dashboard-download-success")).toBeTruthy();
    expect(screen.getByRole("button", { name: "btn-download" }).getAttribute("disabled")).toBeNull();
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText("dashboard-download-success")).toBeNull();
    }, { timeout: 3000 });
  });

  it("shows localized failure feedback when dashboard PDF download fails", async () => {
    pdfToBlobFactory = () => Promise.reject(new Error("pdf failed"));

    render(<DashboardPage />);

    const downloadButton = await completeProtocolToDownload();
    fireEvent.click(downloadButton);

    expect(await screen.findByText("dashboard-download-failed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "btn-download" }).getAttribute("disabled")).toBeNull();
    expect(createObjectURLMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText("dashboard-download-failed")).toBeNull();
    }, { timeout: 3000 });
  });

  it("ignores stale dashboard PDF download completion after starting a new protocol", async () => {
    const staleDownload = createDeferredBlob();
    pdfToBlobFactory = () => staleDownload.promise;

    render(<DashboardPage />);

    const downloadButton = await completeProtocolToDownload();
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "btn-generating" }) as HTMLButtonElement).disabled).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "btn-new" }));

    await act(async () => {
      staleDownload.resolve(new Blob(["stale"], { type: "application/pdf" }));
    });

    expect(screen.getByPlaceholderText("dashboard-project-placeholder")).toBeTruthy();
    expect(screen.queryByText("dashboard-download-success")).toBeNull();
    expect(screen.queryByText("dashboard-download-failed")).toBeNull();
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

    currentSearch = "case=case-2";
    window.localStorage.setItem(
      "baucompliance:wizard-project-draft",
      JSON.stringify({
        selectedCaseId: "case-1",
        name: "Stale Draft Name",
        contractor: "Builder AG",
        client: "Owner GmbH",
        updatedAt: "2026-05-15T09:00:00.000Z",
      })
    );
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
      resolveCaseLoadPromise(resolveCaseLoad, { data: [buildCase()], error: null });
    });
  });

  it("removes an invalid requested case from the URL while preserving sibling params", async () => {
    currentSearch = "case=missing-case&view=wizard";
    caseResponseFactory = () => ({ data: [buildCase("case-1", "Alpine Tower")], error: null });

    render(<DashboardPage />);

    expect(await screen.findByRole("option", { name: "Alpine Tower (ZH)" })).toBeTruthy();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard?view=wizard", { scroll: false });
      expect(lastComplianceRecordCaseId).toBeNull();
    });
    expect(screen.getByText("dashboard-linked-case-missing-title")).toBeTruthy();
    expect(screen.getByText("dashboard-linked-case-missing-desc")).toBeTruthy();
    expect((screen.getByLabelText("wizard-case-selector") as HTMLSelectElement).value).toBe("");
    expect((screen.getByPlaceholderText("dashboard-project-placeholder") as HTMLInputElement).value).toBe("");

    fireEvent.change(screen.getByLabelText("wizard-case-selector"), {
      target: { value: "case-1" },
    });

    await waitFor(() => {
      expect(screen.queryByText("dashboard-linked-case-missing-title")).toBeNull();
      expect((screen.getByLabelText("wizard-case-selector") as HTMLSelectElement).value).toBe("case-1");
      expect((screen.getByPlaceholderText("dashboard-project-placeholder") as HTMLInputElement).value).toBe("Alpine Tower");
    });
  });

  it("hydrates a requested linked case from the dashboard URL handoff", async () => {
    currentSearch = "case=case-1&view=wizard";
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

    const { rerender } = render(<DashboardPage />);

    expect(await screen.findByRole("option", { name: "Alpine Tower (ZH)" })).toBeTruthy();
    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBe("case-1");
    });
    expect((screen.getByLabelText("wizard-case-selector") as HTMLSelectElement).value).toBe("case-1");
    await waitFor(() => {
      expect((screen.getByPlaceholderText("dashboard-project-placeholder") as HTMLInputElement).value).toBe("Alpine Tower");
    });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard?view=wizard", { scroll: false });
    });

    currentSearch = "view=wizard";
    rerender(<DashboardPage />);

    await waitFor(() => {
      expect(lastComplianceRecordCaseId).toBe("case-1");
      expect((screen.getByLabelText("wizard-case-selector") as HTMLSelectElement).value).toBe("case-1");
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

    resolveCaseLoadPromise(resolveFirstRequest, { data: null, error: { message: "late failure" } });

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(screen.getByLabelText("wizard-case-selector")).toBeTruthy();
    expect(screen.getByRole("option", { name: "River Hall (ZH)" })).toBeTruthy();
  });
});
