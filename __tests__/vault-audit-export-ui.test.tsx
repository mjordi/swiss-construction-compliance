import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

const replaceMock = vi.fn();
const pushMock = vi.fn();
const routerMock = { replace: replaceMock, push: pushMock };
const authState: { user: { id: string } | null } = { user: { id: "user-1" } };
const { buildCsvMock, filenameMock } = vi.hoisted(() => ({
  buildCsvMock: vi.fn((rows: Array<Record<string, unknown>>, labels: Record<string, string>, generatedAt: Date) => {
    void rows;
    void labels;
    void generatedAt;
    return "\uFEFFcsv-data";
  }),
  filenameMock: vi.fn((generatedAt: Date) => {
    void generatedAt;
    return "baucompliance-vault-audit-2026-08-20.csv";
  }),
}));
const { buildTimelineMock, timelineState } = vi.hoisted(() => ({
  buildTimelineMock: vi.fn(),
  timelineState: { activeStatus: "ok" as "ok" | "expired", activeDays: 45 },
}));
const createObjectUrlMock = vi.fn(() => "blob:vault-audit");
const revokeObjectUrlMock = vi.fn();
let statusUpdateResult: Promise<{ error: { message: string } | null }>;
let casesSelectResults: Array<Promise<{ data: typeof cases; error: { message: string } | null }>> = [];
let protocolsSelectResults: Array<Promise<{ data: Array<{ id: string; case_id: string; project_name: string }>; error: { message: string } | null }>> = [];

const rpcMock = vi.fn(async (functionName: string) => {
  if (functionName !== "get_vault_audit_snapshot") {
    throw new Error(`Unexpected RPC ${functionName}`);
  }
  const [casesResult, protocolsResult] = await Promise.all([
    casesSelectResults[0],
    protocolsSelectResults[0],
  ]);
  const error = casesResult.error ?? protocolsResult.error;
  return {
    data: error ? null : { cases: casesResult.data, protocols: protocolsResult.data },
    error,
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/vault",
  useRouter: () => routerMock,
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ lang: "en", t: (key: string) => key }),
}));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => <div {...props}>{children}</div> },
}));
vi.mock("@/components/dashboard/CaseEvidencePanel", () => ({
  default: ({ caseId, onChecklistUpdated }: { caseId: string; onChecklistUpdated?: () => void }) => (
    <button type="button" data-testid={`evidence-${caseId}`} onClick={() => onChecklistUpdated?.()}>
      update evidence
    </button>
  ),
}));
vi.mock("@/lib/vault-audit-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vault-audit-export")>()),
  buildVaultAuditCsv: buildCsvMock,
  vaultAuditCsvFilename: filenameMock,
}));
vi.mock("@/lib/case-timeline", () => ({
  buildComplianceCaseTimeline: buildTimelineMock,
  deriveChecklistProgress: (checklist: Record<string, boolean>) => ({
    completed: Object.values(checklist).filter(Boolean).length,
    total: Object.keys(checklist).length,
    label: "progress",
  }),
}));

const cases = [
  {
    id: "case-active",
    user_id: "user-1",
    project_name: "Alpine Tower",
    canton: "ZH",
    contract_date: "2026-03-01",
    discovery_date: "2026-03-21",
    checklist: null,
    created_at: "2026-03-21T00:00:00.000Z",
    updated_at: "2026-08-19T09:00:00.123456+00:00",
    status: "active",
  },
  {
    id: "case-archived",
    user_id: "user-1",
    project_name: "Summit Depot",
    canton: "GR",
    contract_date: "2026-02-01",
    discovery_date: "2026-02-21",
    checklist: { evidenceAttached: true },
    created_at: "2026-02-21T00:00:00.000Z",
    updated_at: "2026-08-18T09:00:00.000Z",
    status: "archived",
  },
];

const supabaseMock = {
  rpc: rpcMock,
  from: (table: string) => {
    if (table === "cases") {
      return {
        update: () => ({ eq: () => ({ eq: () => statusUpdateResult }) }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  },
};
vi.mock("@/lib/supabase", () => ({ getSupabase: () => supabaseMock }));

import TechVault from "@/app/dashboard/vault/page";

describe("Vault portfolio audit export", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
    buildCsvMock.mockClear();
    filenameMock.mockClear();
    createObjectUrlMock.mockClear();
    revokeObjectUrlMock.mockClear();
    rpcMock.mockClear();
    replaceMock.mockClear();
    pushMock.mockClear();
    timelineState.activeStatus = "ok";
    timelineState.activeDays = 45;
    buildTimelineMock.mockImplementation((inputs: Array<{ id: string }>) => inputs.map((input) => ({
      id: input.id,
      status: input.id === "case-archived" ? "warning" : timelineState.activeStatus,
      regime: "new",
      noticeApplies: true,
      daysToDeadline: input.id === "case-archived" ? 20 : timelineState.activeDays,
      checklistDefaults: {
        defectDocumented: true,
        evidenceAttached: false,
        noticeDrafted: false,
        calendarReminderExported: false,
      },
    })));
    statusUpdateResult = Promise.resolve({ error: null });
    casesSelectResults = [Promise.resolve({ data: cases, error: null })];
    protocolsSelectResults = [Promise.resolve({
      data: [{ id: "protocol-1", case_id: "case-archived", project_name: "Summit Depot" }],
      error: null,
    })];
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrlMock });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrlMock });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("loads one snapshot-consistent owner portfolio and exports it rather than only the active tab", async () => {
    render(<TechVault />);

    expect(screen.queryByRole("button", { name: "vault-audit-export-action" })).toBeNull();
    await screen.findByText("Alpine Tower");

    const exportButton = screen.getByRole("button", { name: "vault-audit-export-action" });
    fireEvent.click(exportButton);
    fireEvent.click(exportButton);

    await waitFor(() => expect(buildCsvMock).toHaveBeenCalledTimes(1));
    const exportedRows = buildCsvMock.mock.calls[0][0];
    expect(exportedRows).toHaveLength(2);
    expect(exportedRows.map((row) => row.caseId).sort()).toEqual(["case-active", "case-archived"]);
    expect(exportedRows.find((row) => row.caseId === "case-archived")).toMatchObject({
      project: "Summit Depot",
      linkedProtocols: 1,
      lifecycleStatus: "vault-status-archived",
    });
    expect(exportedRows.find((row) => row.caseId === "case-active")).toMatchObject({
      sourceUpdatedAt: "2026-08-19T09:00:00.123456+00:00",
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("get_vault_audit_snapshot");
    expect(filenameMock).toHaveBeenCalledTimes(1);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:vault-audit");
    expect(await screen.findByText("vault-audit-export-success")).toBeTruthy();
  });

  it("passes a nullable database update timestamp through as unavailable audit data", async () => {
    casesSelectResults = [Promise.resolve({
      data: cases.map((entry) => entry.id === "case-active" ? { ...entry, updated_at: null } : entry) as unknown as typeof cases,
      error: null,
    })];
    render(<TechVault />);
    await screen.findByText("Alpine Tower");

    fireEvent.click(screen.getByRole("button", { name: "vault-audit-export-action" }));

    await waitFor(() => expect(buildCsvMock).toHaveBeenCalledTimes(1));
    expect(buildCsvMock.mock.calls[0][0].find((row) => row.caseId === "case-active")).toMatchObject({
      sourceUpdatedAt: null,
    });
  });

  it("stacks the header actions on narrow viewports and restores the row layout responsively", async () => {
    render(<TechVault />);
    await screen.findByText("Alpine Tower");

    const exportButton = screen.getByRole("button", { name: "vault-audit-export-action" });
    const actions = exportButton.parentElement?.parentElement;
    const header = actions?.parentElement;

    expect(["flex-col", "sm:flex-row", "sm:justify-between"].every((name) => header?.classList.contains(name))).toBe(true);
    expect(["w-full", "flex-col", "sm:w-auto", "sm:flex-row"].every((name) => actions?.classList.contains(name))).toBe(true);
    expect(screen.getByRole("link", { name: "vault-new-project" }).classList.contains("whitespace-nowrap")).toBe(true);
  });

  it("recomputes date-dependent legal context immediately before export", async () => {
    render(<TechVault />);
    await screen.findByText("Alpine Tower");
    const timelineCallsBeforeExport = buildTimelineMock.mock.calls.length;
    timelineState.activeStatus = "expired";
    timelineState.activeDays = -1;

    fireEvent.click(screen.getByRole("button", { name: "vault-audit-export-action" }));

    await waitFor(() => expect(buildCsvMock).toHaveBeenCalledTimes(1));
    expect(buildCsvMock.mock.calls[0][0].find((row) => row.caseId === "case-active")).toMatchObject({
      lifecycleStatus: "vault-status-review",
      legalStatus: "cases-status-expired",
      deadlineContext: "cases-countdown-one-day-overdue",
    });
    expect(buildTimelineMock).toHaveBeenCalledTimes(timelineCallsBeforeExport + 1);
  });

  it("shows retryable feedback when browser download preparation fails", async () => {
    createObjectUrlMock.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    render(<TechVault />);
    await screen.findByText("Alpine Tower");

    fireEvent.click(screen.getByRole("button", { name: "vault-audit-export-action" }));

    expect(await screen.findByText("vault-audit-export-error")).toBeTruthy();
    expect(screen.getByRole("button", { name: "vault-audit-export-action" })).toBeTruthy();
  });

  it("blocks export while an optimistic lifecycle mutation is unresolved", async () => {
    statusUpdateResult = new Promise(() => undefined);
    render(<TechVault />);
    await screen.findByText("Alpine Tower");

    fireEvent.click(screen.getByRole("button", { name: "vault-archive-project" }));

    const exportButton = screen.getByRole("button", { name: "vault-audit-export-action" });
    await waitFor(() => expect(exportButton.getAttribute("disabled")).not.toBeNull());
    fireEvent.click(exportButton);

    expect(buildCsvMock).not.toHaveBeenCalled();
    expect(createObjectUrlMock).not.toHaveBeenCalled();
  });

  it("keeps export blocked until the post-mutation refresh replaces the optimistic row", async () => {
    let resolveRefresh!: (result: { data: typeof cases; error: null }) => void;
    render(<TechVault />);
    await screen.findByText("Alpine Tower");
    casesSelectResults = [new Promise((resolve) => {
      resolveRefresh = resolve;
    })];

    fireEvent.click(screen.getByRole("button", { name: "vault-archive-project" }));

    const exportButton = screen.getByRole("button", { name: "vault-audit-export-action" });
    await waitFor(() => expect(exportButton.getAttribute("disabled")).not.toBeNull());
    fireEvent.click(exportButton);
    expect(buildCsvMock).not.toHaveBeenCalled();

    resolveRefresh({
      data: cases.map((entry) => entry.id === "case-active"
        ? { ...entry, status: "archived", updated_at: "2026-08-20T08:00:00.000Z" }
        : entry),
      error: null,
    });

    await waitFor(() => expect(exportButton.getAttribute("disabled")).toBeNull());
    fireEvent.click(exportButton);
    await waitFor(() => expect(buildCsvMock).toHaveBeenCalledTimes(1));
    expect(buildCsvMock.mock.calls[0][0].find((row) => row.caseId === "case-active")).toMatchObject({
      lifecycleStatus: "vault-status-archived",
      sourceUpdatedAt: "2026-08-20T08:00:00.000Z",
    });
  });

  it("keeps export blocked until an evidence-triggered refresh succeeds", async () => {
    let resolveRefresh!: (result: { data: typeof cases; error: null }) => void;
    render(<TechVault />);
    await screen.findByText("Alpine Tower");
    casesSelectResults = [new Promise((resolve) => {
      resolveRefresh = resolve;
    })];

    fireEvent.click(screen.getByTestId("evidence-case-active"));

    const exportButton = screen.getByRole("button", { name: "vault-audit-export-action" });
    expect(exportButton.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(exportButton);
    expect(buildCsvMock).not.toHaveBeenCalled();

    resolveRefresh({
      data: cases.map((entry) => entry.id === "case-active"
        ? {
            ...entry,
            checklist: { evidenceAttached: true },
            updated_at: "2026-08-20T08:10:00.000Z",
          }
        : entry),
      error: null,
    });

    await waitFor(() => expect(exportButton.getAttribute("disabled")).toBeNull());
    fireEvent.click(exportButton);
    await waitFor(() => expect(buildCsvMock).toHaveBeenCalledTimes(1));
    expect(buildCsvMock.mock.calls[0][0].find((row) => row.caseId === "case-active")).toMatchObject({
      checklistCompleted: 2,
      sourceUpdatedAt: "2026-08-20T08:10:00.000Z",
    });
  });

  it("offers a retry when an evidence-triggered refresh fails", async () => {
    render(<TechVault />);
    await screen.findByText("Alpine Tower");
    casesSelectResults = [Promise.resolve({ data: cases, error: { message: "offline" } })];

    fireEvent.click(screen.getByTestId("evidence-case-active"));

    expect((await screen.findByRole("alert")).textContent).toContain("vault-error-load");
    expect(screen.queryByRole("button", { name: "vault-audit-export-action" })).toBeNull();

    casesSelectResults = [Promise.resolve({ data: cases, error: null })];
    fireEvent.click(screen.getByRole("button", { name: "vault-load-retry" }));

    const exportButton = await screen.findByRole("button", { name: "vault-audit-export-action" });
    expect(exportButton.getAttribute("disabled")).toBeNull();
  });

  it("offers a retry when the post-mutation refresh fails", async () => {
    render(<TechVault />);
    await screen.findByText("Alpine Tower");
    casesSelectResults = [Promise.resolve({ data: cases, error: { message: "offline" } })];

    fireEvent.click(screen.getByRole("button", { name: "vault-archive-project" }));

    expect((await screen.findByRole("alert")).textContent).toContain("vault-error-load");
    expect(screen.queryByRole("button", { name: "vault-audit-export-action" })).toBeNull();

    casesSelectResults = [Promise.resolve({
      data: cases.map((entry) => entry.id === "case-active"
        ? { ...entry, status: "archived", updated_at: "2026-08-20T08:05:00.000Z" }
        : entry),
      error: null,
    })];
    fireEvent.click(screen.getByRole("button", { name: "vault-load-retry" }));

    const exportButton = await screen.findByRole("button", { name: "vault-audit-export-action" });
    expect(exportButton.getAttribute("disabled")).toBeNull();
    fireEvent.click(exportButton);
    await waitFor(() => expect(buildCsvMock).toHaveBeenCalledTimes(1));
    expect(buildCsvMock.mock.calls[0][0].find((row) => row.caseId === "case-active")).toMatchObject({
      lifecycleStatus: "vault-status-archived",
      sourceUpdatedAt: "2026-08-20T08:05:00.000Z",
    });
  });

  it("keeps export blocked while reconciling a failed mutation response", async () => {
    let rejectUpdate!: (reason: Error) => void;
    statusUpdateResult = new Promise((_, reject) => { rejectUpdate = reject; });
    render(<TechVault />);
    await screen.findByText("Alpine Tower");
    casesSelectResults = [Promise.resolve({ data: cases, error: { message: "offline" } })];

    fireEvent.click(screen.getByRole("button", { name: "vault-archive-project" }));
    rejectUpdate(new Error("response lost"));

    expect((await screen.findByRole("alert")).textContent).toContain("vault-error-load");
    expect(screen.queryByRole("button", { name: "vault-audit-export-action" })).toBeNull();
    expect(buildCsvMock).not.toHaveBeenCalled();

    casesSelectResults = [Promise.resolve({
      data: cases.map((entry) => entry.id === "case-active"
        ? { ...entry, status: "archived", updated_at: "2026-08-20T09:30:00.000Z" }
        : entry),
      error: null,
    })];
    fireEvent.click(screen.getByRole("button", { name: "vault-load-retry" }));

    const exportButton = await screen.findByRole("button", { name: "vault-audit-export-action" });
    expect(exportButton.getAttribute("disabled")).toBeNull();
    fireEvent.click(exportButton);
    await waitFor(() => expect(buildCsvMock).toHaveBeenCalledTimes(1));
    expect(buildCsvMock.mock.calls[0][0].find((row) => row.caseId === "case-active")).toMatchObject({
      lifecycleStatus: "vault-status-archived",
      sourceUpdatedAt: "2026-08-20T09:30:00.000Z",
    });
  });

  it("clears mutation guards after a definitive status update error", async () => {
    statusUpdateResult = Promise.resolve({ error: { message: "permission denied" } });
    render(<TechVault />);
    await screen.findByText("Alpine Tower");

    fireEvent.click(screen.getByRole("button", { name: "vault-archive-project" }));

    expect(await screen.findByText("vault-update-status-error")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "vault-audit-export-action" }).getAttribute("disabled")).toBeNull();
      expect(screen.getByRole("button", { name: "vault-archive-project" }).getAttribute("disabled")).toBeNull();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "vault-load-retry" })).toBeTruthy();
  });

  it("keeps an ambiguous archive retryable until a snapshot observes the expected status", async () => {
    let rejectUpdate!: (reason: Error) => void;
    statusUpdateResult = new Promise((_, reject) => { rejectUpdate = reject; });
    render(<TechVault />);
    await screen.findByText("Alpine Tower");
    rpcMock
      .mockResolvedValueOnce({ data: { cases, protocols: [] }, error: null })
      .mockResolvedValueOnce({
        data: {
          cases: cases.map((entry) => entry.id === "case-active"
            ? { ...entry, status: "archived", updated_at: "2026-08-20T09:45:00.000Z" }
            : entry),
          protocols: [],
        },
        error: null,
      });

    fireEvent.click(screen.getByRole("button", { name: "vault-archive-project" }));
    rejectUpdate(new Error("response lost"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    const exportWhileOldSnapshotIsVisible = screen.getByRole("button", { name: "vault-audit-export-action" });
    expect(exportWhileOldSnapshotIsVisible.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(exportWhileOldSnapshotIsVisible);
    expect(buildCsvMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "vault-load-retry" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(3));
    const exportButton = screen.getByRole("button", { name: "vault-audit-export-action" });
    expect(exportButton.getAttribute("disabled")).toBeNull();
    expect(screen.queryByText("vault-update-status-error")).toBeNull();
    fireEvent.click(exportButton);
    await waitFor(() => expect(buildCsvMock).toHaveBeenCalledTimes(1));
    expect(buildCsvMock.mock.calls[0][0].find((row: Record<string, unknown>) => row.caseId === "case-active")).toMatchObject({
      lifecycleStatus: "vault-status-archived",
      sourceUpdatedAt: "2026-08-20T09:45:00.000Z",
    });
  });
});
