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
const createObjectUrlMock = vi.fn(() => "blob:vault-audit");
const revokeObjectUrlMock = vi.fn();
let statusUpdateResult: Promise<{ error: { message: string } | null }>;

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
vi.mock("@/components/dashboard/CaseEvidencePanel", () => ({ default: () => null }));
vi.mock("@/lib/vault-audit-export", () => ({
  buildVaultAuditCsv: buildCsvMock,
  vaultAuditCsvFilename: filenameMock,
}));
vi.mock("@/lib/case-timeline", () => ({
  buildComplianceCaseTimeline: (inputs: Array<{ id: string }>) => inputs.map((input) => ({
    id: input.id,
    status: input.id === "case-archived" ? "warning" : "urgent",
    regime: "new",
    noticeApplies: true,
    daysToDeadline: input.id === "case-archived" ? 20 : 2,
    checklistDefaults: {
      defectDocumented: true,
      evidenceAttached: false,
      noticeDrafted: false,
      calendarReminderExported: false,
    },
  })),
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
    updated_at: "2026-08-19T09:00:00.000Z",
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
  from: (table: string) => {
    if (table === "cases") {
      return {
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: cases, error: null }) }) }),
        update: () => ({ eq: () => ({ eq: () => statusUpdateResult }) }),
      };
    }
    if (table === "protocols") {
      return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: "protocol-1", case_id: "case-archived", project_name: "Summit Depot" }], error: null }) }) };
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
    replaceMock.mockClear();
    pushMock.mockClear();
    statusUpdateResult = Promise.resolve({ error: null });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrlMock });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrlMock });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("exports the complete owner-visible portfolio rather than only the active tab", async () => {
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
    expect(filenameMock).toHaveBeenCalledTimes(1);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:vault-audit");
    expect(await screen.findByText("vault-audit-export-success")).toBeTruthy();
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
});
